// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from "assert";

import * as acquisitionSdk from "../script/acquisition-sdk";
import * as mockApi from "./acquisition-rest-mock";
import * as rest from "../script/types/rest-definitions";

const latestPackage: rest.UpdateCheckResponse = clone(mockApi.latestPackage);

const configuration: acquisitionSdk.Configuration = {
  appVersion: "1.5.0",
  clientUniqueId: "My iPhone",
  deploymentKey: mockApi.validDeploymentKey,
  serverUrl: mockApi.serverUrl,
};

const templateCurrentPackage: acquisitionSdk.Package = {
  deploymentKey: mockApi.validDeploymentKey,
  description: "sdfsdf",
  label: "v1",
  appVersion: latestPackage.appVersion,
  packageHash: "hash001",
  isMandatory: false,
  packageSize: 100,
};

const scriptUpdateResult: acquisitionSdk.RemotePackage = {
  deploymentKey: mockApi.validDeploymentKey,
  description: latestPackage.description,
  downloadUrl: latestPackage.downloadURL,
  label: latestPackage.label,
  appVersion: latestPackage.appVersion,
  isMandatory: latestPackage.isMandatory,
  packageHash: latestPackage.packageHash,
  packageSize: latestPackage.packageSize,
};

const nativeUpdateResult: acquisitionSdk.NativeUpdateNotification = {
  updateAppVersion: true,
  appVersion: latestPackage.appVersion,
};

