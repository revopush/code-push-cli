import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { restoreSourceMapMetadata } from "../script/utils/source-map-utils";
import { getSourceMapPaths } from "../script/react-native-utils";

describe("Source map metadata", () => {
  let testDirectory: string;

  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-source-map-"));
  });

  afterEach(() => {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  function createSourceMap(fields: Record<string, unknown>): string {
    const sourceMap = path.join(testDirectory, "composed.map");
    fs.writeFileSync(sourceMap, JSON.stringify(fields));
    return sourceMap;
  }

  function readSourceMap(sourceMap: string): unknown {
    return JSON.parse(fs.readFileSync(sourceMap, "utf8"));
  }

  it("restores fields the composer dropped without touching the ones it produced", async () => {
    const composed = createSourceMap({ version: 3, file: "main.jsbundle.hbc", mappings: "AAAA;AACA", x_google_ignoreList: [] });

    const restored = await restoreSourceMapMetadata(composed, {
      version: 3,
      file: "main.jsbundle",
      mappings: "AAAA;ACAA",
      debugId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      x_google_ignoreList: [1],
      x_custom_vendor: { nested: true },
    });

    assert.deepStrictEqual(restored, ["debugId", "x_custom_vendor"]);
    assert.deepStrictEqual(readSourceMap(composed), {
      version: 3,
      file: "main.jsbundle.hbc",
      mappings: "AAAA;AACA",
      x_google_ignoreList: [],
      debugId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      x_custom_vendor: { nested: true },
    });
  });

  it("never restores positional fields, which index into the packager's sources", async () => {
    const composed = createSourceMap({ version: 3, sources: ["/abs/a.js"], mappings: "AAAA" });

    const restored = await restoreSourceMapMetadata(composed, {
      sourceRoot: "/abs/",
      sections: [],
      ignoreList: [1],
      x_google_ignoreList: [1],
      x_facebook_sources: [null],
      x_hermes_function_offsets: { "0": [0] },
      debugId: "aaaa-bbbb",
    });

    assert.deepStrictEqual(restored, ["debugId"]);
    assert.deepStrictEqual(readSourceMap(composed), { version: 3, sources: ["/abs/a.js"], mappings: "AAAA", debugId: "aaaa-bbbb" });
  });

  it("leaves the composed source map untouched when there is nothing to restore", async () => {
    const composed = createSourceMap({ version: 3, file: "main.jsbundle.hbc", debugId: "from-compose" });
    const contents = fs.readFileSync(composed, "utf8");

    assert.deepStrictEqual(await restoreSourceMapMetadata(composed, { version: 3 }), []);
    assert.deepStrictEqual(await restoreSourceMapMetadata(composed, { debugId: "from-packager" }), []);
    assert.strictEqual(fs.readFileSync(composed, "utf8"), contents);
  });
});

describe("Source map paths", () => {
  it("names the Android maps like the Gradle plugin", () => {
    assert.deepStrictEqual(getSourceMapPaths({ platform: "android" }, "index.android.bundle", "out", true), {
      packager: path.join("out", "index.android.bundle.packager.map"),
      final: path.join("out", "index.android.bundle.map"),
    });
    assert.deepStrictEqual(getSourceMapPaths({ platform: "android" }, "index.android.bundle", "out", false), {
      packager: path.join("out", "index.android.bundle.map"),
      final: path.join("out", "index.android.bundle.map"),
    });
  });

  it("names the iOS map after SOURCEMAP_FILE from the Podfile's .xcode.env", () => {
    const iosDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-ios-"));
    try {
      const podFile = path.join(iosDirectory, "Podfile");
      fs.writeFileSync(path.join(iosDirectory, ".xcode.env"), "export SOURCEMAP_FILE=/build/custom.map\n");
      const map = path.join("out", "custom.map");
      assert.deepStrictEqual(getSourceMapPaths({ platform: "ios", podFile }, "main.jsbundle", "out", true), {
        packager: map,
        final: map,
      });
    } finally {
      fs.rmSync(iosDirectory, { recursive: true, force: true });
    }
  });

  it("uses a .map sourcemapOutput as is", () => {
    const map = path.join("out", "app.map");
    assert.deepStrictEqual(getSourceMapPaths({ platform: "android" }, "index.android.bundle", map, true), {
      packager: map,
      final: map,
    });
  });
});
