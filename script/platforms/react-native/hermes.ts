// Hermes detection, hermesc lookup, bytecode version checks and compilation

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as chalk from "chalk";
import { coerce, gte } from "semver";

import * as cli from "../../types/cli";
import { log } from "../../ui/terminal";
import { downloadBlob, extractArchive, fileExists } from "../../utils/file-utils";
import type AccountManager = require("../../management-sdk");
import { getGradleHermesCommand, getGradleHermesEnabled, readGradleProperty } from "../android/gradle";
import { getXcodeDotEnvValue } from "../ios/xcode";
import { getReactNativePackagePath, getReactNativeVersion } from "./bundler";
import { restoreSourceMapMetadata, SourceMapPaths } from "./source-maps";

const OS_BIN = ({ win32: "win64-bin", darwin: "osx-bin" } as Record<string, string>)[process.platform] ?? "linux64-bin";

function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

export async function isHermesEnabled({ platform, gradleFile, podFile }: cli.NativeProject): Promise<boolean> {
  const enabled = platform === "android" ? await getGradleHermesEnabled(gradleFile) : getIosHermesEnabled(podFile);
  // Hermes is the default engine since React Native 0.70
  return enabled ?? gte(coerce(getReactNativeVersion()) ?? "0.0.0", "0.70.0");
}

