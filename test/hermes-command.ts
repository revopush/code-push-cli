import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as cmdexec from "../script/command-executor";
import { getHermesCommand } from "../script/react-native-utils";

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
    delete process.env.RCT_HERMES_V1_ENABLED;
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
    assert.strictEqual(
      await getHermesCommand("android", undefined, undefined),
      path.join(projectDirectory, "custom", OS_BIN, "hermesc")
    );
  });

  it("expands $rootDir in hermesCommand", async () => {
    bundledHermesc();
    createFile("android/app/build.gradle", 'react {\n    hermesCommand = "$rootDir/my-custom-hermesc/bin/hermesc"\n}\n');
    assert.strictEqual(
      await getHermesCommand("android", undefined, undefined),
      path.join(projectDirectory, "android", "my-custom-hermesc", "bin", "hermesc")
    );
  });

  it("resolves a legacy project.ext.react hermesCommand against the app module", async () => {
    bundledHermesc();
    createFile("android/app/build.gradle", 'project.ext.react = [\n    hermesCommand: "../../custom/%OS-BIN%/hermesc"\n]\n');
    assert.strictEqual(
      await getHermesCommand("android", undefined, undefined),
      path.join(projectDirectory, "custom", OS_BIN, "hermesc")
    );
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
      assert.strictEqual(
        await getHermesCommand("android", undefined, undefined),
        path.join(projectDirectory, "custom", OS_BIN, "hermesc")
      );
    });

    it("does not run Gradle when the build script doesn't set hermesCommand", async () => {
      const bundled = bundledHermesc();
      createGradlew("exit 1");
      createFile("android/app/build.gradle.kts", 'react {\n    // hermesCommand = "custom/hermesc"\n}\n');
      assert.strictEqual(fs.realpathSync(await getHermesCommand("android", undefined, undefined)), bundled);
      assert.strictEqual(fs.existsSync(gradleRun()), false);
    });

    it("warns and falls back to the default hermesc when Gradle fails", async () => {
      const bundled = bundledHermesc();
      const log = sinon.stub(cmdexec, "log");
      try {
        createGradlew("exit 1");
        createFile("android/app/build.gradle.kts", 'react {\n    hermesCommand = "custom/hermesc"\n}\n');
        assert.strictEqual(fs.realpathSync(await getHermesCommand("android", undefined, undefined)), bundled);
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
    assert.strictEqual(fs.realpathSync(await getHermesCommand("android", undefined, undefined)), expected);
  });

  it("prefers the bundled hermesc unless Hermes V1 is enabled", async () => {
    const bundled = bundledHermesc();
    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await getHermesCommand("android", undefined, undefined)), bundled);

    createFile("android/gradle.properties", "hermesEnabled=true\nhermesV1Enabled=true\n");
    assert.strictEqual(fs.realpathSync(await getHermesCommand("android", undefined, undefined)), compiler);
  });

  it("resolves hermes-compiler through react-native when it is not hoisted", async () => {
    const compiler = hermesCompiler("node_modules/react-native/node_modules");
    assert.strictEqual(fs.realpathSync(await getHermesCommand("android", undefined, undefined)), compiler);
  });

  it("uses hermesc built from source via REACT_NATIVE_OVERRIDE_HERMES_DIR", async () => {
    bundledHermesc();
    const built = createFile(`hermes/build/bin/${HERMESC}`);
    process.env.REACT_NATIVE_OVERRIDE_HERMES_DIR = path.join(projectDirectory, "hermes");
    assert.strictEqual(await getHermesCommand("android", undefined, undefined), built);
  });

  it("uses HERMES_CLI_PATH, then the CocoaPods hermesc, on iOS", async () => {
    hermesCompiler();
    const podHermesc = createFile("ios/Pods/hermes-engine/destroot/bin/hermesc");
    assert.strictEqual(fs.realpathSync(await getHermesCommand("ios", undefined, undefined)), podHermesc);

    process.env.HERMES_CLI_PATH = "/custom/hermesc";
    assert.strictEqual(await getHermesCommand("ios", undefined, undefined), "/custom/hermesc");
  });

  it("prefers the bundled hermesc on iOS without CocoaPods unless Hermes V1 is enabled", async () => {
    const bundled = bundledHermesc();
    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await getHermesCommand("ios", undefined, undefined)), bundled);

    process.env.RCT_HERMES_V1_ENABLED = "1";
    assert.strictEqual(fs.realpathSync(await getHermesCommand("ios", undefined, undefined)), compiler);
  });

  it("falls back to hermes-compiler on iOS when react-native has no bundled hermesc", async () => {
    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await getHermesCommand("ios", undefined, undefined)), compiler);
  });

  it("reads HERMES_CLI_PATH from ios/.xcode.env.local", async () => {
    createFile("ios/.xcode.env.local", "export HERMES_CLI_PATH=/xcode/hermesc\n");
    assert.strictEqual(await getHermesCommand("ios", undefined, undefined), "/xcode/hermesc");
  });
});
