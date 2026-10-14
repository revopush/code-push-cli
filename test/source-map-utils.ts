import { strict as assert } from "assert";
import * as fs from "fs";
import { restoreSourceMapMetadata } from "../script/utils/source-map-utils";
import { useTempDirectory } from "./helpers/temp-directory";

describe("source-map-utils", () => {
  describe("restoreSourceMapMetadata", () => {
    const tempDirectory = useTempDirectory("source-map-utils");

    const writeSourceMap = (fields: Record<string, unknown>) => tempDirectory.write("composed.map", JSON.stringify(fields));
    const readSourceMap = (sourceMap: string): unknown => JSON.parse(fs.readFileSync(sourceMap, "utf8"));

    it("restores fields the composer dropped without touching the ones it produced", async () => {
      const composed = writeSourceMap({ version: 3, file: "main.jsbundle.hbc", mappings: "AAAA;AACA", x_google_ignoreList: [] });

      const restored = await restoreSourceMapMetadata(composed, {
        version: 3,
        file: "main.jsbundle",
        mappings: "AAAA;ACAA",
        debugId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        x_google_ignoreList: [1],
        x_custom_vendor: { nested: true },
      });

      assert.deepEqual(restored, ["debugId", "x_custom_vendor"]);
      assert.deepEqual(readSourceMap(composed), {
        version: 3,
        file: "main.jsbundle.hbc",
        mappings: "AAAA;AACA",
        x_google_ignoreList: [],
        debugId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        x_custom_vendor: { nested: true },
      });
    });

    it("never restores positional fields, which index into the packager's sources", async () => {
      const composed = writeSourceMap({ version: 3, sources: ["/abs/a.js"], mappings: "AAAA" });

      const restored = await restoreSourceMapMetadata(composed, {
        sourceRoot: "/abs/",
        sections: [],
        ignoreList: [1],
        x_google_ignoreList: [1],
        x_facebook_sources: [null],
        x_hermes_function_offsets: { "0": [0] },
        debugId: "aaaa-bbbb",
      });

      assert.deepEqual(restored, ["debugId"]);
      assert.deepEqual(readSourceMap(composed), { version: 3, sources: ["/abs/a.js"], mappings: "AAAA", debugId: "aaaa-bbbb" });
    });

    it("leaves the composed source map untouched when there is nothing to restore", async () => {
      const composed = writeSourceMap({ version: 3, file: "main.jsbundle.hbc", debugId: "from-compose" });
      const contents = fs.readFileSync(composed, "utf8");

      assert.deepEqual(await restoreSourceMapMetadata(composed, { version: 3 }), []);
      assert.deepEqual(await restoreSourceMapMetadata(composed, { debugId: "from-packager" }), []);
      assert.equal(fs.readFileSync(composed, "utf8"), contents);
    });
  });
});
