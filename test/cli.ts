// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from "assert";
import * as sinon from "sinon";
import Q = require("q");
import * as fs from "fs";
import * as path from "path";
import * as codePush from "../script/types";
import * as cli from "../script/types/cli";
import * as cmdexec from "../script/command-executor";
import * as os from "os";

function assertJsonDescribesObject(json: string, object: Object): void {
  // Make sure JSON is indented correctly
  assert.equal(json, JSON.stringify(object, /*replacer=*/ null, /*spacing=*/ 2));
}

function ensureInTestAppDirectory(): void {
  if (!~__dirname.indexOf("/resources/TestApp")) {
    process.chdir(__dirname + "/resources/TestApp");
  }
}

function isDefined(object: any): boolean {
  return object !== undefined && object !== null;
}

const NOW = 1471460856191;
const DEFAULT_ACCESS_KEY_MAX_AGE = 1000 * 60 * 60 * 24 * 60; // 60 days
const TEST_MACHINE_NAME = "Test machine";

export class SdkStub {
  private productionDeployment: codePush.Deployment = {
    name: "Production",
    key: "6",
  };
  private stagingDeployment: codePush.Deployment = {
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
    },
  };

  public isAuthenticated(): Q.Promise<boolean> {
    return Q(true);
  }

  public getAccountInfo(): Q.Promise<codePush.Account> {
    return Q(<codePush.Account>{
      email: "a@a.com",
    });
  }

  public addAccessKey(name: string, ttl: number): Q.Promise<codePush.AccessKey> {
    return Q(<codePush.AccessKey>{
      key: "key123",
      createdTime: new Date().getTime(),
      name,
      expires: NOW + (isDefined(ttl) ? ttl : DEFAULT_ACCESS_KEY_MAX_AGE),
    });
  }

  public patchAccessKey(oldName: string, newName?: string, newTtl?: number): Q.Promise<codePush.AccessKey> {
    return Q(<codePush.AccessKey>{
      createdTime: new Date().getTime(),
      name: newName,
      expires: NOW + (isDefined(newTtl) ? newTtl : DEFAULT_ACCESS_KEY_MAX_AGE),
    });
  }

  public addApp(name: string): Q.Promise<codePush.App> {
    return Q(<codePush.App>{
      name: name,
    });
  }

  public addCollaborator(): Q.Promise<void> {
    return Q(<void>null);
  }

  public addDeployment(deploymentName: string): Q.Promise<codePush.Deployment> {
    return Q(<codePush.Deployment>{
      name: deploymentName,
      key: "6",
    });
  }

  public clearDeploymentHistory(): Q.Promise<void> {
    return Q(<void>null);
  }

  public getAccessKeys(): Q.Promise<codePush.AccessKey[]> {
    return Q([
      <codePush.AccessKey>{
        createdTime: 0,
        name: "Test name",
        expires: NOW + DEFAULT_ACCESS_KEY_MAX_AGE,
      },
    ]);
  }

  public getSessions(): Q.Promise<codePush.Session[]> {
    return Q([
      <codePush.Session>{
        loggedInTime: 0,
        machineName: TEST_MACHINE_NAME,
      },
    ]);
  }

  public getApps(): Q.Promise<codePush.App[]> {
    return Q([
      <codePush.App>{
        name: "a",
        collaborators: {
          "a@a.com": { permission: "Owner", isCurrentAccount: true },
        },
        deployments: ["Production", "Staging"],
      },
      <codePush.App>{
        name: "b",
        collaborators: {
          "a@a.com": { permission: "Owner", isCurrentAccount: true },
        },
        deployments: ["Production", "Staging"],
      },
    ]);
  }

  public getDeployments(appName: string): Q.Promise<codePush.Deployment[]> {
    if (appName === "a") {
      return Q([this.productionDeployment, this.stagingDeployment]);
    }

    return Q.reject<codePush.Deployment[]>();
  }

  public getDeployment(appName: string, deploymentName: string): Q.Promise<codePush.Deployment> {
    if (appName === "a") {
      if (deploymentName === "Production") {
        return Q(this.productionDeployment);
      } else if (deploymentName === "Staging") {
        return Q(this.stagingDeployment);
      }
    }

    return Q.reject<codePush.Deployment>();
  }

  public getDeploymentHistory(): Q.Promise<codePush.Package[]> {
    return Q([
      <codePush.Package>{
        description: null,
        appVersion: "1.0.0",
        isMandatory: false,
        packageHash: "463acc7d06adc9c46233481d87d9e8264b3e9ffe60fe98d721e6974209dc71a0",
        blobUrl: "https://fakeblobstorage.net/storagev2/blobid1",
        uploadTime: 1447113596270,
        size: 1,
        label: "v1",
      },
      <codePush.Package>{
        description: "New update - this update does a whole bunch of things, including testing linewrapping",
        appVersion: "1.0.1",
        isMandatory: false,
        packageHash: "463acc7d06adc9c46233481d87d9e8264b3e9ffe60fe98d721e6974209dc71a0",
        blobUrl: "https://fakeblobstorage.net/storagev2/blobid2",
        uploadTime: 1447118476669,
        size: 2,
        label: "v2",
      },
    ]);
  }

  public getDeploymentMetrics(): Q.Promise<any> {
    return Q({
      "1.0.0": {
        active: 123,
      },
      v1: {
        active: 789,
        downloaded: 456,
        failed: 654,
        installed: 987,
      },
      v2: {
        active: 123,
        downloaded: 321,
        failed: 789,
        installed: 456,
      },
    });
  }

  public getCollaborators(): Q.Promise<any> {
    return Q({
      "a@a.com": {
        permission: "Owner",
        isCurrentAccount: true,
      },
      "b@b.com": {
        permission: "Collaborator",
        isCurrentAccount: false,
      },
    });
  }

  public patchRelease(): Q.Promise<void> {
    return Q(<void>null);
  }

  public promote(): Q.Promise<void> {
    return Q(<void>null);
  }

  public release(): Q.Promise<string> {
    return Q("Successfully released");
  }

  public removeAccessKey(): Q.Promise<void> {
    return Q(<void>null);
  }

  public removeApp(): Q.Promise<void> {
    return Q(<void>null);
  }

  public removeCollaborator(): Q.Promise<void> {
    return Q(<void>null);
  }

  public removeDeployment(): Q.Promise<void> {
    return Q(<void>null);
  }

  public removeSession(): Q.Promise<void> {
    return Q(<void>null);
  }

  public renameApp(): Q.Promise<void> {
    return Q(<void>null);
  }

  public rollback(): Q.Promise<void> {
    return Q(<void>null);
  }

  public transferApp(): Q.Promise<void> {
    return Q(<void>null);
  }

  public renameDeployment(): Q.Promise<void> {
    return Q(<void>null);
  }
}

