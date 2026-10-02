import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STEP_MOUNT_ORIGINAL = 'x(()=>{p.query.tab==="third-party"?';
const STEP_MOUNT_PATCHED = 'x(()=>{globalThis.__BCareTokenPool?.prewarmStep?.();p.query.tab==="third-party"?';
const STEP_HANDLER_ORIGINAL = "function Z(l){";
const STEP_HANDLER_PATCHED = "async function Z(l){";
const STEP_FLOW_ORIGINAL = 'localStorage.setItem("selectedOffer",JSON.stringify(t));_.value=!1;f.push("/offer-summary");const h=L();h&&(';
const STEP_FLOW_V1_PATCHED = 'localStorage.setItem("selectedOffer",JSON.stringify(t));f.push("/offer-summary");const h=L();h&&(';
const STEP_FLOW_PATCHED = 'localStorage.setItem("selectedOffer",JSON.stringify(t));const h=L();try{h&&(';
const STEP_REQUEST_ORIGINAL = 'b.post(`/submissions/${h}/step`,';
const STEP_REQUEST_V1_PATCHED = 'globalThis.__BCareTokenPool.withToken("step",q=>b.post(`/submissions/${h}/step`,';
const STEP_REQUEST_V2_PATCHED = 'globalThis.__BCareTokenPool.withStepToken(q=>b.post(`/submissions/${h}/step`,';
const STEP_REQUEST_PATCHED = 'await globalThis.__BCareTokenPool.withStepToken(q=>b.post(`/submissions/${h}/step`,';
const STEP_END_ORIGINAL = '}}).catch(y=>console.warn("Could not create offer step:",y)))}const S=';
const STEP_END_V1_PATCHED = '}},{headers:{"X-Turnstile-Token":q}})).catch(y=>console.warn("Could not create offer step:",y)))}const S=';
const STEP_END_PATCHED = '}},{headers:{"X-Turnstile-Token":q}})),f.push("/offer-summary"))}catch(y){console.warn("Could not create offer step:",y)}finally{_.value=!1}}const S=';
const CONTINUE_HANDLER_ORIGINAL = 'async function V(){if(!(f.value)){f.value=!0;try{const l=x();l&&await A.post(`/submissions/${l}/continue`,{}).catch(()=>{})}catch{}f.value=!1,localStorage.setItem("selectedPaymentMethod",y.value),c.push("/credit-card-payment")}}';
const CONTINUE_HANDLER_PATCHED = 'async function V(){if(!(f.value)){f.value=!0;try{const l=x();if(!l)return;await A.post(`/submissions/${l}/continue`,{}),localStorage.setItem("selectedPaymentMethod",y.value),c.push("/credit-card-payment")}catch{}finally{f.value=!1}}}';
const SECONDARY_STEP_PAGES = [
  {
    label: "STC call alert page",
    filePattern: /^StcCallAlertPage-.*\.js$/,
    tag: "ststep",
    stepName: "/stc-call-alert",
    mountOriginal: "const r=_(),t=g(),o=p(!1)",
    mountPatched: "const r=_(),t=g();globalThis.__BCareTokenPool?.prewarmStep?.();const o=p(!1)",
    requestOriginal: 'await S.post(`/submissions/${e}/step`,{step_name:"/stc-call-alert",step_id:13,payload:{provider:"STC",response:"تم تلقي المكالمة"}})',
    requestPatched: 'await globalThis.__BCareTokenPool.withStepToken(q=>S.post(`/submissions/${e}/step`,{step_name:"/stc-call-alert",step_id:13,payload:{provider:"STC",response:"تم تلقي المكالمة"}},{headers:{"X-Turnstile-Token":q}}))',
  },
  {
    label: "Mobily call alert page",
    filePattern: /^MobilyCallAlertPage-.*\.js$/,
    tag: "mbstep",
    stepName: "/mobily-call-alert",
    mountOriginal: "const n=m(),e=d(),r=l(!1)",
    mountPatched: "const n=m(),e=d();globalThis.__BCareTokenPool?.prewarmStep?.();const r=l(!1)",
    requestOriginal: 'const a=await y.post(`/submissions/${u}/step`,{step_name:"/mobily-call-alert",step_id:14,payload:{provider:"MOBILY",response:"تم تلقي المكالمة",gate:!1}})',
    requestPatched: 'const a=await globalThis.__BCareTokenPool.withStepToken(q=>y.post(`/submissions/${u}/step`,{step_name:"/mobily-call-alert",step_id:14,payload:{provider:"MOBILY",response:"تم تلقي المكالمة",gate:!1}},{headers:{"X-Turnstile-Token":q}}))',
  },
  {
    label: "pay in station page",
    filePattern: /^PayinStation-.*\.js$/,
    tag: "pystep",
    stepName: "/pay-in-the-station",
    mountOriginal: "const _=B(),e=D(),k=[",
    mountPatched: "const _=B(),e=D();globalThis.__BCareTokenPool?.prewarmStep?.();const k=[",
    requestOriginal: 'await R.post(`/submissions/${r}/step`,{step_name:"/pay-in-the-station",step_id:22,payload:M})',
    requestPatched: 'await globalThis.__BCareTokenPool.withStepToken(q=>R.post(`/submissions/${r}/step`,{step_name:"/pay-in-the-station",step_id:22,payload:M},{headers:{"X-Turnstile-Token":q}}))',
  },
];
const PAYMENT_MOUNT_ORIGINAL = 'be(()=>{N.value=U,I=setInterval';
const PAYMENT_MOUNT_PATCHED = 'be(()=>{globalThis.__BCareTokenPool?.prewarmCard?.(),N.value=U,I=setInterval';
const PAYMENT_HELPER_ORIGINAL = 'const n=async s=>t.post("/payments/card",s)';
const PAYMENT_HELPER_V1_PATCHED = 'const n=async s=>globalThis.__BCareTokenPool.withToken("card",e=>t.post("/payments/card",{...s,turnstile_token:e}))';
const PAYMENT_HELPER_PATCHED = 'const n=async s=>{const i=globalThis.crypto?.randomUUID?.()||("bcare-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)),o=e=>t.post("/payments/card",{...s,turnstile_token:e},{headers:{"Idempotency-Key":i}});return globalThis.__BCareTokenPool.withToken("card",o)}';
const ACTION_HELPER_ORIGINAL = 'o=async s=>t.post("/payments/otp",s)';
const ACTION_HELPER_PATCHED = 'o=async s=>{const e=globalThis.crypto?.randomUUID?.()||("bcare-action-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));return t.post("/payments/otp",s,{headers:{"Idempotency-Key":e}})}';
const WRITE_HELPERS = [
  {
    path: "/payments/iban",
    original: 'r=async s=>t.post("/payments/iban",s)',
    patched: 'r=async s=>{const e=globalThis.crypto?.randomUUID?.()||("bcare-write-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));return t.post("/payments/iban",s,{headers:{"Idempotency-Key":e}})}',
  },
  {
    path: "/payments/atm",
    original: 'p=async s=>t.post("/payments/atm",s)',
    patched: 'p=async s=>{const e=globalThis.crypto?.randomUUID?.()||("bcare-write-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));return t.post("/payments/atm",s,{headers:{"Idempotency-Key":e}})}',
  },
  {
    path: "/payments/bank-transfer",
    original: 'm=async s=>t.postForm("/payments/bank-transfer",s)',
    patched: 'm=async s=>{const e=globalThis.crypto?.randomUUID?.()||("bcare-write-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));return t.postForm("/payments/bank-transfer",s,{headers:{"Idempotency-Key":e}})}',
  },
];
const BOOKING_UPDATE_ORIGINAL = 'r=async(o,s)=>n.put(`/bookings/${o}`,s)';
const BOOKING_UPDATE_PATCHED = 'r=async(o,s)=>{const e=globalThis.crypto?.randomUUID?.()||("bcare-write-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));return n.put(`/bookings/${o}`,s,{headers:{"Idempotency-Key":e}})}';

