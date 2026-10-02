import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_PATTERN = /\.release-[a-f0-9]{12}(?=\.js\b)/g;

function withoutReleaseTag(value) {
  return String(value).replace(RELEASE_PATTERN, "");
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

async function releaseDigest(assetDirectory, javascriptFiles) {
  const hash = createHash("sha256");
  for (const filePath of javascriptFiles) {
    hash.update(withoutReleaseTag(path.relative(assetDirectory, filePath)));
    hash.update("\0");
    hash.update(withoutReleaseTag(await fs.readFile(filePath, "utf8")));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

function releasedName(assetName, release) {
  return withoutReleaseTag(assetName).replace(/\.js$/, `.release-${release}.js`);
}

async function rewriteReferences(publicDirectory, replacements) {
  for (const filePath of await listFiles(publicDirectory)) {
    if (!/\.(?:html|js|css|json|webmanifest)$/i.test(filePath)) continue;
    const source = await fs.readFile(filePath, "utf8");
    let content = source;
    for (const [originalName, nextName] of replacements) content = content.replaceAll(originalName, nextName);
    if (content !== source) await fs.writeFile(filePath, content, "utf8");
  }
}

export async function cacheBustDependentAssets(publicDirectory) {
  const assetDirectory = path.join(publicDirectory, "assets");
  const javascriptFiles = (await listFiles(assetDirectory))
    .filter(filePath => filePath.endsWith(".js"))
    .sort((left, right) => left.localeCompare(right));
  if (!javascriptFiles.length) throw new Error("No browser JavaScript assets found");

  const release = await releaseDigest(assetDirectory, javascriptFiles);
  const replacements = new Map();
  for (const filePath of javascriptFiles) {
    const originalName = path.basename(filePath);
    if (replacements.has(originalName)) throw new Error(`Duplicate browser asset name: ${originalName}`);
    replacements.set(originalName, releasedName(originalName, release));
  }

  await rewriteReferences(publicDirectory, replacements);
  for (const filePath of javascriptFiles) {
    const originalName = path.basename(filePath);
    const nextName = replacements.get(originalName);
    if (nextName && nextName !== originalName) await fs.rename(filePath, path.join(path.dirname(filePath), nextName));
  }

  return { release, assets: Object.fromEntries(replacements) };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const publicDirectory = process.argv[2];
  if (!publicDirectory) throw new Error("Usage: node cache-bust-dependent-assets.mjs <public-directory>");
  const result = await cacheBustDependentAssets(path.resolve(publicDirectory));
  console.info(`[DependentAssets] release ${result.release}`);
}
