import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "__bcTsWait";
const STATE = "let Rr=null,pr=null,Wa=!1,Or=null;";
const STATE_FIXED = "let Rr=null,pr=null,Wa=!1,Or=null,__bcTsWait=null;";
const RENDER = 'pr=t.render(r,{sitekey:yi,size:"invisible",appearance:"execute"}),Wa=!0,!0';
const RENDER_FIXED = 'pr=t.render(r,{sitekey:yi,size:"invisible",appearance:"execute",execution:"execute",callback:o=>{const i=String(o||"").trim(),s=__bcTsWait;__bcTsWait=null,s&&s(i)},"error-callback":()=>{const o=__bcTsWait;__bcTsWait=null,o&&o("")},"expired-callback":()=>{const o=__bcTsWait;__bcTsWait=null,o&&o("")},"timeout-callback":()=>{const o=__bcTsWait;__bcTsWait=null,o&&o("")}}),Wa=!0,!0';
const RENDER_INTERACTIVE = 'pr=t.render(r,{sitekey:yi,size:"flexible",appearance:"interaction-only",execution:"execute",callback:o=>{r.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";r.setAttribute("aria-hidden","true");const i=String(o||"").trim(),s=__bcTsWait;__bcTsWait=null,s&&s(i)},"error-callback":()=>{r.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";r.setAttribute("aria-hidden","true");const o=__bcTsWait;__bcTsWait=null,o&&o("")},"expired-callback":()=>{r.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";r.setAttribute("aria-hidden","true");const o=__bcTsWait;__bcTsWait=null,o&&o("")},"timeout-callback":()=>{r.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";r.setAttribute("aria-hidden","true");const o=__bcTsWait;__bcTsWait=null,o&&o("")},"before-interactive-callback":()=>{r.style.cssText="position:fixed;left:50%;top:50%;width:min(320px,calc(100vw - 32px));height:auto;opacity:1;pointer-events:auto;transform:translate(-50%,-50%);z-index:2147483647";r.removeAttribute("aria-hidden")}}),Wa=!0,!0';
const CONTAINER_OFFSCREEN = 'e.style.position="fixed",e.style.left="-9999px",e.style.top="0",e.style.width="1px",e.style.height="1px",e.style.opacity="0",e.style.pointerEvents="none"';
const CONTAINER_DIMENSIONED = 'e.style.position="fixed",e.style.left="-9999px",e.style.top="0",e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px",e.style.opacity="0",e.style.pointerEvents="none"';
const EXECUTE = 'const t=bs();return!t||pr===null||typeof t.execute!="function"?"":new Promise(r=>{const n=o=>{r(String(o||"").trim())};try{t.execute(pr,{callback:o=>n(o),"error-callback":()=>n(""),"expired-callback":()=>n(""),"timeout-callback":()=>n("")})}catch{n("")}})';
const EXECUTE_FIXED = 'const t=bs();if(!t||pr===null||typeof t.execute!="function")return"";const a=typeof t.getResponse=="function"?String(t.getResponse(pr)||"").trim():"";return a||new Promise(r=>{const n=o=>{__bcTsWait===n&&(__bcTsWait=null),r(String(o||"").trim())};__bcTsWait=n;try{t.execute(pr)}catch{n("")}})';

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function assertCallbackFlow(source) {
  if (!source.includes(MARKER)) throw new Error("Turnstile render callback wiring is missing");
  if (!source.includes('execution:"execute"')) throw new Error("Turnstile execution mode is missing");
  const nativeInvisible = source.includes("__bcTsInvisibleFirst");
  if (!nativeInvisible && !source.includes('size:"flexible"')) throw new Error("Turnstile flexible interactive size is missing");
  if (!nativeInvisible && !source.includes('appearance:"interaction-only"') && !source.includes('appearance:"always"')) throw new Error("Turnstile appearance is missing");
  if (!nativeInvisible && !source.includes('before-interactive-callback')) throw new Error("Turnstile interactive callback is missing");
  if (nativeInvisible && (source.includes('appearance:"interaction-only"') || source.includes('size:"flexible"'))) {
    throw new Error("Managed display options remain on the native Invisible widget");
  }
  if (!source.includes('e.style.width="min(320px,calc(100vw - 32px))"')) throw new Error("Turnstile render container width is missing");
  if (!source.includes('e.style.height="65px"')) throw new Error("Turnstile render container height is missing");
  if (!source.includes("t.execute(pr)")) throw new Error("Turnstile execution call is missing");
  if (source.includes('t.execute(pr,{callback:')) throw new Error("Turnstile callbacks are still passed to execute");
}

export function repairCallbackFlowSource(source) {
  let content = source;
  if (content.includes("__bcTsInvisibleFirst")) {
    assertCallbackFlow(content);
    return { changed: false, content };
  }
  if (content.includes("__bcTsWidgetVisible")) {
    assertCallbackFlow(content);
    return { changed: false, content };
  }
  if (!content.includes(MARKER)) {
    for (const [name, needle] of [["state", STATE], ["render", RENDER], ["execute", EXECUTE]]) {
      if (count(content, needle) !== 1) throw new Error(`Expected exactly one ${name} Turnstile fragment`);
    }
    content = content
      .replace(STATE, STATE_FIXED)
      .replace(RENDER, RENDER_FIXED)
      .replace(EXECUTE, EXECUTE_FIXED);
  }
  if (!content.includes('appearance:"interaction-only"')) {
    if (count(content, RENDER_FIXED) !== 1) throw new Error("Expected exactly one callback-enabled Turnstile render fragment");
    content = content.replace(RENDER_FIXED, RENDER_INTERACTIVE);
  }
  if (content.includes('appearance:"interaction-only"') && !content.includes('size:"flexible"')) {
    if (count(content, RENDER_INTERACTIVE.replace('size:"flexible"', 'size:"invisible"')) !== 1) {
      throw new Error("Expected exactly one invisible interactive Turnstile render fragment");
    }
    content = content.replace(RENDER_INTERACTIVE.replace('size:"flexible"', 'size:"invisible"'), RENDER_INTERACTIVE);
  }
  if (!content.includes('e.style.width="min(320px,calc(100vw - 32px))"')) {
    if (count(content, CONTAINER_OFFSCREEN) !== 1) throw new Error("Expected exactly one undersized Turnstile container fragment");
    content = content.replace(CONTAINER_OFFSCREEN, CONTAINER_DIMENSIONED);
  }
  assertCallbackFlow(content);
  return { changed: content !== source, content };
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const baseName = assetName.replace(/\.turnstilecb-[a-f0-9]{12}/g, "");
  return baseName.replace(/\.js$/, `.turnstilecb-${digest}.js`);
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

export async function repairCallbackFlowAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);
  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = repairCallbackFlowSource(source);
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
  if (!assetDirectory) throw new Error("Usage: node repair-turnstile-callback-flow.mjs <asset-directory>");
  const result = await repairCallbackFlowAssets(path.resolve(assetDirectory));
  console.log(`[TurnstileCallback] updated ${result.changed}; asset ${result.asset}`);
}
