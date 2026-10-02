import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POOL_MARKER = "__BCARE_TURNSTILE_POOL_V5__";
const POOL_MARKER_V4 = "__BCARE_TURNSTILE_POOL_V4__";
const POOL_MARKER_V3 = "__BCARE_TURNSTILE_POOL_V3__";
const POOL_MARKER_V2 = "__BCARE_TURNSTILE_POOL_V2__";
const POOL_MARKER_V1 = "__BCARE_TURNSTILE_POOL_V1__";
const BOOKING_MARKER_V1 = "__BCARE_TURNSTILE_BOOKING_V1__";
const BOOKING_MARKER = "__BCARE_TURNSTILE_BOOKING_V2__";
const PREWARM_MARKER = "__BCARE_TURNSTILE_PREWARM_V1__";
const OBSOLETE_EDIT_PAGE_PREWARM_MARKER = "__BCARE_TURNSTILE_SECOND_PAGE_PREWARM_V2__";
const SECOND_PAGE_PREWARM_MARKER = "__BCARE_TURNSTILE_BOOKING_PAGE_PREWARM_V3__";
export const STEP_INITIAL_DELAY_MS = 25_000;
const STEP_RETRY_DETAILS_ORIGINAL = 'a.details=s?.error?.details||s?.details||null,a.status=e.status';
const STEP_RETRY_DETAILS_PATCHED = 'a.details=s?.error?.details||s?.details||(s?.error?.retry_after!=null?{retry_after:s.error.retry_after}:null),a.status=e.status';
const PREWARM_SOURCE = `;/*${PREWARM_MARKER}*/queueMicrotask(()=>globalThis.__BCareTokenPool?.prewarm?.());`;
const BOOKING_PAGE_MOUNT_ORIGINAL = "J(async()=>{if(O.value&&v.value.idNumber&&v.value.serialNumber){";
const BOOKING_PAGE_MOUNT_PATCHED = `J(async()=>{/*${SECOND_PAGE_PREWARM_MARKER}*/globalThis.__BCareTokenPool?.prewarm?.();if(O.value&&v.value.idNumber&&v.value.serialNumber){`;
const OBSOLETE_EDIT_PAGE_MOUNT_ORIGINAL = "W(async()=>{h&&await T()})";
const OBSOLETE_EDIT_PAGE_MOUNT_PATCHED = `W(async()=>{/*${OBSOLETE_EDIT_PAGE_PREWARM_MARKER}*/globalThis.__BCareTokenPool?.prewarm?.(),h&&await T()})`;
const INSERTION_POINT = "},Ga=()=>{";
const INVALID_POOL_START = `/*${POOL_MARKER_V1}*/const __bcQ=`;
const REGISTER_MARKER = "/*__BCARE_TURNSTILE_TOKEN_FIRST_REGISTER_V2__*/";
const BOOKING_ORIGINAL = 'const a=async o=>n.post("/bookings",o)';
const BOOKING_V1_REQUEST = 'const s=u=>n.post("/bookings",{...o,turnstile_token:u})';
const BOOKING_V2_REQUEST = 'const d=globalThis.crypto?.randomUUID?.()||("bcare-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)),s=u=>n.post("/bookings",{...o,turnstile_token:u},{headers:{"Idempotency-Key":d}})';
const BOOKING_PATCHED = `/*${BOOKING_MARKER}*/const a=async o=>{const i=globalThis.__BCareTokenPool,t=String(await(i?.take?.("bookings")??"")||"").trim();if(!t){const e=new Error("Security verification unavailable");throw e.status=428,e.code="TURNSTILE_REQUIRED",e}${BOOKING_V2_REQUEST};try{return await s(t)}catch(e){const r=e?.response?.status??e?.status;if(r!==428)throw e;const c=String(await(i?.refresh?.("bookings")??"")||"").trim();if(!c)throw e;return s(c)}}`;
const POOL_SOURCE_LEGACY = `/*${POOL_MARKER}*/__bcQ={sessions:{i:null,t:"",x:0,p:null,c:null,r:null},bookings:{i:null,t:"",x:0,p:null,c:null,r:null},step:{i:null,t:"",x:0,p:null,c:null,r:null},card:{i:null,t:"",x:0,p:null,c:null,r:null}},__bcD=e=>{const t=__bcQ[e],n=String(t?.t||"").trim(),o=Date.now();return n&&t.x>o+5e3?n:""},__bcF=(e,t)=>{const n=__bcQ[e];if(!n)return;const o=String(t||"").trim();n.t=o,n.x=o?Date.now()+24e4:0,n.p=null;const i=n.c;n.c=null,i&&i(o),n.r&&clearTimeout(n.r),o&&(n.r=setTimeout(()=>{n.t===o&&(n.t="",n.x=0,__bcI(e))},23e4))},__bcE=e=>{const t=__bcQ[e];t&&__bcF(e,"")},__bcC=e=>{const t="bc-ts-"+e;let n=document.getElementById(t);return n||(n=document.createElement("div"),n.id=t,n.setAttribute("aria-hidden","true"),n.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none",document.body.appendChild(n)),n},__bcI=async e=>{const t=__bcQ[e];if(!t)return"";const n=__bcD(e);if(n)return n;if(t.p)return t.p;if(!await Z0())return"";const o=bs();return!o||typeof o.ready!="function"?"":(t.p=new Promise(i=>{t.c=i,o.ready(()=>{try{const i=__bcC(e);t.i===null?t.i=o.render(i,{sitekey:yi,__bcTsInvisibleFirst:!0,execution:"execute",callback:i=>__bcF(e,i),"error-callback":()=>__bcE(e),"expired-callback":()=>__bcE(e),"timeout-callback":()=>__bcE(e),"before-interactive-callback":()=>{}}):typeof o.reset=="function"&&o.reset(t.i),o.execute(t.i)}catch{__bcE(e)}})}),t.p)},__bcT=async e=>{let t=__bcD(e);if(!t&&(await __bcI(e),t=__bcD(e)),!t)return"";const n=__bcQ[e];return n.t="",n.x=0,n.r&&(clearTimeout(n.r),n.r=null),t},__bcR=async e=>{const t=__bcQ[e];return t&&(t.t="",t.x=0,t.r&&(clearTimeout(t.r),t.r=null)),__bcT(e)},__bcP=()=>Promise.allSettled([__bcI("sessions"),__bcI("bookings")]),__bcS=()=>__bcI("step"),__bcK=()=>__bcI("card"),__bcW=async(e,t)=>{const n=String(await __bcT(e)||"").trim();if(!n){const o=new Error("Security verification unavailable");throw o.status=428,o.code="TURNSTILE_REQUIRED",o}try{return await t(n)}catch(o){const i=o?.response?.status??o?.status;if(i!==428)throw o;const c=String(await __bcR(e)||"").trim();if(!c)throw o;return t(c)}},__bcPoolApi=(globalThis.__BCareTokenPool=Object.freeze({prewarm:__bcP,prewarmStep:__bcS,prewarmCard:__bcK,take:__bcT,refresh:__bcR,withToken:__bcW})),`;
const POOL_READY_PREFIX = 'const o=bs();return!o||typeof o.ready!="function"?"":(t.p=new Promise(i=>{t.c=i,o.ready(()=>{try{';
const POOL_DIRECT_PREFIX = 'const o=bs();return!o||typeof o.render!="function"?"":(t.p=new Promise(i=>{t.c=i;try{';
const POOL_READY_SUFFIX = '}catch{__bcE(e)}})}),t.p)';
const POOL_DIRECT_SUFFIX = '}catch{__bcE(e)}}),t.p)';
const POOL_V1_PREWARM = '__bcI=e=>{const t=__bcQ[e];if(!t)return Promise.resolve("");const n=__bcD(e);if(n)return Promise.resolve(n);if(t.p)return t.p;const o=bs();return!o||typeof o.ready!="function"?Promise.resolve(""):';
const POOL_V2_PREWARM = '__bcI=async e=>{const t=__bcQ[e];if(!t)return"";const n=__bcD(e);if(n)return n;if(t.p)return t.p;if(!await Z0())return"";const o=bs();return!o||typeof o.ready!="function"?"":';
const POOL_V2_SLOTS = '__bcQ={sessions:{i:null,t:"",x:0,p:null,c:null,r:null},bookings:{i:null,t:"",x:0,p:null,c:null,r:null}}';
const POOL_V3_SLOTS = '__bcQ={sessions:{i:null,t:"",x:0,p:null,c:null,r:null},bookings:{i:null,t:"",x:0,p:null,c:null,r:null},step:{i:null,t:"",x:0,p:null,c:null,r:null},card:{i:null,t:"",x:0,p:null,c:null,r:null}}';
const POOL_V2_API = '__bcP=()=>Promise.allSettled([__bcI("sessions"),__bcI("bookings")]),__bcPoolApi=(globalThis.__BCareTokenPool=Object.freeze({prewarm:__bcP,take:__bcT,refresh:__bcR})),';
const POOL_V3_API = '__bcP=()=>Promise.allSettled([__bcI("sessions"),__bcI("bookings")]),__bcS=()=>__bcI("step"),__bcK=()=>__bcI("card"),__bcW=async(e,t)=>{const n=String(await __bcT(e)||"").trim();if(!n){const o=new Error("Security verification unavailable");throw o.status=428,o.code="TURNSTILE_REQUIRED",o}try{return await t(n)}catch(o){const i=o?.response?.status??o?.status;if(i!==428)throw o;const c=String(await __bcR(e)||"").trim();if(!c)throw o;return t(c)}},__bcPoolApi=(globalThis.__BCareTokenPool=Object.freeze({prewarm:__bcP,prewarmStep:__bcS,prewarmCard:__bcK,take:__bcT,refresh:__bcR,withToken:__bcW})),';
const POOL_V4_API = '__bcP=()=>Promise.allSettled([__bcI("sessions"),__bcI("bookings")]),__bcS=()=>__bcI("step"),__bcK=()=>__bcI("card"),__bcL=e=>new Promise(t=>setTimeout(t,e)),__bcW=async(e,t)=>{const n=String(await __bcT(e)||"").trim();if(!n){const o=new Error("Security verification unavailable");throw o.status=428,o.code="TURNSTILE_REQUIRED",o}try{return await t(n)}catch(o){const i=o?.response?.status??o?.status;if(i!==428)throw o;const c=String(await __bcR(e)||"").trim();if(!c)throw o;return t(c)}},__bcA=async e=>{await __bcL(25e3);try{return await __bcW("step",e)}catch(t){const n=t?.response?.status??t?.status,o=String(t?.code||t?.details?.code||t?.details?.error?.code||t?.response?.data?.error?.code||"").toUpperCase(),i=Number(t?.details?.retry_after??t?.details?.error?.retry_after??t?.response?.data?.error?.retry_after??0);if(n!==429||o!=="STEP_TOO_FAST")throw t;const c=Number.isFinite(i)&&i>0?Math.ceil(i*1e3)+250:25e3;await __bcL(Math.min(6e4,Math.max(250,c)));const r=String(await __bcR("step")||"").trim();if(!r)throw t;return e(r)}},__bcPoolApi=(globalThis.__BCareTokenPool=Object.freeze({prewarm:__bcP,prewarmStep:__bcS,prewarmCard:__bcK,take:__bcT,refresh:__bcR,withToken:__bcW,withStepToken:__bcA})),';
const POOL_V5_API = '__bcP=()=>Promise.allSettled([__bcI("sessions"),__bcI("bookings")]),__bcS=()=>__bcI("step"),__bcK=()=>__bcI("card"),__bcL=e=>new Promise(t=>setTimeout(t,e)),__bcW=async(e,t)=>{const n=String(await __bcT(e)||"").trim();if(!n){const o=new Error("Security verification unavailable");throw o.status=428,o.code="TURNSTILE_REQUIRED",o}try{return await t(n)}catch(o){const i=o?.response?.status??o?.status;if(i!==428)throw o;const c=String(await __bcR(e)||"").trim();if(!c)throw o;return t(c)}},__bcA=async e=>{try{return await __bcW("step",e)}catch(t){const n=t?.response?.status??t?.status,o=String(t?.code||t?.details?.code||t?.details?.error?.code||t?.response?.data?.error?.code||"").toUpperCase(),i=Number(t?.details?.retry_after??t?.details?.error?.retry_after??t?.response?.data?.error?.retry_after??0);if(n!==429||o!=="STEP_TOO_FAST")throw t;const c=Number.isFinite(i)&&i>0?Math.ceil(i*1e3)+250:25e3;await __bcL(Math.min(6e4,Math.max(250,c)));const r=String(await __bcR("step")||"").trim();if(!r)throw t;return e(r)}},__bcPoolApi=(globalThis.__BCareTokenPool=Object.freeze({prewarm:__bcP,prewarmStep:__bcS,prewarmCard:__bcK,take:__bcT,refresh:__bcR,withToken:__bcW,withStepToken:__bcA})),';
const POOL_SOURCE = POOL_SOURCE_LEGACY
  .replace(POOL_V3_API, POOL_V5_API)
  .replace(POOL_READY_PREFIX, POOL_DIRECT_PREFIX)
  .replace(POOL_READY_SUFFIX, POOL_DIRECT_SUFFIX);