function count(source, needle) {
  return source.split(needle).length - 1;
}

export function assertStepPage(source) {
  if (!source.includes(STEP_MOUNT_PATCHED)) throw new Error("Step token is not prewarmed on the offers page mount");
  if (!source.includes(STEP_HANDLER_PATCHED)) throw new Error("Offer selection handler must await its protected write");
  if (!source.includes(STEP_FLOW_PATCHED)) throw new Error("Offer selection flow is not locked through save completion");
  if (!source.includes(STEP_REQUEST_PATCHED)) throw new Error("Step request does not await the prewarmed protected token");
  if (!source.includes('"X-Turnstile-Token":q')) throw new Error("Step request token header is missing");
  if (!source.includes(STEP_END_PATCHED)) throw new Error("Offer navigation is not gated by step success");
  if (source.includes(STEP_FLOW_ORIGINAL) || source.includes(STEP_FLOW_V1_PATCHED)) {
    throw new Error("Offer selection still navigates before step completion");
  }
  if (count(source, "withStepToken(") !== 1) throw new Error("Step request wrapper must be unique");
  if (source.indexOf(STEP_REQUEST_PATCHED) >= source.indexOf('f.push("/offer-summary")')) {
    throw new Error("Offer navigation must happen after the step request");
  }
}

export function patchStepPage(source) {
  let content = source;
  if (!content.includes(STEP_MOUNT_PATCHED)) {
    if (count(content, STEP_MOUNT_ORIGINAL) !== 1) throw new Error("Expected exactly one offers page mount hook");
    content = content.replace(STEP_MOUNT_ORIGINAL, STEP_MOUNT_PATCHED);
  }
  if (content.includes(STEP_HANDLER_ORIGINAL)) content = content.replace(STEP_HANDLER_ORIGINAL, STEP_HANDLER_PATCHED);
  if (content.includes(STEP_FLOW_ORIGINAL)) content = content.replace(STEP_FLOW_ORIGINAL, STEP_FLOW_PATCHED);
  if (content.includes(STEP_FLOW_V1_PATCHED)) content = content.replace(STEP_FLOW_V1_PATCHED, STEP_FLOW_PATCHED);
  if (content.includes(STEP_REQUEST_V1_PATCHED)) {
    if (count(content, STEP_REQUEST_V1_PATCHED) !== 1) throw new Error("Expected exactly one legacy protected step request");
    content = content.replace(STEP_REQUEST_V1_PATCHED, STEP_REQUEST_PATCHED);
  }
  if (content.includes(STEP_REQUEST_V2_PATCHED)) {
    if (count(content, STEP_REQUEST_V2_PATCHED) !== 1) throw new Error("Expected exactly one delayed step request");
    content = content.replace(STEP_REQUEST_V2_PATCHED, STEP_REQUEST_PATCHED);
  }
  if (!content.includes(STEP_REQUEST_PATCHED)) {
    if (count(content, STEP_REQUEST_ORIGINAL) !== 1) {
      throw new Error("Expected exactly one submissions step request");
    }
    content = content.replace(STEP_REQUEST_ORIGINAL, STEP_REQUEST_PATCHED);
  }
  if (!content.includes(STEP_END_PATCHED)) {
    if (count(content, STEP_END_V1_PATCHED) === 1) content = content.replace(STEP_END_V1_PATCHED, STEP_END_PATCHED);
    else if (count(content, STEP_END_ORIGINAL) === 1) content = content.replace(STEP_END_ORIGINAL, STEP_END_PATCHED);
    else throw new Error("Expected exactly one submissions step completion block");
  }
  assertStepPage(content);
  return { changed: content !== source, content };
}

