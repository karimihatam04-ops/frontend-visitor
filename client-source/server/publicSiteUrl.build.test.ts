import { describe, expect, it } from "vitest";
import {
  assertPublicSiteUrlRewrite,
  patchPublicSiteUrlSource,
} from "../scripts/rewrite-public-site-url.mjs";

describe("BCare public-site URL rewrite", () => {
  it("moves the QR target away from the legacy frontend deployment", () => {
    const currentHost = "bcareapp-cqsxcdmi.manus.space";
    const patched = patchPublicSiteUrlSource(
      'const qr="https://bcare-spa-gdkwxzkl.manus.space";',
      currentHost,
    );

    expect(patched.changed).toBe(true);
    expect(patched.content).toContain(currentHost);
    expect(patched.content).not.toContain("bcare-spa-gdkwxzkl.manus.space");
    expect(() => assertPublicSiteUrlRewrite(patched.content, currentHost)).not.toThrow();
  });
});
