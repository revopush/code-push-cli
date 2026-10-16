import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yauzl from "yauzl";
import * as yazl from "yazl";
import { pipeline } from "node:stream/promises";

import superagent = require("superagent");

export function isBinaryOrZip(path: string): boolean {
  return path.search(/\.zip$/i) !== -1 || path.search(/\.apk$/i) !== -1 || path.search(/\.ipa$/i) !== -1;
}

export function isDirectory(path: string): boolean {
  return fs.statSync(path).isDirectory();
}

export function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function copyFileToTmpDir(filePath: string): string {
  if (!isDirectory(filePath)) {
    const outputFolderPath: string = fs.mkdtempSync(path.join(os.tmpdir(), "code-push"));

    const outputFilePath: string = path.join(outputFolderPath, path.basename(filePath));
    fs.writeFileSync(outputFilePath, fs.readFileSync(filePath));

    return outputFolderPath;
  }
}

/**
 * Lists the files under a folder, level by level, with paths joined by "/".
 * Symlinks are listed as files, even when they point to a folder.
 */
export async function listFiles(directoryPath: string): Promise<string[]> {
  let files: string[] = [];
  let folders: string[] = [directoryPath];
  while (folders.length > 0) {
    const entries = (await Promise.all(folders.map(readFolder))).flat();
    files = files.concat(entries.filter((entry) => !entry.isFolder).map((entry) => entry.path));
    folders = entries.filter((entry) => entry.isFolder).map((entry) => entry.path);
  }
  return files;
}

async function readFolder(folder: string): Promise<{ path: string; isFolder: boolean }[]> {
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  return entries.map((entry) => ({ path: `${folder}/${entry.name}`, isFolder: entry.isDirectory() }));
}

export function fileDoesNotExistOrIsDirectory(path: string): boolean {
  try {
    return isDirectory(path);
  } catch {
    return true;
  }
}

export function normalizePath(filePath: string): string {
  // Windows paths use backslashes; zip entries need slashes
  return filePath.replace(/\\/g, "/");
}

export async function downloadBlob(url: string, folder: string, filename: string = "blob.zip"): Promise<string> {
  const destination = path.join(folder, filename);
  const writeStream = fs.createWriteStream(destination);

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve(destination));
    writeStream.on("error", reject);

    superagent
      .get(url)
      .ok((res) => res.status < 400)
      .on("error", (err) => {
        writeStream.destroy();
        reject(err);
      })
      .pipe(writeStream);
  });
}

export async function extractArchive(zipPath: string, extractTo: string) {
  const zipFile = await yauzl.openPromise(zipPath);
  for await (const entry of zipFile.eachEntry()) {
    if (entry.fileName.endsWith("/")) continue; // directory entry; parents are created below
    const outPath = path.join(extractTo, entry.fileName);
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    await pipeline(await zipFile.openReadStreamPromise(entry), fs.createWriteStream(outPath));
  }
}

export type ZipEntry = [filePath: string, zipEntryPath: string];

/** Writes a zip with each [file on disk, path inside the zip] entry, in order */
export function createZip(zipPath: string, entries: ZipEntry[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const zipFile = new yazl.ZipFile();
    const writeStream = fs.createWriteStream(zipPath);
    let failure: Error | undefined;
    // Settle only once the zip file is closed, so a caller can delete it
    const fail = (error: Error): void => {
      failure ??= error;
      writeStream.destroy();
    };

    // yazl reports unreadable input files on the ZipFile itself
    zipFile.on("error", fail);
    zipFile.outputStream
      .pipe(writeStream)
      .on("error", fail)
      .on("close", () => (failure ? reject(failure) : resolve()));

    for (const [filePath, zipEntryPath] of entries) {
      zipFile.addFile(filePath, zipEntryPath);
    }

    zipFile.end();
  });
}

/** Zips the files that exist in sourceFolder, keeping their relative paths */
export function createZipArchive(sourceFolder: string, zipPath: string, filesToInclude: string[]): Promise<void> {
  const entries: ZipEntry[] = filesToInclude
    .map((file): ZipEntry => [path.join(sourceFolder, file), file])
    .filter(([filePath]) => fs.existsSync(filePath));
  return createZip(zipPath, entries);
}
