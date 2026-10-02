import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cacheBustDependentAssets } from "../scripts/cache-bust-dependent-assets.mjs";

describe("dependent browser asset cache busting", () => {
  it("renames the full JavaScript graph with one release and rewrites every importer", async () => {
    const publicDirectory = await mkdtemp(path.join(os.tmpdir(), "bcare-assets-"));
    const assetDirectory = path.join(publicDirectory, "assets");
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(path.join(publicDirectory, "index.html"), '<script src="/assets/index-old.js"></script>');
    await writeFile(path.join(assetDirectory, "index-old.js"), 'import "./EditBookingPage-old.js";');
    await writeFile(path.join(assetDirectory, "EditBookingPage-old.js"), 'import "./main-old.js";');
    await writeFile(path.join(assetDirectory, "main-old.js"), "export const pool=true;");

    const result = await cacheBustDependentAssets(publicDirectory);
    const files = (await readdir(assetDirectory)).sort();
    const suffix = `.release-${result.release}.js`;
    const contents = await Promise.all(files.map(file => readFile(path.join(assetDirectory, file), "utf8")));

    expect(files).toHaveLength(3);
    expect(files.every(file => file.endsWith(suffix))).toBe(true);
    expect(await readFile(path.join(publicDirectory, "index.html"), "utf8")).not.toContain("index-old.js");
    expect(contents.join("\n")).not.toContain('"./EditBookingPage-old.js"');
    expect(contents.join("\n")).not.toContain('"./main-old.js"');
    expect(contents.join("\n")).toContain(`EditBookingPage-old.release-${result.release}.js`);
    expect(contents.join("\n")).toContain(`main-old.release-${result.release}.js`);
  });
});
