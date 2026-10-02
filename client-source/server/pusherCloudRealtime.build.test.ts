import { describe, expect, it } from "vitest";
import {
  assertPusherCloudRealtime,
  patchPusherCloudRealtimeSource,
} from "../scripts/configure-pusher-cloud-realtime.mjs";

const PUBLIC_KEY = "268c1eda35a9bcbd2056";
const CLUSTER = "ap1";

describe("BCare Pusher Cloud realtime build", () => {
  it("replaces the staging Reverb initializer with the verified historical Pusher app", () => {
    const source =
      'const u="__STAGING_REVERB_APP_KEY__",s=location.hostname,o=location.protocol==="https:"?443:80;window.Pusher=Gr;{te=new Xr({broadcaster:"reverb",key:u,wsHost:s,wsPort:o,wssPort:o,wsPath:"/ws",forceTLS:location.protocol==="https:",enabledTransports:["ws","wss"],authEndpoint:"/api/laravel/broadcasting/auth",auth:{withCredentials:!0}});return}';
    const patched = patchPusherCloudRealtimeSource(source, {
      publicKey: PUBLIC_KEY,
      cluster: CLUSTER,
    });
    expect(patched.changed).toBe(true);
    expect(patched.content).toContain(`const u="${PUBLIC_KEY}"`);
    expect(patched.content).toContain('broadcaster:"pusher"');
    expect(patched.content).toContain('cluster:"ap1"');
    expect(patched.content).not.toContain("__STAGING_REVERB_APP_KEY__");
    expect(patched.content).not.toContain('broadcaster:"reverb"');
    expect(patched.content).not.toContain("wsHost:");
    expect(patched.content).not.toContain('wsPath:"/ws"');
    expect(() => assertPusherCloudRealtime(patched.content, { publicKey: PUBLIC_KEY, cluster: CLUSTER })).not.toThrow();
  });

  it("removes the previous unconfigured-Reverb guard instead of preserving a silent return", () => {
    const source =
      '/*__BCARE_DISABLE_UNCONFIGURED_REVERB_V1__*/const u="__STAGING_REVERB_APP_KEY__";if(u==="__STAGING_REVERB_APP_KEY__")return;const s="becare-public-gateway.dariatameen.workers.dev",o=443;window.Pusher=Gr;{te=new Xr({broadcaster:"reverb",key:u,wsHost:s,wsPort:o,wssPort:o,wsPath:"/ws",forceTLS:!0,enabledTransports:["ws","wss"]});return}';
    const patched = patchPusherCloudRealtimeSource(source, {
      publicKey: PUBLIC_KEY,
      cluster: CLUSTER,
    });
    expect(patched.content).not.toContain("if(u===");
    expect(patched.content).not.toContain("__BCARE_DISABLE_UNCONFIGURED_REVERB_V1__");
    expect(() => assertPusherCloudRealtime(patched.content, { publicKey: PUBLIC_KEY, cluster: CLUSTER })).not.toThrow();
  });
});
