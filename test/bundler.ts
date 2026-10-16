import { strict as assert } from "assert";
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as sinon from "sinon";
import * as bundler from "../script/platforms/react-native/bundler";
import * as terminal from "../script/ui/terminal";
import { restoreEnvAfterEach } from "./helpers/env";

const options: bundler.BundleOptions = {
  platform: "android",
  development: false,
  outputFolder: "out",
  bundleName: "index.android.bundle",
  packagerSourceMap: "out/index.android.bundle.map",
  extraBundlerOptions: [],
};

describe("bundler", () => {
  restoreEnvAfterEach();

  let bundlerProcess: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  let spawn: sinon.SinonStub;

  beforeEach(() => {
    bundlerProcess = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    spawn = sinon.stub(bundler, "spawn").returns(bundlerProcess as unknown as ChildProcess);
    sinon.stub(terminal, "log");
  });

  afterEach(() => sinon.restore());

  it("resolves when the bundler exits with code 0", async () => {
    const bundling = bundler.runReactNativeBundleCommand(options, "index.js", false);
    bundlerProcess.emit("close", 0, null);
    await bundling;
  });

  it("rejects when the bundler exits with an error code", async () => {
    const bundling = bundler.runReactNativeBundleCommand(options, "index.js", false);
    bundlerProcess.emit("close", 1, null);
    await assert.rejects(bundling, { message: '"react-native bundle" command exited with code 1.' });
  });

  it("rejects when the bundler is killed, instead of releasing a partial bundle", async () => {
    const bundling = bundler.runReactNativeBundleCommand(options, "index.js", false);
    bundlerProcess.emit("close", null, "SIGKILL");
    await assert.rejects(bundling, { message: '"react-native bundle" command was stopped by SIGKILL.' });
  });

  it("rejects when the bundler can't be started", async () => {
    const bundling = bundler.runReactNativeBundleCommand(options, "index.js", false);
    bundlerProcess.emit("error", new Error("spawn node ENOENT"));
    await assert.rejects(bundling, { message: "spawn node ENOENT" });
  });

  it("passes CODE_PUSH_NODE_ARGS to node, ignoring a blank value", async () => {
    process.env.CODE_PUSH_NODE_ARGS = "  ";
    const bundling = bundler.runReactNativeBundleCommand(options, "index.js", false);
    bundlerProcess.emit("close", 0, null);
    await bundling;
    assert.ok(!spawn.args[0][1].includes(""));

    process.env.CODE_PUSH_NODE_ARGS = " --max-old-space-size=8192 ";
    const bundlingWithArgs = bundler.runReactNativeBundleCommand(options, "index.js", false);
    bundlerProcess.emit("close", 0, null);
    await bundlingWithArgs;
    assert.equal(spawn.args[1][1][0], "--max-old-space-size=8192");
  });
});