describe("Acquisition SDK", () => {
  it("Package with lower label and different package hash gives update", (done: Mocha.Done) => {
    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);
    acquisition.queryUpdateWithCurrentPackage(
      templateCurrentPackage,
      (error: Error, returnPackage: acquisitionSdk.RemotePackage | acquisitionSdk.NativeUpdateNotification) => {
        assert.equal(null, error);
        assert.deepEqual(scriptUpdateResult, returnPackage);
        done();
      }
    );
  });

  it("Package with equal package hash gives no update", (done: Mocha.Done) => {
    const equalVersionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    equalVersionPackage.packageHash = latestPackage.packageHash;

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);
    acquisition.queryUpdateWithCurrentPackage(
      equalVersionPackage,
      (error: Error, returnPackage: acquisitionSdk.RemotePackage | acquisitionSdk.NativeUpdateNotification) => {
        assert.equal(null, error);
        assert.equal(null, returnPackage);
        done();
      }
    );
  });

  it("Package with higher different hash and higher label version gives update", (done: Mocha.Done) => {
    const higherVersionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    higherVersionPackage.packageHash = "hash990";

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);
    acquisition.queryUpdateWithCurrentPackage(
      higherVersionPackage,
      (error: Error, returnPackage: acquisitionSdk.RemotePackage | acquisitionSdk.NativeUpdateNotification) => {
        assert.equal(null, error);
        assert.deepEqual(scriptUpdateResult, returnPackage);
        done();
      }
    );
  });

  it("Package with lower native version gives update notification", (done: Mocha.Done) => {
    const lowerAppVersionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    lowerAppVersionPackage.appVersion = "0.0.1";

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);
    acquisition.queryUpdateWithCurrentPackage(
      lowerAppVersionPackage,
      (error: Error, returnPackage: acquisitionSdk.RemotePackage | acquisitionSdk.NativeUpdateNotification) => {
        assert.equal(null, error);
        assert.deepEqual(nativeUpdateResult, returnPackage);
        done();
      }
    );
  });

  it("Package with higher native version gives no update", (done: Mocha.Done) => {
    const higherAppVersionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    higherAppVersionPackage.appVersion = "9.9.0";

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);
    acquisition.queryUpdateWithCurrentPackage(
      higherAppVersionPackage,
      (error: Error, returnPackage: acquisitionSdk.RemotePackage | acquisitionSdk.NativeUpdateNotification) => {
        assert.equal(null, error);
        assert.deepEqual(null, returnPackage);
        done();
      }
    );
  });

  it("An empty response gives no update", (done: Mocha.Done) => {
    const lowerAppVersionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    lowerAppVersionPackage.appVersion = "0.0.1";

    const emptyReponse: acquisitionSdk.Http.Response = {
      statusCode: 200,
      body: JSON.stringify({}),
    };

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.CustomResponseHttpRequester(emptyReponse), configuration);
    acquisition.queryUpdateWithCurrentPackage(lowerAppVersionPackage, (error: Error) => {
      assert.equal(null, error);
      done();
    });
  });

  it("An unexpected (but valid) JSON response gives no update", (done: Mocha.Done) => {
    const lowerAppVersionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    lowerAppVersionPackage.appVersion = "0.0.1";

    const unexpectedResponse: acquisitionSdk.Http.Response = {
      statusCode: 200,
      body: JSON.stringify({ unexpected: "response" }),
    };

    const acquisition = new acquisitionSdk.AcquisitionManager(
      new mockApi.CustomResponseHttpRequester(unexpectedResponse),
      configuration
    );
    acquisition.queryUpdateWithCurrentPackage(lowerAppVersionPackage, (error: Error) => {
      assert.equal(null, error);
      done();
    });
  });

  it("Package for companion app ignores high native version and gives update", (done: Mocha.Done) => {
    const higherAppVersionCompanionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    higherAppVersionCompanionPackage.appVersion = "9.9.0";

    const companionAppConfiguration = clone(configuration);
    companionAppConfiguration.ignoreAppVersion = true;

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), companionAppConfiguration);
    acquisition.queryUpdateWithCurrentPackage(
      higherAppVersionCompanionPackage,
      (error: Error, returnPackage: acquisitionSdk.RemotePackage | acquisitionSdk.NativeUpdateNotification) => {
        assert.equal(null, error);
        assert.deepEqual(scriptUpdateResult, returnPackage);
        done();
      }
    );
  });

  it("If latest package is mandatory, returned package is mandatory", (done: Mocha.Done) => {
    mockApi.latestPackage.isMandatory = true;

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);
    acquisition.queryUpdateWithCurrentPackage(templateCurrentPackage, (error: Error, returnPackage: acquisitionSdk.RemotePackage) => {
      assert.equal(null, error);
      assert.equal(true, returnPackage.isMandatory);
      done();
    });
  });

  it("If invalid arguments are provided, an error is raised", (done: Mocha.Done) => {
    const invalidPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    invalidPackage.appVersion = null;

    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);
    try {
      acquisition.queryUpdateWithCurrentPackage(invalidPackage, () => {
        assert.fail("Should throw an error if the native implementation gave an incorrect package");
        done();
      });
    } catch (error) {
      done();
    }
  });

  it("If an invalid JSON response is returned by the server, an error is raised", (done: Mocha.Done) => {
    const lowerAppVersionPackage: acquisitionSdk.Package = clone(templateCurrentPackage);
    lowerAppVersionPackage.appVersion = "0.0.1";

    const invalidJsonReponse: acquisitionSdk.Http.Response = {
      statusCode: 200,
      body: "invalid {{ json",
    };

    const acquisition = new acquisitionSdk.AcquisitionManager(
      new mockApi.CustomResponseHttpRequester(invalidJsonReponse),
      configuration
    );
    acquisition.queryUpdateWithCurrentPackage(lowerAppVersionPackage, (error: Error) => {
      assert.notEqual(null, error);
      done();
    });
  });

  it("If deploymentKey is not valid...", (done: Mocha.Done) => {
    // TODO: behaviour is not defined
    done();
  });

  it("reportStatusDeploy(...) signals completion", (done: Mocha.Done): void => {
    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);

    acquisition.reportStatusDeploy(
      templateCurrentPackage,
      acquisitionSdk.AcquisitionStatus.DeploymentFailed,
      "1.5.0",
      mockApi.validDeploymentKey,
      (error: Error, parameter: void): void => {
        if (error) {
          throw error;
        }

        assert.equal(parameter, /*expected*/ null);

        done();
      }
    );
  });

  it("reportStatusDownload(...) signals completion", (done: Mocha.Done): void => {
    const acquisition = new acquisitionSdk.AcquisitionManager(new mockApi.HttpRequester(), configuration);

    acquisition.reportStatusDownload(templateCurrentPackage, (error: Error, parameter: void): void => {
      if (error) {
        throw error;
      }

      assert.equal(parameter, /*expected*/ null);

      done();
    });
  });
});

function clone<T>(initialObject: T): T {
  return JSON.parse(JSON.stringify(initialObject));
}
