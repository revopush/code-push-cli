import { AccessKey, Account, App, CollaboratorMap, Deployment, DeploymentMetrics, Package, Session } from "../../script/types";

/** The fixed "now" the stub's access key expirations are computed from */
export const NOW = 1471460856191;
export const DEFAULT_ACCESS_KEY_MAX_AGE = 1000 * 60 * 60 * 24 * 60; // 60 days
export const TEST_MACHINE_NAME = "Test machine";

/**
 * Stands in for the management SDK in CLI tests: account "a@a.com" owns apps "a" and "b",
 * and app "a" has an empty "Production" deployment and a "Staging" deployment with release "v2".
 * Each test should use a fresh instance, since the CLI adds metrics to the returned deployments.
 */
export class SdkStub {
  private readonly productionDeployment: Deployment = {
    name: "Production",
    key: "6",
  };

  private readonly stagingDeployment: Deployment = {
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

  public isAuthenticated(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public getAccountInfo(): Promise<Account> {
    return Promise.resolve(<Account>{ email: "a@a.com" });
  }

  public addAccessKey(name: string, ttl?: number): Promise<AccessKey> {
    return Promise.resolve(<AccessKey>{
      key: "key123",
      createdTime: new Date().getTime(),
      name,
      expires: NOW + (ttl ?? DEFAULT_ACCESS_KEY_MAX_AGE),
    });
  }

  public patchAccessKey(_oldName: string, newName?: string, newTtl?: number): Promise<AccessKey> {
    return Promise.resolve(<AccessKey>{
      createdTime: new Date().getTime(),
      name: newName,
      expires: NOW + (newTtl ?? DEFAULT_ACCESS_KEY_MAX_AGE),
    });
  }

  public getAccessKeys(): Promise<AccessKey[]> {
    return Promise.resolve([<AccessKey>{ createdTime: 0, name: "Test name", expires: NOW + DEFAULT_ACCESS_KEY_MAX_AGE }]);
  }

  public removeAccessKey(): Promise<void> {
    return Promise.resolve();
  }

  public getSessions(): Promise<Session[]> {
    return Promise.resolve([{ loggedInTime: 0, machineName: TEST_MACHINE_NAME }]);
  }

  public removeSession(): Promise<void> {
    return Promise.resolve();
  }

  public addApp(name: string): Promise<App> {
    return Promise.resolve(<App>{ name });
  }

  public getApps(): Promise<App[]> {
    const ownedApp = (name: string): App => ({
      name,
      collaborators: { "a@a.com": { permission: "Owner", isCurrentAccount: true } },
      deployments: ["Production", "Staging"],
    });
    return Promise.resolve([ownedApp("a"), ownedApp("b")]);
  }

  public removeApp(): Promise<void> {
    return Promise.resolve();
  }

  public renameApp(): Promise<void> {
    return Promise.resolve();
  }

  public transferApp(): Promise<void> {
    return Promise.resolve();
  }

  public addCollaborator(): Promise<void> {
    return Promise.resolve();
  }

  public getCollaborators(): Promise<CollaboratorMap> {
    return Promise.resolve({
      "a@a.com": { permission: "Owner", isCurrentAccount: true },
      "b@b.com": { permission: "Collaborator", isCurrentAccount: false },
    });
  }

  public removeCollaborator(): Promise<void> {
    return Promise.resolve();
  }

  public addDeployment(deploymentName: string): Promise<Deployment> {
    return Promise.resolve({ name: deploymentName, key: "6" });
  }

  public getDeployments(appName: string): Promise<Deployment[]> {
    if (appName !== "a") {
      return Promise.reject(new Error(`Unknown app "${appName}"`));
    }
    return Promise.resolve([this.productionDeployment, this.stagingDeployment]);
  }

  public getDeployment(appName: string, deploymentName: string): Promise<Deployment> {
    const deployment =
      appName === "a" ? [this.productionDeployment, this.stagingDeployment].find((d) => d.name === deploymentName) : undefined;
    return deployment ? Promise.resolve(deployment) : Promise.reject(new Error(`Unknown deployment "${appName}/${deploymentName}"`));
  }

  public removeDeployment(): Promise<void> {
    return Promise.resolve();
  }

  public renameDeployment(): Promise<void> {
    return Promise.resolve();
  }

  public clearDeploymentHistory(): Promise<void> {
    return Promise.resolve();
  }

  public getDeploymentHistory(): Promise<Package[]> {
    return Promise.resolve([
      <Package>{
        description: null,
        appVersion: "1.0.0",
        isMandatory: false,
        packageHash: "463acc7d06adc9c46233481d87d9e8264b3e9ffe60fe98d721e6974209dc71a0",
        blobUrl: "https://fakeblobstorage.net/storagev2/blobid1",
        uploadTime: 1447113596270,
        size: 1,
        label: "v1",
      },
      <Package>{
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

  public getDeploymentMetrics(): Promise<DeploymentMetrics> {
    return Promise.resolve(<DeploymentMetrics>{
      "1.0.0": { active: 123 },
      v1: { active: 789, downloaded: 456, failed: 654, installed: 987 },
      v2: { active: 123, downloaded: 321, failed: 789, installed: 456 },
    });
  }

  public release(): Promise<string> {
    return Promise.resolve("Successfully released");
  }

  public patchRelease(): Promise<void> {
    return Promise.resolve();
  }

  public promote(): Promise<void> {
    return Promise.resolve();
  }

  public rollback(): Promise<void> {
    return Promise.resolve();
  }
}
