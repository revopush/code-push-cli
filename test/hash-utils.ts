// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import * as yauzl from "yauzl";
import * as hashUtils from "../script/hash-utils";
import { useTempDirectory } from "./helpers/temp-directory";

const TEST_ZIP = path.join(__dirname, "resources", "test.zip");
const TEST_ZIP_HASH = "540fed8df3553079e81d1353c5cc4e3cac7db9aea647a85d550f646e8620c317";
const TEST_ZIP_MANIFEST_HASH = "9e0499ce7df5c04cb304c9deed684dc137fc603cb484a5b027478143c595d80b";
const TEST_ZIP_FILE_HASHES = {
  "b.txt": "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d",
  "c.txt": "2e7d2c03a9507ae265ecf5b5356885a53393a2029d241394997265a1a25aefc6",
  "d.txt": "18ac3e7343f016890c510e93f935261169d9e3f565436429830faf0934f4f8e4",
};

// Contains OS metadata (such as __MACOSX/ and .DS_Store) next to its single real file
const IGNORED_METADATA_ZIP = path.join(__dirname, "resources", "ignoredMetadata.zip");
const IGNORED_METADATA_ZIP_FILE_HASHES = {
  "www/index.html": "b0693dc92f76e08bf1485b3dd9b514a2e31dfd6f39422a6b60edb722671dc98f",
};

async function unzip(zipPath: string, directory: string): Promise<void> {
  const zipFile = await yauzl.openPromise(zipPath);
  try {
    for await (const entry of zipFile.eachEntry()) {
      const target = path.join(directory, entry.fileName);
      if (entry.fileName.endsWith("/")) {
        fs.mkdirSync(target, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        await pipeline(await zipFile.openReadStreamPromise(entry), fs.createWriteStream(target));
      }
    }
  } finally {
    zipFile.close();
  }
}

function fileHashes(manifest: hashUtils.PackageManifest): Record<string, string> {
  return Object.fromEntries(manifest.toMap());
}

describe("hash-utils", () => {
  const tempDirectory = useTempDirectory("hash-utils");

  async function manifestOfUnzipped(zipPath: string): Promise<hashUtils.PackageManifest> {
    await unzip(zipPath, tempDirectory.path);
    return hashUtils.generatePackageManifestFromDirectory(tempDirectory.path, tempDirectory.path);
  }

  it("hashes a file", async () => {
    assert.equal(await hashUtils.hashFile(TEST_ZIP), TEST_ZIP_HASH);
  });

  it("generates a package manifest for an archive", async () => {
    const manifest = await hashUtils.generatePackageManifestFromZip(TEST_ZIP);

    assert.deepEqual(fileHashes(manifest), TEST_ZIP_FILE_HASHES);
  });

  it("generates a package manifest for a directory", async () => {
    const manifest = await manifestOfUnzipped(TEST_ZIP);

    assert.deepEqual(fileHashes(manifest), TEST_ZIP_FILE_HASHES);
  });

  it("computes the package hash from a manifest", async () => {
    const manifest = await hashUtils.generatePackageManifestFromZip(TEST_ZIP);

    assert.equal(await manifest.computePackageHash(), TEST_ZIP_MANIFEST_HASH);
  });

  it("ignores OS metadata files in an archive", async () => {
    const manifest = await hashUtils.generatePackageManifestFromZip(IGNORED_METADATA_ZIP);

    assert.deepEqual(fileHashes(manifest), IGNORED_METADATA_ZIP_FILE_HASHES);
  });

  it("ignores OS metadata files in a directory", async () => {
    const manifest = await manifestOfUnzipped(IGNORED_METADATA_ZIP);

    assert.deepEqual(fileHashes(manifest), IGNORED_METADATA_ZIP_FILE_HASHES);
  });
});
