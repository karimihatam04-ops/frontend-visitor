import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shortenMainAsset } from "../scripts/shorten-main-asset.mjs";

describe("BCare main asset filename", () => {
  it("uses a short content hash and updates references", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bcare-main-"));
    try {
      const assets = path.join(root, "assets");
      await mkdir(assets);
      const oldName = `main-${"x".repeat(240)}.js`;
      const content = "export const ready=true";
      await writeFile(path.join(assets, oldName), content);
      await writeFile(path.join(root, "index.html"), `<script src="/assets/${oldName}"></script>`);
      const result = await shortenMainAsset(root);
      const digest = createHash("sha256").update(content).digest("hex").slice(0, 16);
      expect(result.asset).toBe(`main-${digest}.js`);
      expect(result.asset.length).toBeLessThan(40);
      expect(await readdir(assets)).toEqual([result.asset]);
      expect(await readFile(path.join(root, "index.html"), "utf8")).toContain(result.asset);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
