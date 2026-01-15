import * as path from "path";
import * as fs from "fs";
import * as chalk from "chalk";
import { log } from "./command-executor";
import { hashFile } from "./hash-utils";
import * as os from "os";
import * as Q from "q";
import * as yazl from "yazl";
import { readFile } from "node:fs/promises";
import plist from "plist"
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

export async function extractMetadataFromIOS(extractFolder, outputFolder) {
  const payloadFolder = path.join(extractFolder, "Payload");
  if (!fs.existsSync(payloadFolder)) {
    throw new Error("Invalid IPA structure: Payload folder not found.");
  }

  const appFolders = fs.readdirSync(payloadFolder).filter((item) => {
    const itemPath = path.join(payloadFolder, item);
    return fs.statSync(itemPath).isDirectory() && item.endsWith(".app");
  });

  if (appFolders.length === 0) {
    throw new Error("Invalid IPA structure: No .app folder found in Payload.");
  }

  const appFolder = path.join(payloadFolder, appFolders[0]);
  const codePushFolder = path.join(appFolder, "assets");

  const fileHashes: { [key: string]: string } = {};

  if (fs.existsSync(codePushFolder)) {
    await calculateHashesForDirectory(codePushFolder, appFolder, fileHashes);
  } else {
    log(chalk.yellow(`\nWarning: CodePush folder not found in IPA.\n`));
  }

  const mainJsBundlePath = path.join(appFolder, "main.jsbundle");
  if (fs.existsSync(mainJsBundlePath)) {
    log(chalk.cyan(`\nFound main.jsbundle, calculating hash:\n`));
    const bundleHash = await hashFile(mainJsBundlePath);
    fileHashes["CodePush/main.jsbundle"] = bundleHash;

    // Copy bundle to output folder
    const outputCodePushFolder = path.join(outputFolder, "CodePush");
    fs.mkdirSync(outputCodePushFolder, { recursive: true });
    const outputBundlePath = path.join(outputCodePushFolder, "main.jsbundle");
    fs.copyFileSync(mainJsBundlePath, outputBundlePath);
  } else {
    throw new Error("main.jsbundle not found in IPA root folder.");
  }

  // Save packageManifest.json
  const manifestPath = path.join(outputFolder, "packageManifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(fileHashes, null, 2));
  log(chalk.cyan(`\nSaved packageManifest.json with ${Object.keys(fileHashes).length} entries.\n`));

  // Create zip archive with packageManifest.json and bundle file
  const zipPath = path.join(os.tmpdir(), `CodePushBinary-${Date.now()}.zip`);
  await createZipArchive(outputFolder, zipPath, ["packageManifest.json", "CodePush/main.jsbundle"]);

  return zipPath;
}

async function calculateHashesForDirectory(
  directoryPath: string,
  basePath: string,
  fileHashes: { [key: string]: string }
) {
  const items = fs.readdirSync(directoryPath);

  for (const item of items) {
    const itemPath = path.join(directoryPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      await calculateHashesForDirectory(itemPath, basePath, fileHashes);
    } else {
      // Calculate relative path from basePath (app folder) to the file
      const relativePath = path.relative(basePath, itemPath).replace(/\\/g, "/");
      const hash = await hashFile(itemPath);
      const hashKey = `CodePush/${relativePath}`
      fileHashes[hashKey] = hash;
      log(chalk.gray(`  ${relativePath}:${hash.substring(0, 8)}...\n`));
    }
  }
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

function parseAnyPlistFile(plistPath: string): any {
  const buf = fs.readFileSync(plistPath);

  if (buf.slice(0, 6).toString("ascii") === "bplist") {
    const arr = bplist.parseBuffer(buf);
    if (!arr?.length) throw new Error("Empty binary plist");
    return arr[0];
  }

  const xml = buf.toString("utf8");
  return plist.parse(xml);
}

export async function getIosVersion(extractFolder: string) {
  const payloadFolder = path.join(extractFolder, "Payload");
  if (!fs.existsSync(payloadFolder)) {
    throw new Error("Invalid IPA structure: Payload folder not found.");
  }

  const appFolders = fs.readdirSync(payloadFolder).filter((item) => {
    const itemPath = path.join(payloadFolder, item);
    return fs.statSync(itemPath).isDirectory() && item.endsWith(".app");
  });

  if (appFolders.length === 0) {
    throw new Error("Invalid IPA structure: No .app folder found in Payload.");
  }

  const appFolder = path.join(payloadFolder, appFolders[0]);

  const plistPath = path.join(appFolder, "Info.plist");

  const data = parseAnyPlistFile(plistPath);

  console.log('App Version (Short):', data.CFBundleShortVersionString);
  console.log('Build Number:', data.CFBundleVersion);
  console.log('Bundle ID:', data.CFBundleIdentifier);

  return {
    version: data.CFBundleShortVersionString,
    build: data.CFBundleVersion
  };
}
