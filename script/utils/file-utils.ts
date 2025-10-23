import * as fs from "fs";
import * as path from "path";
import * as rimraf from "rimraf";
import * as temp from "temp";
import * as unzipper from "unzipper";

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
  } catch (e) {
    return false;
  }
}

export function copyFileToTmpDir(filePath: string): string {
  if (!isDirectory(filePath)) {
    const outputFolderPath: string = temp.mkdirSync("code-push");
    rimraf.sync(outputFolderPath);
    fs.mkdirSync(outputFolderPath);

    const outputFilePath: string = path.join(outputFolderPath, path.basename(filePath));
    fs.writeFileSync(outputFilePath, fs.readFileSync(filePath));

    return outputFolderPath;
  }
}

export function fileDoesNotExistOrIsDirectory(path: string): boolean {
  try {
    return isDirectory(path);
  } catch (error) {
    return true;
  }
}

export function normalizePath(filePath: string): string {
  //replace all backslashes coming from cli running on windows machines by slashes
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

export async function extract(zipPath: string, extractTo: string) {
  const extractStream = unzipper.Extract({ path: extractTo });
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath).pipe(extractStream).on("close", resolve).on("error", reject);
  });
}
