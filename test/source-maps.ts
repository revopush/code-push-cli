import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { getSourceMapPaths, restoreSourceMapMetadata } from "../script/platforms/react-native/source-maps";
import { useTempDirectory } from "./helpers/temp-directory";

describe("source-maps", () => {
  describe("getSourceMapPaths", () => {
    const iosDirectory = useTempDirectory("source-maps-ios");

    it("names the Android maps like the Gradle plugin", () => {
      assert.deepEqual(getSourceMapPaths({ platform: "android" }, "index.android.bundle", "out", true), {
        packager: path.join("out", "index.android.bundle.packager.map"),
        final: path.join("out", "index.android.bundle.map"),
      });
      assert.deepEqual(getSourceMapPaths({ platform: "android" }, "index.android.bundle", "out", false), {
        packager: path.join("out", "index.android.bundle.map"),
        final: path.join("out", "index.android.bundle.map"),
      });
    });

    it("names the iOS map after the bundle, or SOURCEMAP_FILE from the Podfile's .xcode.env", () => {
      const podFile = path.join(iosDirectory.path, "Podfile");
      const defaultMap = path.join("out", "main.jsbundle.map");
      assert.deepEqual(getSourceMapPaths({ platform: "ios", podFile }, "main.jsbundle", "out", true), {
        packager: defaultMap,
        final: defaultMap,
      });

      iosDirectory.write(".xcode.env", "export SOURCEMAP_FILE=/build/custom.map\n");
      const customMap = path.join("out", "custom.map");
      assert.deepEqual(getSourceMapPaths({ platform: "ios", podFile }, "main.jsbundle", "out", true), {
        packager: customMap,
        final: customMap,
      });
    });

    it("uses a .map sourcemapOutput as is", () => {
      const map = path.join("out", "app.map");

      assert.deepEqual(getSourceMapPaths({ platform: "android" }, "index.android.bundle", map, true), {
        packager: map,
        final: map,
      });
    });
  });

  describe("restoreSourceMapMetadata", () => {
    const tempDirectory = useTempDirectory("source-maps");

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
