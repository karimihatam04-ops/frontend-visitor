const RUNTIME_HOST_MARKER = "__BCARE_RUNTIME_PUBLIC_HOST__";
const COPIED_HOSTS = new Set([
  "bcare-spa-gdkwxzkl.manus.space",
  "bcareapp-cqsxcdmi.manus.space",
  "tamenasaa.manus.space",
  "temansu.manus.space",
]);
const QR_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/";

function replaceCopiedHostText(value, hostname) {
  let nextValue = value.replaceAll(RUNTIME_HOST_MARKER, hostname);
  for (const copiedHost of COPIED_HOSTS) {
    nextValue = nextValue.replaceAll(copiedHost, hostname);
  }
  return nextValue;
}

function synchronizePublicHost(root = document) {
  const { hostname, origin } = window.location;
  if (!hostname || !origin || !/^https?:$/.test(window.location.protocol)) return;

  const queryRoot = root.querySelectorAll ? root : document;
  for (const image of queryRoot.querySelectorAll(`img[src^="${QR_ENDPOINT}"]`)) {
    const qrUrl = new URL(image.src);
    if (qrUrl.searchParams.get("data") !== origin) {
      qrUrl.searchParams.set("data", origin);
      image.src = qrUrl.toString();
    }
  }

  const walkerRoot = root.nodeType === Node.TEXT_NODE ? root.parentNode : root;
  if (!walkerRoot) return;
  const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const nextValue = replaceCopiedHostText(textNode.nodeValue || "", hostname);
    if (nextValue !== textNode.nodeValue) textNode.nodeValue = nextValue;
    textNode = walker.nextNode();
  }
}

let synchronizationQueued = false;
function scheduleSynchronization(root = document) {
  if (synchronizationQueued) return;
  synchronizationQueued = true;
  queueMicrotask(() => {
    synchronizationQueued = false;
    synchronizePublicHost(root);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => scheduleSynchronization(), { once: true });
} else {
  scheduleSynchronization();
}

new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) scheduleSynchronization(node);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
