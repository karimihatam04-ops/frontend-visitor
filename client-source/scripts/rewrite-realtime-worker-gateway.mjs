import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_REALTIME_WORKER_GATEWAY_V1__";
const DEFAULT_WORKER_ORIGIN = "https://becare-public-gateway.dariatameen.workers.dev";

function normalizedWorkerOrigin(value = process.env.BCARE_WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN) {
  const origin = String(value || "").trim().replace(/\/+$/, "");
  const url = new URL(origin);
  if (url.protocol !== "https:") throw new Error("BCare Worker origin must use HTTPS");
  return url.origin;
}

export function assertRealtimeWorkerRewrite(source, workerOrigin = normalizedWorkerOrigin()) {
  if (!source.includes(PATCH_MARKER)) throw new Error("BCare realtime Worker marker is missing");
  if (source.includes('authEndpoint:"/api/laravel/broadcasting/auth"')) {
    throw new Error("Legacy same-origin Reverb auth endpoint remains in the browser bundle");
  }
  if (!source.includes(`authEndpoint:"${workerOrigin}/api/laravel/broadcasting/auth"`)) {
    throw new Error("Worker Reverb auth endpoint is missing from the browser bundle");
  }
  const workerHost = new URL(workerOrigin).hostname;
  if (source.includes("wsHost:s")) throw new Error("Legacy same-origin Reverb websocket host remains in the browser bundle");
  if (!source.includes(`wsHost:"${workerHost}"`)) {
    throw new Error("Worker Reverb websocket host is missing from the browser bundle");
  }
}

export function patchRealtimeWorkerSource(source, workerOrigin = normalizedWorkerOrigin()) {
  const legacySocketHost = 'const u="__STAGING_REVERB_APP_KEY__",s=location.hostname,o=location.protocol==="https:"?443:80';
  const workerHost = new URL(workerOrigin).hostname;
  if (source.includes(PATCH_MARKER)) {
    let content = source.includes(legacySocketHost)
      ? source.replace(legacySocketHost, `const u="__STAGING_REVERB_APP_KEY__",s="${workerHost}",o=443`)
      : source;
    content = content.replaceAll("wsHost:s", `wsHost:"${workerHost}"`);
    assertRealtimeWorkerRewrite(content, workerOrigin);
    return { changed: content !== source, content };
  }

  const legacyEndpoint = 'authEndpoint:"/api/laravel/broadcasting/auth"';
  if (source.split(legacyEndpoint).length - 1 !== 1) {
    throw new Error("Expected exactly one same-origin Reverb auth endpoint");
  }
  let content = `/*${PATCH_MARKER}*/${source.replace(
    legacyEndpoint,
    `authEndpoint:"${workerOrigin}/api/laravel/broadcasting/auth"`,
  )}`;
  if (!content.includes(legacySocketHost)) throw new Error("Expected the Reverb same-origin websocket initializer exactly once");
  if (content.split(legacySocketHost).length - 1 !== 1) throw new Error("Found multiple Reverb websocket initializers");
  content = content.replace(
    legacySocketHost,
    `const u="__STAGING_REVERB_APP_KEY__",s="${workerHost}",o=443`,
  );
  content = content.replaceAll("wsHost:s", `wsHost:"${workerHost}"`);
  assertRealtimeWorkerRewrite(content, workerOrigin);
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

export async function patchRealtimeWorkerAssets(assetDirectory, workerOrigin = normalizedWorkerOrigin()) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^realtime-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one realtime asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchRealtimeWorkerSource(source, workerOrigin);
  await fs.writeFile(filePath, result.content, "utf8");

  const originalName = path.basename(filePath);
  const nextName = cacheBustedName(originalName, result.content);
  if (nextName !== originalName) {
    await replaceAssetReferences(path.dirname(assetDirectory), originalName, nextName);
    await fs.rename(filePath, path.join(assetDirectory, nextName));
  }
  return { changed: result.changed, asset: nextName, workerOrigin };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node rewrite-realtime-worker-gateway.mjs <asset-directory>");
  const result = await patchRealtimeWorkerAssets(path.resolve(assetDirectory));
  console.log(`[RealtimeWorkerGateway] updated ${result.changed}; asset ${result.asset}; origin ${result.workerOrigin}`);
}
