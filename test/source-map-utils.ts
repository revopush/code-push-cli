import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { restoreSourceMapMetadata } from "../script/utils/source-map-utils";

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

  const readSourceMap = (sourceMap: string) => JSON.parse(fs.readFileSync(sourceMap, "utf8"));

  it("restores fields the composer dropped without touching the ones it produced", () => {
    const composed = createSourceMap({ version: 3, file: "main.jsbundle.hbc", mappings: "AAAA;AACA", x_google_ignoreList: [] });

    const restored = restoreSourceMapMetadata(composed, {
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

  it("never restores positional fields, which index into the packager's sources", () => {
    const composed = createSourceMap({ version: 3, sources: ["/abs/a.js"], mappings: "AAAA" });

    const restored = restoreSourceMapMetadata(composed, {
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

  it("leaves the composed source map untouched when there is nothing to restore", () => {
    const composed = createSourceMap({ version: 3, file: "main.jsbundle.hbc", debugId: "from-compose" });
    const contents = fs.readFileSync(composed, "utf8");

    assert.deepStrictEqual(restoreSourceMapMetadata(composed, { version: 3 }), []);
    assert.deepStrictEqual(restoreSourceMapMetadata(composed, { debugId: "from-packager" }), []);
    assert.strictEqual(fs.readFileSync(composed, "utf8"), contents);
  });
});
