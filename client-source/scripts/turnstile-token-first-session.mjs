import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "__BCARE_TURNSTILE_TOKEN_FIRST_SESSION_V2__";
const MARKER_V1 = "__BCARE_TURNSTILE_TOKEN_FIRST_SESSION_V1__";
const ORIGINAL = 'Rx=async({fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,turnstileToken:i}={})=>{const s=localStorage.getItem("visitor_id")||void 0,l=qn("visitor_token")||void 0,a=localStorage.getItem("visitor_fingerprint")||void 0,d={fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,visitor_id:s,visitor_token:l,visitor_fingerprint:a,turnstile_token:i},u=await wn.post("/sessions",d,{headers:a?{"X-Visitor-Fingerprint":a}:void 0});return ns(u),u}';
const PATCHED_V1 = `/*${MARKER_V1}*/Rx=async({fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,turnstileToken:i}={})=>{const s=localStorage.getItem("visitor_id")||void 0,l=qn("visitor_token")||void 0,a=localStorage.getItem("visitor_fingerprint")||void 0,d=async m=>wn.post("/sessions",{fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,visitor_id:s,visitor_token:l,visitor_fingerprint:a,turnstile_token:m},{headers:a?{"X-Visitor-Fingerprint":a}:void 0}),u=()=>{const m=bs();if(m&&pr!==null&&typeof m.reset=="function")try{m.reset(pr)}catch{}},c=async()=>{u();return String(await $0()||"").trim()};let f=String(i||"").trim();f||(f=await c());if(!f){const m=new Error("Security verification unavailable");throw m.status=428,m.code="TURNSTILE_REQUIRED",m}try{const m=await d(f);return ns(m),m}catch(m){if(!_x(m))throw m;f=await c();if(!f)throw m;const h=await d(f);return ns(h),h}}`;
const PATCHED = `/*${MARKER}*/Rx=async({fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,turnstileToken:i}={})=>{const s=localStorage.getItem("visitor_id")||void 0,l=qn("visitor_token")||void 0,a=localStorage.getItem("visitor_fingerprint")||void 0,d=async m=>wn.post("/sessions",{fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,visitor_id:s,visitor_token:l,visitor_fingerprint:a,turnstile_token:m},{headers:a?{"X-Visitor-Fingerprint":a}:void 0}),u=globalThis.__BCareTokenPool,c=async()=>String(await(u?.take?.("sessions")??$0())||"").trim(),f=async()=>String(await(u?.refresh?.("sessions")??$0())||"").trim();let m=String(i||"").trim();m||(m=await c());if(!m){const h=new Error("Security verification unavailable");throw h.status=428,h.code="TURNSTILE_REQUIRED",h}try{const h=await d(m);return ns(h),h}catch(h){if(!_x(h))throw h;m=await f();if(!m)throw h;const g=await d(m);return ns(g),g}}`;

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function assertSessionTokenFirst(source) {
  if (!source.includes(MARKER)) throw new Error("Session Turnstile marker is missing");
  if (!source.includes('take?.("sessions")')) throw new Error("Session does not consume the prewarmed token");
  if (!source.includes('turnstile_token:m')) throw new Error("Session payload does not include the resolved token");
  if (!source.includes('refresh?.("sessions")')) throw new Error("Session 428 retry does not refresh the token");
  if (source.includes('turnstile_token:i},u=await wn.post("/sessions"')) throw new Error("Legacy direct session request remains");
}

export function patchSessionTokenFirstSource(source) {
  if (source.includes(MARKER)) {
    assertSessionTokenFirst(source);
    return { changed: false, content: source };
  }
  let content = source;
  if (content.includes(MARKER_V1)) {
    if (count(content, PATCHED_V1) !== 1) throw new Error("Expected exactly one v1 session token flow");
    content = content.replace(PATCHED_V1, PATCHED);
  } else {
    if (count(content, ORIGINAL) !== 1) throw new Error(`Expected exactly one legacy session request, found ${count(content, ORIGINAL)}`);
    content = content.replace(ORIGINAL, PATCHED);
  }
  assertSessionTokenFirst(content);
  return { changed: true, content };
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const baseName = assetName.replace(/\.tssession-[a-f0-9]{12}/g, "");
  return baseName.replace(/\.js$/, `.tssession-${digest}.js`);
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

export async function patchSessionTokenFirstAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);

  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = patchSessionTokenFirstSource(source);
  if (result.changed) await fs.writeFile(filePath, result.content, "utf8");
  const originalName = path.basename(filePath);
  const nextName = cacheBustedName(originalName, result.content);
  if (nextName !== originalName) {
    await replaceReferences(path.dirname(assetDirectory), originalName, nextName);
    await fs.rename(filePath, path.join(assetDirectory, nextName));
  }
  return { changed: result.changed, asset: nextName };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node turnstile-token-first-session.mjs <asset-directory>");
  const result = await patchSessionTokenFirstAssets(path.resolve(assetDirectory));
  console.log(`[TurnstileSession] updated ${result.changed}; asset ${result.asset}`);
}
