import { describe, expect, it } from "vitest";
import {
  assertTurnstileSiteKey,
  patchTurnstileSiteKeySource,
} from "../scripts/inject-turnstile-site-key.mjs";

const siteKey = "0x4AAAAAAEF260t-jgRLf7wf";
const previousSiteKey = "0x4AAAAAAEFoUpy6_6Vaf4G9";

describe("BCare Turnstile browser configuration", () => {
  it("replaces the disabled initializer with the configured public site key", () => {
    const patched = patchTurnstileSiteKeySource('const Ha="DISABLED";const yi=Ha==="DISABLED"?"":Ha;', siteKey);

    expect(patched.changed).toBe(true);
    expect(patched.content).toContain(`const Ha="${siteKey}"`);
    expect(patched.content).not.toContain('const Ha="DISABLED"');
    expect(() => assertTurnstileSiteKey(patched.content, siteKey)).not.toThrow();
  });

  it("replaces an existing configured site key after widget rotation", () => {
    const source = `/*__BCARE_TURNSTILE_SITE_KEY_V1__*/const Ha="${previousSiteKey}";`;
    const patched = patchTurnstileSiteKeySource(source, siteKey);

    expect(patched.changed).toBe(true);
    expect(patched.content).toContain(`const Ha="${siteKey}"`);
    expect(patched.content).not.toContain(previousSiteKey);
    expect(() => assertTurnstileSiteKey(patched.content, siteKey)).not.toThrow();
  });
});
