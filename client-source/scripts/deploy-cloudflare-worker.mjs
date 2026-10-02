import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "afc1c6cb9746c50c03d3b0940a1718ee";
const scriptName = process.env.CLOUDFLARE_WORKER_NAME || "becare-public-gateway";
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.resolve(directory, "../cloudflare-worker/becare-public-gateway.mjs"), "utf8");
const settingsUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/settings`;
const apiHeaders = { Authorization: `Bearer ${token}` };
const settingsResponse = await fetch(settingsUrl, { headers: apiHeaders });
if (!settingsResponse.ok) throw new Error(`Unable to read current Worker settings: ${settingsResponse.status}`);

const settingsPayload = await settingsResponse.json();
const settings = settingsPayload?.result;
if (!settings || !Array.isArray(settings.bindings)) throw new Error("Worker settings did not contain bindings");

const bindings = settings.bindings.map(binding =>
  binding.type === "secret_text" ? { name: binding.name, type: "inherit" } : binding,
);

const metadata = {
  main_module: "index.js",
  bindings,
  compatibility_date: settings.compatibility_date,
  compatibility_flags: settings.compatibility_flags || [],
  annotations: {
    "workers/message": "BCare explicit API gateway route expansion",
  },
};

const form = new FormData();
form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
form.set("index.js", new Blob([source], { type: "application/javascript+module" }), "index.js");

const deploymentUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}?bindings_inherit=strict`;
const deploymentResponse = await fetch(deploymentUrl, {
  method: "PUT",
  headers: apiHeaders,
  body: form,
});
const deploymentPayload = await deploymentResponse.json();
if (!deploymentResponse.ok || deploymentPayload.success !== true) {
  throw new Error(`Worker deployment failed: ${JSON.stringify(deploymentPayload.errors || deploymentPayload.messages || [])}`);
}

console.log(JSON.stringify({ success: true, scriptName, result: deploymentPayload.result }, null, 2));
