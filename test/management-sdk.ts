// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import superagent = require("superagent");
import installSuperagentMock = require("superagent-mock");

import AccountManager = require("../script/management-sdk");
import * as fileUtils from "../script/utils/file-utils";
import { useTempDirectory } from "./helpers/temp-directory";

interface MockedResponse {
  text: string;
  status: number;
  ok: boolean;
  header: Record<string, string>;
  headers: Record<string, string>;
}

interface SuperagentMock {
  unset(): void;
}

const serverUrl = "http://localhost";

let superagentMock: SuperagentMock | undefined;

/**
 * Answers every request with the given status and body, and returns the request bodies it receives.
 * Like a real superagent error, a non-2xx status fails the request with the body as its message.
 */
function mockServerResponse(status: number, body = "", header: Record<string, string> = {}): unknown[] {
  const requestBodies: unknown[] = [];
  superagentMock?.unset();
  superagentMock = installSuperagentMock(superagent, [
    {
      pattern: `${serverUrl}/(\\w+)/?`,
      fixtures: (_match: RegExpExecArray, requestBody: unknown): MockedResponse => {
        requestBodies.push(requestBody);
        const ok = status >= 200 && status < 300;
        if (!ok) {
          throw Object.assign(new Error(body), { status });
        }
        return { text: body, status, ok, header, headers: {} };
      },
      callback: (_match: RegExpExecArray, response: MockedResponse): MockedResponse => response,
    },
  ]);
  return requestBodies;
}

type SdkCall = (manager: AccountManager) => Promise<unknown>;

const callsThatPropagateServerErrors: Array<[name: string, call: SdkCall]> = [
  ["addApp", (manager) => manager.addApp("appName")],
  ["getApp", (manager) => manager.getApp("appName")],
  ["renameApp", (manager) => manager.renameApp("appName", "newAppName")],
  ["removeApp", (manager) => manager.removeApp("appName")],
  ["transferApp", (manager) => manager.transferApp("appName", "email1")],
  ["addDeployment", (manager) => manager.addDeployment("appName", "deploymentName")],
  ["getDeployment", (manager) => manager.getDeployment("appName", "deploymentName")],
  ["getDeployments", (manager) => manager.getDeployments("appName")],
  ["renameDeployment", (manager) => manager.renameDeployment("appName", "deploymentName", "newDeploymentName")],
  ["removeDeployment", (manager) => manager.removeDeployment("appName", "deploymentName")],
  ["getDeploymentHistory", (manager) => manager.getDeploymentHistory("appName", "deploymentName")],
  ["clearDeploymentHistory", (manager) => manager.clearDeploymentHistory("appName", "deploymentName")],
  ["addCollaborator", (manager) => manager.addCollaborator("appName", "email1")],
  ["getCollaborators", (manager) => manager.getCollaborators("appName")],
  ["removeCollaborator", (manager) => manager.removeCollaborator("appName", "email1")],
  ["patchRelease", (manager) => manager.patchRelease("appName", "deploymentName", "label", { description: "newDescription" })],
  ["promote", (manager) => manager.promote("appName", "deploymentName", "newDeploymentName", { description: "newDescription" })],
  ["rollback", (manager) => manager.rollback("appName", "deploymentName", "targetReleaseLabel")],
];

