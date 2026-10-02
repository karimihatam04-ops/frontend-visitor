import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_TURNSTILE_SITE_KEY_V1__";
const DEFAULT_SITE_KEY = "0x4AAAAAAEF260t-jgRLf7wf";
const SITE_KEY_INITIALIZER = /const Ha="0x4AAAAA[A-Za-z0-9_-]{12,}"/g;

function configuredSiteKey(value = process.env.BCARE_TURNSTILE_SITE_KEY || DEFAULT_SITE_KEY) {
  const key = String(value || "").trim();
  if (!/^0x4AAAAA[A-Za-z0-9_-]{12,}$/.test(key)) throw new Error("BCare Turnstile site key is invalid");
  return key;
}

export function assertTurnstileSiteKey(source, siteKey = configuredSiteKey()) {
  if (!source.includes(PATCH_MARKER)) throw new Error("BCare Turnstile patch marker is missing");
  if (!source.includes(`const Ha="${siteKey}"`)) throw new Error("BCare Turnstile site key is missing from the browser bundle");
  if (source.includes('const Ha="DISABLED"')) throw new Error("BCare Turnstile remains disabled in the browser bundle");
}

export function patchTurnstileSiteKeySource(source, siteKey = configuredSiteKey()) {
  if (source.includes(PATCH_MARKER)) {
    if (source.includes(`const Ha="${siteKey}"`)) {
      assertTurnstileSiteKey(source, siteKey);
      return { changed: false, content: source };
    }
    const matches = source.match(SITE_KEY_INITIALIZER) ?? [];
    if (matches.length !== 1) throw new Error(`Expected exactly one existing BCare Turnstile site key, found ${matches.length}`);
    const content = source.replace(SITE_KEY_INITIALIZER, `const Ha="${siteKey}"`);
    assertTurnstileSiteKey(content, siteKey);
    return { changed: true, content };
  }

  const legacy = 'const Ha="DISABLED"';
  if (!source.includes(legacy)) throw new Error("Expected the disabled BCare Turnstile initializer exactly once");
  if (source.split(legacy).length - 1 !== 1) throw new Error("Found multiple BCare Turnstile initializers");

  const content = `/*${PATCH_MARKER}*/${source.replace(legacy, `const Ha="${siteKey}"`)}`;
  assertTurnstileSiteKey(content, siteKey);
  return { changed: true, content };
}

export async function patchTurnstileSiteKeyAssets(assetDirectory, siteKey = configuredSiteKey()) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchTurnstileSiteKeySource(source, siteKey);
  if (result.changed) await fs.writeFile(filePath, result.content, "utf8");
  return { changed: result.changed, asset: path.basename(filePath), siteKey };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node inject-turnstile-site-key.mjs <asset-directory>");
  const result = await patchTurnstileSiteKeyAssets(path.resolve(assetDirectory));
  console.log(`[Turnstile] updated ${result.changed}; asset ${result.asset}`);
}
