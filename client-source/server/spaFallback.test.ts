import { describe, expect, it } from "vitest";
import { shouldServeSpaFallback } from "./spaFallback";

describe("SPA fallback routing", () => {
  it("serves the React document for browser navigation paths", () => {
    expect(shouldServeSpaFallback("/insurance/vehicle")).toBe(true);
    expect(shouldServeSpaFallback("/booking/confirmation")).toBe(true);
  });

  it("never treats undefined backend paths as SPA navigation", () => {
    expect(shouldServeSpaFallback("/api/not-defined")).toBe(false);
    expect(shouldServeSpaFallback("/broadcasting/not-defined")).toBe(false);
    expect(shouldServeSpaFallback("/pusher/not-defined")).toBe(false);
  });
});
