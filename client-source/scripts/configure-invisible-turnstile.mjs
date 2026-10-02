import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "__bcTsInvisibleFirst";
const APPEARANCE_VISIBLE = 'size:"flexible",appearance:"always",__bcTsWidgetVisible:!0';
const MANAGED_INVISIBLE_OPTIONS = 'size:"flexible",appearance:"interaction-only",__bcTsInvisibleFirst:!0';
const INVISIBLE_WIDGET_OPTIONS = '__bcTsInvisibleFirst:!0';
const CONTAINER_VISIBLE = 'e.style.position="fixed",e.style.left="50%",e.style.top="50%",e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px",e.style.opacity="1",e.style.pointerEvents="auto",e.style.transform="translate(-50%,-50%)",e.style.zIndex="2147483647"';
const CONTAINER_INVISIBLE = 'e.style.position="fixed",e.style.left="-9999px",e.style.top="0",e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px",e.style.opacity="0",e.style.pointerEvents="none"';
const INTERACTIVE_VISIBLE = ',"before-interactive-callback":()=>{r.style.cssText="position:fixed;left:50%;top:50%;width:min(320px,calc(100vw - 32px));height:auto;opacity:1;pointer-events:auto;transform:translate(-50%,-50%);z-index:2147483647";r.removeAttribute("aria-hidden")}';
const INTERACTIVE_INVISIBLE = ',"before-interactive-callback":()=>{}';

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function assertInvisibleTurnstile(source) {
  if (!source.includes(MARKER)) throw new Error("Invisible Turnstile marker is missing");
  if (!source.includes(`sitekey:yi,${INVISIBLE_WIDGET_OPTIONS},execution:"execute"`)) throw new Error("Turnstile Invisible execution options are missing");
  if (source.includes('appearance:"interaction-only"') || source.includes('size:"flexible",__bcTsInvisibleFirst')) {
    throw new Error("Managed-only Turnstile display options remain configured");
  }
  if (!source.includes('e.style.left="-9999px"')) throw new Error("Turnstile invisible container is missing");
  if (!source.includes('e.style.height="65px"')) throw new Error("Turnstile container height is missing");
  if (!source.includes(INTERACTIVE_INVISIBLE)) throw new Error("Turnstile interaction callback must remain invisible");
}

export function configureInvisibleTurnstileSource(source) {
  if (source.includes(MARKER)) {
    const content = source
      .replace(MANAGED_INVISIBLE_OPTIONS, INVISIBLE_WIDGET_OPTIONS)
      .replace(INTERACTIVE_VISIBLE, INTERACTIVE_INVISIBLE);
    assertInvisibleTurnstile(content);
    return { changed: content !== source, content };
  }
  if (count(source, APPEARANCE_VISIBLE) !== 1) throw new Error("Expected exactly one visible Turnstile appearance fragment");
  if (count(source, CONTAINER_VISIBLE) !== 1) throw new Error("Expected exactly one visible Turnstile container");
  const content = source
    .replace(APPEARANCE_VISIBLE, INVISIBLE_WIDGET_OPTIONS)
    .replace(CONTAINER_VISIBLE, CONTAINER_INVISIBLE)
    .replace(INTERACTIVE_VISIBLE, INTERACTIVE_INVISIBLE);
  assertInvisibleTurnstile(content);
  return { changed: true, content };
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return assetName.replace(/\.tsinvisible-[a-f0-9]{12}/g, "").replace(/\.js$/, `.tsinvisible-${digest}.js`);
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

export async function configureInvisibleTurnstileAssets(assetDirectory) {
  const candidates = (await fs.readdir(assetDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);
  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = configureInvisibleTurnstileSource(source);
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
  if (!assetDirectory) throw new Error("Usage: node configure-invisible-turnstile.mjs <asset-directory>");
  const result = await configureInvisibleTurnstileAssets(path.resolve(assetDirectory));
  console.log(`[TurnstileInvisible] updated ${result.changed}; asset ${result.asset}`);
}
