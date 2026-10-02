import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_DISABLE_UNCONFIGURED_REVERB_V1__";
const STAGING_KEY = "__STAGING_REVERB_APP_KEY__";

export function assertUnconfiguredRealtimeDisabled(source) {
  if (!source.includes(PATCH_MARKER)) throw new Error("BCare unconfigured-Reverb patch marker is missing");
  const guard = `const u="${STAGING_KEY}";if(u==="${STAGING_KEY}")return;`;
  if (!source.includes(guard)) throw new Error("Unconfigured Reverb guard is missing from the browser bundle");
}

export function patchUnconfiguredRealtimeSource(source) {
  if (source.includes(PATCH_MARKER)) {
    assertUnconfiguredRealtimeDisabled(source);
    return { changed: false, content: source };
  }
  const initializer = `const u="${STAGING_KEY}",`;
  if (source.split(initializer).length - 1 !== 1) {
    throw new Error("Expected exactly one staging Reverb initializer");
  }
  const content = `/*${PATCH_MARKER}*/${source.replace(initializer, `const u="${STAGING_KEY}";if(u==="${STAGING_KEY}")return;const `)}`;
  assertUnconfiguredRealtimeDisabled(content);
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

export async function patchUnconfiguredRealtimeAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^realtime-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one realtime asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchUnconfiguredRealtimeSource(source);
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
  if (!assetDirectory) throw new Error("Usage: node disable-unconfigured-realtime.mjs <asset-directory>");
  const result = await patchUnconfiguredRealtimeAssets(path.resolve(assetDirectory));
  console.log(`[ReverbGuard] updated ${result.changed}; asset ${result.asset}`);
}
