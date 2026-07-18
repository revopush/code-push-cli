import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import * as chalk from "chalk";
import { log } from "./command-executor";
import * as os from "os";
import * as Q from "q";
import * as yazl from "yazl";
import * as unzipper from "unzipper";
import { readFile } from "node:fs/promises";
import * as plist from "plist"
import * as bplist from "bplist-parser";

export async function extractMetadataFromAndroid(extractFolder, outputFolder) {
  const assetsFolder = path.join(extractFolder, "assets");
  if (!fs.existsSync(assetsFolder)) {
    throw new Error("Invalid APK structure: assets folder not found.");
  }

  const codepushMetadata = path.join(assetsFolder, "CodePushMetadata");

  let fileHashes: { [key: string]: string } = {};
  if (fs.existsSync(codepushMetadata)) {
    fileHashes = await takeHashesFromMetadata(codepushMetadata);
  } else {
    log(chalk.yellow(`\nWarning: CodepushMetadata file not found in APK. Check used version of SDK\n`));
  }

  // Get index.android.bundle from root of app folder
  const mainJsBundlePath = path.join(assetsFolder, "index.android.bundle");
  if (fs.existsSync(mainJsBundlePath)) {
    // Copy bundle to output folder
    const outputCodePushFolder = path.join(outputFolder, "CodePush");
    fs.mkdirSync(outputCodePushFolder, { recursive: true });
    const outputBundlePath = path.join(outputCodePushFolder, "index.android.bundle");
    fs.copyFileSync(mainJsBundlePath, outputBundlePath);
  } else {
    throw new Error("index.android.bundle not found in APK root folder.");
  }

  // Save packageManifest.json
  const manifestPath = path.join(outputFolder, "packageManifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(fileHashes, null, 2));
  log(chalk.cyan(`\nSaved packageManifest.json with ${Object.keys(fileHashes).length} entries.\n`));

  // Create zip archive with packageManifest.json and bundle file
  const zipPath = path.join(os.tmpdir(), `CodePushBinary-${Date.now()}.zip`);
  await createZipArchive(outputFolder, zipPath, ["packageManifest.json", "CodePush/index.android.bundle"]);

  return zipPath;
}

export async function extractMetadataFromIOS(ipaPath: string, outputFolder: string) {
  const { files, appPrefix } = await openIPA(ipaPath);

  const assetsPrefix = `${appPrefix}assets/`;
  const bundlePath = `${appPrefix}main.jsbundle`;

  const fileHashes: { [key: string]: string } = {};
  let bundleBuffer: Buffer | null = null;

  for (const entry of files) {
    if (entry.type !== "File") continue;

    if (entry.path === bundlePath) {
      bundleBuffer = await entry.buffer();
    } else if (entry.path.startsWith(assetsPrefix)) {
      const relativePath = entry.path.slice(appPrefix.length); // e.g. assets/img/logo.png
      const hash = sha256(await entry.buffer());
      fileHashes[`CodePush/${relativePath}`] = hash;
      log(chalk.gray(`  ${relativePath}:${hash.substring(0, 8)}...\n`));
    }
  }

  if (Object.keys(fileHashes).length === 0) {
    log(chalk.yellow(`\nWarning: CodePush assets folder not found in IPA.\n`));
  }

  if (!bundleBuffer) {
    throw new Error("main.jsbundle not found in IPA app folder.");
  }

  log(chalk.cyan(`\nFound main.jsbundle, calculating hash:\n`));
  fileHashes["CodePush/main.jsbundle"] = sha256(bundleBuffer);

  // Write bundle to output folder (needed for the release package zip)
  const outputCodePushFolder = path.join(outputFolder, "CodePush");
  fs.mkdirSync(outputCodePushFolder, { recursive: true });
  fs.writeFileSync(path.join(outputCodePushFolder, "main.jsbundle"), bundleBuffer);

  // Save packageManifest.json
  const manifestPath = path.join(outputFolder, "packageManifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(fileHashes, null, 2));
  log(chalk.cyan(`\nSaved packageManifest.json with ${Object.keys(fileHashes).length} entries.\n`));

  // Create zip archive with packageManifest.json and bundle file
  const zipPath = path.join(os.tmpdir(), `CodePushBinary-${Date.now()}.zip`);
  await createZipArchive(outputFolder, zipPath, ["packageManifest.json", "CodePush/main.jsbundle"]);

  return zipPath;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Open the IPA via its central directory (the authoritative entry index) instead of
// streaming extraction, which is known to silently drop files. The count check guards
// against a truncated/corrupt archive.
async function openIPA(ipaPath: string): Promise<{ files: any[]; appPrefix: string }> {
  const directory = await unzipper.Open.file(ipaPath);

  if (directory.files.length !== directory.numberOfRecords) {
    throw new Error(
      `Invalid IPA: central directory lists ${directory.numberOfRecords} entries but ${directory.files.length} were read. The file may be corrupt or truncated.`
    );
  }

  const appMatch = directory.files.map((f) => f.path.match(/^(Payload\/[^/]+\.app)\//)).find(Boolean);
  if (!appMatch) {
    throw new Error('Invalid IPA structure: no "Payload/*.app" folder found.');
  }

  return { files: directory.files, appPrefix: `${appMatch[1]}/` };
}


type BinaryHashes = { [p: string]: string };

async function takeHashesFromMetadata(metadataPath: string): Promise<BinaryHashes> {
  const content = await readFile(metadataPath, "utf-8");
  const metadata = JSON.parse(content);
  if (!metadata || !metadata.manifest) {
    throw new Error("Failed to take manifest from metadata file of APK");
  }

  return Object.fromEntries(metadata.manifest.map((item) => item.split(":")));
}

function createZipArchive(sourceFolder: string, zipPath: string, filesToInclude: string[]): Q.Promise<void> {
  return Q.Promise<void>((resolve, reject) => {
    const zipFile = new yazl.ZipFile();
    const writeStream = fs.createWriteStream(zipPath);

    zipFile.outputStream
      .pipe(writeStream)
      .on("error", (error: Error) => {
        reject(error);
      })
      .on("close", () => {
        resolve();
      });

    for (const file of filesToInclude) {
      const filePath = path.join(sourceFolder, file);
      if (fs.existsSync(filePath)) {
        zipFile.addFile(filePath, file);
      }
    }

    zipFile.end();
  });
}

function parsePlistBuffer(buf: Buffer): any {
  if (buf.slice(0, 6).toString("ascii") === "bplist") {
    const arr = bplist.parseBuffer(buf);
    if (!arr?.length) throw new Error("Empty binary plist");
    return arr[0];
  }

  return plist.parse(buf.toString("utf8"));
}

export async function getIosVersion(ipaPath: string) {
  const { files, appPrefix } = await openIPA(ipaPath);

  const plistEntry = files.find((f) => f.path === `${appPrefix}Info.plist`);
  if (!plistEntry) {
    throw new Error("Info.plist not found in IPA app folder.");
  }

  const data = parsePlistBuffer(await plistEntry.buffer());

  log(chalk.cyan(`App Version: ${data.CFBundleShortVersionString}, Build: ${data.CFBundleVersion}\n`));

  return {
    version: data.CFBundleShortVersionString,
    build: data.CFBundleVersion,
  };
}
