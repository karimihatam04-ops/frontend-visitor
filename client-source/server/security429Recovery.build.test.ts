import { describe, expect, it } from "vitest";
import {
  assertSecurity429Recovery,
  patchSecurity429Recovery,
} from "../scripts/patch-security-429-recovery.mjs";

const prePatchBundle = [
  'if(t&&(n==="challenge"||r.includes("text/html"))){',
  ':r===429||e_.has(t)?{category:"rate_limit"',
  'if(l?.status===429&&l?.code==="REGISTER_BURST_LIMIT")return',
].join(";");

describe("إصلاح استجابة 429", () => {
  it("يعطل شاشة الحظر العامة لاستجابة 429 غير المصحوبة برمز تطبيق صريح", () => {
    const patched = patchSecurity429Recovery(prePatchBundle);

    expect(patched.detected).toBe(true);
    expect(patched.changed).toBe(true);
    expect(patched.content).toContain("__BCARE_SECURITY_429_RECOVERY_V1__");
    expect(patched.content).toContain("e.status!==429");
    expect(patched.content).toContain('e_.has(t)&&t!=="REGISTER_BURST_LIMIT"');
    expect(patched.content).toContain("if(l?.status===429)return");
    expect(() => assertSecurity429Recovery(patched.content)).not.toThrow();
  });
});
