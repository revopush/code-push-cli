import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as cmdexec from "../script/command-executor";
import { findHermesc, isHermesEnabled } from "../script/utils/hermes-utils";
import { getAndroidVersionInfo } from "../script/utils/gradle-utils";

const OS_BIN = process.platform === "darwin" ? "osx-bin" : process.platform === "win32" ? "win64-bin" : "linux64-bin";
const HERMESC = process.platform === "win32" ? "hermesc.exe" : "hermesc";

describe("Hermes command resolution", () => {
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;
  let projectDirectory: string;

  function createFile(relativePath: string, contents = ""): string {
    const file = path.join(projectDirectory, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  }

  const bundledHermesc = () => createFile(`node_modules/react-native/sdks/hermesc/${OS_BIN}/${HERMESC}`);
  const hermesCompiler = (root = "node_modules") => {
    createFile(`${root}/hermes-compiler/package.json`, JSON.stringify({ name: "hermes-compiler", version: "1.0.0" }));
    return createFile(`${root}/hermes-compiler/hermesc/${OS_BIN}/${HERMESC}`);
  };

  beforeEach(() => {
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    delete process.env.HERMES_CLI_PATH;
    delete process.env.REACT_NATIVE_OVERRIDE_HERMES_DIR;
    projectDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "revopush-hermesc-")));
    createFile("node_modules/react-native/package.json", JSON.stringify({ name: "react-native", version: "0.83.0" }));
    createFile("android/app/build.gradle", "react {\n}\n");
    createFile("android/gradle.properties", "hermesEnabled=true\n");
    process.chdir(projectDirectory);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  });

  it("resolves a literal hermesCommand from the react block against the project root", async () => {
    bundledHermesc();
    createFile("android/app/build.gradle", 'react {\n    hermesCommand = "custom/%OS-BIN%/hermesc"\n}\n');
    assert.strictEqual(await findHermesc("android"), path.join(projectDirectory, "custom", OS_BIN, "hermesc"));
  });

  it("expands $rootDir in hermesCommand", async () => {
    bundledHermesc();
    createFile("android/app/build.gradle", 'react {\n    hermesCommand = "$rootDir/my-custom-hermesc/bin/hermesc"\n}\n');
    assert.strictEqual(await findHermesc("android"), path.join(projectDirectory, "android", "my-custom-hermesc", "bin", "hermesc"));
  });

  it("resolves a legacy project.ext.react hermesCommand against the app module", async () => {
    bundledHermesc();
    createFile("android/app/build.gradle", 'project.ext.react = [\n    hermesCommand: "../../custom/%OS-BIN%/hermesc"\n]\n');
    assert.strictEqual(await findHermesc("android"), path.join(projectDirectory, "custom", OS_BIN, "hermesc"));
  });

  it("reads legacy project.ext.react entries that follow a trailing comment", async () => {
    bundledHermesc();
    createFile(
      "android/app/build.gradle",
      'project.ext.react = [\n    enableHermes: true,  // clean and rebuild if changing\n    hermesCommand: "../../custom/%OS-BIN%/hermesc"\n]\n'
    );
    assert.strictEqual(await findHermesc("android"), path.join(projectDirectory, "custom", OS_BIN, "hermesc"));
  });

  it("resolves hermesCommand against a literal react.root", async () => {
    bundledHermesc();
    createFile("android/app/build.gradle", 'react {\n    root = file("../../app-root")\n    hermesCommand = "custom/hermesc"\n}\n');
    assert.strictEqual(await findHermesc("android"), path.join(projectDirectory, "app-root", "custom", "hermesc"));
  });

  describe("Kotlin DSL", () => {
    const gradleRun = () => path.join(projectDirectory, "gradle-ran");

    // Stands in for the Gradle wrapper: records that it ran and prints the evaluated react { } config
    function createGradlew(script: string) {
      fs.rmSync(path.join(projectDirectory, "android", "app", "build.gradle"));
      createFile("android/gradlew", `#!/bin/sh\ntouch "${gradleRun()}"\n${script}\n`);
      fs.chmodSync(path.join(projectDirectory, "android", "gradlew"), 0o755);
    }

    it("evaluates hermesCommand with Gradle and resolves it against react.root", async () => {
      bundledHermesc();
      createGradlew(`echo '{"hermesCommand":"custom/%OS-BIN%/hermesc","root":"${projectDirectory}"}'`);
      createFile("android/app/build.gradle.kts", 'react {\n    hermesCommand = "custom/%OS-BIN%/hermesc"\n}\n');
      assert.strictEqual(await findHermesc("android"), path.join(projectDirectory, "custom", OS_BIN, "hermesc"));
    });

    it("does not run Gradle when the build script doesn't set hermesCommand", async () => {
      const bundled = bundledHermesc();
      createGradlew("exit 1");
      createFile("android/app/build.gradle.kts", 'react {\n    // hermesCommand = "custom/hermesc"\n}\n');
      assert.strictEqual(fs.realpathSync(await findHermesc("android")), bundled);
      assert.strictEqual(fs.existsSync(gradleRun()), false);
    });

    it("warns and falls back to the default hermesc when Gradle fails", async () => {
      const bundled = bundledHermesc();
      const log = sinon.stub(cmdexec, "log");
      try {
        createGradlew("exit 1");
        createFile("android/app/build.gradle.kts", 'react {\n    hermesCommand = "custom/hermesc"\n}\n');
        assert.strictEqual(fs.realpathSync(await findHermesc("android")), bundled);
        sinon.assert.calledWithMatch(log, sinon.match(/Gradle failed/));
      } finally {
        log.restore();
      }
    });
  });

  it("ignores a computed hermesCommand expression such as Expo's", async () => {
    const expected = bundledHermesc();
    createFile(
      "android/app/build.gradle",
      'react {\n    hermesCommand = new File(["node", "--print", "require.resolve(\'react-native/package.json\')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"\n}\n'
    );
    assert.strictEqual(fs.realpathSync(await findHermesc("android")), expected);
  });

  it("ignores Expo SDK 55's hermesCommand expression without a warning", async () => {
    const expected = hermesCompiler();
    createFile(
      "android/app/build.gradle",
      'react {\n    hermesCommand = new File(["node", "--print", "require.resolve(\'hermes-compiler/package.json\', { paths: [require.resolve(\'react-native/package.json\')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"\n}\n'
    );
    const log = sinon.stub(cmdexec, "log");
    try {
      assert.strictEqual(fs.realpathSync(await findHermesc("android")), expected);
      sinon.assert.notCalled(log);
    } finally {
      log.restore();
    }
  });

  it("prefers the bundled hermesc unless Hermes V1 is enabled", async () => {
    const bundled = bundledHermesc();
    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await findHermesc("android")), bundled);

    createFile("android/gradle.properties", "hermesEnabled=true\nhermesV1Enabled=true\n");
    assert.strictEqual(fs.realpathSync(await findHermesc("android")), compiler);
  });

  it("resolves hermes-compiler through react-native when it is not hoisted", async () => {
    const compiler = hermesCompiler("node_modules/react-native/node_modules");
    assert.strictEqual(fs.realpathSync(await findHermesc("android")), compiler);
  });

  it("uses hermesc built from source via REACT_NATIVE_OVERRIDE_HERMES_DIR", async () => {
    bundledHermesc();
    const built = createFile(`hermes/build/bin/${HERMESC}`);
    process.env.REACT_NATIVE_OVERRIDE_HERMES_DIR = path.join(projectDirectory, "hermes");
    assert.strictEqual(await findHermesc("android"), built);
  });

  it("uses HERMES_CLI_PATH, then the CocoaPods hermesc, on iOS", async () => {
    hermesCompiler();
    const podHermesc = createFile("ios/Pods/hermes-engine/destroot/bin/hermesc");
    assert.strictEqual(fs.realpathSync(await findHermesc("ios")), podHermesc);

    process.env.HERMES_CLI_PATH = "/custom/hermesc";
    assert.strictEqual(await findHermesc("ios"), "/custom/hermesc");
  });

  it("prefers hermes-compiler on iOS without CocoaPods, skipping RN 0.82's empty placeholder package", async () => {
    const bundled = bundledHermesc();
    createFile("node_modules/hermes-compiler/package.json", JSON.stringify({ name: "hermes-compiler", version: "0.0.0" }));
    assert.strictEqual(fs.realpathSync(await findHermesc("ios")), bundled);

    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await findHermesc("ios")), compiler);
  });

  it("falls back to hermes-compiler on iOS when react-native has no bundled hermesc", async () => {
    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await findHermesc("ios")), compiler);
  });

  it("reads HERMES_CLI_PATH from ios/.xcode.env.local", async () => {
    createFile("ios/.xcode.env.local", "export HERMES_CLI_PATH=/xcode/hermesc\n");
    assert.strictEqual(await findHermesc("ios"), "/xcode/hermesc");
  });

  it("uses HERMES_CLI_PATH written into the Pods xcconfig by pod install", async () => {
    createFile("ios/Pods/hermes-engine/destroot/bin/hermesc");
    createFile(
      "ios/Pods/Target Support Files/Pods-App/Pods-App.release.xcconfig",
      "PODS_ROOT = ${SRCROOT}/Pods\nHERMES_CLI_PATH = $(PODS_ROOT)/../../node_modules/hermes-compiler/hermesc/osx-bin/hermesc\n"
    );
    assert.strictEqual(path.resolve(await findHermesc("ios")), path.resolve("node_modules/hermes-compiler/hermesc/osx-bin/hermesc"));

    createFile("ios/.xcode.env", "export HERMES_CLI_PATH=/xcode/hermesc\n");
    assert.strictEqual(await findHermesc("ios"), "/xcode/hermesc");
  });

  it("expands $PODS_ROOT in HERMES_CLI_PATH", async () => {
    createFile("ios/.xcode.env", 'export HERMES_CLI_PATH="$PODS_ROOT/custom/hermesc"\n');
    assert.strictEqual(await findHermesc("ios"), path.join("ios", "Pods", "custom", "hermesc"));
  });

  it("finds the hermes binary of RN < 0.64's hermes-engine package", async () => {
    createFile("node_modules/hermes-engine/package.json", JSON.stringify({ name: "hermes-engine", version: "0.4.0" }));
    const hermes = createFile(`node_modules/hermes-engine/${OS_BIN}/${process.platform === "win32" ? "hermes.exe" : "hermes"}`);
    assert.strictEqual(fs.realpathSync(await findHermesc("android")), hermes);
  });

  it("fails with the setting to use when no hermesc is found", async () => {
    await assert.rejects(findHermesc("android"), /Set react\.hermesCommand/);
    await assert.rejects(findHermesc("ios"), /Set HERMES_CLI_PATH/);
  });

  describe("Hermes enabled detection", () => {
    const command = (platform: string): any => ({ platform });

    it("reads hermesEnabled from gradle.properties", async () => {
      createFile("android/gradle.properties", "hermesEnabled=false\n");
      assert.strictEqual(await isHermesEnabled(command("android")), false);
    });

    it("reads enableHermes after a commented project.ext.react entry", async () => {
      createFile("android/gradle.properties", "");
      createFile("node_modules/react-native/package.json", JSON.stringify({ name: "react-native", version: "0.68.0" }));
      createFile(
        "android/app/build.gradle",
        'project.ext.react = [\n    entryFile: "index.js",  // entry\n    enableHermes: true\n]\n'
      );
      assert.strictEqual(await isHermesEnabled(command("android")), true);
    });

    it("reads enableHermes from RN < 0.71's project.ext.react", async () => {
      createFile("android/gradle.properties", "");
      createFile("android/app/build.gradle", "project.ext.react = [\n    enableHermes: false\n]\n");
      assert.strictEqual(await isHermesEnabled(command("android")), false);
    });

    it("reads hermes_enabled from the Podfile, ignoring comments", async () => {
      createFile("ios/Podfile", "# :hermes_enabled => true\nuse_react_native!(\n  :hermes_enabled => false\n)\n");
      assert.strictEqual(await isHermesEnabled(command("ios")), false);
    });

    it("reads the scoped react.hermesEnabled property", async () => {
      createFile("android/gradle.properties", "react.hermesEnabled=false\n");
      assert.strictEqual(await isHermesEnabled(command("android")), false);
    });

    it("reads the USE_HERMES build setting pod install writes into the Xcode project", async () => {
      createFile("ios/Podfile", "use_react_native!(\n  :hermes_enabled => true\n)\n");
      createFile("ios/App.xcodeproj/project.pbxproj", "buildSettings = {\n\t\t\t\tUSE_HERMES = false;\n};\n");
      assert.strictEqual(await isHermesEnabled(command("ios")), false);
    });

    it("defaults to Hermes on RN 0.70+", async () => {
      createFile("android/gradle.properties", "");
      assert.strictEqual(await isHermesEnabled(command("android")), true);
    });
  });

  it("resolves a versionName that references a Gradle property", async () => {
    createFile("android/gradle.properties", "appVersion=1.2.3\n");
    createFile(
      "android/app/build.gradle",
      "android {\n    defaultConfig {\n        versionName project.appVersion\n        versionCode 7\n    }\n}\n"
    );
    assert.deepStrictEqual(await getAndroidVersionInfo(undefined), { appVersion: "1.2.3", buildNumber: "7" });
  });
});
