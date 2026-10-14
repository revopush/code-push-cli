// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { strict as assert } from "assert";
import * as path from "path";
import {
  analyzeReleaseContents,
  ASSET_OPTIMIZATION_DOCS_URL,
  enforceAssetSizeLimit,
  formatReleaseSizeWarnings,
  formatSourceMapWarning,
  MAX_ASSET_SIZE_BYTES,
  MAX_BUNDLE_SIZE_BYTES,
  ReleaseSizeAnalysis,
  SENTRY_SOURCE_MAP_DOCS_URL,
  shouldAnalyzeReleaseSizes,
} from "../script/utils/release-size-utils";
import { useTempDirectory } from "./helpers/temp-directory";

function releaseSizeAnalysis(overrides: Partial<ReleaseSizeAnalysis> = {}): ReleaseSizeAnalysis {
  return { bundleSize: 1, oversizedAssets: [], sourceMaps: [], ...overrides };
}

describe("release-size-utils", () => {
  describe("analyzeReleaseContents", () => {
    const release = useTempDirectory("release-size-utils");

    it("finds oversized assets recursively, excludes the bundle, and sorts paths", () => {
      release.writeSized("main.jsbundle", MAX_ASSET_SIZE_BYTES + 100);
      release.writeSized("at-limit.asset", MAX_ASSET_SIZE_BYTES);
      release.writeSized("z.asset", MAX_ASSET_SIZE_BYTES + 2);
      release.writeSized(path.join("nested", "a.asset"), MAX_ASSET_SIZE_BYTES + 1);
      release.writeSized(path.join("maps", "z.map"), 1);
      release.writeSized("a.MAP", 1);

      const analysis = analyzeReleaseContents(release.path, "main.jsbundle");

      assert.equal(analysis.bundleSize, MAX_ASSET_SIZE_BYTES + 100);
      assert.deepEqual(
        analysis.oversizedAssets.map((asset) => asset.path),
        ["nested/a.asset", "z.asset"]
      );
      assert.deepEqual(
        analysis.sourceMaps.map((sourceMap) => sourceMap.path),
        ["a.MAP", "maps/z.map"]
      );
    });

    it("allows files exactly at the asset and bundle limits", () => {
      release.writeSized("index.android.bundle", MAX_BUNDLE_SIZE_BYTES);
      release.writeSized("asset.bin", MAX_ASSET_SIZE_BYTES);

      const analysis = analyzeReleaseContents(release.path, "index.android.bundle");

      assert.equal(analysis.oversizedAssets.length, 0);
      assert.equal(formatReleaseSizeWarnings(analysis, false), null);
    });

    it("detects files that exceed the limits by one byte", () => {
      release.writeSized("index.android.bundle", MAX_BUNDLE_SIZE_BYTES + 1);
      release.writeSized("asset.bin", MAX_ASSET_SIZE_BYTES + 1);

      const analysis = analyzeReleaseContents(release.path, "index.android.bundle");

      assert.equal(analysis.bundleSize, MAX_BUNDLE_SIZE_BYTES + 1);
      assert.deepEqual(analysis.oversizedAssets, [{ path: "asset.bin", size: MAX_ASSET_SIZE_BYTES + 1 }]);
    });

    it("measures the final bundle after Hermes overwrites the JS bundle", () => {
      release.writeSized("main.jsbundle", 1024);
      assert.equal(analyzeReleaseContents(release.path, "main.jsbundle").bundleSize, 1024);

      release.writeSized("main.jsbundle", MAX_BUNDLE_SIZE_BYTES + 1);

      const analysis = analyzeReleaseContents(release.path, "main.jsbundle");
      assert.equal(analysis.bundleSize, MAX_BUNDLE_SIZE_BYTES + 1);
      assert.ok(formatReleaseSizeWarnings(analysis, false));
    });
  });

  describe("enforceAssetSizeLimit", () => {
    it("blocks oversized assets without force and includes the remediation", () => {
      const analysis = releaseSizeAnalysis({
        oversizedAssets: [{ path: "images/hero.png", size: MAX_ASSET_SIZE_BYTES + 1 }],
      });

      assert.throws(
        () => enforceAssetSizeLimit(analysis, false),
        (error: Error) =>
          error.message.includes("images/hero.png") &&
          error.message.includes(`${MAX_ASSET_SIZE_BYTES + 1} bytes`) &&
          error.message.includes("--force") &&
          error.message.includes(ASSET_OPTIMIZATION_DOCS_URL)
      );
      assert.doesNotThrow(() => enforceAssetSizeLimit(analysis, true));
    });
  });

  describe("formatReleaseSizeWarnings", () => {
    it("formats forced asset and large bundle warnings in one final section", () => {
      const analysis = releaseSizeAnalysis({
        bundleSize: MAX_BUNDLE_SIZE_BYTES + 1,
        oversizedAssets: [{ path: "images/hero.png", size: MAX_ASSET_SIZE_BYTES + 1 }],
      });

      const warning = formatReleaseSizeWarnings(analysis, true);

      assert.ok(warning);
      assert.ok(warning.startsWith("[Warning] Release size checks:"));
      assert.ok(warning.includes("Release completed because --force was used"));
      assert.ok(warning.includes("images/hero.png"));
      assert.ok(warning.includes(ASSET_OPTIMIZATION_DOCS_URL));
      assert.ok(warning.includes("The generated JS/Hermes bundle"));
      assert.ok(warning.includes("To reduce the update size, use diff updates."));
      assert.ok(warning.indexOf("images/hero.png") < warning.indexOf("The generated JS/Hermes bundle"));
    });

    it("warns about a large bundle without requiring force", () => {
      const analysis = releaseSizeAnalysis({ bundleSize: MAX_BUNDLE_SIZE_BYTES + 1 });

      const warning = formatReleaseSizeWarnings(analysis, false);

      assert.ok(warning);
      assert.ok(warning.includes(`${MAX_BUNDLE_SIZE_BYTES + 1} bytes`));
      assert.ok(warning.includes("diff updates"));
    });
  });

  describe("formatSourceMapWarning", () => {
    it("formats a separate source map warning with file paths and the Sentry guide", () => {
      const warning = formatSourceMapWarning([
        { path: "a.map", size: 1 },
        { path: "nested/b.map", size: 2 },
      ]);

      assert.ok(warning);
      assert.ok(warning.includes("a.map"));
      assert.ok(warning.includes("nested/b.map"));
      assert.ok(warning.includes(SENTRY_SOURCE_MAP_DOCS_URL));
      assert.equal(formatSourceMapWarning([]), null);
    });
  });

  describe("shouldAnalyzeReleaseSizes", () => {
    it("analyzes iOS and Android releases but bypasses Windows", () => {
      assert.equal(shouldAnalyzeReleaseSizes("ios"), true);
      assert.equal(shouldAnalyzeReleaseSizes("ANDROID"), true);
      assert.equal(shouldAnalyzeReleaseSizes("windows"), false);
    });
  });
});
