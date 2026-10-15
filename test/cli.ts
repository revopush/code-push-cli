// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as cmdexec from "../script/command-executor";
import * as cli from "../script/types/cli";
import { argValue, fakeBundlerProcess } from "./helpers/bundler";
import { restoreEnvAfterEach } from "./helpers/env";
import { DEFAULT_ACCESS_KEY_MAX_AGE, NOW, SdkStub, TEST_MACHINE_NAME } from "./helpers/sdk-stub";
import { inDirectory, useTempDirectory } from "./helpers/temp-directory";

const TEST_APP_DIRECTORY = path.join(__dirname, "resources", "TestApp");
const INVALID_SEMVER_RANGE_ERROR = 'Please use a semver-compliant target binary version range, for example "1.0.0", "*" or "^1.2.3".';
const INVALID_RELEASE_FILE_ERROR =
  "It is unnecessary to package releases in a .zip or binary file. Please specify the direct path to the update content's directory (e.g. /platforms/ios/www) or file (e.g. main.jsbundle).";

/** Stands in for the bundler: writes an empty bundle where asked and exits immediately */
function fakeBundler(_command: string, args: string[]) {
  const bundlePath = argValue(args, "--bundle-output");
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
  fs.writeFileSync(bundlePath, "");
  return fakeBundlerProcess(args);
}

/** Runs the command; being async turns synchronous throws into rejections for `assert.rejects` */
async function execute(command: cli.ICommand): Promise<void> {
  await cmdexec.execute(command);
}

function patchCommand(overrides: Partial<cli.IPatchCommand> = {}): cli.IPatchCommand {
  return {
    type: cli.CommandType.patch,
    appName: "a",
    deploymentName: "Staging",
    label: null,
    disabled: false,
    description: "Patched",
    mandatory: true,
    rollout: 25,
    appStoreVersion: "1.0.1",
    ...overrides,
  };
}

function promoteCommand(overrides: Partial<cli.IPromoteCommand> = {}): cli.IPromoteCommand {
  return {
    type: cli.CommandType.promote,
    appName: "a",
    sourceDeploymentName: "Staging",
    destDeploymentName: "Production",
    label: null,
    description: "Promoted",
    mandatory: true,
    rollout: 25,
    appStoreVersion: "1.0.1",
    ...overrides,
  };
}

function releaseCommand(overrides: Partial<cli.IReleaseCommand> = {}): cli.IReleaseCommand {
  return {
    type: cli.CommandType.release,
    appName: "a",
    deploymentName: "Staging",
    description: "Test release",
    mandatory: false,
    rollout: null,
    appStoreVersion: "1.0.0",
    package: "./resources",
    ...overrides,
  };
}

function releaseReactCommand(overrides: Partial<cli.IReleaseReactCommand> = {}): cli.IReleaseReactCommand {
  return {
    type: cli.CommandType.releaseReact,
    appName: "a",
    appStoreVersion: null,
    deploymentName: "Staging",
    description: "Test release",
    mandatory: false,
    rollout: null,
    platform: "ios",
    // Defaults the argument parser sets
    extraBundlerOptions: [],
    extraHermesFlags: [],
    ...overrides,
  };
}

