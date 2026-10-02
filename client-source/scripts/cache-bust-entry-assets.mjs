import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY_TAG = ".entry-";

export function entryAssetName(assetName, source) {
  const stem = assetName.replace(/\.entry-[a-f0-9]{12}/g, "");
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 12);
  return stem.replace(/\.js$/, `${ENTRY_TAG}${digest}.js`);
}

async function rewriteReferences(rootDirectory, originalName, nextName) {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      await rewriteReferences(entryPath, originalName, nextName);
      continue;
    }
    if (!/\.(?:html|js|css|json|webmanifest)$/i.test(entry.name)) continue;
    const source = await fs.readFile(entryPath, "utf8");
    const content = source.replaceAll(originalName, nextName);
    if (content !== source) await fs.writeFile(entryPath, content, "utf8");
  }
}

export async function cacheBustEntryAsset(publicDirectory) {
  const assetDirectory = path.join(publicDirectory, "assets");
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^index-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one browser entry asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const originalName = path.basename(filePath);
  const source = await fs.readFile(filePath, "utf8");
  const nextName = entryAssetName(originalName, source);
  if (nextName === originalName) return { changed: false, asset: originalName };

  await rewriteReferences(publicDirectory, originalName, nextName);
  await fs.rename(filePath, path.join(assetDirectory, nextName));
  return { changed: true, asset: nextName };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const publicDirectory = process.argv[2];
  if (!publicDirectory) throw new Error("Usage: node cache-bust-entry-assets.mjs <public-directory>");
  const result = await cacheBustEntryAsset(path.resolve(publicDirectory));
  console.log(`[EntryAsset] updated ${result.changed}; asset ${result.asset}`);
}
