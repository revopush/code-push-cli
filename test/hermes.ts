import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as uiLog from "../script/ui/log";
import {
  findHermesc,
  getHermescBytecodeVersion,
  isBaseBytecodeCompatible,
  isHermesEnabled,
} from "../script/platforms/react-native/hermes";
import { restoreEnvAfterEach } from "./helpers/env";
import { useTempDirectory } from "./helpers/temp-directory";

const OS_BIN = ({ win32: "win64-bin", darwin: "osx-bin" } as Record<string, string>)[process.platform] ?? "linux64-bin";

function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

const HERMES_BYTECODE_MAGIC = BigInt("0x1F1903C103BC1FC6");

function hermesBytecodeHeader(version: number): Buffer {
  const header = Buffer.alloc(128);
  header.writeBigUInt64LE(HERMES_BYTECODE_MAGIC, 0);
  header.writeUInt32LE(version, 8);
  return header;
}

describe("hermes", () => {
  const project = useTempDirectory("hermes", { chdir: true });
  restoreEnvAfterEach();

  beforeEach(() => {
    delete process.env.HERMES_CLI_PATH;
    delete process.env.PODFILE_DIR;
  });

  afterEach(() => sinon.restore());

  function writePackageJson(directory: string, name: string, version: string): string {
    return project.write(`${directory}/package.json`, JSON.stringify({ name, version }));
  }

  function writeReactNativeApp(): void {
    writePackageJson("node_modules/react-native", "react-native", "0.83.0");
    project.write("android/app/build.gradle", "react {\n}\n");
    project.write("android/gradle.properties", "hermesEnabled=true\n");
  }

  function writeBundledHermesc(): string {
    return project.write(`node_modules/react-native/sdks/hermesc/${OS_BIN}/${exe("hermesc")}`);
  }

  function writeHermesCompiler(nodeModules = "node_modules"): string {
    writePackageJson(`${nodeModules}/hermes-compiler`, "hermes-compiler", "1.0.0");
    return project.write(`${nodeModules}/hermes-compiler/hermesc/${OS_BIN}/${exe("hermesc")}`);
  }

  async function resolvedHermesc(options: Parameters<typeof findHermesc>[0]): Promise<string> {
    return fs.realpathSync(await findHermesc(options));
  }

  describe("findHermesc", () => {
    beforeEach(writeReactNativeApp);

    describe("on Android", () => {
      it("resolves a literal hermesCommand from the react block against the project root", async () => {
        writeBundledHermesc();
        project.write("android/app/build.gradle", 'react {\n    hermesCommand = "custom/%OS-BIN%/hermesc"\n}\n');

        assert.equal(await findHermesc({ platform: "android" }), path.join(project.path, "custom", OS_BIN, "hermesc"));
      });

      it("expands $rootDir in hermesCommand", async () => {
        writeBundledHermesc();
        project.write("android/app/build.gradle", 'react {\n    hermesCommand = "$rootDir/my-custom-hermesc/bin/hermesc"\n}\n');

        assert.equal(
          await findHermesc({ platform: "android" }),
          path.join(project.path, "android", "my-custom-hermesc", "bin", "hermesc")
        );
      });

      it("reads a literal hermesCommand from a Kotlin DSL build script", async () => {
        writeBundledHermesc();
        fs.rmSync(path.join(project.path, "android", "app", "build.gradle"));
        project.write("android/app/build.gradle.kts", 'react {\n    hermesCommand.set("custom/%OS-BIN%/hermesc")\n}\n');

        assert.equal(await findHermesc({ platform: "android" }), path.join(project.path, "custom", OS_BIN, "hermesc"));
      });

      it("ignores a commented-out hermesCommand", async () => {
        const bundled = writeBundledHermesc();
        project.write("android/app/build.gradle", 'react {\n    // hermesCommand = "$rootDir/my-custom-hermesc/bin/hermesc"\n}\n');

        assert.equal(await resolvedHermesc({ platform: "android" }), bundled);
      });

      it("ignores a computed hermesCommand expression such as Expo's", async () => {
        const bundled = writeBundledHermesc();
        project.write(
          "android/app/build.gradle",
          'react {\n    hermesCommand = new File(["node", "--print", "require.resolve(\'react-native/package.json\')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"\n}\n'
        );

        assert.equal(await resolvedHermesc({ platform: "android" }), bundled);
      });

      it("ignores Expo SDK 55's hermesCommand expression without a warning", async () => {
        const compiler = writeHermesCompiler();
        project.write(
          "android/app/build.gradle",
          'react {\n    hermesCommand = new File(["node", "--print", "require.resolve(\'hermes-compiler/package.json\', { paths: [require.resolve(\'react-native/package.json\')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"\n}\n'
        );
        const log = sinon.stub(uiLog, "log");

        assert.equal(await resolvedHermesc({ platform: "android" }), compiler);
        sinon.assert.notCalled(log);
      });

      it("prefers the bundled hermesc unless Hermes V1 is enabled", async () => {
        const bundled = writeBundledHermesc();
        const compiler = writeHermesCompiler();
        assert.equal(await resolvedHermesc({ platform: "android" }), bundled);

        project.write("android/gradle.properties", "hermesEnabled=true\nhermesV1Enabled=true\n");
        assert.equal(await resolvedHermesc({ platform: "android" }), compiler);
      });

      it("resolves hermes-compiler through react-native when it is not hoisted", async () => {
        const compiler = writeHermesCompiler("node_modules/react-native/node_modules");

        assert.equal(await resolvedHermesc({ platform: "android" }), compiler);
      });

      it("finds the hermes binary of RN < 0.64's hermes-engine package", async () => {
        writePackageJson("node_modules/hermes-engine", "hermes-engine", "0.4.0");
        const hermes = project.write(`node_modules/hermes-engine/${OS_BIN}/${exe("hermes")}`);

        assert.equal(await resolvedHermesc({ platform: "android" }), hermes);
      });
    });

    describe("on iOS", () => {
      it("uses HERMES_CLI_PATH from the environment", async () => {
        writeHermesCompiler();
        process.env.HERMES_CLI_PATH = "/custom/hermesc";

        assert.equal(await findHermesc({ platform: "ios" }), "/custom/hermesc");
      });

      it("reads HERMES_CLI_PATH from ios/.xcode.env.local over ios/.xcode.env", async () => {
        project.write("ios/.xcode.env", "export HERMES_CLI_PATH=/env/hermesc\n");
        project.write("ios/.xcode.env.local", "export HERMES_CLI_PATH=/xcode/hermesc\n");

        assert.equal(await findHermesc({ platform: "ios" }), "/xcode/hermesc");
      });

      it("prefers the Podfile's .xcode.env over PODFILE_DIR over ios/", async () => {
        project.write("ios/.xcode.env", "export HERMES_CLI_PATH=/ios/hermesc\n");
        project.write("apps/mobile/ios/.xcode.env", "export HERMES_CLI_PATH=/podfile/hermesc\n");
        project.write("pods/.xcode.env", "export HERMES_CLI_PATH=/podfile-dir/hermesc\n");
        assert.equal(await findHermesc({ platform: "ios" }), "/ios/hermesc");

        process.env.PODFILE_DIR = path.join(project.path, "pods");
        assert.equal(await findHermesc({ platform: "ios" }), "/podfile-dir/hermesc");
        assert.equal(await findHermesc({ platform: "ios", podFile: "apps/mobile/ios/Podfile" }), "/podfile/hermesc");
      });

      it("ignores a HERMES_CLI_PATH that references Xcode variables", async () => {
        const compiler = writeHermesCompiler();
        project.write("ios/.xcode.env", 'export HERMES_CLI_PATH="$PODS_ROOT/custom/hermesc"\n');

        assert.equal(await resolvedHermesc({ platform: "ios" }), compiler);
      });

      it("prefers hermes-compiler, skipping RN 0.82's empty placeholder package", async () => {
        const bundled = writeBundledHermesc();
        writePackageJson("node_modules/hermes-compiler", "hermes-compiler", "0.0.0");
        assert.equal(await resolvedHermesc({ platform: "ios" }), bundled);

        const compiler = writeHermesCompiler();
        assert.equal(await resolvedHermesc({ platform: "ios" }), compiler);
      });
    });

    it("fails with the setting to use when no hermesc is found", async () => {
      await assert.rejects(findHermesc({ platform: "android" }), /Set react\.hermesCommand/);
      await assert.rejects(findHermesc({ platform: "ios" }), /Set HERMES_CLI_PATH/);
    });
  });

  describe("isHermesEnabled", () => {
    beforeEach(writeReactNativeApp);

    it("reads hermesEnabled from gradle.properties", async () => {
      project.write("android/gradle.properties", "hermesEnabled=false\n");

      assert.equal(await isHermesEnabled({ platform: "android" }), false);
    });

    it("reads the scoped react.hermesEnabled property", async () => {
      project.write("android/gradle.properties", "react.hermesEnabled=false\n");

      assert.equal(await isHermesEnabled({ platform: "android" }), false);
    });

    it("reads enableHermes from RN < 0.71's project.ext.react", async () => {
      project.write("android/gradle.properties", "");
      project.write("android/app/build.gradle", "project.ext.react = [\n    enableHermes: false\n]\n");

      assert.equal(await isHermesEnabled({ platform: "android" }), false);
    });

    it("reads enableHermes after a commented project.ext.react entry", async () => {
      project.write("android/gradle.properties", "");
      writePackageJson("node_modules/react-native", "react-native", "0.68.0");
      project.write(
        "android/app/build.gradle",
        'project.ext.react = [\n    entryFile: "index.js",  // entry\n    enableHermes: true\n]\n'
      );

      assert.equal(await isHermesEnabled({ platform: "android" }), true);
    });

    it("reads hermes_enabled from the Podfile, ignoring comments", async () => {
      project.write("ios/Podfile", "# :hermes_enabled => true\nuse_react_native!(\n  :hermes_enabled => false\n)\n");

      assert.equal(await isHermesEnabled({ platform: "ios" }), false);
    });

    it("looks in ios/ when the parser passes no Podfile (null)", async () => {
      project.write("ios/Podfile", "use_react_native!(\n  :hermes_enabled => false\n)\n");

      assert.equal(await isHermesEnabled({ platform: "ios", podFile: null }), false);
    });

    it("reads the USE_HERMES build setting pod install writes into the Xcode project", async () => {
      project.write("ios/Podfile", "use_react_native!(\n  :hermes_enabled => true\n)\n");
      project.write("ios/App.xcodeproj/project.pbxproj", "buildSettings = {\n\t\t\t\tUSE_HERMES = false;\n};\n");

      assert.equal(await isHermesEnabled({ platform: "ios" }), false);
    });

    it("defaults to Hermes on RN 0.70+", async () => {
      project.write("android/gradle.properties", "");

      assert.equal(await isHermesEnabled({ platform: "android" }), true);
    });
  });

  /** A stand-in hermesc: a node script that runs `script` in place of `hermesc -emit-binary -` */
  function writeCompiler(script: string): string {
    const compiler = project.write("hermesc", `#!/usr/bin/env node\n${script}\n`);
    fs.chmodSync(compiler, 0o755);
    return compiler;
  }

  function writeCompilerEmitting(version: number): string {
    return writeCompiler(`process.stdout.write(Buffer.from("${hermesBytecodeHeader(version).toString("hex")}", "hex"));`);
  }

  function writeFailingCompiler(): string {
    return writeCompiler("process.exit(1);");
  }

  function writeBundle(contents: Buffer | string): string {
    return project.write("index.android.bundle", contents);
  }

  describe("getHermescBytecodeVersion", () => {
    it("reads the version from the bytecode the compiler emits", () => {
      assert.equal(getHermescBytecodeVersion(writeCompilerEmitting(98)), 98);
    });

    it("returns undefined when the compiler fails, is missing, or emits something other than Hermes bytecode", () => {
      assert.equal(getHermescBytecodeVersion(writeFailingCompiler()), undefined);
      assert.equal(getHermescBytecodeVersion(writeCompiler(`process.stdout.write("var a;");`)), undefined);
      assert.equal(getHermescBytecodeVersion(path.join(project.path, "missing-hermesc")), undefined);
    });
  });

  describe("isBaseBytecodeCompatible", () => {
    let log: sinon.SinonStub;

    beforeEach(() => {
      log = sinon.stub(uiLog, "log");
    });

    it("accepts the base bytecode when versions match", () => {
      assert.equal(isBaseBytecodeCompatible(writeBundle(hermesBytecodeHeader(96)), writeCompilerEmitting(96)), true);
      sinon.assert.notCalled(log);
    });

    it("rejects the base bytecode and warns when versions differ", () => {
      assert.equal(isBaseBytecodeCompatible(writeBundle(hermesBytecodeHeader(96)), writeCompilerEmitting(98)), false);
      sinon.assert.calledWithMatch(log, sinon.match(/v96.*v98/s));
    });

    it("rejects the base bytecode when the compiler version is unknown", () => {
      assert.equal(isBaseBytecodeCompatible(writeBundle(hermesBytecodeHeader(96)), writeFailingCompiler()), false);
    });

    it("rejects a base that is not Hermes bytecode", () => {
      const compiler = writeCompilerEmitting(96);

      assert.equal(isBaseBytecodeCompatible(writeBundle("__d(function(){});"), compiler), false);
      assert.equal(isBaseBytecodeCompatible(writeBundle(Buffer.from([0xc6, 0x1f])), compiler), false);
    });
  });
});
