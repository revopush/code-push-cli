import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
    projectDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "revopush-hermesc-")));
    createFile("node_modules/react-native/package.json", JSON.stringify({ name: "react-native", version: "0.83.0" }));
    createFile("android/app/build.gradle", "react {\n}\n");
    createFile("android/gradle.properties", "hermesEnabled=true\n");
    process.chdir(projectDirectory);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  });

  it("uses a literal hermesCommand from the react block, resolved against the app module", async () => {
    bundledHermesc();
    createFile("android/app/build.gradle", 'react {\n    hermesCommand = "../../custom/%OS-BIN%/hermesc"\n}\n');
    assert.strictEqual(
      await getHermesCommand("android", undefined, undefined),
      path.join(projectDirectory, "custom", OS_BIN, "hermesc")
    );
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

  it("falls back to hermes-compiler on iOS without CocoaPods", async () => {
    bundledHermesc();
    const compiler = hermesCompiler();
    assert.strictEqual(fs.realpathSync(await getHermesCommand("ios", undefined, undefined)), compiler);
  });
});