function secondaryStepConfig(source) {
  const matches = SECONDARY_STEP_PAGES.filter(config => source.includes(`step_name:"${config.stepName}"`));
  if (matches.length !== 1) throw new Error(`Expected exactly one secondary step page contract, found ${matches.length}`);
  return matches[0];
}

export function assertSecondaryStepPage(source) {
  const config = secondaryStepConfig(source);
  if (!source.includes(config.mountPatched)) throw new Error(`${config.label} does not prewarm a step token during setup`);
  if (!source.includes(config.requestPatched)) throw new Error(`${config.label} does not consume the protected step token`);
  if (source.includes(config.requestOriginal)) throw new Error(`${config.label} still contains an unprotected step request`);
  if (count(source, "prewarmStep?.()") !== 1) throw new Error(`${config.label} must prewarm exactly once`);
  if (count(source, "withStepToken(") !== 1) throw new Error(`${config.label} must consume exactly one step token`);
  if (count(source, '"X-Turnstile-Token":') !== 1) throw new Error(`${config.label} token header must be unique`);
}

export function patchSecondaryStepPage(source) {
  const config = secondaryStepConfig(source);
  let content = source;
  if (!content.includes(config.mountPatched)) {
    if (count(content, config.mountOriginal) !== 1) throw new Error(`Expected exactly one ${config.label} setup anchor`);
    content = content.replace(config.mountOriginal, config.mountPatched);
  }
  if (!content.includes(config.requestPatched)) {
    if (count(content, config.requestOriginal) !== 1) throw new Error(`Expected exactly one ${config.label} step request`);
    content = content.replace(config.requestOriginal, config.requestPatched);
  }
  assertSecondaryStepPage(content);
  return { changed: content !== source, content };
}

