import { describe, expect, it } from "vitest";
import {
  assertRealtimeWorkerRewrite,
  patchRealtimeWorkerSource,
} from "../scripts/rewrite-realtime-worker-gateway.mjs";

const workerOrigin = "https://becare-public-gateway.dariatameen.workers.dev";

describe("BCare Reverb Worker auth rewrite", () => {
  it("moves the Reverb authentication endpoint off the local Manus origin", () => {
    const patched = patchRealtimeWorkerSource(
      'const u="__STAGING_REVERB_APP_KEY__",s=location.hostname,o=location.protocol==="https:"?443:80;new Xr({wsHost:s,authEndpoint:"/api/laravel/broadcasting/auth",auth:{withCredentials:!0}});',
      workerOrigin,
    );

    expect(patched.changed).toBe(true);
    expect(patched.content).toContain(`authEndpoint:"${workerOrigin}/api/laravel/broadcasting/auth"`);
    expect(patched.content).toContain('wsHost:"becare-public-gateway.dariatameen.workers.dev"');
    expect(() => assertRealtimeWorkerRewrite(patched.content, workerOrigin)).not.toThrow();
  });
});