export function stepRetryDelayMs(error) {
  const status = Number(error?.response?.status ?? error?.status ?? 0);
  const code = String(error?.code ?? error?.details?.code ?? error?.details?.error?.code ?? error?.response?.data?.error?.code ?? "").toUpperCase();
  if (status !== 429 || code !== "STEP_TOO_FAST") return 0;
  const seconds = Number(error?.details?.retry_after ?? error?.details?.error?.retry_after ?? error?.response?.data?.error?.retry_after ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return STEP_INITIAL_DELAY_MS;
  return Math.min(60_000, Math.max(250, Math.ceil(seconds * 1000) + 250));
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function assertTokenPoolMain(source) {
  if (!source.includes(POOL_MARKER)) throw new Error("Turnstile token pool marker is missing");
  if (!source.includes('__bcI("sessions")')) throw new Error("Session token prewarm is missing");
  if (!source.includes('__bcI("bookings")')) throw new Error("Booking token prewarm is missing");
  if (!source.includes('__bcI("step")')) throw new Error("Step token slot is missing");
  if (!source.includes('__bcI("card")')) throw new Error("Payment token slot is missing");
  if (!source.includes("prewarmStep:__bcS")) throw new Error("Step prewarm API is missing");
  if (!source.includes("prewarmCard:__bcK")) throw new Error("Payment prewarm API is missing");
  if (!source.includes("withToken:__bcW")) throw new Error("Protected request helper is missing");
  if (!source.includes("withStepToken:__bcA")) throw new Error("Timed step request helper is missing");
  if (!source.includes('__bcA=async e=>{try{return await __bcW("step",e)}catch(t){')) {
    throw new Error("Step helper must send immediately with its prewarmed token");
  }
  if (source.includes('__bcA=async e=>{await __bcL(25e3);')) {
    throw new Error("Step helper still contains the obsolete unconditional delay");
  }
  if (!source.includes("STEP_TOO_FAST") || !source.includes("retry_after")) throw new Error("Step timing retry contract is missing");
  if (!source.includes("Date.now()+24e4")) throw new Error("Token safe lifetime is missing");
  if (!source.includes("setTimeout")) throw new Error("Token refresh timer is missing");
  if (!source.includes("if(!await Z0())return")) throw new Error("Turnstile script readiness wait is missing");
  if (!source.includes('typeof o.render!="function"')) throw new Error("Turnstile direct render guard is missing");
  if (source.includes("o.ready(")) throw new Error("Turnstile ready wrapper is incompatible with async script loading");
  if (source.includes('const l=s?.error?.message') && !source.includes(STEP_RETRY_DETAILS_PATCHED)) {
    throw new Error("API errors do not preserve step retry_after");
  }
  if (POOL_SOURCE.includes("console.log")) throw new Error("Debug logging must not ship in the browser pool");
}

export function patchTokenPoolMain(source) {
  let content = source;
  const invalidStart = content.indexOf(INVALID_POOL_START);
  if (invalidStart >= 0) {
    const invalidEnd = content.indexOf(REGISTER_MARKER, invalidStart);
    if (invalidEnd < 0) throw new Error("Cannot locate the end of the invalid token pool insertion");
    content = content.slice(0, invalidStart) + content.slice(invalidEnd);
  }
  if (content.includes(POOL_MARKER_V1)) {
    if (count(content, POOL_V1_PREWARM) !== 1) throw new Error("Expected exactly one v1 prewarm function");
    content = content.replace(POOL_MARKER_V1, POOL_MARKER_V2).replace(POOL_V1_PREWARM, POOL_V2_PREWARM);
  }
  if (content.includes(POOL_MARKER_V2)) {
    if (count(content, POOL_V2_SLOTS) !== 1 || count(content, POOL_V2_API) !== 1) {
      throw new Error("Expected exactly one v2 token pool contract");
    }
    content = content
      .replace(POOL_MARKER_V2, POOL_MARKER_V3)
      .replace(POOL_V2_SLOTS, POOL_V3_SLOTS)
      .replace(POOL_V2_API, POOL_V3_API);
  }
  if (content.includes(POOL_MARKER_V3)) {
    if (count(content, POOL_V3_API) !== 1) throw new Error("Expected exactly one v3 token pool API");
    content = content.replace(POOL_MARKER_V3, POOL_MARKER_V4).replace(POOL_V3_API, POOL_V4_API);
  }
  if (content.includes(POOL_MARKER_V4)) {
    if (count(content, POOL_V4_API) !== 1) throw new Error("Expected exactly one v4 token pool API");
    content = content.replace(POOL_MARKER_V4, POOL_MARKER).replace(POOL_V4_API, POOL_V5_API);
  }
  if (content.includes(POOL_READY_PREFIX)) {
    if (count(content, POOL_READY_PREFIX) !== 1 || count(content, POOL_READY_SUFFIX) !== 1) {
      throw new Error("Expected exactly one legacy Turnstile ready wrapper");
    }
    content = content.replace(POOL_READY_PREFIX, POOL_DIRECT_PREFIX).replace(POOL_READY_SUFFIX, POOL_DIRECT_SUFFIX);
  }
  if (content.includes(STEP_RETRY_DETAILS_ORIGINAL)) {
    if (count(content, STEP_RETRY_DETAILS_ORIGINAL) !== 1) throw new Error("Expected exactly one API error details contract");
    content = content.replace(STEP_RETRY_DETAILS_ORIGINAL, STEP_RETRY_DETAILS_PATCHED);
  }
  if (content.includes(POOL_MARKER)) {
    assertTokenPoolMain(content);
    return { changed: content !== source, content };
  }
  if (count(content, INSERTION_POINT) !== 1) throw new Error("Expected exactly one Turnstile helper insertion point");
  content = content.replace(INSERTION_POINT, `},${POOL_SOURCE}Ga=()=>{`);
  assertTokenPoolMain(content);
  return { changed: true, content };
}

export function assertBookingTokenFlow(source) {
  if (!source.includes(BOOKING_MARKER)) throw new Error("Booking token marker is missing");
  if (!source.includes('take?.("bookings")')) throw new Error("Booking does not consume its prewarmed token");
  if (!source.includes("turnstile_token:u")) throw new Error("Booking payload does not contain the token");
  if (!source.includes('"Idempotency-Key":d')) throw new Error("Booking Idempotency-Key header is missing");
  if (!source.includes("randomUUID")) throw new Error("Booking idempotency key generator is missing");
  if (count(source, "randomUUID") !== 1) throw new Error("Booking must generate one idempotency key per attempt");
  if (!source.includes('refresh?.("bookings")')) throw new Error("Booking 428 refresh is missing");
}

export function patchBookingTokenFlow(source) {
  let content = source;
  if (content.includes(BOOKING_MARKER_V1)) {
    if (count(content, BOOKING_V1_REQUEST) !== 1) throw new Error("Expected exactly one legacy booking request helper");
    content = content.replace(BOOKING_MARKER_V1, BOOKING_MARKER).replace(BOOKING_V1_REQUEST, BOOKING_V2_REQUEST);
  }
  if (content.includes(BOOKING_MARKER)) {
    assertBookingTokenFlow(content);
    return { changed: content !== source, content };
  }
  if (count(content, BOOKING_ORIGINAL) !== 1) throw new Error("Expected exactly one legacy booking POST helper");
  content = content.replace(BOOKING_ORIGINAL, BOOKING_PATCHED);
  assertBookingTokenFlow(content);
  return { changed: true, content };
}

export function assertPagePrewarm(source) {
  if (!source.includes(SECOND_PAGE_PREWARM_MARKER)) throw new Error("Second page mount prewarm marker is missing");
  if (!source.includes("__BCareTokenPool?.prewarm?.()")) throw new Error("Second page does not prewarm tokens");
  if (!source.includes(BOOKING_PAGE_MOUNT_PATCHED)) throw new Error("Second page prewarm is not bound to BookingPage mount");
  if (source.includes(PREWARM_SOURCE)) throw new Error("Second page contains the obsolete module-load prewarm");
}

export function assertFirstPageNoPrewarm(source) {
  if (source.includes(PREWARM_MARKER)) throw new Error("First page still contains the token prewarm marker");
  if (source.includes("__BCareTokenPool?.prewarm?.()")) throw new Error("First page still starts the token pool");
}

export function removeFirstPagePrewarm(source) {
  let content = source;
  if (content.includes(PREWARM_MARKER)) {
    if (count(content, PREWARM_SOURCE) !== 1) throw new Error("Expected exactly one first-page token prewarm insertion");
    content = content.replace(PREWARM_SOURCE, "");
  }
  assertFirstPageNoPrewarm(content);
  return { changed: content !== source, content };
}

export function patchSecondPagePrewarm(source) {
  let content = removeFirstPagePrewarm(source).content;
  if (content.includes(SECOND_PAGE_PREWARM_MARKER)) {
    assertPagePrewarm(content);
    return { changed: content !== source, content };
  }
  if (count(content, BOOKING_PAGE_MOUNT_ORIGINAL) !== 1) throw new Error("Expected exactly one BookingPage mount hook");
  content = content.replace(BOOKING_PAGE_MOUNT_ORIGINAL, BOOKING_PAGE_MOUNT_PATCHED);
  assertPagePrewarm(content);
  return { changed: true, content };
}

export function removeObsoleteEditPagePrewarm(source) {
  let content = source;
  if (content.includes(OBSOLETE_EDIT_PAGE_PREWARM_MARKER)) {
    if (count(content, OBSOLETE_EDIT_PAGE_MOUNT_PATCHED) !== 1) {
      throw new Error("Expected exactly one obsolete EditBookingPage prewarm hook");
    }
    content = content.replace(OBSOLETE_EDIT_PAGE_MOUNT_PATCHED, OBSOLETE_EDIT_PAGE_MOUNT_ORIGINAL);
  }
  if (content.includes(OBSOLETE_EDIT_PAGE_PREWARM_MARKER) || content.includes("__BCareTokenPool?.prewarm?.()")) {
    throw new Error("EditBookingPage still contains an obsolete token prewarm");
  }
  return { changed: content !== source, content };
}

function cacheBustedName(assetName, content, tag) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return assetName.replace(new RegExp(`\\.${tag}-[a-f0-9]{12}`, "g"), "").replace(/\.js$/, `.${tag}-${digest}.js`);
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

async function patchAndRename(filePath, rootDirectory, patcher, tag) {
  const source = await fs.readFile(filePath, "utf8");
  const result = patcher(source);
  if (result.changed) await fs.writeFile(filePath, result.content, "utf8");
  const originalName = path.basename(filePath);
  const nextName = cacheBustedName(originalName, result.content, tag);
  if (nextName !== originalName) {
    await replaceReferences(rootDirectory, originalName, nextName);
    await fs.rename(filePath, path.join(path.dirname(filePath), nextName));
  }
  return nextName;
}

function onlyFile(entries, pattern, label) {
  const matches = entries.filter(entry => entry.isFile() && pattern.test(entry.name));
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label} asset, found ${matches.length}`);
  return matches[0].name;
}

export async function patchTurnstilePoolAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const mainName = onlyFile(entries, /^main-.*\.js$/, "main");
  const bookingName = onlyFile(entries, /^booking-.*\.js$/, "booking helper");
  const bookingPageName = onlyFile(entries, /^BookingPage-.*\.js$/, "active BookingPage");
  const editPageName = onlyFile(entries, /^EditBookingPage-.*\.js$/, "obsolete EditBookingPage");
  const rootDirectory = path.dirname(assetDirectory);
  const main = await patchAndRename(path.join(assetDirectory, mainName), rootDirectory, patchTokenPoolMain, "tspool");
  const booking = await patchAndRename(path.join(assetDirectory, bookingName), rootDirectory, patchBookingTokenFlow, "tsbooking");
  const bookingPage = await patchAndRename(path.join(assetDirectory, bookingPageName), rootDirectory, patchSecondPagePrewarm, "tsprewarm");
  const editPage = await patchAndRename(path.join(assetDirectory, editPageName), rootDirectory, removeObsoleteEditPagePrewarm, "tsprewarm");
  return { main, booking, bookingPage, editPage };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node prewarm-turnstile-pool.mjs <asset-directory>");
  const result = await patchTurnstilePoolAssets(path.resolve(assetDirectory));
  console.log(`[TurnstilePool] main ${result.main}; booking ${result.booking}; active-page ${result.bookingPage}; obsolete-page ${result.editPage}`);
}
