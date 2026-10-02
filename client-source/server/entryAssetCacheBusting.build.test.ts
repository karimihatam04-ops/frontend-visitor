import { describe, expect, it } from "vitest";
import { entryAssetName } from "../scripts/cache-bust-entry-assets.mjs";

describe("entry asset cache busting", () => {
  it("changes the browser entry asset name when its import graph changes", () => {
    const initial = entryAssetName("index-BWnj6n6M.js", 'import "./main-old.js"');
    const updated = entryAssetName("index-BWnj6n6M.js", 'import "./main-new.js"');

    expect(initial).toMatch(/^index-BWnj6n6M\.entry-[a-f0-9]{12}\.js$/);
    expect(updated).toMatch(/^index-BWnj6n6M\.entry-[a-f0-9]{12}\.js$/);
    expect(updated).not.toBe(initial);
  });
});
