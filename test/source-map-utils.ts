// Licensed under the MIT License.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readSourceMapFields, restoreSourceMapFields, SourceMapFields } from "../script/utils/source-map-utils";

describe("Source map utility", () => {
  let testDirectory: string;

  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-source-map-"));
  });

  afterEach(() => {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  it("reads the top-level fields of a source map", () => {
    const sourceMapPath = createSourceMap("packager.map", { version: 3, debugId: "aaaa-bbbb", x_custom_vendor: { nested: true } });

    assert.deepStrictEqual(readSourceMapFields(sourceMapPath), {
      version: 3,
      debugId: "aaaa-bbbb",
      x_custom_vendor: { nested: true },
    });
  });

  it("throws when a source map is not a JSON object", () => {
    const sourceMapPath = path.join(testDirectory, "not-an-object.map");
    fs.writeFileSync(sourceMapPath, JSON.stringify([1, 2, 3]));

    assert.throws(() => readSourceMapFields(sourceMapPath), /is not a source map object/);
  });

  it("restores fields the composer dropped without touching the ones it produced", () => {
    const packagerFields: SourceMapFields = {
      version: 3,
      file: "main.jsbundle",
      mappings: "AAAA;ACAA",
      debugId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      x_google_ignoreList: [1],
      x_custom_vendor: { nested: true },
    };
    const composedSourceMapPath = createSourceMap("composed.map", {
      version: 3,
      file: "main.jsbundle.hbc",
      mappings: "AAAA;AACA",
      x_google_ignoreList: [],
    });

    const restoredFields = restoreSourceMapFields(composedSourceMapPath, packagerFields);

    assert.deepStrictEqual(restoredFields, ["debugId", "x_custom_vendor"]);
    assert.deepStrictEqual(readSourceMapFields(composedSourceMapPath), {
      version: 3,
      file: "main.jsbundle.hbc",
      mappings: "AAAA;AACA",
      x_google_ignoreList: [],
      debugId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      x_custom_vendor: { nested: true },
    });
  });

  it("never restores a structural field the composer resolved away", () => {
    const composedSourceMapPath = createSourceMap("composed.map", { version: 3, sources: ["/abs/a.js"], mappings: "AAAA" });

    const restoredFields = restoreSourceMapFields(composedSourceMapPath, { sourceRoot: "/abs/", sections: [], debugId: "aaaa-bbbb" });

    assert.deepStrictEqual(restoredFields, ["debugId"]);
    assert.deepStrictEqual(readSourceMapFields(composedSourceMapPath), {
      version: 3,
      sources: ["/abs/a.js"],
      mappings: "AAAA",
      debugId: "aaaa-bbbb",
    });
  });

  it("leaves the composed source map untouched when there is nothing to restore", () => {
    const composedSourceMapPath = createSourceMap("composed.map", { version: 3, file: "main.jsbundle.hbc" });
    const composedContents = fs.readFileSync(composedSourceMapPath, "utf8");

    assert.deepStrictEqual(restoreSourceMapFields(composedSourceMapPath, { version: 3 }), []);
    assert.strictEqual(fs.readFileSync(composedSourceMapPath, "utf8"), composedContents);
  });

  function createSourceMap(fileName: string, fields: SourceMapFields): string {
    const sourceMapPath = path.join(testDirectory, fileName);
    fs.writeFileSync(sourceMapPath, JSON.stringify(fields, null, 2));
    return sourceMapPath;
  }
});
