import { strict as assert } from "assert";
import * as path from "path";
import { getSourceMapPaths } from "../script/react-native-utils";
import { useTempDirectory } from "./helpers/temp-directory";

describe("react-native-utils", () => {
  describe("getSourceMapPaths", () => {
    const iosDirectory = useTempDirectory("react-native-utils");

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
});
