import { describe, expect, it } from "vitest";
import { applyTokenFirstRegisterSource, assertTokenFirstRegister } from "../scripts/turnstile-token-first-register.mjs";

describe("Turnstile token-first registration", () => {
  it("obtains a token before the first register request and refreshes it after 428", () => {
    const source = [
      'n=null,o="";const i=6;let s=0;for(',
      'turnstile_token:o',
      'if(_x(l)){if(o||(o=await $0()),!o)return ut("visitor.register.turnstile_failed"),"";continue}',
    ].join(";");
    const result = applyTokenFirstRegisterSource(source);

    expect(result.changed).toBe(true);
    expect(result.content).toContain('o=await $0()');
    expect(result.content).toContain('if(_x(l)){o=await $0()');
    expect(() => assertTokenFirstRegister(result.content)).not.toThrow();
  });
});
