import { describe, expect, it } from "vitest";
import {
  assertUnconfiguredRealtimeDisabled,
  patchUnconfiguredRealtimeSource,
} from "../scripts/disable-unconfigured-realtime.mjs";

describe("BCare unconfigured Reverb guard", () => {
  it("does not start Reverb when the compiled staging placeholder remains", () => {
    const patched = patchUnconfiguredRealtimeSource(
      'const u="__STAGING_REVERB_APP_KEY__",s="becare-public-gateway.dariatameen.workers.dev",o=443;',
    );

    expect(patched.changed).toBe(true);
    expect(patched.content).toContain('if(u==="__STAGING_REVERB_APP_KEY__")return;');
    expect(() => assertUnconfiguredRealtimeDisabled(patched.content)).not.toThrow();
  });
});
