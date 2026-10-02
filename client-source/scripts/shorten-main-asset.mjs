import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function shortName(content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `main-${digest}.js`;
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

export async function shortenMainAsset(publicDirectory) {
  const assetDirectory = path.join(publicDirectory, "assets");
  const matches = (await fs.readdir(assetDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name));
  if (matches.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${matches.length}`);
  const originalName = matches[0].name;
  const filePath = path.join(assetDirectory, originalName);
  const content = await fs.readFile(filePath, "utf8");
  const nextName = shortName(content);
  if (nextName === originalName) return { changed: false, asset: nextName };
  await replaceReferences(publicDirectory, originalName, nextName);
  await fs.rename(filePath, path.join(assetDirectory, nextName));
  return { changed: true, asset: nextName };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const publicDirectory = process.argv[2];
  if (!publicDirectory) throw new Error("Usage: node shorten-main-asset.mjs <public-directory>");
  const result = await shortenMainAsset(path.resolve(publicDirectory));
  console.log(`[MainAsset] updated ${result.changed}; asset ${result.asset}`);
}