describe("CLI", () => {
  let log: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;
  let spawn: sinon.SinonStub;
  let wasConfirmed = true;
  const INVALID_RELEASE_FILE_ERROR_MESSAGE: string =
    "It is unnecessary to package releases in a .zip or binary file. Please specify the direct path to the update content's directory (e.g. /platforms/ios/www) or file (e.g. main.jsbundle).";

  beforeEach((): void => {
    wasConfirmed = true;

    sandbox = sinon.createSandbox();
    (<any>cmdexec).sdk = new SdkStub();

    sandbox.stub(cmdexec, "confirm").callsFake(() => Q(wasConfirmed));

    sandbox.stub(cmdexec, "createEmptyTempReleaseFolder").callsFake(() => Q.Promise<void>((resolve) => resolve()));
    log = sandbox.stub(cmdexec, "log").callsFake(() => {});
    spawn = sandbox.stub(cmdexec, "spawn").callsFake((command: string, args: string[] = []) => {
      // Stand in for the bundler's output, which the release checks read
      const bundleOutput = args.indexOf("--bundle-output");
      if (bundleOutput !== -1) {
        fs.mkdirSync(path.dirname(args[bundleOutput + 1]), { recursive: true });
        fs.writeFileSync(args[bundleOutput + 1], "");
      }
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, callback: () => void) => {
          callback();
        },
      };
    });
  });

  afterEach((): void => {
    sandbox.restore();
  });

  it("accessKeyAdd creates access key with name and default ttl", (done: Mocha.Done): void => {
    const command: cli.IAccessKeyAddCommand = {
      type: cli.CommandType.accessKeyAdd,
      name: "Test name",
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledTwice(log);
      assert.equal(log.args[0].length, 1);

      let actual: string = log.args[0][0];
      let expected = `Successfully created the "Test name" access key: key123`;
      assert.equal(actual, expected);

      actual = log.args[1][0];
      expected = "Make sure to save this key value somewhere safe, since you won't be able to view it from the CLI again!";
      assert.equal(actual, expected);

      done();
    });
  });

  it("accessKeyAdd creates access key with name and specified ttl", (done: Mocha.Done): void => {
    const ttl = 10000;
    const command: cli.IAccessKeyAddCommand = {
      type: cli.CommandType.accessKeyAdd,
      name: "Test name",
      ttl,
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledTwice(log);
      assert.equal(log.args[0].length, 1);

      let actual: string = log.args[0][0];
      let expected = `Successfully created the "Test name" access key: key123`;
      assert.equal(actual, expected);

      actual = log.args[1][0];
      expected = "Make sure to save this key value somewhere safe, since you won't be able to view it from the CLI again!";
      assert.equal(actual, expected);

      done();
    });
  });

  it("accessKeyPatch updates access key with new name", (done: Mocha.Done): void => {
    const command: cli.IAccessKeyPatchCommand = {
      type: cli.CommandType.accessKeyPatch,
      oldName: "Test name",
      newName: "Updated name",
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = `Successfully renamed the access key "Test name" to "Updated name".`;

      assert.equal(actual, expected);
      done();
    });
  });

  it("accessKeyPatch updates access key with new ttl", (done: Mocha.Done): void => {
    const ttl = 10000;
    const command: cli.IAccessKeyPatchCommand = {
      type: cli.CommandType.accessKeyPatch,
      oldName: "Test name",
      ttl,
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = `Successfully changed the expiration date of the "Test name" access key to Wednesday, August 17, 2016 12:07 PM.`;

      assert.equal(actual, expected);
      done();
    });
  });

  it("accessKeyPatch updates access key with new name and ttl", (done: Mocha.Done): void => {
    const ttl = 10000;
    const command: cli.IAccessKeyPatchCommand = {
      type: cli.CommandType.accessKeyPatch,
      oldName: "Test name",
      newName: "Updated name",
      ttl,
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = `Successfully renamed the access key "Test name" to "Updated name" and changed its expiration date to Wednesday, August 17, 2016 12:07 PM.`;

      assert.equal(actual, expected);
      done();
    });
  });

  it("accessKeyList lists access key name and expires fields", (done: Mocha.Done): void => {
    const command: cli.IAccessKeyListCommand = {
      type: cli.CommandType.accessKeyList,
      format: "json",
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = [
        {
          createdTime: 0,
          name: "Test name",
          expires: NOW + DEFAULT_ACCESS_KEY_MAX_AGE,
        },
      ];

      assertJsonDescribesObject(actual, expected);
      done();
    });
  });

  it("accessKeyRemove removes access key", (done: Mocha.Done): void => {
    const command: cli.IAccessKeyRemoveCommand = {
      type: cli.CommandType.accessKeyRemove,
      accessKey: "8",
    };

    const removeAccessKey: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeAccessKey");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(removeAccessKey);
      sinon.assert.calledWithExactly(removeAccessKey, "8");
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully removed the "8" access key.');

      done();
    });
  });

  it("accessKeyRemove does not remove access key if cancelled", (done: Mocha.Done): void => {
    const command: cli.IAccessKeyRemoveCommand = {
      type: cli.CommandType.accessKeyRemove,
      accessKey: "8",
    };

    const removeAccessKey: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeAccessKey");

    wasConfirmed = false;

    cmdexec.execute(command).done((): void => {
      sinon.assert.notCalled(removeAccessKey);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, "Access key removal cancelled.");

      done();
    });
  });

  it("appAdd reports new app name and ID", (done: Mocha.Done): void => {
    const command: cli.IAppAddCommand = {
      type: cli.CommandType.appAdd,
      appName: "a",
      os: "",
      platform: "",
    };

    const addApp: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "addApp");
    const deploymentList: sinon.SinonSpy = sandbox.spy(cmdexec, "deploymentList");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(addApp);
      sinon.assert.calledTwice(log);
      sinon.assert.calledWithExactly(log, 'Successfully added the "a" app, along with the following default deployments:');
      sinon.assert.calledOnce(deploymentList);
      done();
    });
  });

  it("appList lists app names and ID's", (done: Mocha.Done): void => {
    const command: cli.IAppListCommand = {
      type: cli.CommandType.appList,
      format: "json",
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = [
        {
          name: "a",
          collaborators: {
            "a@a.com": {
              permission: "Owner",
              isCurrentAccount: true,
            },
          },
          deployments: ["Production", "Staging"],
        },
        {
          name: "b",
          collaborators: {
            "a@a.com": {
              permission: "Owner",
              isCurrentAccount: true,
            },
          },
          deployments: ["Production", "Staging"],
        },
      ];

      assertJsonDescribesObject(actual, expected);
      done();
    });
  });

  it("appRemove removes app", (done: Mocha.Done): void => {
    const command: cli.IAppRemoveCommand = {
      type: cli.CommandType.appRemove,
      appName: "a",
    };

    const removeApp: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeApp");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(removeApp);
      sinon.assert.calledWithExactly(removeApp, "a");
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully removed the "a" app.');

      done();
    });
  });

  it("appRemove does not remove app if cancelled", (done: Mocha.Done): void => {
    const command: cli.IAppRemoveCommand = {
      type: cli.CommandType.appRemove,
      appName: "a",
    };

    const removeApp: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeApp");

    wasConfirmed = false;

    cmdexec.execute(command).done((): void => {
      sinon.assert.notCalled(removeApp);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, "App removal cancelled.");

      done();
    });
  });

  it("appRename renames app", (done: Mocha.Done): void => {
    const command: cli.IAppRenameCommand = {
      type: cli.CommandType.appRename,
      currentAppName: "a",
      newAppName: "c",
    };

    const renameApp: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "renameApp");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(renameApp);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully renamed the "a" app to "c".');

      done();
    });
  });

  it("appTransfer transfers app", (done: Mocha.Done): void => {
    const command: cli.IAppTransferCommand = {
      type: cli.CommandType.appTransfer,
      appName: "a",
      email: "b@b.com",
    };

    const transferApp: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "transferApp");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(transferApp);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully transferred the ownership of app "a" to the account with email "b@b.com".');

      done();
    });
  });

  it("collaboratorAdd adds collaborator", (done: Mocha.Done): void => {
    const command: cli.ICollaboratorAddCommand = {
      type: cli.CommandType.collaboratorAdd,
      appName: "a",
      email: "b@b.com",
    };

    const addCollaborator: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "addCollaborator");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(addCollaborator);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully added "b@b.com" as a collaborator to the app "a".');

      done();
    });
  });

  it("collaboratorList lists collaborators email and properties", (done: Mocha.Done): void => {
    const command: cli.ICollaboratorListCommand = {
      type: cli.CommandType.collaboratorList,
      appName: "a",
      format: "json",
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = {
        collaborators: {
          "a@a.com": { permission: "Owner", isCurrentAccount: true },
          "b@b.com": { permission: "Collaborator", isCurrentAccount: false },
        },
      };

      assertJsonDescribesObject(actual, expected);
      done();
    });
  });

  it("collaboratorRemove removes collaborator", (done: Mocha.Done): void => {
    const command: cli.ICollaboratorRemoveCommand = {
      type: cli.CommandType.collaboratorRemove,
      appName: "a",
      email: "b@b.com",
    };

    const removeCollaborator: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeCollaborator");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(removeCollaborator);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully removed "b@b.com" as a collaborator from the app "a".');

      done();
    });
  });

  it("deploymentAdd reports new app name and ID", (done: Mocha.Done): void => {
    const command: cli.IDeploymentAddCommand = {
      type: cli.CommandType.deploymentAdd,
      appName: "a",
      deploymentName: "b",
      default: false,
    };

    const addDeployment: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "addDeployment");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(addDeployment);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully added the "b" deployment with key "6" to the "a" app.');
      done();
    });
  });

  it("deploymentHistoryClear clears deployment", (done: Mocha.Done): void => {
    const command: cli.IDeploymentHistoryClearCommand = {
      type: cli.CommandType.deploymentHistoryClear,
      appName: "a",
      deploymentName: "Staging",
    };

    const clearDeployment: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "clearDeploymentHistory");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(clearDeployment);
      sinon.assert.calledWithExactly(clearDeployment, "a", "Staging");
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(
        log,
        'Successfully cleared the release history associated with the "Staging" deployment from the "a" app.'
      );

      done();
    });
  });

  it("deploymentHistoryClear does not clear deployment if cancelled", (done: Mocha.Done): void => {
    const command: cli.IDeploymentHistoryClearCommand = {
      type: cli.CommandType.deploymentHistoryClear,
      appName: "a",
      deploymentName: "Staging",
    };

    const clearDeployment: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "clearDeploymentHistory");

    wasConfirmed = false;

    cmdexec.execute(command).done((): void => {
      sinon.assert.notCalled(clearDeployment);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, "Clear deployment cancelled.");

      done();
    });
  });

  it("deploymentList lists deployment names, deployment keys, and package information", (done: Mocha.Done): void => {
    const command: cli.IDeploymentListCommand = {
      type: cli.CommandType.deploymentList,
      appName: "a",
      format: "json",
      displayKeys: true,
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = [
        {
          name: "Production",
          key: "6",
        },
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
            metrics: {
              active: 123,
              downloaded: 321,
              failed: 789,
              installed: 456,
              totalActive: 1035,
            },
          },
        },
      ];

      assertJsonDescribesObject(actual, expected);
      done();
    });
  });

  it("deploymentRemove removes deployment", (done: Mocha.Done): void => {
    const command: cli.IDeploymentRemoveCommand = {
      type: cli.CommandType.deploymentRemove,
      appName: "a",
      deploymentName: "Staging",
    };

    const removeDeployment: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeDeployment");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(removeDeployment);
      sinon.assert.calledWithExactly(removeDeployment, "a", "Staging");
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully removed the "Staging" deployment from the "a" app.');

      done();
    });
  });

  it("deploymentRemove does not remove deployment if cancelled", (done: Mocha.Done): void => {
    const command: cli.IDeploymentRemoveCommand = {
      type: cli.CommandType.deploymentRemove,
      appName: "a",
      deploymentName: "Staging",
    };

    const removeDeployment: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeDeployment");

    wasConfirmed = false;

    cmdexec.execute(command).done((): void => {
      sinon.assert.notCalled(removeDeployment);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, "Deployment removal cancelled.");

      done();
    });
  });

  it("deploymentRename renames deployment", (done: Mocha.Done): void => {
    const command: cli.IDeploymentRenameCommand = {
      type: cli.CommandType.deploymentRename,
      appName: "a",
      currentDeploymentName: "Staging",
      newDeploymentName: "c",
    };

    const renameDeployment: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "renameDeployment");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(renameDeployment);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, 'Successfully renamed the "Staging" deployment to "c" for the "a" app.');

      done();
    });
  });

  it("deploymentHistory lists package history information", (done: Mocha.Done): void => {
    const command: cli.IDeploymentHistoryCommand = {
      type: cli.CommandType.deploymentHistory,
      appName: "a",
      deploymentName: "Staging",
      format: "json",
      displayAuthor: false,
    };

    const getDeploymentHistory: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "getDeploymentHistory");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(getDeploymentHistory);
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected: (codePush.Package & cmdexec.PackageWithMetrics)[] = [
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
      ];

      assertJsonDescribesObject(actual, expected);
      done();
    });
  });

  it("patch command successfully updates specific label", (done: Mocha.Done): void => {
    const command: cli.IPatchCommand = {
      type: cli.CommandType.patch,
      appName: "a",
      deploymentName: "Staging",
      label: "v1",
      disabled: false,
      description: "Patched",
      mandatory: true,
      rollout: 25,
      appStoreVersion: "1.0.1",
    };

    const patch: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "patchRelease");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(patch);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, `Successfully updated the "v1" release of "a" app's "Staging" deployment.`);

      done();
    });
  });

  it("patch command successfully updates latest release", (done: Mocha.Done): void => {
    const command: cli.IPatchCommand = {
      type: cli.CommandType.patch,
      appName: "a",
      deploymentName: "Staging",
      label: null,
      disabled: false,
      description: "Patched",
      mandatory: true,
      rollout: 25,
      appStoreVersion: "1.0.1",
    };

    const patch: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "patchRelease");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(patch);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, `Successfully updated the "latest" release of "a" app's "Staging" deployment.`);

      done();
    });
  });

  it("patch command successfully updates without appStoreVersion", (done: Mocha.Done): void => {
    const command: cli.IPatchCommand = {
      type: cli.CommandType.patch,
      appName: "a",
      deploymentName: "Staging",
      label: null,
      disabled: false,
      description: "Patched",
      mandatory: true,
      rollout: 25,
      appStoreVersion: null,
    };

    const patch: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "patchRelease");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(patch);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, `Successfully updated the "latest" release of "a" app's "Staging" deployment.`);

      done();
    });
  });

  it("patch command fails if no properties were specified for update", (done: Mocha.Done): void => {
    const command: cli.IPatchCommand = {
      type: cli.CommandType.patch,
      appName: "a",
      deploymentName: "Staging",
      label: null,
      disabled: null,
      description: null,
      mandatory: null,
      rollout: null,
      appStoreVersion: null,
    };

    const patch: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "patchRelease");

    cmdexec
      .execute(command)
      .then(() => {
        done(new Error("Did not throw error."));
      })
      .catch((err) => {
        assert.equal(err.message, "At least one property must be specified to patch a release.");
        sinon.assert.notCalled(patch);
        done();
      })
      .done();
  });

  it("promote works successfully", (done: Mocha.Done): void => {
    const command: cli.IPromoteCommand = {
      type: cli.CommandType.promote,
      appName: "a",
      sourceDeploymentName: "Staging",
      destDeploymentName: "Production",
      label: null,
      description: "Promoted",
      mandatory: true,
      rollout: 25,
      appStoreVersion: "1.0.1",
    };

    const promote: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "promote");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(promote);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(
        log,
        `Successfully promoted the "Staging" deployment of the "a" app to the "Production" deployment.`
      );

      done();
    });
  });

  it("promote works successfully without appStoreVersion", (done: Mocha.Done): void => {
    const command: cli.IPromoteCommand = {
      type: cli.CommandType.promote,
      appName: "a",
      sourceDeploymentName: "Staging",
      destDeploymentName: "Production",
      label: null,
      description: "Promoted",
      mandatory: true,
      rollout: 25,
      appStoreVersion: null,
    };

    const promote: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "promote");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(promote);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(
        log,
        `Successfully promoted the "Staging" deployment of the "a" app to the "Production" deployment.`
      );

      done();
    });
  });

  it("rollback works successfully", (done: Mocha.Done): void => {
    const command: cli.IRollbackCommand = {
      type: cli.CommandType.rollback,
      appName: "a",
      deploymentName: "Staging",
      targetRelease: "v2",
    };

    const rollback: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "rollback");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(rollback);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, `Successfully performed a rollback on the "Staging" deployment of the "a" app.`);

      done();
    });
  });

  it("release doesn't allow non valid semver ranges", (done: Mocha.Done): void => {
    const command: cli.IReleaseCommand = {
      type: cli.CommandType.release,
      appName: "a",
      deploymentName: "Staging",
      description: "test releasing zip file",
      mandatory: false,
      rollout: null,
      appStoreVersion: "not semver",
      package: "./resources",
    };

    releaseHelperFunction(
      command,
      done,
      'Please use a semver-compliant target binary version range, for example "1.0.0", "*" or "^1.2.3".'
    );
  });

  it("release doesn't allow releasing .zip file", (done: Mocha.Done): void => {
    const command: cli.IReleaseCommand = {
      type: cli.CommandType.release,
      appName: "a",
      deploymentName: "Staging",
      description: "test releasing zip file",
      mandatory: false,
      rollout: null,
      appStoreVersion: "1.0.0",
      package: "/fake/path/test/file.zip",
    };

    releaseHelperFunction(command, done, INVALID_RELEASE_FILE_ERROR_MESSAGE);
  });

  it("release doesn't allow releasing .ipa file", (done: Mocha.Done): void => {
    const command: cli.IReleaseCommand = {
      type: cli.CommandType.release,
      appName: "a",
      deploymentName: "Staging",
      description: "test releasing ipa file",
      mandatory: false,
      rollout: null,
      appStoreVersion: "1.0.0",
      package: "/fake/path/test/file.ipa",
    };

    releaseHelperFunction(command, done, INVALID_RELEASE_FILE_ERROR_MESSAGE);
  });

  it("release doesn't allow releasing .apk file", (done: Mocha.Done): void => {
    const command: cli.IReleaseCommand = {
      type: cli.CommandType.release,
      appName: "a",
      deploymentName: "Staging",
      description: "test releasing apk file",
      mandatory: false,
      rollout: null,
      appStoreVersion: "1.0.0",
      package: "/fake/path/test/file.apk",
    };

    releaseHelperFunction(command, done, INVALID_RELEASE_FILE_ERROR_MESSAGE);
  });

  it("release-react fails if CWD does not contain package.json", (done: Mocha.Done): void => {
    const command: cli.IReleaseReactCommand = {
      type: cli.CommandType.releaseReact,
      appName: "a",
      appStoreVersion: null,
      deploymentName: "Staging",
      description: "Test invalid folder",
      mandatory: false,
      rollout: null,
      platform: "ios",
      extraBundlerOptions: [],
      extraHermesFlags: [],
    };

    const release: sinon.SinonSpy = sandbox.spy(cmdexec, "release");
    const originalCwd = process.cwd();
    process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "revopush-no-package-")));

    cmdexec
      .execute(command)
      .then(() => {
        done(new Error("Did not throw error."));
      })
      .catch((err) => {
        assert.equal(
          err.message,
          'Unable to find or read "package.json" in the CWD. The command must be executed in a React Native project folder.'
        );
        sinon.assert.notCalled(release);
        sinon.assert.notCalled(spawn);
        done();
      })
      .finally(() => process.chdir(originalCwd))
      .done();
  });

  it("release-react fails if entryFile does not exist", (done: Mocha.Done): void => {
    const command: cli.IReleaseReactCommand = {
      type: cli.CommandType.releaseReact,
      appName: "a",
      appStoreVersion: null,
      deploymentName: "Staging",
      description: "Test invalid entryFile",
      entryFile: "doesntexist.js",
      mandatory: false,
      rollout: null,
      platform: "ios",
      extraBundlerOptions: [],
      extraHermesFlags: [],
    };

    ensureInTestAppDirectory();

    const release: sinon.SinonSpy = sandbox.spy(cmdexec, "release");

    cmdexec
      .execute(command)
      .then(() => {
        done(new Error("Did not throw error."));
      })
      .catch((err) => {
        assert.equal(err.message, 'Entry file "doesntexist.js" does not exist.');
        sinon.assert.notCalled(release);
        sinon.assert.notCalled(spawn);
        done();
      })
      .done();
  });

  it("release-react fails if platform is invalid", (done: Mocha.Done): void => {
    const command: cli.IReleaseReactCommand = {
      type: cli.CommandType.releaseReact,
      appName: "a",
      appStoreVersion: null,
      deploymentName: "Staging",
      description: "Test invalid platform",
      mandatory: false,
      rollout: null,
      platform: "blackberry",
      extraBundlerOptions: [],
      extraHermesFlags: [],
    };

    ensureInTestAppDirectory();

    const release: sinon.SinonSpy = sandbox.spy(cmdexec, "release");

    cmdexec
      .execute(command)
      .then(() => {
        done(new Error("Did not throw error."));
      })
      .catch((err) => {
        assert.equal(err.message, 'Platform must be either "android" or "ios".');
        sinon.assert.notCalled(release);
        sinon.assert.notCalled(spawn);
        done();
      })
      .done();
  });

  it("release-react fails if targetBinaryRange is not a valid semver range expression", (done: Mocha.Done): void => {
    const bundleName = "bundle.js";
    const command: cli.IReleaseReactCommand = {
      type: cli.CommandType.releaseReact,
      appName: "a",
      appStoreVersion: "notsemver",
      bundleName: bundleName,
      deploymentName: "Staging",
      description: "Test uses targetBinaryRange",
      mandatory: false,
      rollout: null,
      platform: "android",
      sourcemapOutput: "index.android.js.map",
      extraBundlerOptions: [],
      extraHermesFlags: [],
    };

    ensureInTestAppDirectory();

    const release: sinon.SinonSpy = sandbox.stub(cmdexec, "release");

    cmdexec
      .execute(command)
      .then(() => {
        done(new Error("Did not throw error."));
      })
      .catch((err) => {
        assert.equal(err.message, 'Please use a semver-compliant target binary version range, for example "1.0.0", "*" or "^1.2.3".');
        sinon.assert.notCalled(release);
        sinon.assert.notCalled(spawn);
        done();
      })
      .done();
  });

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

  // Runs release-react in the test app against the stub SDK, returning the bundler arguments and the uploaded release metadata
  function runReleaseReact(command: cli.IReleaseReactCommand): Q.Promise<{ bundlerArgs: string[]; metadata: any }> {
    ensureInTestAppDirectory();
    const sdkRelease: sinon.SinonStub = sandbox.stub(cmdexec.sdk, "release").returns(Q(<void>null));

    return cmdexec.execute(command).then(() => {
      sinon.assert.calledOnce(spawn);
      assert.equal(spawn.args[0][0], "node");
      sinon.assert.calledOnce(sdkRelease);
      return { bundlerArgs: spawn.args[0][1], metadata: sdkRelease.args[0][3] };
    });
  }

  function argValue(args: string[], flag: string): string {
    return String(args[args.indexOf(flag) + 1]);
  }

  it("release-react defaults entry file to index.{platform}.js if not provided", (done: Mocha.Done): void => {
    runReleaseReact(releaseReactCommand({ platform: "ios" }))
      .then(({ bundlerArgs }) => {
        assert.equal(argValue(bundlerArgs, "--entry-file"), "index.ios.js");
        done();
      })
      .done();
  });

  it('release-react defaults bundle name to "main.jsbundle" if not provided and platform is "ios"', (done: Mocha.Done): void => {
    runReleaseReact(releaseReactCommand({ platform: "ios" }))
      .then(({ bundlerArgs, metadata }) => {
        assert.equal(argValue(bundlerArgs, "--bundle-output"), path.join(os.tmpdir(), "CodePush", "main.jsbundle"));
        assert.equal(metadata.bundleName, "main.jsbundle");
        done();
      })
      .done();
  });

  it('release-react defaults bundle name to "index.android.bundle" if not provided and platform is "android"', (done: Mocha.Done): void => {
    runReleaseReact(releaseReactCommand({ platform: "android" }))
      .then(({ bundlerArgs, metadata }) => {
        assert.equal(argValue(bundlerArgs, "--bundle-output"), path.join(os.tmpdir(), "CodePush", "index.android.bundle"));
        assert.equal(argValue(bundlerArgs, "--entry-file"), "index.android.js");
        assert.equal(metadata.bundleName, "index.android.bundle");
        done();
      })
      .done();
  });

  it("release-react generates dev bundle", (done: Mocha.Done): void => {
    runReleaseReact(releaseReactCommand({ platform: "android", development: true }))
      .then(({ bundlerArgs }) => {
        assert.equal(argValue(bundlerArgs, "--dev"), "true");
        done();
      })
      .done();
  });

  it("release-react generates sourcemaps", (done: Mocha.Done): void => {
    runReleaseReact(releaseReactCommand({ platform: "android", sourcemapOutput: "index.android.js.map" }))
      .then(({ bundlerArgs }) => {
        assert.equal(argValue(bundlerArgs, "--sourcemap-output"), "index.android.js.map");
        done();
      })
      .done();
  });

  it("release-react uses specified targetBinaryRange option", (done: Mocha.Done): void => {
    runReleaseReact(releaseReactCommand({ platform: "android", appStoreVersion: ">=1.0.0 <1.0.5" }))
      .then(({ metadata }) => {
        assert.equal(metadata.appVersion, ">=1.0.0 <1.0.5");
        done();
      })
      .done();
  });

  it("release-react applies arguments to node binary provided via the CODE_PUSH_NODE_ARGS env var", (done: Mocha.Done): void => {
    const originalNodeArgs = process.env.CODE_PUSH_NODE_ARGS;
    process.env.CODE_PUSH_NODE_ARGS = "  --foo=bar    --baz  ";

    runReleaseReact(releaseReactCommand())
      .then(({ bundlerArgs }) => {
        assert.deepEqual(bundlerArgs.slice(0, 2), ["--foo=bar", "--baz"]);
        done();
      })
      .finally(() => {
        if (originalNodeArgs === undefined) delete process.env.CODE_PUSH_NODE_ARGS;
        else process.env.CODE_PUSH_NODE_ARGS = originalNodeArgs;
      })
      .done();
  });

  it("release-react applies extraBundlerOptions to bundler command", (done: Mocha.Done): void => {
    runReleaseReact(releaseReactCommand({ extraBundlerOptions: ["--foo=bar", "--baz"] }))
      .then(({ bundlerArgs }) => {
        assert.deepEqual(bundlerArgs.slice(-2), ["--foo=bar", "--baz"]);
        done();
      })
      .done();
  });

  it("sessionList lists session name and expires fields", (done: Mocha.Done): void => {
    const command: cli.IAccessKeyListCommand = {
      type: cli.CommandType.sessionList,
      format: "json",
    };

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(log);
      assert.equal(log.args[0].length, 1);

      const actual: string = log.args[0][0];
      const expected = [
        {
          loggedInTime: 0,
          machineName: TEST_MACHINE_NAME,
        },
      ];

      assertJsonDescribesObject(actual, expected);
      done();
    });
  });

  it("sessionRemove removes session", (done: Mocha.Done): void => {
    const machineName = TEST_MACHINE_NAME;
    const command: cli.ISessionRemoveCommand = {
      type: cli.CommandType.sessionRemove,
      machineName: machineName,
    };

    const removeSession: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeSession");

    cmdexec.execute(command).done((): void => {
      sinon.assert.calledOnce(removeSession);
      sinon.assert.calledWithExactly(removeSession, machineName);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, `Successfully removed the login session for "${machineName}".`);

      done();
    });
  });

  it("sessionRemove does not remove session if cancelled", (done: Mocha.Done): void => {
    const machineName = TEST_MACHINE_NAME;
    const command: cli.ISessionRemoveCommand = {
      type: cli.CommandType.sessionRemove,
      machineName: machineName,
    };

    const removeSession: sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeSession");

    wasConfirmed = false;

    cmdexec.execute(command).done((): void => {
      sinon.assert.notCalled(removeSession);
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log, "Session removal cancelled.");

      done();
    });
  });

  it("sessionRemove does not remove current session", (done: Mocha.Done): void => {
    const machineName = os.hostname();
    const command: cli.ISessionRemoveCommand = {
      type: cli.CommandType.sessionRemove,
      machineName: machineName,
    };

    wasConfirmed = false;

    cmdexec
      .execute(command)
      .then(() => {
        done(new Error("Did not throw error."));
      })
      .catch(() => {
        done();
      })
      .done();
  });

  function releaseHelperFunction(command: cli.IReleaseCommand, done: Mocha.Done, expectedError: string): void {
    cmdexec.execute(command).done(
      (): void => {
        throw "Error Expected";
      },
      (error: any): void => {
        assert(!!error);
        assert.equal(error.message, expectedError);
        done();
      }
    );
  }
});