describe("CLI", () => {
  let log: sinon.SinonStub;
  let confirm: sinon.SinonStub;
  let spawn: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(cmdexec, "sdk").value(new SdkStub());
    confirm = sinon.stub(cmdexec, "confirm").resolves(true);
    sinon.stub(cmdexec, "createEmptyTempReleaseFolder").resolves();
    log = sinon.stub(cmdexec, "log");
    spawn = sinon.stub(cmdexec, "spawn").callsFake(fakeBundler);
  });

  afterEach(() => sinon.restore());

  const assertLoggedOnce = (message: string): void => sinon.assert.calledOnceWithExactly(log, message);
  const assertLoggedJson = (value: unknown): void => assertLoggedOnce(JSON.stringify(value, null, 2));

  describe("access-key", () => {
    const createdMessages = [
      ['Successfully created the "Test name" access key: key123'],
      ["Make sure to save this key value somewhere safe, since you won't be able to view it from the CLI again!"],
    ];

    it("add creates an access key with the default ttl", async () => {
      const addAccessKey = sinon.spy(cmdexec.sdk, "addAccessKey");

      const command: cli.IAccessKeyAddCommand = { type: cli.CommandType.accessKeyAdd, name: "Test name" };

      await execute(command);

      sinon.assert.calledOnceWithExactly(addAccessKey, "Test name", undefined);
      assert.deepEqual(log.args, createdMessages);
    });

    it("add creates an access key with the specified ttl", async () => {
      const addAccessKey = sinon.spy(cmdexec.sdk, "addAccessKey");

      const command: cli.IAccessKeyAddCommand = { type: cli.CommandType.accessKeyAdd, name: "Test name", ttl: 10000 };

      await execute(command);

      sinon.assert.calledOnceWithExactly(addAccessKey, "Test name", 10000);
      assert.deepEqual(log.args, createdMessages);
    });

    it("patch renames the access key", async () => {
      const command: cli.IAccessKeyPatchCommand = {
        type: cli.CommandType.accessKeyPatch,
        oldName: "Test name",
        newName: "Updated name",
      };

      await execute(command);

      assertLoggedOnce('Successfully renamed the access key "Test name" to "Updated name".');
    });

    it("patch changes the access key's ttl", async () => {
      const command: cli.IAccessKeyPatchCommand = { type: cli.CommandType.accessKeyPatch, oldName: "Test name", ttl: 10000 };

      await execute(command);

      assertLoggedOnce(
        'Successfully changed the expiration date of the "Test name" access key to Wednesday, August 17, 2016 at 12:07 PM.'
      );
    });

    it("patch renames the access key and changes its ttl", async () => {
      const command: cli.IAccessKeyPatchCommand = {
        type: cli.CommandType.accessKeyPatch,
        oldName: "Test name",
        newName: "Updated name",
        ttl: 10000,
      };

      await execute(command);

      assertLoggedOnce(
        'Successfully renamed the access key "Test name" to "Updated name" and changed its expiration date to Wednesday, August 17, 2016 at 12:07 PM.'
      );
    });

    it("list prints the access keys' name and expiration", async () => {
      const command: cli.IAccessKeyListCommand = { type: cli.CommandType.accessKeyList, format: "json" };

      await execute(command);

      assertLoggedJson([{ createdTime: 0, name: "Test name", expires: NOW + DEFAULT_ACCESS_KEY_MAX_AGE }]);
    });

    describe("remove", () => {
      const command: cli.IAccessKeyRemoveCommand = { type: cli.CommandType.accessKeyRemove, accessKey: "8" };

      it("removes the access key", async () => {
        const removeAccessKey = sinon.spy(cmdexec.sdk, "removeAccessKey");

        await execute(command);

        sinon.assert.calledOnceWithExactly(removeAccessKey, "8");
        assertLoggedOnce('Successfully removed the "8" access key.');
      });

      it("keeps the access key if cancelled", async () => {
        const removeAccessKey = sinon.spy(cmdexec.sdk, "removeAccessKey");
        confirm.resolves(false);

        await execute(command);

        sinon.assert.notCalled(removeAccessKey);
        assertLoggedOnce("Access key removal cancelled.");
      });
    });
  });

  describe("app", () => {
    it("add reports the new app and lists its default deployments", async () => {
      const addApp = sinon.spy(cmdexec.sdk, "addApp");
      const deploymentList = sinon.spy(cmdexec, "deploymentList");
      const command: cli.IAppAddCommand = { type: cli.CommandType.appAdd, appName: "a", os: "", platform: "" };

      await execute(command);

      sinon.assert.calledOnce(addApp);
      sinon.assert.calledTwice(log);
      sinon.assert.calledWithExactly(log, 'Successfully added the "a" app, along with the following default deployments:');
      sinon.assert.calledOnce(deploymentList);
    });

    it("list prints the apps", async () => {
      const command: cli.IAppListCommand = { type: cli.CommandType.appList, format: "json" };

      await execute(command);

      const ownedApp = (name: string) => ({
        name,
        collaborators: { "a@a.com": { permission: "Owner", isCurrentAccount: true } },
        deployments: ["Production", "Staging"],
      });
      assertLoggedJson([ownedApp("a"), ownedApp("b")]);
    });

    describe("remove", () => {
      const command: cli.IAppRemoveCommand = { type: cli.CommandType.appRemove, appName: "a" };

      it("removes the app", async () => {
        const removeApp = sinon.spy(cmdexec.sdk, "removeApp");

        await execute(command);

        sinon.assert.calledOnceWithExactly(removeApp, "a");
        assertLoggedOnce('Successfully removed the "a" app.');
      });

      it("keeps the app if cancelled", async () => {
        const removeApp = sinon.spy(cmdexec.sdk, "removeApp");
        confirm.resolves(false);

        await execute(command);

        sinon.assert.notCalled(removeApp);
        assertLoggedOnce("App removal cancelled.");
      });
    });

    it("rename renames the app", async () => {
      const renameApp = sinon.spy(cmdexec.sdk, "renameApp");
      const command: cli.IAppRenameCommand = { type: cli.CommandType.appRename, currentAppName: "a", newAppName: "c" };

      await execute(command);

      sinon.assert.calledOnce(renameApp);
      assertLoggedOnce('Successfully renamed the "a" app to "c".');
    });

    it("transfer transfers the app", async () => {
      const transferApp = sinon.spy(cmdexec.sdk, "transferApp");
      const command: cli.IAppTransferCommand = { type: cli.CommandType.appTransfer, appName: "a", email: "b@b.com" };

      await execute(command);

      sinon.assert.calledOnce(transferApp);
      assertLoggedOnce('Successfully transferred the ownership of app "a" to the account with email "b@b.com".');
    });
  });

  describe("collaborator", () => {
    it("add adds the collaborator", async () => {
      const addCollaborator = sinon.spy(cmdexec.sdk, "addCollaborator");
      const command: cli.ICollaboratorAddCommand = { type: cli.CommandType.collaboratorAdd, appName: "a", email: "b@b.com" };

      await execute(command);

      sinon.assert.calledOnce(addCollaborator);
      assertLoggedOnce('Successfully added "b@b.com" as a collaborator to the app "a".');
    });

    it("list prints the collaborators' email and properties", async () => {
      const command: cli.ICollaboratorListCommand = { type: cli.CommandType.collaboratorList, appName: "a", format: "json" };

      await execute(command);

      assertLoggedJson({
        collaborators: {
          "a@a.com": { permission: "Owner", isCurrentAccount: true },
          "b@b.com": { permission: "Collaborator", isCurrentAccount: false },
        },
      });
    });

    it("remove removes the collaborator", async () => {
      const removeCollaborator = sinon.spy(cmdexec.sdk, "removeCollaborator");
      const command: cli.ICollaboratorRemoveCommand = { type: cli.CommandType.collaboratorRemove, appName: "a", email: "b@b.com" };

      await execute(command);

      sinon.assert.calledOnce(removeCollaborator);
      assertLoggedOnce('Successfully removed "b@b.com" as a collaborator from the app "a".');
    });
  });

  describe("deployment", () => {
    it("add reports the new deployment and its key", async () => {
      const addDeployment = sinon.spy(cmdexec.sdk, "addDeployment");
      const command: cli.IDeploymentAddCommand = {
        type: cli.CommandType.deploymentAdd,
        appName: "a",
        deploymentName: "b",
        default: false,
      };

      await execute(command);

      sinon.assert.calledOnce(addDeployment);
      assertLoggedOnce('Successfully added the "b" deployment with key "6" to the "a" app.');
    });

    describe("clear", () => {
      const command: cli.IDeploymentHistoryClearCommand = {
        type: cli.CommandType.deploymentHistoryClear,
        appName: "a",
        deploymentName: "Staging",
      };

      it("clears the deployment's release history", async () => {
        const clearDeploymentHistory = sinon.spy(cmdexec.sdk, "clearDeploymentHistory");

        await execute(command);

        sinon.assert.calledOnceWithExactly(clearDeploymentHistory, "a", "Staging");
        assertLoggedOnce('Successfully cleared the release history associated with the "Staging" deployment from the "a" app.');
      });

      it("keeps the release history if cancelled", async () => {
        const clearDeploymentHistory = sinon.spy(cmdexec.sdk, "clearDeploymentHistory");
        confirm.resolves(false);

        await execute(command);

        sinon.assert.notCalled(clearDeploymentHistory);
        assertLoggedOnce("Clear deployment cancelled.");
      });
    });

    it("list prints the deployments' names, keys and latest release with its metrics", async () => {
      const command: cli.IDeploymentListCommand = {
        type: cli.CommandType.deploymentList,
        appName: "a",
        format: "json",
        displayKeys: true,
      };

      await execute(command);

      assertLoggedJson([
        { name: "Production", key: "6" },
        {
          name: "Staging",
          key: "6",
          package: {
            appVersion: "1.0.0",
            description: "fgh",
            label: "v2",
            packageHash: "jkl",
            isMandatory: true,
            size: 10,
            blobUrl: "http://mno.pqr",
            uploadTime: 1000,
            metrics: { active: 123, downloaded: 321, failed: 789, installed: 456, totalActive: 1035 },
          },
        },
      ]);
    });

    describe("remove", () => {
      const command: cli.IDeploymentRemoveCommand = {
        type: cli.CommandType.deploymentRemove,
        appName: "a",
        deploymentName: "Staging",
      };

      it("removes the deployment", async () => {
        const removeDeployment = sinon.spy(cmdexec.sdk, "removeDeployment");

        await execute(command);

        sinon.assert.calledOnceWithExactly(removeDeployment, "a", "Staging");
        assertLoggedOnce('Successfully removed the "Staging" deployment from the "a" app.');
      });

      it("keeps the deployment if cancelled", async () => {
        const removeDeployment = sinon.spy(cmdexec.sdk, "removeDeployment");
        confirm.resolves(false);

        await execute(command);

        sinon.assert.notCalled(removeDeployment);
        assertLoggedOnce("Deployment removal cancelled.");
      });
    });

    it("rename renames the deployment", async () => {
      const renameDeployment = sinon.spy(cmdexec.sdk, "renameDeployment");
      const command: cli.IDeploymentRenameCommand = {
        type: cli.CommandType.deploymentRename,
        appName: "a",
        currentDeploymentName: "Staging",
        newDeploymentName: "c",
      };

      await execute(command);

      sinon.assert.calledOnce(renameDeployment);
      assertLoggedOnce('Successfully renamed the "Staging" deployment to "c" for the "a" app.');
    });

    it("history prints the releases with their metrics", async () => {
      const getDeploymentHistory = sinon.spy(cmdexec.sdk, "getDeploymentHistory");
      const command: cli.IDeploymentHistoryCommand = {
        type: cli.CommandType.deploymentHistory,
        appName: "a",
        deploymentName: "Staging",
        format: "json",
        displayAuthor: false,
      };

      await execute(command);

      sinon.assert.calledOnce(getDeploymentHistory);
      assertLoggedJson([
        {
          description: null,
          appVersion: "1.0.0",
          isMandatory: false,
          packageHash: "463acc7d06adc9c46233481d87d9e8264b3e9ffe60fe98d721e6974209dc71a0",
          blobUrl: "https://fakeblobstorage.net/storagev2/blobid1",
          uploadTime: 1447113596270,
          size: 1,
          label: "v1",
          metrics: { active: 789, downloaded: 456, failed: 654, installed: 987, totalActive: 1035 },
        },
        {
          description: "New update - this update does a whole bunch of things, including testing linewrapping",
          appVersion: "1.0.1",
          isMandatory: false,
          packageHash: "463acc7d06adc9c46233481d87d9e8264b3e9ffe60fe98d721e6974209dc71a0",
          blobUrl: "https://fakeblobstorage.net/storagev2/blobid2",
          uploadTime: 1447118476669,
          size: 2,
          label: "v2",
          metrics: { active: 123, downloaded: 321, failed: 789, installed: 456, totalActive: 1035 },
        },
      ]);
    });
  });

  describe("patch", () => {
    it("updates the release with the given label", async () => {
      const patchRelease = sinon.spy(cmdexec.sdk, "patchRelease");

      await execute(patchCommand({ label: "v1" }));

      sinon.assert.calledOnce(patchRelease);
      assertLoggedOnce(`Successfully updated the "v1" release of "a" app's "Staging" deployment.`);
    });

    it("updates the latest release when no label is given", async () => {
      const patchRelease = sinon.spy(cmdexec.sdk, "patchRelease");

      await execute(patchCommand());

      sinon.assert.calledOnce(patchRelease);
      assertLoggedOnce(`Successfully updated the "latest" release of "a" app's "Staging" deployment.`);
    });

    it("updates the release without a target binary version", async () => {
      const patchRelease = sinon.spy(cmdexec.sdk, "patchRelease");

      await execute(patchCommand({ appStoreVersion: null }));

      sinon.assert.calledOnce(patchRelease);
      assertLoggedOnce(`Successfully updated the "latest" release of "a" app's "Staging" deployment.`);
    });

    it("fails if no property to update is given", async () => {
      const patchRelease = sinon.spy(cmdexec.sdk, "patchRelease");
      const command = patchCommand({ disabled: null, description: null, mandatory: null, rollout: null, appStoreVersion: null });

      await assert.rejects(execute(command), { message: "At least one property must be specified to patch a release." });

      sinon.assert.notCalled(patchRelease);
    });
  });

  describe("promote", () => {
    const promotedMessage = `Successfully promoted the "Staging" deployment of the "a" app to the "Production" deployment.`;

    it("promotes the release", async () => {
      const promote = sinon.spy(cmdexec.sdk, "promote");

      await execute(promoteCommand());

      sinon.assert.calledOnce(promote);
      assertLoggedOnce(promotedMessage);
    });

    it("promotes the release without a target binary version", async () => {
      const promote = sinon.spy(cmdexec.sdk, "promote");

      await execute(promoteCommand({ appStoreVersion: null }));

      sinon.assert.calledOnce(promote);
      assertLoggedOnce(promotedMessage);
    });
  });

  describe("rollback", () => {
    it("rolls the deployment back", async () => {
      const rollback = sinon.spy(cmdexec.sdk, "rollback");
      const command: cli.IRollbackCommand = {
        type: cli.CommandType.rollback,
        appName: "a",
        deploymentName: "Staging",
        targetRelease: "v2",
      };

      await execute(command);

      sinon.assert.calledOnce(rollback);
      assertLoggedOnce(`Successfully performed a rollback on the "Staging" deployment of the "a" app.`);
    });
  });

  describe("release", () => {
    it("rejects a target binary version that is not a semver range", async () => {
      await assert.rejects(execute(releaseCommand({ appStoreVersion: "not semver" })), {
        message: INVALID_SEMVER_RANGE_ERROR,
      });
    });

    for (const extension of ["zip", "ipa", "apk"]) {
      it(`rejects releasing a .${extension} file`, async () => {
        const command = releaseCommand({ package: `/fake/path/test/file.${extension}` });

        await assert.rejects(execute(command), { message: INVALID_RELEASE_FILE_ERROR });
      });
    }
  });

  describe("release-react", () => {
    restoreEnvAfterEach();

    beforeEach(() => {
      // The signing step reports a missing private key with console.log rather than log
      sinon.stub(console, "log");
    });

    function executeInTestApp(command: cli.ICommand): Promise<void> {
      return inDirectory(TEST_APP_DIRECTORY, () => execute(command));
    }

    async function releaseFromTestApp(command: cli.IReleaseReactCommand): Promise<{ bundlerArgs: string[]; metadata: any }> {
      const sdkRelease = sinon.stub(cmdexec.sdk, "release").resolves();

      await executeInTestApp(command);

      sinon.assert.calledOnce(spawn);
      assert.equal(spawn.args[0][0], "node");
      sinon.assert.calledOnce(sdkRelease);
      return { bundlerArgs: spawn.args[0][1], metadata: sdkRelease.args[0][3] };
    }

    describe("outside a React Native project", () => {
      useTempDirectory("no-package", { chdir: true });

      it("fails if the working directory has no package.json", async () => {
        const upload = sinon.spy(cmdexec.sdk, "release");

        await assert.rejects(execute(releaseReactCommand()), {
          message: 'Unable to find or read "package.json" in the CWD. The command must be executed in a React Native project folder.',
        });

        sinon.assert.notCalled(upload);
        sinon.assert.notCalled(spawn);
      });
    });

    const invalidCommands: { title: string; overrides: Partial<cli.IReleaseReactCommand>; error: string }[] = [
      {
        title: "the entry file does not exist",
        overrides: { entryFile: "doesntexist.js" },
        error: 'Entry file "doesntexist.js" does not exist.',
      },
      {
        title: "the platform is invalid",
        overrides: { platform: "blackberry" },
        error: 'Platform must be either "android" or "ios".',
      },
      {
        title: "the target binary version is not a semver range",
        overrides: {
          platform: "android",
          appStoreVersion: "notsemver",
          bundleName: "bundle.js",
          sourcemapOutput: "index.android.js.map",
        },
        error: INVALID_SEMVER_RANGE_ERROR,
      },
    ];
    for (const { title, overrides, error } of invalidCommands) {
      it(`fails if ${title}`, async () => {
        const upload = sinon.spy(cmdexec.sdk, "release");

        await assert.rejects(executeInTestApp(releaseReactCommand(overrides)), { message: error });

        sinon.assert.notCalled(upload);
        sinon.assert.notCalled(spawn);
      });
    }

    it("defaults the entry file to index.{platform}.js", async () => {
      const { bundlerArgs } = await releaseFromTestApp(releaseReactCommand({ platform: "ios" }));

      assert.equal(argValue(bundlerArgs, "--entry-file"), "index.ios.js");
    });

    it('defaults the bundle name to "main.jsbundle" on iOS', async () => {
      const { bundlerArgs, metadata } = await releaseFromTestApp(releaseReactCommand({ platform: "ios" }));

      assert.equal(argValue(bundlerArgs, "--bundle-output"), path.join(os.tmpdir(), "CodePush", "main.jsbundle"));
      assert.equal(metadata.bundleName, "main.jsbundle");
    });

    it('defaults the bundle name to "index.android.bundle" on Android', async () => {
      const { bundlerArgs, metadata } = await releaseFromTestApp(releaseReactCommand({ platform: "android" }));

      assert.equal(argValue(bundlerArgs, "--bundle-output"), path.join(os.tmpdir(), "CodePush", "index.android.bundle"));
      assert.equal(argValue(bundlerArgs, "--entry-file"), "index.android.js");
      assert.equal(metadata.bundleName, "index.android.bundle");
    });

    it("generates a dev bundle", async () => {
      const { bundlerArgs } = await releaseFromTestApp(releaseReactCommand({ platform: "android", development: true }));

      assert.equal(argValue(bundlerArgs, "--dev"), "true");
    });

    it("generates sourcemaps", async () => {
      const { bundlerArgs } = await releaseFromTestApp(
        releaseReactCommand({ platform: "android", sourcemapOutput: "index.android.js.map" })
      );

      assert.equal(argValue(bundlerArgs, "--sourcemap-output"), "index.android.js.map");
    });

    it("uses the specified target binary version range", async () => {
      const { metadata } = await releaseFromTestApp(releaseReactCommand({ platform: "android", appStoreVersion: ">=1.0.0 <1.0.5" }));

      assert.equal(metadata.appVersion, ">=1.0.0 <1.0.5");
    });

    it("passes CODE_PUSH_NODE_ARGS to the node binary", async () => {
      process.env.CODE_PUSH_NODE_ARGS = "  --foo=bar    --baz  ";

      const { bundlerArgs } = await releaseFromTestApp(releaseReactCommand());

      assert.deepEqual(bundlerArgs.slice(0, 2), ["--foo=bar", "--baz"]);
    });

    it("appends extraBundlerOptions to the bundler command", async () => {
      const { bundlerArgs } = await releaseFromTestApp(releaseReactCommand({ extraBundlerOptions: ["--foo=bar", "--baz"] }));

      assert.deepEqual(bundlerArgs.slice(-2), ["--foo=bar", "--baz"]);
    });
  });

  describe("session", () => {
    it("list prints the sessions' machine name and login time", async () => {
      const command: cli.ISessionListCommand = { type: cli.CommandType.sessionList, format: "json" };

      await execute(command);

      assertLoggedJson([{ loggedInTime: 0, machineName: TEST_MACHINE_NAME }]);
    });

    describe("remove", () => {
      const sessionRemoveCommand = (machineName: string): cli.ISessionRemoveCommand => ({
        type: cli.CommandType.sessionRemove,
        machineName,
      });

      it("removes the session", async () => {
        const removeSession = sinon.spy(cmdexec.sdk, "removeSession");

        await execute(sessionRemoveCommand(TEST_MACHINE_NAME));

        sinon.assert.calledOnceWithExactly(removeSession, TEST_MACHINE_NAME);
        assertLoggedOnce(`Successfully removed the login session for "${TEST_MACHINE_NAME}".`);
      });

      it("keeps the session if cancelled", async () => {
        const removeSession = sinon.spy(cmdexec.sdk, "removeSession");
        confirm.resolves(false);

        await execute(sessionRemoveCommand(TEST_MACHINE_NAME));

        sinon.assert.notCalled(removeSession);
        assertLoggedOnce("Session removal cancelled.");
      });

      it("refuses to remove the current machine's session", async () => {
        const removeSession = sinon.spy(cmdexec.sdk, "removeSession");

        await assert.rejects(execute(sessionRemoveCommand(os.hostname())), {
          message: "Cannot remove the current login session via this command. Please run 'revopush logout' instead.",
        });

        sinon.assert.notCalled(removeSession);
      });
    });
  });
});
