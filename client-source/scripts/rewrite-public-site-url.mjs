import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_PUBLIC_SITE_URL_V1__";
const LEGACY_HOST = "bcare-spa-gdkwxzkl.manus.space";
const DEFAULT_HOST = "bcareapp-cqsxcdmi.manus.space";

function configuredHost(value = process.env.BCARE_PUBLIC_SITE_HOST || DEFAULT_HOST) {
  const host = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*\.manus\.space$/.test(host)) {
    throw new Error("BCare public site host must be a Manus HTTPS hostname");
  }
  return host;
}

export function assertPublicSiteUrlRewrite(source, host = configuredHost()) {
  if (!source.includes(PATCH_MARKER)) throw new Error("BCare public-site URL patch marker is missing");
  if (source.includes(LEGACY_HOST)) throw new Error("Legacy BCare public-site hostname remains in the browser bundle");
  if (!source.includes(host)) throw new Error("Current BCare public-site hostname is missing from the browser bundle");
}

export function patchPublicSiteUrlSource(source, host = configuredHost()) {
  if (source.includes(PATCH_MARKER)) {
    assertPublicSiteUrlRewrite(source, host);
    return { changed: false, content: source };
  }
  if (!source.includes(LEGACY_HOST)) throw new Error("Expected legacy BCare public-site hostname exactly once in the main asset");
  const content = `/*${PATCH_MARKER}*/${source.replaceAll(LEGACY_HOST, host)}`;
  assertPublicSiteUrlRewrite(content, host);
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

export async function patchPublicSiteUrlAssets(assetDirectory, host = configuredHost()) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchPublicSiteUrlSource(source, host);
  if (result.changed) await fs.writeFile(filePath, result.content, "utf8");

  const originalName = path.basename(filePath);
  const nextName = cacheBustedName(originalName, result.content);
  if (nextName !== originalName) {
    await replaceAssetReferences(path.dirname(assetDirectory), originalName, nextName);
    await fs.rename(filePath, path.join(assetDirectory, nextName));
  }
  return { changed: result.changed, asset: nextName, host };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node rewrite-public-site-url.mjs <asset-directory>");
  const result = await patchPublicSiteUrlAssets(path.resolve(assetDirectory));
  console.log(`[PublicSiteUrl] updated ${result.changed}; asset ${result.asset}; host ${result.host}`);
}
