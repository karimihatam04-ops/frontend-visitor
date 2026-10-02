import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_CLOUDFLARE_GATEWAY_V1__";
const DEFAULT_WORKER_ORIGIN = "https://becare-public-gateway.dariatameen.workers.dev";

function normalizedWorkerOrigin(value = process.env.BCARE_WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN) {
  const origin = String(value || "").trim().replace(/\/+$/, "");
  const url = new URL(origin);
  if (url.protocol !== "https:") throw new Error("BCare Worker origin must use HTTPS");
  return url.origin;
}

function occurrenceCount(source, value) {
  return source.split(value).length - 1;
}

export function assertWorkerGatewayRewrite(source, workerOrigin = normalizedWorkerOrigin()) {
  if (!source.includes(PATCH_MARKER)) throw new Error("BCare Worker gateway marker is missing");
  if (source.includes('nl="/api/laravel/api/v1"')) {
    throw new Error("Legacy same-origin Laravel API base remains in the browser bundle");
  }
  if (!source.includes(`nl="${workerOrigin}/api/v1"`)) {
    throw new Error("Worker API base is missing from the browser bundle");
  }
  if (source.includes('fetch("/api/vehicle-inquiry"')) {
    throw new Error("Legacy same-origin vehicle inquiry endpoint remains in the browser bundle");
  }
  if (!source.includes(`fetch("${workerOrigin}/api/vehicle-inquiry"`)) {
    throw new Error("Worker vehicle inquiry endpoint is missing from the browser bundle");
  }
}

export function patchWorkerGatewaySource(source, workerOrigin = normalizedWorkerOrigin()) {
  if (source.includes(PATCH_MARKER)) {
    assertWorkerGatewayRewrite(source, workerOrigin);
    return { changed: false, content: source };
  }

  const apiBase = 'nl="/api/laravel/api/v1"';
  const vehicleEndpoint = 'fetch("/api/vehicle-inquiry"';
  if (occurrenceCount(source, apiBase) !== 1) {
    throw new Error("Expected exactly one legacy Laravel API base in the browser bundle");
  }
  if (occurrenceCount(source, vehicleEndpoint) !== 1) {
    throw new Error("Expected exactly one legacy vehicle inquiry endpoint in the browser bundle");
  }

  const content = `/*${PATCH_MARKER}*/${source
    .replace(apiBase, `nl="${workerOrigin}/api/v1"`)
    .replace(vehicleEndpoint, `fetch("${workerOrigin}/api/vehicle-inquiry"`)}`;

  assertWorkerGatewayRewrite(content, workerOrigin);
  return { changed: true, content };
}

async function listTextAssets(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTextAssets(entryPath)));
    } else if (/\.(?:html|js|css|json|webmanifest)$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function replaceAssetReferences(publicDirectory, originalName, nextName) {
  for (const file of await listTextAssets(publicDirectory)) {
    const source = await fs.readFile(file, "utf8");
    const content = source.replaceAll(originalName, nextName);
    if (content !== source) await fs.writeFile(file, content, "utf8");
  }
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const baseName = assetName.replace(/\.gateway-[a-f0-9]{12}/g, "");
  return baseName.replace(/\.js$/, `.gateway-${digest}.js`);
}

export async function patchWorkerGatewayAssets(assetDirectory, workerOrigin = normalizedWorkerOrigin()) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));

  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchWorkerGatewaySource(source, workerOrigin);
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
  if (!assetDirectory) throw new Error("Usage: node rewrite-worker-gateway.mjs <asset-directory>");
  const result = await patchWorkerGatewayAssets(path.resolve(assetDirectory));
  console.log(`[WorkerGateway] updated ${result.changed}; asset ${result.asset}; origin ${result.workerOrigin}`);
}
