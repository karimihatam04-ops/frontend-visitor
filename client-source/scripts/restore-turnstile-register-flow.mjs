import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_TURNSTILE_PRELOAD_REGISTER_V1__";
const TOKEN_FIRST_MARKER = "__BCARE_TURNSTILE_TOKEN_FIRST_REGISTER_V2__";
const EARLY_INITIALIZER = 'n=null,o=await $0();if(!o)return ut("visitor.register.turnstile_failed"),"";const i=6;let s=0;for(';
const REGISTER_INITIALIZER = 'n=null,o="";const i=6;let s=0;for(';

export function assertRegisterFlow(source) {
  if (source.includes(TOKEN_FIRST_MARKER)) return;
  if (source.includes(PATCH_MARKER) || source.includes(EARLY_INITIALIZER)) {
    throw new Error("Visitor registration is still blocked by the early Turnstile preload");
  }
  if (!source.includes(REGISTER_INITIALIZER)) {
    throw new Error("Visitor registration retry flow is missing");
  }
}

export function restoreRegisterFlowSource(source) {
  if (source.includes(TOKEN_FIRST_MARKER)) {
    return { changed: false, content: source };
  }
  if (!source.includes(PATCH_MARKER) && !source.includes(EARLY_INITIALIZER)) {
    assertRegisterFlow(source);
    return { changed: false, content: source };
  }
  const matches = source.split(EARLY_INITIALIZER).length - 1;
  if (matches !== 1) throw new Error(`Expected exactly one early register initializer, found ${matches}`);
  const content = source
    .replace(`/*${PATCH_MARKER}*/`, "")
    .replace(EARLY_INITIALIZER, REGISTER_INITIALIZER);
  assertRegisterFlow(content);
  return { changed: true, content };
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const baseName = assetName.replace(/\.registerflow-[a-f0-9]{12}/g, "");
  return baseName.replace(/\.js$/, `.registerflow-${digest}.js`);
}

async function replaceAssetReferences(rootDirectory, originalName, nextName) {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      await replaceAssetReferences(entryPath, originalName, nextName);
    } else if (/\.(?:html|js|css|json|webmanifest)$/i.test(entry.name)) {
      const source = await fs.readFile(entryPath, "utf8");
      const content = source.replaceAll(originalName, nextName);
      if (content !== source) await fs.writeFile(entryPath, content, "utf8");
    }
  }
}

export async function restoreRegisterFlowAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = restoreRegisterFlowSource(source);
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
  if (!assetDirectory) throw new Error("Usage: node restore-turnstile-register-flow.mjs <asset-directory>");
  const result = await restoreRegisterFlowAssets(path.resolve(assetDirectory));
  console.log(`[RegisterFlow] restored ${result.changed}; asset ${result.asset}`);
}
