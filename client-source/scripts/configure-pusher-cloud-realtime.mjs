import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER = "__BCARE_PUSHER_CLOUD_REALTIME_V1__";
const DISABLED_MARKER = "__BCARE_DISABLE_UNCONFIGURED_REVERB_V1__";
const WORKER_REVERB_MARKER = "__BCARE_REALTIME_WORKER_GATEWAY_V1__";
const STAGING_KEY = "__STAGING_REVERB_APP_KEY__";
const AUTH_ENDPOINT = "https://becare-public-gateway.dariatameen.workers.dev/api/laravel/broadcasting/auth";

function validatedOptions({ publicKey, cluster }) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(publicKey || ""))) {
    throw new Error("A valid public Pusher app key is required");
  }
  if (!/^[a-z0-9-]{2,32}$/.test(String(cluster || ""))) {
    throw new Error("A valid Pusher cluster is required");
  }
  return { publicKey: String(publicKey), cluster: String(cluster) };
}

export function assertPusherCloudRealtime(source, options) {
  const { publicKey, cluster } = validatedOptions(options);
  if (!source.includes(PATCH_MARKER)) throw new Error("Pusher Cloud patch marker is missing");
  if (!source.includes(`const u="${publicKey}"`)) throw new Error("Public Pusher app key is missing");
  if (!source.includes('broadcaster:"pusher"')) throw new Error("Pusher broadcaster is missing");
  if (!source.includes(`cluster:"${cluster}"`)) throw new Error("Pusher cluster is missing");
  if (!source.includes(`authEndpoint:"${AUTH_ENDPOINT}"`)) throw new Error("Pusher auth endpoint is missing");
  if (source.includes(STAGING_KEY)) throw new Error("Staging Reverb placeholder remains");
  if (source.includes(DISABLED_MARKER) || source.includes("if(u===")) {
    throw new Error("Unconfigured-Reverb guard remains");
  }
  if (source.includes('broadcaster:"reverb",key:u') || source.includes('wsPath:"/ws",forceTLS:')) {
    throw new Error("Reverb websocket configuration remains");
  }
}

export function patchPusherCloudRealtimeSource(source, options) {
  const { publicKey, cluster } = validatedOptions(options);
  if (source.includes(PATCH_MARKER)) {
    assertPusherCloudRealtime(source, { publicKey, cluster });
    return { changed: false, content: source };
  }
  const initializerPattern = new RegExp(
    String.raw`const u="${STAGING_KEY}".*?window\.Pusher=([A-Za-z_$][\w$]*);\{te=new ([A-Za-z_$][\w$]*)\(\{broadcaster:"reverb",key:u,.*?\}\);return\}`,
    "gs",
  );
  const matches = [...source.matchAll(initializerPattern)];
  if (matches.length !== 1) throw new Error(`Expected exactly one staging Reverb initializer, found ${matches.length}`);
  const [, pusherClass, echoClass] = matches[0];
  const initializer =
    `const u="${publicKey}";window.Pusher=${pusherClass};` +
    `{te=new ${echoClass}({broadcaster:"pusher",key:u,cluster:"${cluster}",forceTLS:!0,` +
    `enabledTransports:["ws","wss"],authEndpoint:"${AUTH_ENDPOINT}",auth:{withCredentials:!0}});return}`;
  const withoutOldMarkers = source
    .replaceAll(`/*${DISABLED_MARKER}*/`, "")
    .replaceAll(`/*${WORKER_REVERB_MARKER}*/`, "");
  const content = `/*${PATCH_MARKER}*/${withoutOldMarkers.replace(initializerPattern, initializer)}`;
  assertPusherCloudRealtime(content, { publicKey, cluster });
  return { changed: true, content };
}

export async function patchPusherCloudRealtimeAssets(assetDirectory, options) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^realtime-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one realtime asset, found ${candidates.length}`);
  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchPusherCloudRealtimeSource(source, options);
  if (result.changed) await fs.writeFile(filePath, result.content, "utf8");
  return { changed: result.changed, asset: path.basename(filePath) };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  const publicKey = process.argv[3];
  const cluster = process.argv[4];
  if (!assetDirectory || !publicKey || !cluster) {
    throw new Error("Usage: node configure-pusher-cloud-realtime.mjs <asset-directory> <public-key> <cluster>");
  }
  const result = await patchPusherCloudRealtimeAssets(path.resolve(assetDirectory), { publicKey, cluster });
  console.log(`[PusherCloud] updated ${result.changed}; asset ${result.asset}`);
}
