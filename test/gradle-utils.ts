import { strict as assert } from "assert";
import { getAndroidVersionInfo } from "../script/utils/gradle-utils";
import { useTempDirectory } from "./helpers/temp-directory";

describe("gradle-utils", () => {
  const project = useTempDirectory("gradle-utils", { chdir: true });

  describe("getAndroidVersionInfo", () => {
    it("resolves a versionName that references a Gradle property", async () => {
      project.write("android/gradle.properties", "appVersion=1.2.3\n");
      project.write(
        "android/app/build.gradle",
        "android {\n    defaultConfig {\n        versionName project.appVersion\n        versionCode 7\n    }\n}\n"
      );

      assert.deepEqual(await getAndroidVersionInfo(undefined), { appVersion: "1.2.3", buildNumber: "7" });
    });
  });
});
