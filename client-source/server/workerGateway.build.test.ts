import { describe, expect, it } from "vitest";
import {
  assertWorkerGatewayRewrite,
  patchWorkerGatewaySource,
} from "../scripts/rewrite-worker-gateway.mjs";

const workerOrigin = "https://becare-public-gateway.dariatameen.workers.dev";
const legacyBundle = 'const nl="/api/laravel/api/v1";fetch("/api/vehicle-inquiry",{method:"POST"});';

describe("BCare Cloudflare Worker bundle rewrite", () => {
  it("moves the browser API base and vehicle inquiry endpoint to the explicit Worker origin", () => {
    const patched = patchWorkerGatewaySource(legacyBundle, workerOrigin);

    expect(patched.changed).toBe(true);
    expect(patched.content).toContain("__BCARE_CLOUDFLARE_GATEWAY_V1__");
    expect(patched.content).toContain(`nl="${workerOrigin}/api/v1"`);
    expect(patched.content).toContain(`fetch("${workerOrigin}/api/vehicle-inquiry"`);
    expect(() => assertWorkerGatewayRewrite(patched.content, workerOrigin)).not.toThrow();
  });
});
