import { strict as assert } from "assert";
import * as fs from "fs";
import * as sinon from "sinon";
import {
  configFilePath as configFile,
  deleteConnectionInfoCache,
  deserializeConnectionInfo,
  serializeConnectionInfo,
} from "../script/auth/connection";
import * as terminal from "../script/ui/terminal";

// File modes don't apply on Windows
const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

describeOnPosix("connection", () => {
  // test/setup.ts points HOME at a temp folder
  const mode = () => fs.statSync(configFile).mode & 0o777;
  // Set the mode explicitly: the `mode` option is masked by the umask, which may already strip the read bits
  const writeReadableByOthers = (content: string) => {
    fs.writeFileSync(configFile, content);
    fs.chmodSync(configFile, 0o644);
  };

  beforeEach(() => sinon.stub(terminal, "log"));
  afterEach(() => {
    sinon.restore();
    deleteConnectionInfoCache(/* printMessage */ false);
  });

  it("saves the access key readable only by the owner", () => {
    serializeConnectionInfo("key", false);

    assert.equal(mode(), 0o600);
    assert.equal(deserializeConnectionInfo().accessKey, "key");
  });

  it("restricts a config file that other users could read before saving the key", () => {
    writeReadableByOthers("{}");

    serializeConnectionInfo("key", false);

    assert.equal(mode(), 0o600);
  });

  it("restricts a config file saved by an older version when reading it", () => {
    writeReadableByOthers(JSON.stringify({ accessKey: "key" }));

    assert.equal(deserializeConnectionInfo().accessKey, "key");
    assert.equal(mode(), 0o600);
  });
});
