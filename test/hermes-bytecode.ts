import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as cmdexec from "../script/command-executor";
import {
  parseHermesCompilerBytecodeVersion,
  readHermesBytecodeVersion,
  resolveHermesBaseBytecode,
} from "../script/react-native-utils";

function createHermesBundle(filePath: string, version: number): string {
  const header = Buffer.alloc(128);
  header.writeBigUInt64LE(BigInt("0x1F1903C103BC1FC6"), 0);
  header.writeUInt32LE(version, 8);
  fs.writeFileSync(filePath, header);
  return filePath;
}

describe("Hermes base bytecode", () => {
  let testDirectory: string;
  let sandbox: sinon.SinonSandbox;
  let log: sinon.SinonStub;

  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-hermes-"));
    sandbox = sinon.createSandbox();
    log = sandbox.stub(cmdexec, "log");
  });

  afterEach(() => {
    sandbox.restore();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  it("reads the bytecode version from a Hermes bundle header", () => {
    const bundle = createHermesBundle(path.join(testDirectory, "index.android.bundle"), 96);
    assert.strictEqual(readHermesBytecodeVersion(bundle), 96);
  });

  it("returns null for a plain JS bundle", () => {
    const bundle = path.join(testDirectory, "index.android.bundle");
    fs.writeFileSync(bundle, "var __BUNDLE_START_TIME__=this.nativePerformanceNow?nativePerformanceNow():Date.now();");
    assert.strictEqual(readHermesBytecodeVersion(bundle), null);
  });

  it("returns null for a file shorter than the header", () => {
    const bundle = path.join(testDirectory, "index.android.bundle");
    fs.writeFileSync(bundle, Buffer.from([0xc6, 0x1f]));
    assert.strictEqual(readHermesBytecodeVersion(bundle), null);
  });

  it("parses the bytecode version from hermesc -version output", () => {
    const output = "Hermes JavaScript compiler.\n  Hermes release version: 250829098.0.1\n  HBC bytecode version: 98\n\n  Features:\n";
    assert.strictEqual(parseHermesCompilerBytecodeVersion(output), 98);
    assert.strictEqual(parseHermesCompilerBytecodeVersion("unknown option"), null);
  });

  it("keeps the base bytecode when versions match", () => {
    const bundle = createHermesBundle(path.join(testDirectory, "index.android.bundle"), 96);
    assert.strictEqual(resolveHermesBaseBytecode(bundle, 96), bundle);
    sinon.assert.notCalled(log);
  });

  it("skips the base bytecode and warns when versions differ", () => {
    const bundle = createHermesBundle(path.join(testDirectory, "index.android.bundle"), 96);
    assert.strictEqual(resolveHermesBaseBytecode(bundle, 98), null);
    sinon.assert.calledWithMatch(log, sinon.match(/v96.*v98/s));
  });

  it("skips the base bytecode when the compiler version is unknown", () => {
    const bundle = createHermesBundle(path.join(testDirectory, "index.android.bundle"), 96);
    assert.strictEqual(resolveHermesBaseBytecode(bundle, null), null);
  });

  it("skips the base bytecode when the base is not Hermes bytecode", () => {
    const bundle = path.join(testDirectory, "index.android.bundle");
    fs.writeFileSync(bundle, "__d(function(){});");
    assert.strictEqual(resolveHermesBaseBytecode(bundle, 96), null);
  });
});