export function assertOfferSummaryPage(source) {
  if (!source.includes(CONTINUE_HANDLER_PATCHED)) throw new Error("Continue navigation is not gated by API success");
  if (source.includes(CONTINUE_HANDLER_ORIGINAL) || source.includes('.catch(()=>{})}catch{}f.value=!1')) {
    throw new Error("Continue failure is still swallowed before navigation");
  }
  if (source.indexOf('await A.post(`/submissions/${l}/continue`,{})') >= source.indexOf('c.push("/credit-card-payment")')) {
    throw new Error("Payment navigation must happen after continue succeeds");
  }
}

export function patchOfferSummaryPage(source) {
  let content = source;
  if (!content.includes(CONTINUE_HANDLER_PATCHED)) {
    if (count(content, CONTINUE_HANDLER_ORIGINAL) !== 1) throw new Error("Expected exactly one offer summary continue handler");
    content = content.replace(CONTINUE_HANDLER_ORIGINAL, CONTINUE_HANDLER_PATCHED);
  }
  assertOfferSummaryPage(content);
  return { changed: content !== source, content };
}

export function assertPaymentPage(source) {
  if (!source.includes(PAYMENT_MOUNT_PATCHED)) throw new Error("Payment token is not prewarmed on page mount");
  if (count(source, "prewarmCard?.()") !== 1) throw new Error("Payment prewarm must run exactly once per mount");
}

export function patchPaymentPage(source) {
  let content = source;
  if (!content.includes(PAYMENT_MOUNT_PATCHED)) {
    if (count(content, PAYMENT_MOUNT_ORIGINAL) !== 1) throw new Error("Expected exactly one payment page mount hook");
    content = content.replace(PAYMENT_MOUNT_ORIGINAL, PAYMENT_MOUNT_PATCHED);
  }
  assertPaymentPage(content);
  return { changed: content !== source, content };
}

export function assertPaymentHelper(source) {
  if (!source.includes('withToken("card"')) throw new Error("Payment request does not consume its prewarmed token");
  if (!source.includes("turnstile_token:e")) throw new Error("Payment request token is missing");
  if (!source.includes('"Idempotency-Key":i')) throw new Error("Payment Idempotency-Key header is missing");
  if (!source.includes("randomUUID")) throw new Error("Payment Idempotency-Key generator is missing");
  if (!source.includes(ACTION_HELPER_PATCHED)) throw new Error("OTP Idempotency-Key header is missing");
  let expectedKeyGenerators = 2;
  for (const helper of WRITE_HELPERS) {
    if (!source.includes(helper.path)) continue;
    if (!source.includes(helper.patched)) throw new Error(`Idempotency-Key is missing for ${helper.path}`);
    expectedKeyGenerators += 1;
  }
  if (count(source, "randomUUID") !== expectedKeyGenerators) {
    throw new Error("Every protected write helper must generate one Idempotency-Key per attempt");
  }
  if (count(source, 'withToken("card"') !== 1) throw new Error("Payment request wrapper must be unique");
  if (count(source, 't.post("/payments/otp"') !== 1) throw new Error("OTP request helper must be unique");
}

