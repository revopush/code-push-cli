// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { strict as assert } from "assert";
import * as path from "path";
import * as Q from "q";
import * as sinon from "sinon";
import * as cmdexec from "../script/command-executor";
import * as cli from "../script/types/cli";
import {
  ASSET_OPTIMIZATION_DOCS_URL,
  MAX_ASSET_SIZE_BYTES,
  MAX_BUNDLE_SIZE_BYTES,
  SENTRY_SOURCE_MAP_DOCS_URL,
} from "../script/utils/release-size-utils";
import { useTempDirectory } from "./helpers/temp-directory";

interface BundlerOutput {
  bundleSize?: number;
  assetSize?: number;
  /** Also emit main.jsbundle.map among the assets */
  sourceMap?: boolean;
}

// End-to-end size checks of release-react / release-expo, with the bundler and the server stubbed out
describe("command-executor release size checks", () => {
  const project = useTempDirectory("release-size-flow", { chdir: true });
  // releaseReact/releaseExpo reject any other --outputDir basename
  const outputDirectory = () => path.join(project.path, "CodePush");

  let sdkRelease: sinon.SinonStub;
  let warn: sinon.SinonStub;

  beforeEach(() => {
    project.write("package.json", JSON.stringify({ name: "TestApp", dependencies: { expo: "1.0.0", "react-native": "0.60.0" } }));
    project.write("index.js", "module.exports = {};\n");
    project.write("node_modules/react-native/package.json", JSON.stringify({ version: "0.60.0" }));
    project.write("node_modules/@expo/cli/index.js", "module.exports = {};\n");

    sdkRelease = sinon.stub().returns(Q(<void>null));
    sinon.stub(cmdexec, "sdk").value({
      getDeployment: sinon.stub().returns(Q({})),
      isAuthenticated: sinon.stub().returns(Q(true)),
      release: sdkRelease,
    });
    sinon.stub(cmdexec, "log");
    sinon.stub(console, "log");
    warn = sinon.stub(console, "warn");
  });

  afterEach(() => sinon.restore());

  /** Makes the bundler (react-native bundle / expo export:embed) succeed, writing files of the given sizes */
  function stubBundler({ bundleSize = 1, assetSize = 1, sourceMap = false }: BundlerOutput = {}): void {
    sinon.stub(cmdexec, "spawn").callsFake((_command: string, args: string[]) => {
      const bundlePath = args[args.indexOf("--bundle-output") + 1];
      const assetsDirectory = path.join(args[args.indexOf("--assets-dest") + 1], "assets");

      project.writeSized(bundlePath, bundleSize);
      project.writeSized(path.join(assetsDirectory, "hero.png"), assetSize);
      if (sourceMap) {
        project.writeSized(path.join(assetsDirectory, "main.jsbundle.map"), 1);
      }

      return <any>{
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, callback: (exitCode: number) => void) => {
          if (event === "close") {
            callback(0);
          }
        },
      };
    });
  }

  function releaseCommand(type: cli.CommandType, overrides: Partial<cli.IReleaseReactCommand> = {}): cli.IReleaseReactCommand {
    return {
      type,
      appName: "TestApp",
      appStoreVersion: "1.0.0",
      bundleName: "main.jsbundle",
      deploymentName: "Staging",
      description: "Release size test",
      development: false,
      disabled: false,
      entryFile: "index.js",
      extraBundlerOptions: [],
      extraHermesFlags: [],
      force: false,
      mandatory: false,
      outputDir: outputDirectory(),
      platform: "ios",
      rollout: 100,
      sourcemapOutput: path.join(project.path, "main.jsbundle.map"),
      ...overrides,
    };
  }

  function assertWarnedAboutSourceMap(): void {
    sinon.assert.calledOnce(warn);
    assert.ok(warn.firstCall.args[0].includes("main.jsbundle.map"));
    assert.ok(warn.firstCall.args[0].includes(SENTRY_SOURCE_MAP_DOCS_URL));
  }

  it("blocks release-react before upload when an asset is oversized", async () => {
    stubBundler({ assetSize: MAX_ASSET_SIZE_BYTES + 1, sourceMap: true });

    await assert.rejects(
      async () => cmdexec.releaseReact(releaseCommand(cli.CommandType.releaseReact)),
      (error: Error) => error.message.includes("--force") && error.message.includes(ASSET_OPTIMIZATION_DOCS_URL)
    );

    sinon.assert.notCalled(sdkRelease);
    assertWarnedAboutSourceMap();
  });

  it("warns about source maps without blocking release-react", async () => {
    stubBundler({ sourceMap: true });

    await cmdexec.releaseReact(releaseCommand(cli.CommandType.releaseReact));

    sinon.assert.calledOnce(sdkRelease);
    assertWarnedAboutSourceMap();
  });

  it("uploads release-expo with force and prints warnings after upload succeeds", async () => {
    stubBundler({ assetSize: MAX_ASSET_SIZE_BYTES + 1, bundleSize: MAX_BUNDLE_SIZE_BYTES + 1 });
    const events: string[] = [];
    sdkRelease.callsFake(() => Q(<void>null).then(() => events.push("upload-completed")));
    warn.callsFake(() => events.push("warning"));

    await cmdexec.releaseExpo(releaseCommand(cli.CommandType.releaseExpo, { force: true }));

    sinon.assert.calledOnce(sdkRelease);
    sinon.assert.calledOnce(warn);
    assert.deepEqual(events, ["upload-completed", "warning"]);
    assert.ok(warn.firstCall.args[0].includes("hero.png"));
    assert.ok(warn.firstCall.args[0].includes("diff updates"));
  });

  it("does not print deferred warnings when upload fails", async () => {
    stubBundler({ assetSize: MAX_ASSET_SIZE_BYTES + 1, bundleSize: MAX_BUNDLE_SIZE_BYTES + 1 });
    sdkRelease.returns(Q.reject(new Error("Upload failed")));

    await assert.rejects(
      async () => cmdexec.releaseExpo(releaseCommand(cli.CommandType.releaseExpo, { force: true })),
      /Upload failed/
    );

    sinon.assert.calledOnce(sdkRelease);
    sinon.assert.notCalled(warn);
  });
});
