import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "__bcTsWidgetVisible";
const APPEARANCE_HIDDEN = 'appearance:"interaction-only"';
const APPEARANCE_VISIBLE = 'appearance:"always",__bcTsWidgetVisible:!0';
const CONTAINER_DIMENSIONED = 'e.style.position="fixed",e.style.left="-9999px",e.style.top="0",e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px",e.style.opacity="0",e.style.pointerEvents="none"';
const CONTAINER_VISIBLE = 'e.style.position="fixed",e.style.left="50%",e.style.top="50%",e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px",e.style.opacity="1",e.style.pointerEvents="auto",e.style.transform="translate(-50%,-50%)",e.style.zIndex="2147483647"';

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function assertVisibleWidget(source) {
  if (!source.includes(MARKER)) throw new Error("Visible Turnstile widget marker is missing");
  if (!source.includes('appearance:"always"')) throw new Error("Turnstile must use always-visible appearance");
  if (!source.includes('e.style.left="50%"')) throw new Error("Turnstile container is not visible");
  if (!source.includes('e.style.height="65px"')) throw new Error("Turnstile container dimensions are missing");
}

export function showVisibleWidgetSource(source) {
  if (source.includes(MARKER)) {
    assertVisibleWidget(source);
    return { changed: false, content: source };
  }
  if (count(source, APPEARANCE_HIDDEN) !== 1) throw new Error("Expected exactly one interactive Turnstile appearance fragment");
  if (count(source, CONTAINER_DIMENSIONED) !== 1) throw new Error("Expected exactly one dimensioned hidden Turnstile container");
  const content = source
    .replace(APPEARANCE_HIDDEN, APPEARANCE_VISIBLE)
    .replace(CONTAINER_DIMENSIONED, CONTAINER_VISIBLE);
  assertVisibleWidget(content);
  return { changed: true, content };
}

function cacheBustedName(assetName, content) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return assetName.replace(/\.tswidget-[a-f0-9]{12}/g, "").replace(/\.js$/, `.tswidget-${digest}.js`);
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

export async function showVisibleWidgetAssets(assetDirectory) {
  const candidates = (await fs.readdir(assetDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^main-.*\.js$/.test(entry.name))
    .map(entry => path.join(assetDirectory, entry.name));
  if (candidates.length !== 1) throw new Error(`Expected exactly one main browser asset, found ${candidates.length}`);
  const filePath = candidates[0];
  const source = await fs.readFile(filePath, "utf8");
  const result = showVisibleWidgetSource(source);
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
  if (!assetDirectory) throw new Error("Usage: node show-turnstile-register-widget.mjs <asset-directory>");
  const result = await showVisibleWidgetAssets(path.resolve(assetDirectory));
  console.log(`[TurnstileWidget] updated ${result.changed}; asset ${result.asset}`);
}
