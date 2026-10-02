import { describe, expect, it } from "vitest";
import {
  assertRegisterFlow,
  restoreRegisterFlowSource,
} from "../scripts/restore-turnstile-register-flow.mjs";

describe("BCare visitor registration retry flow", () => {
  it("restores the 428-to-Turnstile retry sequence instead of blocking register before it starts", () => {
    const source = '/*__BCARE_TURNSTILE_PRELOAD_REGISTER_V1__*/n=null,o=await $0();if(!o)return ut("visitor.register.turnstile_failed"),"";const i=6;let s=0;for(';
    const restored = restoreRegisterFlowSource(source);

    expect(restored.changed).toBe(true);
    expect(restored.content).toContain('n=null,o="";const i=6;let s=0;for(');
    expect(() => assertRegisterFlow(restored.content)).not.toThrow();
  });
});
