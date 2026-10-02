import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "__BCARE_TURNSTILE_TOKEN_FIRST_REGISTER_V2__";
const REGISTER_INITIALIZER = 'n=null,o="";const i=6;let s=0;for(';
const TOKEN_FIRST_INITIALIZER = `/*${MARKER}*/n=null,o=await $0();if(!o)return ut("visitor.register.turnstile_failed"),"";const i=6;let s=0;for(`;
const STALE_TOKEN_RETRY = 'if(_x(l)){if(o||(o=await $0()),!o)return ut("visitor.register.turnstile_failed"),"";continue}';
const REFRESHED_TOKEN_RETRY = 'if(_x(l)){o=await $0();if(!o)return ut("visitor.register.turnstile_failed"),"";continue}';

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function assertTokenFirstRegister(source) {
  if (!source.includes(MARKER)) throw new Error("Token-first register marker is missing");
  if (!source.includes(TOKEN_FIRST_INITIALIZER)) throw new Error("Token-first register initializer is missing");
  if (!source.includes(REFRESHED_TOKEN_RETRY)) throw new Error("Turnstile token refresh retry is missing");
  if (!source.includes("turnstile_token:o")) throw new Error("Register request does not carry the Turnstile token");
}

export function applyTokenFirstRegisterSource(source) {
  if (source.includes(MARKER)) {
    assertTokenFirstRegister(source);
    return { changed: false, content: source };
  }
  if (count(source, REGISTER_INITIALIZER) !== 1) throw new Error("Expected exactly one visitor register initializer");
  if (count(source, STALE_TOKEN_RETRY) !== 1) throw new Error("Expected exactly one stale Turnstile retry handler");
  const content = source
    .replace(REGISTER_INITIALIZER, TOKEN_FIRST_INITIALIZER)
    .replace(STALE_TOKEN_RETRY, REFRESHED_TOKEN_RETRY);
  assertTokenFirstRegister(content);
  return { changed: true, content };
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return assetName.replace(/\.tokenfirst-[a-f0-9]{12}/g, "").replace(/\.js$/, `.tokenfirst-${digest}.js`);
}

async function replaceReferences(rootDirectory, originalName, nextName) {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      await replaceReferences(entryPath, originalName, nextName);
      continue;
    }
    if (!/\.(?:html|js|css|json|webmanifest)$/i.test(entry.name)) continue;
    const source = await fs.readFile(entryPath, "utf8");
    const content = source.replaceAll(originalName, nextName);
    if (content !== source) await fs.writeFile(entryPath, content, "utf8");
  }
}

export async function applyTokenFirstRegisterAssets(assetDirectory) {
  const candidates = (await fs.readdir(assetDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);
  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = applyTokenFirstRegisterSource(source);
  if (result.changed) await fs.writeFile(filePath, result.content, "utf8");
  const originalName = path.basename(filePath);
  const nextName = cacheBustedName(originalName, result.content);
  if (nextName !== originalName) {
    await replaceReferences(path.dirname(assetDirectory), originalName, nextName);
    await fs.rename(filePath, path.join(assetDirectory, nextName));
  }
  return { changed: result.changed, asset: nextName };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node turnstile-token-first-register.mjs <asset-directory>");
  const result = await applyTokenFirstRegisterAssets(path.resolve(assetDirectory));
  console.log(`[TurnstileTokenFirst] updated ${result.changed}; asset ${result.asset}`);
}
