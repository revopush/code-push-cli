import * as fs from "fs";
import { readFile } from "node:fs/promises";
import { buffer as readStreamToBuffer } from "node:stream/consumers";
import * as os from "os";
import * as path from "path";
import * as chalk from "chalk";
import * as protobuf from "protobufjs";
import * as yauzl from "yauzl";

import { log } from "../../ui/terminal";
import { createZipArchive } from "../../utils/file-utils";

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

  const mainJsBundlePath = path.join(assetsFolder, "index.android.bundle");
  if (fs.existsSync(mainJsBundlePath)) {
    const outputCodePushFolder = path.join(outputFolder, "CodePush");
    fs.mkdirSync(outputCodePushFolder, { recursive: true });
    const outputBundlePath = path.join(outputCodePushFolder, "index.android.bundle");
    fs.copyFileSync(mainJsBundlePath, outputBundlePath);
  } else {
    throw new Error("index.android.bundle not found in APK root folder.");
  }

  const manifestPath = path.join(outputFolder, "packageManifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(fileHashes, null, 2));
  log(chalk.cyan(`\nSaved packageManifest.json with ${Object.keys(fileHashes).length} entries.\n`));

  const zipPath = path.join(os.tmpdir(), `CodePushBinary-${Date.now()}.zip`);
  await createZipArchive(outputFolder, zipPath, ["packageManifest.json", "CodePush/index.android.bundle"]);

  return zipPath;
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

// Minimal .aab manifest reader; replaces the unmaintained aab-parser, which
// pinned a vulnerable protobufjs (^6.11.2).

export type AabManifest = {
  versionCode: number;
  versionName: string;
  packageName: string;
  compiledSdkVersion: number;
  compiledSdkVersionCodename: number;
};

type ManifestAttribute = { name: string; value: string };

const AAB_MANIFEST_ENTRY_NAME = "base/manifest/AndroidManifest.xml";

// An AAB's <manifest> is protobuf-encoded as an aapt.pb.XmlNode. We only read a
// few attributes, so we declare just that slice (field numbers from AOSP
// aapt2/Resources.proto); the decoder skips every field we omit.
const XmlNode = protobuf
  .parse(
    `
    syntax = "proto3";
    package aapt.pb;
    message XmlAttribute { string name = 2; string value = 3; }
    message XmlElement { string name = 3; repeated XmlAttribute attribute = 4; }
    message XmlNode { XmlElement element = 1; }
`
  )
  .root.lookupType("aapt.pb.XmlNode");

async function readManifestAttributes(file: string | Buffer): Promise<ManifestAttribute[]> {
  const zipFile = typeof file === "string" ? await yauzl.openPromise(file) : await yauzl.fromBufferPromise(file);

  let manifest: Buffer | undefined;
  for await (const entry of zipFile.eachEntry()) {
    if (entry.fileName !== AAB_MANIFEST_ENTRY_NAME) continue;
    manifest = await readStreamToBuffer(await zipFile.openReadStreamPromise(entry));
    break; // breaking out of eachEntry() closes the zip file for us
  }

  if (manifest === undefined) {
    throw new Error("Could not find AndroidManifest.xml file inside the app bundle file");
  }

  const decoded = XmlNode.decode(manifest).toJSON() as { element?: { attribute?: ManifestAttribute[] } };
  return decoded.element?.attribute ?? [];
}

export async function parseAabManifest(file: string | Buffer): Promise<AabManifest> {
  const attributes = await readManifestAttributes(file);

  function getAttribute(name: string): string {
    const attribute = attributes.find((attr) => attr.name === name);
    if (attribute === undefined) {
      throw new Error(`Attribute "${name}" not found in AndroidManifest.xml`);
    }
    return attribute.value;
  }

  return {
    versionCode: Number(getAttribute("versionCode")),
    versionName: getAttribute("versionName"),
    packageName: getAttribute("package"),
    compiledSdkVersion: Number(getAttribute("compileSdkVersion")),
    compiledSdkVersionCodename: Number(getAttribute("compileSdkVersionCodename")),
  };
}