// pod install writes USE_HERMES into the Xcode project since RN 0.75; older apps set :hermes_enabled in the Podfile
function getIosHermesEnabled(podFile?: string | null): boolean | undefined {
  // The parser passes null when --podFile isn't given
  const podfilePath: string = podFile || path.join("ios", "Podfile");
  const iosDir = path.dirname(podfilePath);
  const xcodeProjects = fs.existsSync(iosDir) ? fs.readdirSync(iosDir).filter((file) => file.endsWith(".xcodeproj")) : [];
  const pbxprojs = xcodeProjects.map((project) => path.join(iosDir, project, "project.pbxproj"));
  const value =
    matchInFiles(pbxprojs, /\bUSE_HERMES = "?(true|false)"?;/) ??
    matchInFiles([podfilePath], /^[^#\n]*:?hermes_enabled\s*(?:=>|:)\s*(true|false)/m);
  return value === undefined ? undefined : value === "true";
}

function matchInFiles(files: string[], pattern: RegExp): string | undefined {
  for (const file of files) {
    const match = fileExists(file) && pattern.exec(fs.readFileSync(file, "utf8"));
    if (match) return match[1];
  }
  return undefined;
}

/** The hermesc RN's build uses: Gradle plugin PathUtils.detectOSAwareHermesCommand, iOS react-native-xcode.sh */
export async function findHermesc({ platform, gradleFile, podFile }: cli.NativeProject): Promise<string> {
  const configured =
    platform === "ios"
      ? getXcodeDotEnvValue("HERMES_CLI_PATH", podFile)
      : getGradleHermesCommand(gradleFile)?.replace("%OS-BIN%", OS_BIN);
  // Values referencing Xcode variables like $PODS_ROOT can't be resolved here
  if (configured && !configured.includes("$")) return configured;

  // RN <= 0.82 ships sdks/hermesc, 0.83+ hermes-compiler. On 0.82, hermes-compiler is an empty placeholder unless
  // the app opts into Hermes V1 (Android also needs hermesV1Enabled)
  const reactNativePath = getReactNativePackagePath();
  const bundledHermesc = path.join(reactNativePath, "sdks", "hermesc", OS_BIN, exe("hermesc"));
  const hermesCompiler = resolvePackageFile("hermes-compiler", reactNativePath, "hermesc", OS_BIN, exe("hermesc"));
  const preferBundled = platform === "android" && readGradleProperty("hermesV1Enabled", gradleFile) !== "true";

  const candidates = [
    ...(preferBundled ? [bundledHermesc, hermesCompiler] : [hermesCompiler, bundledHermesc]),
    // RN < 0.69: hermes-engine (binary named "hermes" before 0.64) or hermesvm
    resolvePackageFile("hermes-engine", reactNativePath, OS_BIN, exe("hermesc")),
    resolvePackageFile("hermes-engine", reactNativePath, OS_BIN, exe("hermes")),
    resolvePackageFile("hermesvm", reactNativePath, OS_BIN, exe("hermes")),
  ];
  const hermesc = candidates.find((candidate) => candidate && fileExists(candidate));
  if (hermesc) return hermesc;

  const setting = platform === "ios" ? "HERMES_CLI_PATH" : "react.hermesCommand";
  throw new Error(`Unable to find hermesc. Set ${setting} to the path of the hermesc binary.`);
}

// Resolved from react-native, since they may not be hoisted
function resolvePackageFile(packageName: string, reactNativePath: string, ...segments: string[]): string | undefined {
  try {
    const packageJson = require.resolve(`${packageName}/package.json`, { paths: [reactNativePath] });
    return path.join(path.dirname(packageJson), ...segments);
  } catch {
    return undefined;
  }
}

// Hermes bytecode header (BytecodeFileFormat.h): uint64 magic, uint32 version, little-endian
const BYTECODE_MAGIC = BigInt("0x1F1903C103BC1FC6");

function readBytecodeVersion(bytecode: Buffer): number | undefined {
  return bytecode.length >= 12 && bytecode.readBigUInt64LE(0) === BYTECODE_MAGIC ? bytecode.readUInt32LE(8) : undefined;
}

/** Compiles empty input and reads the version from the emitted header */
export function getHermescBytecodeVersion(hermesc: string): number | undefined {
  const result = childProcess.spawnSync(hermesc, ["-emit-binary", "-"], { input: "", timeout: 30000 });
  return result.status === 0 ? readBytecodeVersion(result.stdout) : undefined;
}

/** -base-bytecode fails on another bytecode version; the base only shrinks diffs, so it's safe to skip */
export function isBaseBytecodeCompatible(baseBytecode: string, hermesc: string): boolean {
  const baseVersion = readBytecodeVersion(fs.readFileSync(baseBytecode));
  const hermescVersion = getHermescBytecodeVersion(hermesc);
  if (baseVersion !== undefined && baseVersion === hermescVersion) return true;

  const warning =
    baseVersion === undefined || hermescVersion === undefined
      ? "Unable to compare Hermes bytecode versions, skipping -base-bytecode."
      : `Base release is Hermes bytecode v${baseVersion}, local compiler produces v${hermescVersion}. ` +
        `Skipping -base-bytecode. Binaries on v${baseVersion} can't run this update.`;
  log(chalk.yellow(`\nWarning: ${warning}\n`));
  return false;
}

type BaseRelease = Pick<cli.IReleaseReactCommand, "appName" | "deploymentName" | "appStoreVersion" | "buildNumber">;

export async function takeHermesBaseBytecode(
  sdk: Pick<AccountManager, "getBaseRelease">,
  { appName, deploymentName, appStoreVersion, buildNumber }: BaseRelease,
  baseReleaseTmpFolder: string,
  outputFolder: string,
  bundleName: string
): Promise<string | null> {
  const { bundleBlobUrl } = await sdk.getBaseRelease(appName, deploymentName, appStoreVersion, buildNumber);
  if (!bundleBlobUrl) {
    return null;
  }

  const baseReleaseArchive = await downloadBlob(bundleBlobUrl, baseReleaseTmpFolder);
  await extractArchive(baseReleaseArchive, baseReleaseTmpFolder);
  const baseReleaseBundle = path.join(baseReleaseTmpFolder, path.basename(outputFolder), bundleName);

  if (!fs.existsSync(baseReleaseBundle)) {
    log(chalk.cyan("\nNo base release available...\n"));
    return null;
  }

  return baseReleaseBundle;
}

export async function runHermesEmitBinaryCommand(
  project: cli.NativeProject,
  bundle: string,
  sourceMaps: SourceMapPaths,
  extraHermesFlags: string[],
  baseBytecode: string | null
): Promise<void> {
  const bytecode = bundle + ".hbc";
  const hermesc = await findHermesc(project);

  const hermesArgs = [
    ...(process.env.CODE_PUSH_NODE_ARGS?.trim().split(/\s+/).filter(Boolean) ?? []),
    "-emit-binary",
    "-O",
    "-out",
    bytecode,
    bundle,
    "-w",
    "-max-diagnostic-width=80",
    ...extraHermesFlags,
    "-output-source-map",
  ];
  if (baseBytecode && isBaseBytecodeCompatible(baseBytecode, hermesc)) {
    hermesArgs.push("-base-bytecode", baseBytecode);
  }

  console.log(chalk.cyan("Converting JS bundle to byte code via Hermes, running command:\n"));
  await runCommand("hermes", hermesc, hermesArgs);
  await fs.promises.rename(bytecode, bundle);

  await composeHermesSourceMaps(getComposeSourceMapsScript(project), bytecode + ".map", sourceMaps);
}

function getComposeSourceMapsScript({ platform, podFile }: cli.NativeProject): string {
  // On iOS, react-native-xcode.sh lets COMPOSE_SOURCEMAP_PATH replace RN's script; an empty value is ignored
  const override = platform === "ios" ? getXcodeDotEnvValue("COMPOSE_SOURCEMAP_PATH", podFile) : undefined;
  const script = override || path.join(getReactNativePackagePath(), "scripts", "compose-source-maps.js");
  if (!fs.existsSync(script)) {
    throw new Error(`Source map compose script ${script} is not found`);
  }
  return script;
}

// Packager + Hermes source maps = final source map, as RN's build does
async function composeHermesSourceMaps(composeScript: string, hermesSourceMap: string, sourceMaps: SourceMapPaths): Promise<void> {
  if (!fs.existsSync(hermesSourceMap)) {
    throw new Error(`sourcemap file ${hermesSourceMap} is not found`);
  }

  // Read before composing: on iOS the composed map overwrites the packager map
  const packagerSourceMapJson = JSON.parse(await fs.promises.readFile(sourceMaps.packager, "utf8"));
  await runCommand("compose-source-maps", "node", [composeScript, sourceMaps.packager, hermesSourceMap, "-o", sourceMaps.final]);
  const restoredFields = await restoreSourceMapMetadata(sourceMaps.final, packagerSourceMapJson);
  if (restoredFields.length > 0) {
    console.log(`Restored packager source map metadata: ${restoredFields.join(", ")}`);
  }
  // Not part of the release
  await fs.promises.unlink(hermesSourceMap);
}

function runCommand(name: string, command: string, args: string[]): Promise<void> {
  console.log(`${command} ${args.join(" ")}`);
  const child = childProcess.spawn(command, args);
  child.stdout.on("data", (data: Buffer) => console.log(data.toString().trim()));
  child.stderr.on("data", (data: Buffer) => console.error(data.toString().trim()));

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode: number, signal: string) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`"${name}" command failed (exitCode=${exitCode}, signal=${signal}).`));
      }
    });
  });
}
