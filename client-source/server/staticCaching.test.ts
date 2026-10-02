import { describe, expect, it } from "vitest";
import { ASSET_CACHE_CONTROL, HTML_CACHE_CONTROL, staticCacheControl } from "./staticCaching";

describe("static cache policy", () => {
  it("never caches the SPA HTML entry document", () => {
    expect(staticCacheControl("/srv/public/index.html", true)).toBe(HTML_CACHE_CONTROL);
  });

  it("does not cache development assets and makes production assets immutable", () => {
    expect(staticCacheControl("/srv/public/assets/index-new.js", false)).toBe(HTML_CACHE_CONTROL);
    expect(staticCacheControl("/srv/public/assets/index-new.js", true)).toBe(ASSET_CACHE_CONTROL);
  });
});