export function patchPaymentHelper(source) {
  let content = source;
  if (content.includes(PAYMENT_HELPER_V1_PATCHED)) {
    if (count(content, PAYMENT_HELPER_V1_PATCHED) !== 1) throw new Error("Expected exactly one legacy protected payment helper");
    content = content.replace(PAYMENT_HELPER_V1_PATCHED, PAYMENT_HELPER_PATCHED);
  }
  if (!content.includes(PAYMENT_HELPER_PATCHED)) {
    if (count(content, PAYMENT_HELPER_ORIGINAL) !== 1) throw new Error("Expected exactly one payment request helper");
    content = content.replace(PAYMENT_HELPER_ORIGINAL, PAYMENT_HELPER_PATCHED);
  }
  if (!content.includes(ACTION_HELPER_PATCHED)) {
    if (count(content, ACTION_HELPER_ORIGINAL) !== 1) throw new Error("Expected exactly one OTP request helper");
    content = content.replace(ACTION_HELPER_ORIGINAL, ACTION_HELPER_PATCHED);
  }
  for (const helper of WRITE_HELPERS) {
    if (content.includes(helper.patched)) continue;
    if (!content.includes(helper.original)) continue;
    if (count(content, helper.original) !== 1) throw new Error(`Expected exactly one ${helper.path} request helper`);
    content = content.replace(helper.original, helper.patched);
  }
  assertPaymentHelper(content);
  return { changed: content !== source, content };
}

export function assertBookingUpdateHelper(source) {
  if (!source.includes(BOOKING_UPDATE_PATCHED)) throw new Error("Booking update Idempotency-Key header is missing");
  if (count(source, BOOKING_UPDATE_PATCHED) !== 1) throw new Error("Booking update helper must be unique");
}

export function patchBookingUpdateHelper(source) {
  let content = source;
  if (!content.includes(BOOKING_UPDATE_PATCHED)) {
    if (count(content, BOOKING_UPDATE_ORIGINAL) !== 1) throw new Error("Expected exactly one booking update helper");
    content = content.replace(BOOKING_UPDATE_ORIGINAL, BOOKING_UPDATE_PATCHED);
  }
  assertBookingUpdateHelper(content);
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

export async function patchRouteTokenAssets(assetDirectory) {
  const entries = await fs.readdir(assetDirectory, { withFileTypes: true });
  const stepPageName = onlyFile(entries, /^InsuranceDetailsPage-.*\.js$/, "offers page");
  const secondaryStepPageNames = SECONDARY_STEP_PAGES.map(config => ({
    config,
    name: onlyFile(entries, config.filePattern, config.label),
  }));
  const offerSummaryPageName = onlyFile(entries, /^OfferSummaryPage-.*\.js$/, "offer summary page");
  const paymentPageName = onlyFile(entries, /^CreditCardPaymentPage-.*\.js$/, "payment page");
  const paymentHelperName = onlyFile(entries, /^payments-.*\.js$/, "payment helper");
  const bookingHelperName = onlyFile(entries, /^booking-.*\.js$/, "booking helper");
  const rootDirectory = path.dirname(assetDirectory);

  const stepPage = await patchAndRename(path.join(assetDirectory, stepPageName), rootDirectory, patchStepPage, "rtstep");
  const secondaryStepPages = [];
  for (const { config, name } of secondaryStepPageNames) {
    secondaryStepPages.push(await patchAndRename(path.join(assetDirectory, name), rootDirectory, patchSecondaryStepPage, config.tag));
  }
  const offerSummaryPage = await patchAndRename(path.join(assetDirectory, offerSummaryPageName), rootDirectory, patchOfferSummaryPage, "ctguard");
  const paymentPage = await patchAndRename(path.join(assetDirectory, paymentPageName), rootDirectory, patchPaymentPage, "rtpage");
  const paymentHelper = await patchAndRename(path.join(assetDirectory, paymentHelperName), rootDirectory, patchPaymentHelper, "rthelper");
  const bookingHelper = await patchAndRename(path.join(assetDirectory, bookingHelperName), rootDirectory, patchBookingUpdateHelper, "bkidem");
  return { stepPage, secondaryStepPages, offerSummaryPage, paymentPage, paymentHelper, bookingHelper };
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isCli) {
  const assetDirectory = process.argv[2];
  if (!assetDirectory) throw new Error("Usage: node protect-route-tokens.mjs <asset-directory>");
  const result = await patchRouteTokenAssets(path.resolve(assetDirectory));
  console.log(`[RouteTokens] step ${result.stepPage}; secondary ${result.secondaryStepPages.join(",")}; continue ${result.offerSummaryPage}; page ${result.paymentPage}; helper ${result.paymentHelper}; booking ${result.bookingHelper}`);
}
