import { describe, expect, it } from "vitest";
import {
  assertTurnstilePreload,
  patchTurnstilePreloadSource,
} from "../scripts/preload-turnstile-register.mjs";

describe("BCare Turnstile registration preflight", () => {
  it("acquires a token before the first visitor register attempt", () => {
    const patched = patchTurnstilePreloadSource('n=null,o="";const i=6;let s=0;for(');

    expect(patched.changed).toBe(true);
    expect(patched.content).toContain('o=await $0();if(!o)return ut("visitor.register.turnstile_failed"),"";');
    expect(() => assertTurnstilePreload(patched.content)).not.toThrow();
  });
});
