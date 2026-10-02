import { describe, expect, it } from "vitest";
import {
  STEP_INITIAL_DELAY_MS,
  assertBookingTokenFlow,
  assertFirstPageNoPrewarm,
  assertPagePrewarm,
  assertTokenPoolMain,
  patchBookingTokenFlow,
  patchSecondPagePrewarm,
  patchTokenPoolMain,
  removeFirstPagePrewarm,
  removeObsoleteEditPagePrewarm,
  stepRetryDelayMs,
} from "../scripts/prewarm-turnstile-pool.mjs";

describe("BCare prewarmed Turnstile token pool", () => {
  it("creates two single-use slots and refreshes them before expiry", () => {
    const source = "prefix},Ga=()=>{suffix";
    const result = patchTokenPoolMain(source);
    expect(result.changed).toBe(true);
    expect(result.content).toContain('__bcI("sessions")');
    expect(result.content).toContain('__bcI("bookings")');
    expect(result.content).toContain('__bcI("step")');
    expect(result.content).toContain('__bcI("card")');
    expect(result.content).toContain("prewarmStep:");
    expect(result.content).toContain("prewarmCard:");
    expect(result.content).toContain("withToken:");
    expect(result.content).toContain("withStepToken:");
    expect(result.content).toContain('__bcA=async e=>{try{return await __bcW("step",e)}catch(t){');
    expect(result.content).not.toContain('__bcA=async e=>{await __bcL(25e3);');
    expect(result.content).toContain("25e3");
    expect(result.content).toContain("STEP_TOO_FAST");
    expect(result.content).toContain("retry_after");
    expect(result.content).toContain('__bcR("step")');
    expect(result.content).toContain("i!==428");
    expect(result.content).toContain("await __bcR(e)");
    expect(result.content).toContain("Date.now()+24e4");
    expect(result.content).toContain("if(!await Z0())return");
    expect(result.content).toContain('typeof o.render!="function"');
    expect(result.content).not.toContain("o.ready(");
    expect(() => assertTokenPoolMain(result.content)).not.toThrow();
  });

  it("sends step immediately and only uses the fallback delay after a real STEP_TOO_FAST response", () => {
    expect(STEP_INITIAL_DELAY_MS).toBe(25_000);
    expect(stepRetryDelayMs({
      status: 429,
      details: { error: { code: "STEP_TOO_FAST", retry_after: 24.211097 } },
    })).toBe(24_462);
    expect(stepRetryDelayMs({ status: 429, details: { error: { code: "OTHER", retry_after: 20 } } })).toBe(0);
    expect(stepRetryDelayMs({ status: 500, details: { error: { code: "STEP_TOO_FAST", retry_after: 20 } } })).toBe(0);
  });

  it("recovers the prior invalid insertion before applying the safe declarators", () => {
    const invalid = "prefix,/*__BCARE_TURNSTILE_POOL_V1__*/const __bcQ={};/*__BCARE_TURNSTILE_TOKEN_FIRST_REGISTER_V2__*/middle},Ga=()=>{suffix";
    const result = patchTokenPoolMain(invalid);
    expect(result.changed).toBe(true);
    expect(result.content).not.toContain("const __bcQ");
    expect(() => assertTokenPoolMain(result.content)).not.toThrow();
  });

  it("adds a booking token, a stable idempotency key, and one 428 refresh", () => {
    const source = 'import{O as n}from"./main.js";const a=async o=>n.post("/bookings",o),r=1;';
    const result = patchBookingTokenFlow(source);
    expect(result.changed).toBe(true);
    expect(result.content).toContain('take?.("bookings")');
    expect(result.content).toContain("turnstile_token:u");
    expect(result.content).toContain('n.post("/bookings",{...o,turnstile_token:u},{headers:');
    expect(result.content).toContain('"Idempotency-Key":d');
    expect(result.content).toContain("randomUUID");
    expect(result.content.match(/randomUUID/g)).toHaveLength(1);
    expect(result.content).toContain("try{return await s(t)}");
    expect(result.content).toContain("return s(c)");
    expect(() => assertBookingTokenFlow(result.content)).not.toThrow();
  });

  it("reuses one non-empty Idempotency-Key when bookings retries after 428", async () => {
    const result = patchBookingTokenFlow('const a=async o=>n.post("/bookings",o)');
    const requests: Array<{ payload: Record<string, unknown>; config: { headers: Record<string, string> } }> = [];
    const client = {
      post: async (_path: string, payload: Record<string, unknown>, config: { headers: Record<string, string> }) => {
        requests.push({ payload, config });
        if (requests.length === 1) throw { response: { status: 428 } };
        return { status: 201 };
      },
    };
    const browser = {
      crypto: { randomUUID: () => "stable-idempotency-key" },
      __BCareTokenPool: {
        take: async () => "booking-token-1",
        refresh: async () => "booking-token-2",
      },
    };
    const helper = new Function("n", "globalThis", `${result.content};return a;`)(client, browser) as (
      payload: Record<string, unknown>,
    ) => Promise<{ status: number }>;

    await expect(helper({ session_id: "session-1" })).resolves.toEqual({ status: 201 });
    expect(requests).toHaveLength(2);
    expect(requests[0].config.headers["Idempotency-Key"]).toBe("stable-idempotency-key");
    expect(requests[1].config.headers["Idempotency-Key"]).toBe("stable-idempotency-key");
    expect(requests[0].config.headers["Idempotency-Key"]).not.toBe("");
    expect(requests[0].payload.turnstile_token).toBe("booking-token-1");
    expect(requests[1].payload.turnstile_token).toBe("booking-token-2");
  });

  it("removes both challenges from the first page", () => {
    const firstPage = 'const page="first";/*__BCARE_TURNSTILE_PREWARM_V1__*/queueMicrotask(()=>globalThis.__BCareTokenPool?.prewarm?.());';
    const result = removeFirstPagePrewarm(firstPage);

    expect(result.changed).toBe(true);
    expect(result.content).not.toContain("__BCareTokenPool?.prewarm?.()");
    expect(() => assertFirstPageNoPrewarm(result.content)).not.toThrow();
  });

  it("starts both challenges when BookingPage mounts before any submit", async () => {
    const source = 'const O={value:false},v={value:{}},N=false,me=async()=>{},J=f=>{globalThis.__mount=f};J(async()=>{if(O.value&&v.value.idNumber&&v.value.serialNumber){}N&&await me()});';
    const result = patchSecondPagePrewarm(source);
    const events: string[] = [];
    const browser: any = { __BCareTokenPool: { prewarm: () => events.push("prewarm") } };

    expect(result.changed).toBe(true);
    expect(result.content).toContain("__BCareTokenPool?.prewarm?.()");
    expect(result.content).toContain("__BCARE_TURNSTILE_BOOKING_PAGE_PREWARM_V3__");
    expect(() => assertPagePrewarm(result.content)).not.toThrow();
    new Function("globalThis", result.content)(browser);
    expect(events).toEqual([]);
    await browser.__mount();
    expect(events).toEqual(["prewarm"]);
  });

  it("removes the obsolete EditBookingPage prewarm patch", () => {
    const stale = 'W(async()=>{/*__BCARE_TURNSTILE_SECOND_PAGE_PREWARM_V2__*/globalThis.__BCareTokenPool?.prewarm?.(),h&&await T()})';
    const result = removeObsoleteEditPagePrewarm(stale);

    expect(result.changed).toBe(true);
    expect(result.content).toBe("W(async()=>{h&&await T()})");
    expect(result.content).not.toContain("__BCareTokenPool?.prewarm?.()");
  });
});
