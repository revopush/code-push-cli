// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import superagent = require("superagent");

import {
  AccessKey,
  AccessKeyRequest,
  Account,
  App,
  CodePushError,
  CollaboratorMap,
  Deployment,
  DeploymentMetrics,
  Headers,
  Package,
  PackageInfo,
  ServerAccessKey,
  Session,
  BaseRelease,
} from "./types";
import { ReactNativePackageInfo } from "./types/rest-definitions";
import { createZip, listFiles, normalizePath } from "./utils/file-utils";

const packageJson = require("../../package.json");

interface JsonResponse {
  headers: Headers;
  body?: any;
}

interface PackageFile {
  isTemporary: boolean;
  path: string;
}

// A template string tag function that URL encodes the substituted values
function urlEncode(strings: string[], ...values: string[]): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += encodeURIComponent(values[i]);
    }
  }

  return result;
}

class AccountManager {
  public static AppPermission = {
    OWNER: "Owner",
    COLLABORATOR: "Collaborator",
  };
  public static API_SERVER_URL = "https://api.revopush.org";
  public static APP_SERVER_URL = "https://app.revopush.org";

  private static API_VERSION: number = 2;

  public static ERROR_GATEWAY_TIMEOUT = 504; // Used if there is a network error
  public static ERROR_INTERNAL_SERVER = 500;
  public static ERROR_NOT_FOUND = 404;
  public static ERROR_CONFLICT = 409; // Used if the resource already exists
  public static ERROR_UNAUTHORIZED = 401;

  private _accessKey: string;
  private _serverUrl: string;
  private _customHeaders: Headers;

  constructor(accessKey: string, customHeaders?: Headers, serverUrl?: string) {
    if (!accessKey) throw new Error("An access key must be specified.");

    this._accessKey = accessKey;
    this._customHeaders = customHeaders;
    this._serverUrl = serverUrl || AccountManager.API_SERVER_URL;
  }

  public get accessKey(): string {
    return this._accessKey;
  }

  public isAuthenticated(throwIfUnauthorized?: boolean): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const request: superagent.Request<any> = superagent.get(`${this._serverUrl}${urlEncode(["/authenticated"])}`);
      this.attachCredentials(request);

