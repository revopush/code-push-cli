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

  it("reads a literal hermesCommand from a Kotlin DSL build script", async () => {
    bundledHermesc();
    fs.rmSync(path.join(projectDirectory, "android", "app", "build.gradle"));
    createFile("android/app/build.gradle.kts", 'react {\n    hermesCommand.set("custom/%OS-BIN%/hermesc")\n}\n');
    assert.strictEqual(await findHermesc("android"), path.join(projectDirectory, "custom", OS_BIN, "hermesc"));
  });

  it("ignores a commented-out hermesCommand", async () => {
    const bundled = bundledHermesc();
    createFile("android/app/build.gradle", 'react {\n    // hermesCommand = "$rootDir/my-custom-hermesc/bin/hermesc"\n}\n');
    assert.strictEqual(fs.realpathSync(await findHermesc("android")), bundled);
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

  it("uses HERMES_CLI_PATH on iOS", async () => {
    hermesCompiler();
    process.env.HERMES_CLI_PATH = "/custom/hermesc";
    assert.strictEqual(await findHermesc("ios"), "/custom/hermesc");
  });

  it("reads HERMES_CLI_PATH from ios/.xcode.env.local", async () => {
    createFile("ios/.xcode.env", "export HERMES_CLI_PATH=/env/hermesc\n");
    createFile("ios/.xcode.env.local", "export HERMES_CLI_PATH=/xcode/hermesc\n");
    assert.strictEqual(await findHermesc("ios"), "/xcode/hermesc");
  });

  it("ignores a HERMES_CLI_PATH that references Xcode variables", async () => {
    const compiler = hermesCompiler();
    createFile("ios/.xcode.env", 'export HERMES_CLI_PATH="$PODS_ROOT/custom/hermesc"\n');
    assert.strictEqual(fs.realpathSync(await findHermesc("ios")), compiler);
  });

  it("prefers hermes-compiler on iOS, skipping RN 0.82's empty placeholder package", async () => {
    const bundled = bundledHermesc();
    createFile("node_modules/hermes-compiler/package.json", JSON.stringify({ name: "hermes-compiler", version: "0.0.0" }));
    assert.strictEqual(fs.realpathSync(await findHermesc("ios")), bundled);

    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await findHermesc("ios")), compiler);
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