describe("Management SDK", () => {
  let manager: AccountManager;

  beforeEach(() => {
    manager = new AccountManager("dummyAccessKey", /*customHeaders=*/ null, serverUrl);
  });

  afterEach(() => {
    superagentMock?.unset();
    superagentMock = undefined;
  });

  describe("server errors", () => {
    for (const [name, call] of callsThatPropagateServerErrors) {
      it(`${name} rejects with the server's message and status code`, async () => {
        mockServerResponse(404, "Text");

        await assert.rejects(async () => call(manager), { message: "Text", statusCode: 404 });
      });
    }

    it("rejects on a 400 response", async () => {
      mockServerResponse(400);

      await assert.rejects(async () => manager.rollback("appName", "deploymentName", "v1"), { statusCode: 400 });
    });
  });

  describe("isAuthenticated", () => {
    it("resolves true when the server accepts the access key", async () => {
      mockServerResponse(200, JSON.stringify({ authenticated: true }));

      assert.equal(await manager.isAuthenticated(), true);
    });

    it("resolves false when the server rejects the access key", async () => {
      mockServerResponse(401, "Unauthorized");

      assert.equal(await manager.isAuthenticated(), false);
    });

    it("rejects when unauthorized if asked to", async () => {
      mockServerResponse(401, "Unauthorized");

      await assert.rejects(async () => manager.isAuthenticated(/*throwIfUnauthorized=*/ true), { message: "Unauthorized" });
    });

    it("rejects on an unexpected status code", async () => {
      mockServerResponse(404, "Not Found");

      await assert.rejects(async () => manager.isAuthenticated(), { message: "Not Found" });
    });
  });

  describe("apps", () => {
    it("addApp resolves with the new app", async () => {
      mockServerResponse(201, JSON.stringify({ success: true }), { location: "/appName" });

      assert.deepEqual(await manager.addApp("appName"), { name: "appName" });
    });

    it("getApp resolves with the app from the response", async () => {
      mockServerResponse(200, JSON.stringify({ app: { name: "appName" } }));

      assert.deepEqual(await manager.getApp("appName"), { name: "appName" });
    });

    it("renameApp resolves with nothing", async () => {
      mockServerResponse(200, JSON.stringify({ apps: [] }));

      assert.equal(await manager.renameApp("appName", "newAppName"), null);
    });

    it("removeApp resolves with nothing", async () => {
      mockServerResponse(200);

      assert.equal(await manager.removeApp("appName"), null);
    });

    it("transferApp resolves with nothing", async () => {
      mockServerResponse(201);

      assert.equal(await manager.transferApp("appName", "email1"), null);
    });
  });

  describe("deployments", () => {
    it("addDeployment resolves with the deployment from the response", async () => {
      const deployment = { name: "name", key: "key" };
      mockServerResponse(201, JSON.stringify({ deployment }), { location: "/deploymentName" });

      assert.deepEqual(await manager.addDeployment("appName", "deploymentName"), deployment);
    });

    it("getDeployment resolves with the deployment from the response", async () => {
      mockServerResponse(200, JSON.stringify({ deployment: { name: "deploymentName" } }));

      assert.deepEqual(await manager.getDeployment("appName", "deploymentName"), { name: "deploymentName" });
    });

    it("getBaseRelease resolves with the base bundle from the response", async () => {
      const basebundle = { bundleBlobUrl: "https://test.test/release.zip" };
      mockServerResponse(200, JSON.stringify({ basebundle }));

      assert.deepEqual(await manager.getBaseRelease("appName", "deploymentName", "1.2.3"), basebundle);
    });

    it("getDeployments resolves with the deployments from the response", async () => {
      mockServerResponse(200, JSON.stringify({ deployments: [] }));

      assert.deepEqual(await manager.getDeployments("appName"), []);
    });

    it("renameDeployment resolves with nothing", async () => {
      mockServerResponse(200, JSON.stringify({ apps: [] }));

      assert.equal(await manager.renameDeployment("appName", "deploymentName", "newDeploymentName"), null);
    });

    it("removeDeployment resolves with nothing", async () => {
      mockServerResponse(200);

      assert.equal(await manager.removeDeployment("appName", "deploymentName"), null);
    });

    it("getDeploymentHistory resolves with an empty history", async () => {
      mockServerResponse(200, JSON.stringify({ history: [] }));

      assert.deepEqual(await manager.getDeploymentHistory("appName", "deploymentName"), []);
    });

    it("getDeploymentHistory resolves with the releases in order", async () => {
      mockServerResponse(200, JSON.stringify({ history: [{ label: "v1" }, { label: "v2" }] }));

      assert.deepEqual(await manager.getDeploymentHistory("appName", "deploymentName"), [{ label: "v1" }, { label: "v2" }]);
    });

    it("clearDeploymentHistory resolves with nothing", async () => {
      mockServerResponse(204);

      assert.equal(await manager.clearDeploymentHistory("appName", "deploymentName"), null);
    });
  });

  describe("collaborators", () => {
    it("addCollaborator resolves with nothing", async () => {
      mockServerResponse(201, "", { location: "/collaborators" });

      assert.equal(await manager.addCollaborator("appName", "email1"), null);
    });

    it("getCollaborators resolves with no collaborators", async () => {
      mockServerResponse(200, JSON.stringify({ collaborators: {} }));

      assert.deepEqual(await manager.getCollaborators("appName"), {});
    });

    it("getCollaborators resolves with each collaborator's permission", async () => {
      const collaborators = {
        email1: { permission: "Owner", isCurrentAccount: true },
        email2: { permission: "Collaborator", isCurrentAccount: false },
      };
      mockServerResponse(200, JSON.stringify({ collaborators }));

      assert.deepEqual(await manager.getCollaborators("appName"), collaborators);
    });

    it("removeCollaborator resolves with nothing", async () => {
      mockServerResponse(200);

      assert.equal(await manager.removeCollaborator("appName", "email1"), null);
    });
  });

  describe("releases", () => {
    it("patchRelease resolves with nothing", async () => {
      mockServerResponse(200, JSON.stringify({ package: { description: "newDescription" } }));

      assert.equal(await manager.patchRelease("appName", "deploymentName", "label", { description: "newDescription" }), null);
    });

    it("patchRelease sends the label without changing the caller's metadata", async () => {
      const requestBodies = mockServerResponse(200);
      const metadata = { description: "newDescription" };

      await manager.patchRelease("appName", "deploymentName", "v1", metadata);

      assert.deepEqual(requestBodies, [JSON.stringify({ packageInfo: { description: "newDescription", label: "v1" } })]);
      assert.deepEqual(metadata, { description: "newDescription" });
    });

    it("promote resolves with nothing", async () => {
      mockServerResponse(200, JSON.stringify({ package: { description: "newDescription" } }));

      assert.equal(await manager.promote("appName", "deploymentName", "newDeploymentName", { description: "newDescription" }), null);
    });

    it("rollback resolves with nothing", async () => {
      mockServerResponse(200, JSON.stringify({ package: { label: "v1" } }));

      assert.equal(await manager.rollback("appName", "deploymentName", "v1"), null);
    });
  });

  describe("uploads", () => {
    const project = useTempDirectory("management-sdk", { chdir: true });

    afterEach(() => sinon.restore());

    it("release deletes the partly written zip when zipping fails", async () => {
      project.write("update/index.bundle", "bundle");
      sinon.stub(fileUtils, "createZip").callsFake(async (zipPath: string) => {
        fs.writeFileSync(zipPath, "partial");
        throw new Error("zip failed");
      });

      await assert.rejects(manager.release("appName", "deploymentName", "update", {}), { message: "zip failed" });
      assert.deepEqual(
        fs.readdirSync(project.path).filter((file) => path.extname(file) === ".zip"),
        []
      );
    });

    it("releaseNative rejects with the server error when its zip is already gone", async () => {
      mockServerResponse(500, "Server error");

      await assert.rejects(manager.releaseNative("appName", "deploymentName", path.join(project.path, "missing.zip"), {}), {
        statusCode: 500,
      });
    });
  });
});
