import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as cmdexec from "../script/command-executor";
import { getHermescBytecodeVersion, isBaseBytecodeCompatible } from "../script/utils/hermes-utils";

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

  // A stand-in hermesc: a node script whose stdout is what `hermesc -emit-binary -` would print
  function createCompiler(script: string): string {
    const compiler = path.join(testDirectory, "hermesc");
    fs.writeFileSync(compiler, `#!/usr/bin/env node\n${script}\n`, { mode: 0o755 });
    return compiler;
  }

  function compilerEmitting(version: number): string {
    return createCompiler(`process.stdout.write(Buffer.from("${hermesHeader(version).toString("hex")}", "hex"));`);
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
    assert.strictEqual(getHermescBytecodeVersion(compilerEmitting(98)), 98);
  });

  it("returns undefined when the compiler fails or emits something other than Hermes bytecode", () => {
    assert.strictEqual(getHermescBytecodeVersion(createCompiler("process.exit(1);")), undefined);
    assert.strictEqual(getHermescBytecodeVersion(createCompiler(`process.stdout.write("var a;");`)), undefined);
    assert.strictEqual(getHermescBytecodeVersion(path.join(testDirectory, "missing-hermesc")), undefined);
  });

  it("uses the base bytecode when versions match", () => {
    assert.strictEqual(isBaseBytecodeCompatible(createBundle(hermesHeader(96)), compilerEmitting(96)), true);
    sinon.assert.notCalled(log);
  });

  it("skips the base bytecode and warns when versions differ", () => {
    assert.strictEqual(isBaseBytecodeCompatible(createBundle(hermesHeader(96)), compilerEmitting(98)), false);
    sinon.assert.calledWithMatch(log, sinon.match(/v96.*v98/s));
  });

  it("skips the base bytecode when the compiler version is unknown", () => {
    assert.strictEqual(isBaseBytecodeCompatible(createBundle(hermesHeader(96)), createCompiler("process.exit(1);")), false);
  });

  it("skips the base bytecode when the base is not Hermes bytecode", () => {
    const compiler = compilerEmitting(96);
    assert.strictEqual(isBaseBytecodeCompatible(createBundle("__d(function(){});"), compiler), false);
    assert.strictEqual(isBaseBytecodeCompatible(createBundle(Buffer.from([0xc6, 0x1f])), compiler), false);
  });
});
