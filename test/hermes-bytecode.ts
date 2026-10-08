import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as cmdexec from "../script/command-executor";
import { getHermesCompilerBytecodeVersion, resolveHermesBaseBytecode } from "../script/react-native-utils";

function hermesHeader(version: number): Buffer {
  const header = Buffer.alloc(128);
  header.writeBigUInt64LE(BigInt("0x1F1903C103BC1FC6"), 0);
  header.writeUInt32LE(version, 8);
  return header;
}

describe("Hermes base bytecode", () => {
  let testDirectory: string;
  let sandbox: sinon.SinonSandbox;
  let log: sinon.SinonStub;

  function createBundle(contents: Buffer | string): string {
    const bundle = path.join(testDirectory, "index.android.bundle");
    fs.writeFileSync(bundle, contents);
    return bundle;
  }

  function createCompiler(script: string): string {
    const compiler = path.join(testDirectory, "hermesc");
    fs.writeFileSync(compiler, `#!/usr/bin/env node\n${script}\n`, { mode: 0o755 });
    return compiler;
  }

  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-hermes-"));
    sandbox = sinon.createSandbox();
    log = sandbox.stub(cmdexec, "log");
  });

  afterEach(() => {
    sandbox.restore();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  it("reads the compiler bytecode version from the bytecode it emits", () => {
    const compiler = createCompiler(`process.stdout.write(Buffer.from("${hermesHeader(98).toString("hex")}", "hex"));`);
    assert.strictEqual(getHermesCompilerBytecodeVersion(compiler), 98);
  });

  it("returns null when the compiler fails or emits something other than Hermes bytecode", () => {
    assert.strictEqual(getHermesCompilerBytecodeVersion(createCompiler("process.exit(1);")), null);
    assert.strictEqual(getHermesCompilerBytecodeVersion(createCompiler(`process.stdout.write("var a;");`)), null);
    assert.strictEqual(getHermesCompilerBytecodeVersion(path.join(testDirectory, "missing-hermesc")), null);
  });

  it("keeps the base bytecode when versions match", () => {
    const bundle = createBundle(hermesHeader(96));
    assert.strictEqual(resolveHermesBaseBytecode(bundle, 96), bundle);
    sinon.assert.notCalled(log);
  });

  it("skips the base bytecode and warns when versions differ", () => {
    const bundle = createBundle(hermesHeader(96));
    assert.strictEqual(resolveHermesBaseBytecode(bundle, 98), null);
    sinon.assert.calledWithMatch(log, sinon.match(/v96.*v98/s));
  });

  it("skips the base bytecode when the compiler version is unknown", () => {
    assert.strictEqual(resolveHermesBaseBytecode(createBundle(hermesHeader(96)), null), null);
  });

  it("skips the base bytecode when the base is not Hermes bytecode", () => {
    assert.strictEqual(resolveHermesBaseBytecode(createBundle("__d(function(){});"), 96), null);
    assert.strictEqual(resolveHermesBaseBytecode(createBundle(Buffer.from([0xc6, 0x1f])), 96), null);
  });
});
