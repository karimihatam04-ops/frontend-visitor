import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_TURNSTILE_PRELOAD_REGISTER_V1__";
const LEGACY_INITIALIZER = 'n=null,o="";const i=6;let s=0;for(';
const PREFLIGHT_INITIALIZER = 'n=null,o=await $0();if(!o)return ut("visitor.register.turnstile_failed"),"";const i=6;let s=0;for(';

export function assertTurnstilePreload(source) {
  if (!source.includes(PATCH_MARKER)) throw new Error("Turnstile bootstrap patch marker is missing");
  if (source.includes(LEGACY_INITIALIZER)) throw new Error("Visitor registration still starts before acquiring a Turnstile token");
  if (!source.includes(PREFLIGHT_INITIALIZER)) throw new Error("Visitor registration Turnstile preflight is missing");
}

export function patchTurnstilePreloadSource(source) {
  if (source.includes(PATCH_MARKER)) {
    assertTurnstilePreload(source);
    return { changed: false, content: source };
  }
  const matches = source.split(LEGACY_INITIALIZER).length - 1;
  if (matches !== 1) throw new Error(`Expected exactly one visitor registration initializer, found ${matches}`);
  const content = `/*${PATCH_MARKER}*/${source.replace(LEGACY_INITIALIZER, PREFLIGHT_INITIALIZER)}`;
  assertTurnstilePreload(content);
  return { changed: true, content };
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const baseName = assetName.replace(/\.gateway-[a-f0-9]{12}/g, "");
  return baseName.replace(/\.js$/, `.gateway-${digest}.js`);
}

async function replaceAssetReferences(publicDirectory, originalName, nextName) {
  const entries = await fs.readdir(publicDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(publicDirectory, entry.name);
    if (entry.isDirectory()) {
      await replaceAssetReferences(entryPath, originalName, nextName);
    } else if (/\.(?:html|js|css|json|webmanifest)$/i.test(entry.name)) {
      const source = await fs.readFile(entryPath, "utf8");
      const content = source.replaceAll(originalName, nextName);
      if (content !== source) await fs.writeFile(entryPath, content, "utf8");
    }
  }
}

export async function patchTurnstilePreloadAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchTurnstilePreloadSource(source);
  if (result.changed) await fs.writeFile(filePath, result.content, "utf8");

  const originalName = path.basename(filePath);
  const nextName = cacheBustedName(originalName, result.content);
  if (nextName !== originalName) {
    await replaceAssetReferences(path.dirname(assetDirectory), originalName, nextName);
    await fs.rename(filePath, path.join(assetDirectory, nextName));
  }
  return { changed: result.changed, asset: nextName };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node preload-turnstile-register.mjs <asset-directory>");
  const result = await patchTurnstilePreloadAssets(path.resolve(assetDirectory));
  console.log(`[TurnstilePreload] updated ${result.changed}; asset ${result.asset}`);
}
