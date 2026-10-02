import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_SECURITY_429_RECOVERY_V1__";

const HTML_CHALLENGE_429_PATTERN =
  'if(t&&(n==="challenge"||r.includes("text/html"))){';
const HTML_CHALLENGE_429_REPLACEMENT =
  'if(t&&e.status!==429&&(n==="challenge"||r.includes("text/html"))){';

const GLOBAL_RATE_LIMIT_PATTERN =
  ':r===429||e_.has(t)?{category:"rate_limit"';
const GLOBAL_RATE_LIMIT_REPLACEMENT =
  ':e_.has(t)&&t!=="REGISTER_BURST_LIMIT"?{category:"rate_limit"';

const REGISTER_BURST_PATTERN =
  'if(l?.status===429&&l?.code==="REGISTER_BURST_LIMIT")return';
const REGISTER_BURST_REPLACEMENT = 'if(l?.status===429)return';

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

export function assertSecurity429Recovery(source) {
  if (!source.includes(PATCH_MARKER)) {
    throw new Error("Security 429 recovery marker is missing");
  }
  if (source.includes(HTML_CHALLENGE_429_PATTERN)) {
    throw new Error("HTML 429 responses are still classified as Cloudflare challenges");
  }
  if (!source.includes(HTML_CHALLENGE_429_REPLACEMENT)) {
    throw new Error("HTML challenge parser is not excluding status 429");
  }
  if (source.includes(GLOBAL_RATE_LIMIT_PATTERN)) {
    throw new Error("Raw HTTP 429 responses still activate the global security screen");
  }
  if (!source.includes(GLOBAL_RATE_LIMIT_REPLACEMENT)) {
    throw new Error("Global rate-limit classifier does not use explicit error codes");
  }
  if (source.includes(REGISTER_BURST_PATTERN)) {
    throw new Error("Visitor registration only handles one specific 429 code");
  }
  if (!source.includes(REGISTER_BURST_REPLACEMENT)) {
    throw new Error("Visitor registration does not absorb transient HTTP 429 responses");
  }
}

/**
 * Prevent a transient 429 from a background visitor-registration/heartbeat
 * request from replacing the complete SPA with SecurityStatusView.
 *
 * Explicit application rate-limit codes such as RATE_LIMIT_EXCEEDED,
 * TOO_MANY_REQUESTS and SESSION_BOOKING_LIMIT_EXCEEDED remain eligible for the
 * global security screen.  Raw HTML 429 responses and REGISTER_BURST_LIMIT are
 * handled by their calling flow instead.
 */
export function patchSecurity429Recovery(source) {
  if (source.includes(PATCH_MARKER)) {
    assertSecurity429Recovery(source);
    return { detected: true, changed: false, content: source };
  }

  const counts = {
    htmlChallenge: countOccurrences(source, HTML_CHALLENGE_429_PATTERN),
    globalClassifier: countOccurrences(source, GLOBAL_RATE_LIMIT_PATTERN),
    registerBurst: countOccurrences(source, REGISTER_BURST_PATTERN),
  };

  if (counts.htmlChallenge === 0 && counts.globalClassifier === 0 && counts.registerBurst === 0) {
    return { detected: false, changed: false, content: source };
  }

  for (const [name, count] of Object.entries(counts)) {
    if (count !== 1) {
      throw new Error(`Expected exactly one ${name} pattern, found ${count}`);
    }
  }

  let content = source;
  content = content.replace(
    HTML_CHALLENGE_429_PATTERN,
    HTML_CHALLENGE_429_REPLACEMENT,
  );
  content = content.replace(
    GLOBAL_RATE_LIMIT_PATTERN,
    GLOBAL_RATE_LIMIT_REPLACEMENT,
  );
  content = content.replace(
    REGISTER_BURST_PATTERN,
    REGISTER_BURST_REPLACEMENT,
  );
  content = `/*${PATCH_MARKER}*/${content}`;

  assertSecurity429Recovery(content);
  return { detected: true, changed: true, content };
}

async function listTextAssets(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTextAssets(entryPath)));
      continue;
    }
    if (/\.(?:html|js|css|json|webmanifest)$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function replaceAssetReferences(publicDirectory, originalName, versionedName) {
  for (const file of await listTextAssets(publicDirectory)) {
    const source = await fs.readFile(file, "utf8");
    const content = source.replaceAll(originalName, versionedName);
    if (content !== source) {
      await fs.writeFile(file, content, "utf8");
    }
  }
}

function cacheBustedAssetName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const baseName = assetName.replace(/\.security429-[a-f0-9]{12}(?=\.js$)/, "");
  return baseName.replace(/\.js$/, `.security429-${digest}.js`);
}

export async function patchSecurity429RecoveryAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));

  let detected = 0;
  let changed = 0;
  let renamed = 0;
  const assets = [];

  for (const filePath of candidates) {
    const source = await fs.readFile(filePath, "utf8");
    const result = patchSecurity429Recovery(source);
    if (!result.detected) continue;

    detected += 1;
    if (result.changed) changed += 1;
    await fs.writeFile(filePath, result.content, "utf8");

    const assetName = path.basename(filePath);
    const versionedName = cacheBustedAssetName(assetName, result.content);
    if (assetName !== versionedName) {
      await replaceAssetReferences(
        path.dirname(assetDirectory),
        assetName,
        versionedName,
      );
      await fs.rename(filePath, path.join(assetDirectory, versionedName));
      renamed += 1;
    }
    assets.push(versionedName);
  }

  if (detected !== 1) {
    throw new Error(
      `Expected exactly one main browser asset with the 429 flow; detected ${detected}`,
    );
  }

  return { detected, changed, renamed, assets };
}

const isCli = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) {
    throw new Error("Usage: node patch-security-429-recovery.mjs <asset-directory>");
  }

  const result = await patchSecurity429RecoveryAssets(
    path.resolve(assetDirectory),
  );
  console.log(
    `[Security429] verified ${result.detected} asset; updated ${result.changed}; cache-busted ${result.renamed}: ${result.assets.join(", ")}`,
  );
}
