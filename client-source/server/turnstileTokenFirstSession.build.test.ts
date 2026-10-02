import { describe, expect, it } from "vitest";
import {
  assertSessionTokenFirst,
  patchSessionTokenFirstSource,
} from "../scripts/turnstile-token-first-session.mjs";

const legacy = 'Rx=async({fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,turnstileToken:i}={})=>{const s=localStorage.getItem("visitor_id")||void 0,l=qn("visitor_token")||void 0,a=localStorage.getItem("visitor_fingerprint")||void 0,d={fullName:e,idNumber:t,phone:r,clientId:n,currentRoute:o,visitor_id:s,visitor_token:l,visitor_fingerprint:a,turnstile_token:i},u=await wn.post("/sessions",d,{headers:a?{"X-Visitor-Fingerprint":a}:void 0});return ns(u),u}';

describe("BCare sessions Turnstile flow", () => {
  it("obtains a fresh token before sessions and refreshes it once on 428", () => {
    const result = patchSessionTokenFirstSource(legacy);

    expect(result.changed).toBe(true);
    expect(result.content).toContain('take?.("sessions")');
    expect(result.content).toContain('turnstile_token:m');
    expect(result.content).toContain('refresh?.("sessions")');
    expect(() => assertSessionTokenFirst(result.content)).not.toThrow();
  });
});
