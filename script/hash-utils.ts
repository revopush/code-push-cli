// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * NOTE!!! This utility file is duplicated for use by the CodePush service (for server-driven hashing/
 * integrity checks) and Management SDK (for end-to-end code signing), please keep them in sync.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as stream from "stream";

import * as yauzl from "yauzl";

import { listFiles } from "./utils/file-utils";

const HASH_ALGORITHM = "sha256";

export async function generatePackageHashFromDirectory(directoryPath: string, basePath: string): Promise<string> {
  if (!fs.lstatSync(directoryPath).isDirectory()) {
    throw new Error("Not a directory. Please either create a directory, or use hashFile().");
  }

  const manifest: PackageManifest = await generatePackageManifestFromDirectory(directoryPath, basePath);
  return manifest.computePackageHash();
}

export function generatePackageManifestFromZip(filePath: string): Promise<PackageManifest> {
  let zipFile: any;

  return new Promise<PackageManifest>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error?: any, openedZipFile?: any): void => {
      if (error) {
        // This is the first time we try to read the package as a .zip file;
        // however, it may not be a .zip file.  Handle this gracefully.
        resolve(null);
        return;
      }

      zipFile = openedZipFile;
      const fileHashesMap = new Map<string, string>();
      const hashFilePromises: Promise<void>[] = [];

      // Read each entry in the archive sequentially and generate a hash for it.
      zipFile.readEntry();
      zipFile
        .on("error", (error: any): void => {
          reject(error);
        })
        .on("entry", (entry: any): void => {
          const fileName: string = PackageManifest.normalizePath(entry.fileName);
          if (PackageManifest.isIgnored(fileName)) {
            zipFile.readEntry();
            return;
          }

          zipFile.openReadStream(entry, (error?: any, readStream?: stream.Readable): void => {
            if (error) {
              reject(error);
              return;
            }

            hashFilePromises.push(
              hashStream(readStream).then((hash: string) => {
                fileHashesMap.set(fileName, hash);
                zipFile.readEntry();
              }, reject)
            );
          });
        })
        .on("end", (): void => {
          Promise.all(hashFilePromises).then(() => resolve(new PackageManifest(fileHashesMap)), reject);
        });
    });
  }).finally(() => zipFile && zipFile.close());
}

export async function generatePackageManifestFromDirectory(directoryPath: string, basePath: string): Promise<PackageManifest> {
  const files: string[] = await listFiles(directoryPath);
  if (files.length === 0) {
    throw new Error("Can't sign the release because no files were found.");
  }

  // Hash the files sequentially, because streaming them in parallel is not necessarily faster
  const fileHashesMap = new Map<string, string>();
  for (const filePath of files) {
    const relativePath: string = PackageManifest.normalizePath(path.relative(basePath, filePath));
    if (!PackageManifest.isIgnored(relativePath)) {
      fileHashesMap.set(relativePath, await hashFile(filePath));
    }
  }

  return new PackageManifest(fileHashesMap);
}

export function hashFile(filePath: string): Promise<string> {
  const readStream: fs.ReadStream = fs.createReadStream(filePath);
  return hashStream(readStream);
}

export function hashStream(readStream: stream.Readable): Promise<string> {
  const hashStream = <stream.Transform>(<any>crypto.createHash(HASH_ALGORITHM));
  let isSettled = false;

  return new Promise<string>((resolve, reject) => {
    readStream
      .on("error", (error: any): void => {
        if (!isSettled) {
          isSettled = true;
          hashStream.end();
          reject(error);
        }
      })
      .on("end", (): void => {
        if (!isSettled) {
          isSettled = true;
          hashStream.end();

          const buffer = <Buffer>hashStream.read();
          const hash: string = buffer.toString("hex");

          resolve(hash);
        }
      });

    readStream.pipe(hashStream);
  });
}

export class PackageManifest {
  private _map: Map<string, string>;

  public constructor(map?: Map<string, string>) {
    if (!map) {
      map = new Map<string, string>();
    }
    this._map = map;
  }

  public toMap(): Map<string, string> {
    return this._map;
  }

  public async computePackageHash(): Promise<string> {
    let entries: string[] = [];
    this._map.forEach((hash: string, name: string): void => {
      entries.push(name + ":" + hash);
    });

    // Make sure this list is alphabetically ordered so that other clients
    // can also compute this hash easily given the update contents.
    entries = entries.sort();

    return crypto.createHash(HASH_ALGORITHM).update(JSON.stringify(entries)).digest("hex");
  }

  public serialize(): string {
    const obj: any = {};

    this._map.forEach(function (value, key) {
      obj[key] = value;
    });

    return JSON.stringify(obj);
  }

  public static deserialize(serializedContents: string): PackageManifest {
    try {
      const obj: any = JSON.parse(serializedContents);
      const map = new Map<string, string>();

      for (const key of Object.keys(obj)) {
        map.set(key, obj[key]);
      }

      return new PackageManifest(map);
    } catch (e) {}
  }

  public static normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/");
  }

  public static isIgnored(relativeFilePath: string): boolean {
    const __MACOSX = "__MACOSX/";
    const DS_STORE = ".DS_Store";

    return startsWith(relativeFilePath, __MACOSX) || relativeFilePath === DS_STORE || endsWith(relativeFilePath, "/" + DS_STORE);
  }
}

function startsWith(str: string, prefix: string): boolean {
  return str && str.substring(0, prefix.length) === prefix;
}

function endsWith(str: string, suffix: string): boolean {
  return str && str.indexOf(suffix, str.length - suffix.length) !== -1;
}
