import { strict as assert } from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as jwt from "jsonwebtoken";
import * as sinon from "sinon";
import { generatePackageHashFromDirectory } from "../script/hash-utils";
import sign from "../script/sign";
import { useTempDirectory } from "./helpers/temp-directory";

describe("sign", () => {
  const dir = useTempDirectory("sign");

  let keys: crypto.KeyPairKeyObjectResult;
  let privateKeyPath: string;
  let releaseFolder: string;
  let signatureFile: string;

  before(() => {
    keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  });

  beforeEach(() => {
    sinon.stub(console, "log");
    privateKeyPath = dir.write("private.pem", keys.privateKey.export({ type: "pkcs1", format: "pem" }));
    dir.write("release/main.jsbundle", "bundle");
    releaseFolder = path.join(dir.path, "release");
    signatureFile = path.join(releaseFolder, ".codepushrelease");
  });

  afterEach(() => sinon.restore());

  function readClaims(): jwt.JwtPayload {
    return jwt.verify(fs.readFileSync(signatureFile, "utf8"), keys.publicKey, { algorithms: ["RS256"] }) as jwt.JwtPayload;
  }

  it("writes a signature with the content hash", async () => {
    const expectedHash = await generatePackageHashFromDirectory(releaseFolder, dir.path);

    await sign(privateKeyPath, releaseFolder);

    const claims = readClaims();
    assert.equal(claims.claimVersion, "1.0.0");
    assert.equal(claims.contentHash, expectedHash);
  });

  it("replaces an existing signature", async () => {
    await sign(privateKeyPath, releaseFolder);
    const { contentHash } = readClaims();

    await sign(privateKeyPath, releaseFolder);

    assert.equal(readClaims().contentHash, contentHash);
  });

  it("rejects a missing signing key", async () => {
    await assert.rejects(sign(path.join(dir.path, "missing.pem"), releaseFolder), /was not valid/);
    assert.equal(fs.existsSync(signatureFile), false);
  });
});
