// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { strict as assert } from "assert";

import {
  AcquisitionManager,
  AcquisitionStatus,
  Callback,
  Configuration,
  Http,
  NativeUpdateNotification,
  Package,
  RemotePackage,
} from "../script/acquisition-sdk";
import * as rest from "../script/types/rest-definitions";
import {
  createLatestPackage,
  CustomResponseHttpRequester,
  HttpRequester,
  serverUrl,
  validDeploymentKey,
} from "./acquisition-rest-mock";

type UpdateCheckResult = RemotePackage | NativeUpdateNotification | null;

function callbackToPromise<T>(start: (callback: Callback<T>) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => start((error, result) => (error ? reject(error) : resolve(result))));
}

function createConfiguration(overrides: Partial<Configuration> = {}): Configuration {
  return {
    appVersion: "1.5.0",
    clientUniqueId: "My iPhone",
    deploymentKey: validDeploymentKey,
    serverUrl,
    ...overrides,
  };
}

/** The package currently running on the device: same app version as the latest release, older label and hash */
function createCurrentPackage(overrides: Partial<Package> = {}): Package {
  return {
    deploymentKey: validDeploymentKey,
    description: "sdfsdf",
    label: "v1",
    appVersion: createLatestPackage().appVersion,
    packageHash: "hash001",
    isMandatory: false,
    packageSize: 100,
    ...overrides,
  };
}

function expectedRemotePackage(latest: rest.UpdateCheckResponse = createLatestPackage()): RemotePackage {
  return {
    deploymentKey: validDeploymentKey,
    description: latest.description,
    downloadUrl: latest.downloadURL,
    label: latest.label,
    appVersion: latest.appVersion,
    isMandatory: latest.isMandatory,
    packageHash: latest.packageHash,
    packageSize: latest.packageSize,
  };
}

function queryUpdate(
  currentPackage: Package,
  {
    requester = new HttpRequester(),
    configuration = createConfiguration(),
  }: { requester?: Http.Requester; configuration?: Configuration } = {}
): Promise<UpdateCheckResult> {
  const acquisition = new AcquisitionManager(requester, configuration);
  return callbackToPromise<UpdateCheckResult>((callback) => acquisition.queryUpdateWithCurrentPackage(currentPackage, callback));
}

function respondingWith(body: string): CustomResponseHttpRequester {
  return new CustomResponseHttpRequester({ statusCode: 200, body });
}

describe("Acquisition SDK", () => {
  describe("queryUpdateWithCurrentPackage", () => {
    it("offers an update when the current package has a lower label and a different hash", async () => {
      assert.deepEqual(await queryUpdate(createCurrentPackage()), expectedRemotePackage());
    });

    it("offers no update when the current package has the latest hash", async () => {
      const currentPackage = createCurrentPackage({ packageHash: createLatestPackage().packageHash });

      assert.equal(await queryUpdate(currentPackage), null);
    });

    it("offers an update when the current package has a higher label but a different hash", async () => {
      const currentPackage = createCurrentPackage({ label: "v9", packageHash: "hash990" });

      assert.deepEqual(await queryUpdate(currentPackage), expectedRemotePackage());
    });

    it("notifies about a newer app version when the current app version is lower", async () => {
      const currentPackage = createCurrentPackage({ appVersion: "0.0.1" });

      const expected: NativeUpdateNotification = { updateAppVersion: true, appVersion: createLatestPackage().appVersion };
      assert.deepEqual(await queryUpdate(currentPackage), expected);
    });

    it("offers no update when the current app version is higher", async () => {
      assert.equal(await queryUpdate(createCurrentPackage({ appVersion: "9.9.0" })), null);
    });

    it("ignores a higher app version for a companion app and offers an update", async () => {
      const currentPackage = createCurrentPackage({ appVersion: "9.9.0" });
      const configuration = createConfiguration({ ignoreAppVersion: true });

      assert.deepEqual(await queryUpdate(currentPackage, { configuration }), expectedRemotePackage());
    });

    it("offers no update for an unknown deployment key", async () => {
      const configuration = createConfiguration({ deploymentKey: "unknownDeploymentKey" });

      assert.equal(await queryUpdate(createCurrentPackage(), { configuration }), null);
    });

    it("returns a mandatory package when the latest release is mandatory", async () => {
      const latest = createLatestPackage({ isMandatory: true });

      const update = await queryUpdate(createCurrentPackage(), { requester: new HttpRequester(latest) });

      assert.deepEqual(update, expectedRemotePackage(latest));
      assert.equal((update as RemotePackage).isMandatory, true);
    });

    it("offers no update for an empty response", async () => {
      const update = await queryUpdate(createCurrentPackage({ appVersion: "0.0.1" }), { requester: respondingWith("{}") });

      assert.equal(update, null);
    });

    it("offers no update for an unexpected but valid JSON response", async () => {
      const requester = respondingWith(JSON.stringify({ unexpected: "response" }));

      assert.equal(await queryUpdate(createCurrentPackage({ appVersion: "0.0.1" }), { requester }), null);
    });

    it("fails when the server returns invalid JSON", async () => {
      const requester = respondingWith("invalid {{ json");

      await assert.rejects(queryUpdate(createCurrentPackage({ appVersion: "0.0.1" }), { requester }), SyntaxError);
    });

    it("throws synchronously when the current package has no app version", () => {
      const acquisition = new AcquisitionManager(new HttpRequester(), createConfiguration());

      assert.throws(
        () =>
          acquisition.queryUpdateWithCurrentPackage(createCurrentPackage({ appVersion: null }), () =>
            assert.fail("The callback should not be called for an invalid package")
          ),
        /incorrect package/
      );
    });
  });

  describe("status reports", () => {
    it("reportStatusDeploy signals completion", async () => {
      const acquisition = new AcquisitionManager(new HttpRequester(), createConfiguration());

      const result = await callbackToPromise<void>((callback) =>
        acquisition.reportStatusDeploy(
          createCurrentPackage(),
          AcquisitionStatus.DeploymentFailed,
          "1.5.0",
          validDeploymentKey,
          callback
        )
      );

      assert.equal(result, null);
    });

    it("reportStatusDownload signals completion", async () => {
      const acquisition = new AcquisitionManager(new HttpRequester(), createConfiguration());

      const result = await callbackToPromise<void>((callback) => acquisition.reportStatusDownload(createCurrentPackage(), callback));

      assert.equal(result, null);
    });
  });
});