      request.end((err: any, res: superagent.Response) => {
        const status: number = this.getErrorStatus(err, res);
        if (err && status !== AccountManager.ERROR_UNAUTHORIZED) {
          reject(this.getCodePushError(err, res));
          return;
        }

        const authenticated: boolean = status === 200;

        if (!authenticated && throwIfUnauthorized) {
          reject(this.getCodePushError(err, res));
          return;
        }

        resolve(authenticated);
      });
    });
  }

  public async addAccessKey(friendlyName: string, ttl?: number): Promise<AccessKey> {
    if (!friendlyName) {
      throw new Error("A name must be specified when adding an access key.");
    }

    const accessKeyRequest: AccessKeyRequest = {
      createdBy: os.hostname(),
      friendlyName,
      ttl,
    };

    const res: JsonResponse = await this.post(
      urlEncode(["/accessKeys/"]),
      JSON.stringify(accessKeyRequest),
      /*expectResponseBody=*/ true
    );
    return {
      createdTime: res.body.accessKey.createdTime,
      expires: res.body.accessKey.expires,
      key: res.body.accessKey.name,
      name: res.body.accessKey.friendlyName,
    };
  }

  public async getAccessKey(accessKeyName: string): Promise<AccessKey> {
    const res: JsonResponse = await this.get(urlEncode([`/accessKeys/${accessKeyName}`]));
    return {
      createdTime: res.body.accessKey.createdTime,
      expires: res.body.accessKey.expires,
      name: res.body.accessKey.friendlyName,
    };
  }

  public async getAccessKeys(): Promise<AccessKey[]> {
    const res: JsonResponse = await this.get(urlEncode(["/accessKeys"]));
    const accessKeys: AccessKey[] = [];

    res.body.accessKeys.forEach((serverAccessKey: ServerAccessKey) => {
      !serverAccessKey.isSession &&
        accessKeys.push({
          createdTime: serverAccessKey.createdTime,
          expires: serverAccessKey.expires,
          name: serverAccessKey.friendlyName,
        });
    });

    return accessKeys;
  }

  public async getSessions(): Promise<Session[]> {
    const res: JsonResponse = await this.get(urlEncode(["/accessKeys"]));
    // A machine name might be associated with multiple session keys,
    // but we should only return one per machine name.
    const sessionMap: { [machineName: string]: Session } = {};
    const now: number = new Date().getTime();
    res.body.accessKeys.forEach((serverAccessKey: ServerAccessKey) => {
      if (serverAccessKey.isSession && serverAccessKey.expires > now) {
        sessionMap[serverAccessKey.createdBy] = {
          loggedInTime: serverAccessKey.createdTime,
          machineName: serverAccessKey.createdBy,
        };
      }
    });

    return Object.keys(sessionMap).map((machineName: string) => sessionMap[machineName]);
  }

  public async patchAccessKey(oldName: string, newName?: string, ttl?: number): Promise<AccessKey> {
    const accessKeyRequest: AccessKeyRequest = {
      friendlyName: newName,
      ttl,
    };

    const res: JsonResponse = await this.patch(urlEncode([`/accessKeys/${oldName}`]), JSON.stringify(accessKeyRequest));
    return {
      createdTime: res.body.accessKey.createdTime,
      expires: res.body.accessKey.expires,
      name: res.body.accessKey.friendlyName,
    };
  }

  public async removeAccessKey(name: string): Promise<void> {
    await this.del(urlEncode([`/accessKeys/${name}`]));
    return null;
  }

  public async removeSession(machineName: string): Promise<void> {
    await this.del(urlEncode([`/sessions/${machineName}`]));
    return null;
  }

  // Account
  public async getAccountInfo(): Promise<Account> {
    const res: JsonResponse = await this.get(urlEncode(["/account"]));
    return res.body.account;
  }

  // Apps
  public async getApps(): Promise<App[]> {
    const res: JsonResponse = await this.get(urlEncode(["/apps"]));
    return res.body.apps;
  }

  public async getApp(appName: string): Promise<App> {
    const res: JsonResponse = await this.get(urlEncode([`/apps/${appName}`]));
    return res.body.app;
  }

  public async addApp(appName: string): Promise<App> {
    const app: App = { name: appName };
    await this.post(urlEncode(["/apps/"]), JSON.stringify(app), /*expectResponseBody=*/ false);
    return app;
  }

  public async removeApp(appName: string): Promise<void> {
    await this.del(urlEncode([`/apps/${appName}`]));
    return null;
  }

  public async renameApp(oldAppName: string, newAppName: string): Promise<void> {
    await this.patch(urlEncode([`/apps/${oldAppName}`]), JSON.stringify({ name: newAppName }));
    return null;
  }

  public async transferApp(appName: string, email: string): Promise<void> {
    await this.post(urlEncode([`/apps/${appName}/transfer/${email}`]), /*requestBody=*/ null, /*expectResponseBody=*/ false);
    return null;
  }

  // Collaborators
  public async getCollaborators(appName: string): Promise<CollaboratorMap> {
    const res: JsonResponse = await this.get(urlEncode([`/apps/${appName}/collaborators`]));
    return res.body.collaborators;
  }

  public async addCollaborator(appName: string, email: string): Promise<void> {
    await this.post(urlEncode([`/apps/${appName}/collaborators/${email}`]), /*requestBody=*/ null, /*expectResponseBody=*/ false);
    return null;
  }

  public async removeCollaborator(appName: string, email: string): Promise<void> {
    await this.del(urlEncode([`/apps/${appName}/collaborators/${email}`]));
    return null;
  }

  // Deployments
  public async addDeployment(appName: string, deploymentName: string, deploymentKey?: string): Promise<Deployment> {
    const deployment = { name: deploymentName, key: deploymentKey } as Deployment;
    const res: JsonResponse = await this.post(
      urlEncode([`/apps/${appName}/deployments/`]),
      JSON.stringify(deployment),
      /*expectResponseBody=*/ true
    );
    return res.body.deployment;
  }

  public async clearDeploymentHistory(appName: string, deploymentName: string): Promise<void> {
    await this.del(urlEncode([`/apps/${appName}/deployments/${deploymentName}/history`]));
    return null;
  }

  public async getDeployments(appName: string): Promise<Deployment[]> {
    const res: JsonResponse = await this.get(urlEncode([`/apps/${appName}/deployments/`]));
    return res.body.deployments;
  }

  public async getDeployment(appName: string, deploymentName: string): Promise<Deployment> {
    const res: JsonResponse = await this.get(urlEncode([`/apps/${appName}/deployments/${deploymentName}`]));
    return res.body.deployment;
  }

  public async getBaseRelease(
    appName: string,
    deploymentName: string,
    appVersion: string,
    buildNumber?: string
  ): Promise<BaseRelease> {
    const qs = buildNumber ? `?appVersion=${appVersion}&buildNumber=${buildNumber}` : `?appVersion=${appVersion}`;
    const res: JsonResponse = await this.get(urlEncode([`/apps/${appName}/deployments/${deploymentName}/basebundle${qs}`]));
    return res.body.basebundle;
  }

  public async renameDeployment(appName: string, oldDeploymentName: string, newDeploymentName: string): Promise<void> {
    await this.patch(urlEncode([`/apps/${appName}/deployments/${oldDeploymentName}`]), JSON.stringify({ name: newDeploymentName }));
    return null;
  }

  public async removeDeployment(appName: string, deploymentName: string): Promise<void> {
    await this.del(urlEncode([`/apps/${appName}/deployments/${deploymentName}`]));
    return null;
  }

  public async getDeploymentMetrics(appName: string, deploymentName: string): Promise<DeploymentMetrics> {
    const res: JsonResponse = await this.get(urlEncode([`/apps/${appName}/deployments/${deploymentName}/metrics`]));
    return res.body.metrics;
  }

  public async getDeploymentHistory(appName: string, deploymentName: string): Promise<Package[]> {
    const res: JsonResponse = await this.get(urlEncode([`/apps/${appName}/deployments/${deploymentName}/history`]));
    return res.body.history;
  }

  public async release(
    appName: string,
    deploymentName: string,
    filePath: string,
    updateMetadata: PackageInfo,
    uploadProgressCallback?: (progress: number) => void
  ): Promise<void> {
    const packageFile: PackageFile = await this.packageFileFromPath(filePath);
    return this.uploadPackage(
      `/apps/${appName}/deployments/${deploymentName}/release`,
      packageFile,
      updateMetadata,
      uploadProgressCallback
    );
  }

  public releaseNative(
    appName: string,
    deploymentName: string,
    filePath: string,
    updateMetadata: ReactNativePackageInfo,
    uploadProgressCallback?: (progress: number) => void
  ): Promise<void> {
    // The metadata zip is created for this upload, so it's always deleted afterwards
    const packageFile: PackageFile = { isTemporary: true, path: filePath };
    return this.uploadPackage(
      `/apps/${appName}/deployments/${deploymentName}/nativerelease`,
      packageFile,
      updateMetadata,
      uploadProgressCallback
    );
  }

  private uploadPackage(
    endpoint: string,
    packageFile: PackageFile,
    updateMetadata: PackageInfo,
    uploadProgressCallback?: (progress: number) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const request: superagent.Request<any> = superagent.post(this._serverUrl + urlEncode([endpoint]));

      this.attachCredentials(request);

      const file: any = fs.createReadStream(packageFile.path);
      request
        .attach("package", file)
        .field("packageInfo", JSON.stringify(updateMetadata))
        .on("progress", (event: any) => {
          if (uploadProgressCallback && event && event.total > 0) {
            const currentProgress: number = (event.loaded / event.total) * 100;
            uploadProgressCallback(currentProgress);
          }
        })
        .end((err: any, res: superagent.Response) => {
          if (packageFile.isTemporary) {
            // Best effort: failing to delete the temp file must not hide the upload's result
            try {
              fs.rmSync(packageFile.path, { force: true });
            } catch {}
          }

          if (err) {
            reject(this.getCodePushError(err, res));
            return;
          }

          if (res.ok) {
            resolve(null);
          } else {
            let body;
            try {
              body = JSON.parse(res.text);
            } catch {}

            reject({
              message: body ? body.message : res.text,
              statusCode: res && res.status,
            } as CodePushError);
          }
        });
    });
  }

  public async patchRelease(appName: string, deploymentName: string, label: string, updateMetadata: PackageInfo): Promise<void> {
    const requestBody: string = JSON.stringify({ packageInfo: { ...updateMetadata, label } });
    await this.patch(
      urlEncode([`/apps/${appName}/deployments/${deploymentName}/release`]),
      requestBody,
      /*expectResponseBody=*/ false
    );
    return null;
  }

  public async promote(
    appName: string,
    sourceDeploymentName: string,
    destinationDeploymentName: string,
    updateMetadata: PackageInfo
  ): Promise<void> {
    const requestBody: string = JSON.stringify({ packageInfo: updateMetadata });
    await this.post(
      urlEncode([`/apps/${appName}/deployments/${sourceDeploymentName}/promote/${destinationDeploymentName}`]),
      requestBody,
      /*expectResponseBody=*/ false
    );
    return null;
  }

  public async rollback(appName: string, deploymentName: string, targetRelease?: string): Promise<void> {
    await this.post(
      urlEncode([`/apps/${appName}/deployments/${deploymentName}/rollback/${targetRelease || ``}`]),
      /*requestBody=*/ null,
      /*expectResponseBody=*/ false
    );
    return null;
  }

  private async packageFileFromPath(filePath: string): Promise<PackageFile> {
    if (!fs.lstatSync(filePath).isDirectory()) {
      return { isTemporary: false, path: filePath };
    }

    const files: string[] = await listFiles(filePath);
    const baseDirectoryPath: string = path.dirname(filePath);
    const zipPath: string = path.join(process.cwd(), this.generateRandomFilename(15) + ".zip");
    try {
      await createZip(
        zipPath,
        // yazl does not like backslash (\) in the metadata path.
        files.map((file) => [file, normalizePath(path.relative(baseDirectoryPath, file))])
      );
    } catch (error) {
      fs.rmSync(zipPath, { force: true });
      throw error;
    }
    return { isTemporary: true, path: zipPath };
  }

  private generateRandomFilename(length: number): string {
    let filename: string = "";
    const validChar: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < length; i++) {
      filename += validChar.charAt(Math.floor(Math.random() * validChar.length));
    }

    return filename;
  }

  private get(endpoint: string, expectResponseBody: boolean = true): Promise<JsonResponse> {
    return this.makeApiRequest("get", endpoint, /*requestBody=*/ null, expectResponseBody, /*contentType=*/ null);
  }

  private post(
    endpoint: string,
    requestBody: string,
    expectResponseBody: boolean,
    contentType: string = "application/json;charset=UTF-8"
  ): Promise<JsonResponse> {
    return this.makeApiRequest("post", endpoint, requestBody, expectResponseBody, contentType);
  }

  private patch(
    endpoint: string,
    requestBody: string,
    expectResponseBody: boolean = false,
    contentType: string = "application/json;charset=UTF-8"
  ): Promise<JsonResponse> {
    return this.makeApiRequest("patch", endpoint, requestBody, expectResponseBody, contentType);
  }

  private del(endpoint: string, expectResponseBody: boolean = false): Promise<JsonResponse> {
    return this.makeApiRequest("del", endpoint, /*requestBody=*/ null, expectResponseBody, /*contentType=*/ null);
  }

  private makeApiRequest(
    method: string,
    endpoint: string,
    requestBody: string,
    expectResponseBody: boolean,
    contentType: string
  ): Promise<JsonResponse> {
    return new Promise<JsonResponse>((resolve, reject) => {
      let request: superagent.Request<any> = (superagent as any)[method](this._serverUrl + endpoint);

      this.attachCredentials(request);

      if (requestBody) {
        if (contentType) {
          request = request.set("Content-Type", contentType);
        }

        request = request.send(requestBody);
      }

      request.end((err: any, res: superagent.Response) => {
        if (err) {
          reject(this.getCodePushError(err, res));
          return;
        }
        let body;
        try {
          body = JSON.parse(res.text);
        } catch {}

        if (res.ok) {
          if (expectResponseBody && !body) {
            reject({
              message: `Could not parse response: ${res.text}`,
              statusCode: AccountManager.ERROR_INTERNAL_SERVER,
            } as CodePushError);
          } else {
            resolve({
              headers: res.header,
              body: body,
            } as JsonResponse);
          }
        } else {
          if (body) {
            reject({
              message: body.message,
              statusCode: this.getErrorStatus(err, res),
            } as CodePushError);
          } else {
            reject({
              message: res.text,
              statusCode: this.getErrorStatus(err, res),
            } as CodePushError);
          }
        }
      });
    });
  }

  private getCodePushError(error: any, response: superagent.Response): CodePushError {
    if (error.syscall === "getaddrinfo") {
      error.message = `Unable to connect to the CodePush server. Are you offline, or behind a firewall or proxy?\n(${error.message})`;
    }

    return {
      message: this.getErrorMessage(error, response),
      statusCode: this.getErrorStatus(error, response),
    };
  }

  private getErrorStatus(error: any, response: superagent.Response): number {
    return (error && error.status) || (response && response.status) || AccountManager.ERROR_GATEWAY_TIMEOUT;
  }

  private getErrorMessage(error: Error, response: superagent.Response): string {
    return response && response.text ? response.text : error.message;
  }

  private attachCredentials(request: superagent.Request<any>): void {
    if (this._customHeaders) {
      for (const headerName in this._customHeaders) {
        request.set(headerName, this._customHeaders[headerName]);
      }
    }

    request.set("Accept", `application/vnd.code-push.v${AccountManager.API_VERSION}+json`);
    request.set("Authorization", `Bearer ${this._accessKey}`);
    request.set("X-CodePush-SDK-Version", packageJson.version);
  }
}

export = AccountManager;
