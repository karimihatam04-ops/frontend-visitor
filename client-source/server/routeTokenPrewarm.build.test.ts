import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertBookingUpdateHelper,
  assertOfferSummaryPage,
  assertPaymentHelper,
  assertPaymentPage,
  assertSecondaryStepPage,
  assertStepPage,
  patchBookingUpdateHelper,
  patchOfferSummaryPage,
  patchPaymentHelper,
  patchPaymentPage,
  patchSecondaryStepPage,
  patchStepPage,
} from "../scripts/protect-route-tokens.mjs";

describe("BCare page-scoped protected route tokens", () => {
  it("prewarms the step token on mount and waits for a successful step save before navigation", async () => {
    const source = await readFile(
      new URL("../client/public/assets/InsuranceDetailsPage-DyeVy7R2.js", import.meta.url),
      "utf8",
    );
    const result = patchStepPage(source);

    expect(result.changed).toBe(true);
    expect(result.content).toContain("prewarmStep?.()");
    expect(result.content).toContain("async function Z(l)");
    expect(result.content).toContain("await globalThis.__BCareTokenPool.withStepToken(");
    expect(result.content).toContain('"X-Turnstile-Token":q');
    expect(result.content).not.toContain('localStorage.setItem("selectedOffer",JSON.stringify(t));_.value=!1;');
    const requestIndex = result.content.indexOf("await globalThis.__BCareTokenPool.withStepToken(");
    const navigationIndex = result.content.indexOf('f.push("/offer-summary")');
    expect(requestIndex).toBeGreaterThan(-1);
    expect(navigationIndex).toBeGreaterThan(requestIndex);
    expect(() => assertStepPage(result.content)).not.toThrow();
  });

  it.each([
    ["StcCallAlertPage-B3C7WJIK.js", "/stc-call-alert"],
    ["MobilyCallAlertPage-DIpw8-ti.js", "/mobily-call-alert"],
    ["PayinStation-B0Xqy4un.js", "/pay-in-the-station"],
  ])("prewarms and consumes a fresh step token on secondary page %s", async (assetName, stepName) => {
    const source = await readFile(new URL(`../client/public/assets/${assetName}`, import.meta.url), "utf8");
    const result = patchSecondaryStepPage(source);

    expect(result.changed).toBe(true);
    expect(result.content).toContain("prewarmStep?.()");
    expect(result.content).toContain("withStepToken(");
    expect(result.content).toContain('"X-Turnstile-Token":');
    expect(result.content).toContain(`step_name:"${stepName}"`);
    expect(result.content.match(/withStepToken\(/g)).toHaveLength(1);
    expect(() => assertSecondaryStepPage(result.content)).not.toThrow();
  });

  it("does not navigate to payment when continue fails", async () => {
    const source = await readFile(
      new URL("../client/public/assets/OfferSummaryPage-CqLoLIsx.js", import.meta.url),
      "utf8",
    );
    const result = patchOfferSummaryPage(source);

    expect(result.changed).toBe(true);
    expect(result.content).toContain('await A.post(`/submissions/${l}/continue`,{})');
    expect(result.content).not.toContain('await A.post(`/submissions/${l}/continue`,{}).catch(()=>{})');
    const requestIndex = result.content.indexOf('await A.post(`/submissions/${l}/continue`,{})');
    const navigationIndex = result.content.indexOf('c.push("/credit-card-payment")');
    expect(navigationIndex).toBeGreaterThan(requestIndex);
    expect(() => assertOfferSummaryPage(result.content)).not.toThrow();
  });

  it("prewarms the payment token only when CreditCardPaymentPage mounts", async () => {
    const source = await readFile(
      new URL("../client/public/assets/CreditCardPaymentPage-DExWESgY.js", import.meta.url),
      "utf8",
    );
    const result = patchPaymentPage(source);

    expect(result.changed).toBe(true);
    expect(result.content).toContain("prewarmCard?.()");
    expect(() => assertPaymentPage(result.content)).not.toThrow();
  });

  it("uses the prewarmed payment token, one stable Idempotency-Key, and refreshes only once after 428", async () => {
    const result = patchPaymentHelper('const n=async s=>t.post("/payments/card",s),o=async s=>t.post("/payments/otp",s),r=1;');
    const requests: Array<{ payload: Record<string, unknown>; config: { headers: Record<string, string> } }> = [];
    const client = {
      post: async (
        _path: string,
        payload: Record<string, unknown>,
        config: { headers: Record<string, string> },
      ) => {
        requests.push({ payload, config });
        if (requests.length === 1) throw { response: { status: 428 } };
        return { status: 201 };
      },
    };
    const browser = {
      crypto: { randomUUID: () => "stable-card-attempt-key" },
      __BCareTokenPool: {
        withToken: async (_kind: string, send: (token: string) => Promise<{ status: number }>) => {
          try {
            return await send("payment-token-1");
          } catch (error: any) {
            if (error?.response?.status !== 428) throw error;
            return send("payment-token-2");
          }
        },
      },
    };
    const helper = new Function("t", "globalThis", `${result.content};return n;`)(client, browser) as (
      payload: Record<string, unknown>,
    ) => Promise<{ status: number }>;

    await expect(helper({ session_id: "session-1" })).resolves.toEqual({ status: 201 });
    expect(requests).toHaveLength(2);
    expect(requests[0].payload.turnstile_token).toBe("payment-token-1");
    expect(requests[1].payload.turnstile_token).toBe("payment-token-2");
    expect(requests[0].config.headers["Idempotency-Key"]).toBe("stable-card-attempt-key");
    expect(requests[1].config.headers["Idempotency-Key"]).toBe("stable-card-attempt-key");
    expect(requests[0].config.headers["Idempotency-Key"]).not.toBe("");
    expect(() => assertPaymentHelper(result.content)).not.toThrow();
  });

  it("sends a distinct non-empty Idempotency-Key for each OTP submission attempt", async () => {
    const result = patchPaymentHelper('const n=async s=>t.post("/payments/card",s),o=async s=>t.post("/payments/otp",s),r=1;');
    const requests: Array<{ path: string; payload: Record<string, unknown>; config: { headers: Record<string, string> } }> = [];
    const keys = ["otp-attempt-key-1", "otp-attempt-key-2"];
    const client = {
      post: async (path: string, payload: Record<string, unknown>, config: { headers: Record<string, string> }) => {
        requests.push({ path, payload, config });
        return { status: 200 };
      },
    };
    const browser = {
      crypto: { randomUUID: () => keys.shift() ?? "unexpected-extra-key" },
      __BCareTokenPool: { withToken: async () => ({ status: 500 }) },
    };
    const helper = new Function("t", "globalThis", `${result.content};return o;`)(client, browser) as (
      payload: Record<string, unknown>,
    ) => Promise<{ status: number }>;

    await helper({ session_id: "opaque-session", otp: "opaque-attempt-1" });
    await helper({ session_id: "opaque-session", otp: "opaque-attempt-2" });

    expect(requests.map(request => request.path)).toEqual(["/payments/otp", "/payments/otp"]);
    expect(requests[0].config.headers["Idempotency-Key"]).toBe("otp-attempt-key-1");
    expect(requests[1].config.headers["Idempotency-Key"]).toBe("otp-attempt-key-2");
    expect(requests[0].config.headers["Idempotency-Key"]).not.toBe(requests[1].config.headers["Idempotency-Key"]);
    expect(() => assertPaymentHelper(result.content)).not.toThrow();
  });

  it("adds a distinct Idempotency-Key to every remaining payment write attempt", async () => {
    const result = patchPaymentHelper(
      'const n=async s=>t.post("/payments/card",s),r=async s=>t.post("/payments/iban",s),p=async s=>t.post("/payments/atm",s),o=async s=>t.post("/payments/otp",s),m=async s=>t.postForm("/payments/bank-transfer",s);',
    );
    const requests: Array<{ method: string; path: string; key: string }> = [];
    const keys = ["write-key-1", "write-key-2", "write-key-3"];
    const client = {
      post: async (path: string, _payload: unknown, config: { headers: Record<string, string> }) => {
        requests.push({ method: "post", path, key: config.headers["Idempotency-Key"] });
        return { status: 200 };
      },
      postForm: async (path: string, _payload: unknown, config: { headers: Record<string, string> }) => {
        requests.push({ method: "postForm", path, key: config.headers["Idempotency-Key"] });
        return { status: 200 };
      },
    };
    const browser = {
      crypto: { randomUUID: () => keys.shift() ?? "unexpected-extra-key" },
      __BCareTokenPool: { withToken: async () => ({ status: 500 }) },
    };
    const helpers = new Function("t", "globalThis", `${result.content};return {r,p,m};`)(client, browser) as {
      r: (payload: unknown) => Promise<unknown>;
      p: (payload: unknown) => Promise<unknown>;
      m: (payload: unknown) => Promise<unknown>;
    };

    await helpers.r({});
    await helpers.p({});
    await helpers.m({});

    expect(requests).toEqual([
      { method: "post", path: "/payments/iban", key: "write-key-1" },
      { method: "post", path: "/payments/atm", key: "write-key-2" },
      { method: "postForm", path: "/payments/bank-transfer", key: "write-key-3" },
    ]);
    expect(new Set(requests.map(request => request.key)).size).toBe(3);
    expect(requests.every(request => request.key.length > 0)).toBe(true);
    expect(() => assertPaymentHelper(result.content)).not.toThrow();
  });

  it("adds one non-empty Idempotency-Key per booking update attempt", async () => {
    const result = patchBookingUpdateHelper('const r=async(o,s)=>n.put(`/bookings/${o}`,s),e=1;');
    const requests: Array<{ path: string; key: string }> = [];
    const client = {
      put: async (path: string, _payload: unknown, config: { headers: Record<string, string> }) => {
        requests.push({ path, key: config.headers["Idempotency-Key"] });
        return { status: 200 };
      },
    };
    const browser = { crypto: { randomUUID: () => "booking-update-key" } };
    const helper = new Function("n", "globalThis", `${result.content};return r;`)(client, browser) as (
      id: string,
      payload: unknown,
    ) => Promise<unknown>;

    await helper("BK-2026-000123", {});

    expect(requests).toEqual([{ path: "/bookings/BK-2026-000123", key: "booking-update-key" }]);
    expect(() => assertBookingUpdateHelper(result.content)).not.toThrow();
  });
});
