// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as querystring from "querystring";

import { Callback, Http } from "../script/acquisition-sdk";
import * as rest from "../script/types/rest-definitions";

type ResponseCallback = Callback<Http.Response>;

export const validDeploymentKey = "asdfasdfawerqw";
export const serverUrl = "http://myurl.com";

const updateCheckUrl = `${serverUrl}/updateCheck?`;
const reportStatusUrls = [`${serverUrl}/reportStatus/deploy`, `${serverUrl}/reportStatus/download`];

/** The release the mock server offers for `validDeploymentKey` */
export function createLatestPackage(overrides: Partial<rest.UpdateCheckResponse> = {}): rest.UpdateCheckResponse {
  return {
    downloadURL: "http://www.windowsazure.com/blobs/awperoiuqpweru",
    description: "Angry flappy birds",
    appVersion: "1.5.0",
    label: "2.4.0",
    isMandatory: false,
    isAvailable: true,
    updateAppVersion: false,
    packageHash: "hash240",
    packageSize: 1024,
    ...overrides,
  };
}

function lastCallback(requestBodyOrCallback: string | ResponseCallback, callback?: ResponseCallback): ResponseCallback {
  if (callback) {
    return callback;
  }
  if (typeof requestBodyOrCallback !== "function") {
    throw new Error("Missing response callback");
  }
  return requestBodyOrCallback;
}

/** Simulates the update-check and status-report endpoints of the server, offering `latestPackage` */
export class HttpRequester implements Http.Requester {
  constructor(private readonly latestPackage: rest.UpdateCheckResponse = createLatestPackage()) {}

  public request(verb: Http.Verb, url: string, requestBodyOrCallback: string | ResponseCallback, callback?: ResponseCallback): void {
    const respond = lastCallback(requestBodyOrCallback, callback);

    if (verb === Http.Verb.GET && url.startsWith(updateCheckUrl)) {
      respond(null, this.onUpdateCheck(querystring.parse(url.substring(updateCheckUrl.length))));
    } else if (verb === Http.Verb.POST && reportStatusUrls.includes(url)) {
      respond(null, { statusCode: 200 });
    } else {
      throw new Error(`Unexpected call: ${verb} ${url}`);
    }
  }

  private onUpdateCheck(params: querystring.ParsedUrlQuery): Http.Response {
    const deploymentKey = params.deploymentKey as string;
    const appVersion = params.appVersion as string;
    if (!deploymentKey || !appVersion) {
      return { statusCode: 400 };
    }

    const latest = this.latestPackage;
    let updateInfo: Partial<rest.UpdateCheckResponse> = { isAvailable: false };
    if (deploymentKey === validDeploymentKey) {
      if (params.isCompanion || appVersion === latest.appVersion) {
        if (params.packageHash !== latest.packageHash) {
          updateInfo = latest;
        }
      } else if (appVersion < latest.appVersion) {
        updateInfo = { updateAppVersion: true, appVersion: latest.appVersion };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ updateInfo }) };
  }
}

/** Answers every GET request with the same response */
export class CustomResponseHttpRequester implements Http.Requester {
  constructor(private readonly response: Http.Response) {}

  public request(_verb: Http.Verb, _url: string, requestBodyOrCallback: string | ResponseCallback): void {
    if (typeof requestBodyOrCallback !== "function") {
      throw new Error("Unexpected request body");
    }
    requestBodyOrCallback(null, this.response);
  }
}
