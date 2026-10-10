// Whether Hermes is enabled, which hermesc React Native's own build uses, and its bytecode version.

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as chalk from "chalk";
import { coerce, gte } from "semver";

import * as cli from "../types/cli";
import { log } from "../command-executor";
import { fileDoesNotExistOrIsDirectory, fileExists } from "./file-utils";
import { getGradleHermesCommand, getGradleHermesEnabled, readGradleProperty } from "./gradle-utils";
import { getReactNativePackagePath, getReactNativeVersion, getXcodeDotEnvValue } from "./react-native-project-utils";

const OS_BIN = ({ win32: "win64-bin", darwin: "osx-bin" } as Record<string, string>)[process.platform] ?? "linux64-bin";

function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

export async function isHermesEnabled(command: cli.IReleaseReactCommand, platform = command.platform.toLowerCase()): Promise<boolean> {
  if (command.useHermes) return true;
  if (platform === "android") return (await getGradleHermesEnabled(command.gradleFile)) ?? isHermesDefaultEngine();
  if (platform === "ios") {
    return getXcodeProjectHermesEnabled(command.podFile) ?? getPodfileHermesEnabled(command.podFile) ?? isHermesDefaultEngine();
  }
  return false;
}

// Hermes is the default engine since React Native 0.70
function isHermesDefaultEngine(): boolean {
  const reactNativeVersion = coerce(getReactNativeVersion());
  return !!reactNativeVersion && gte(reactNativeVersion, "0.70.0");
}

// pod install writes the USE_HERMES build setting that react-native-xcode.sh checks into the app's Xcode project
function getXcodeProjectHermesEnabled(podFile?: string): boolean | undefined {
  const iosDir = path.dirname(podFile || path.join("ios", "Podfile"));
  const projects = fs.existsSync(iosDir) ? fs.readdirSync(iosDir).filter((file) => file.endsWith(".xcodeproj")) : [];
  for (const project of projects) {
    const pbxproj = path.join(iosDir, project, "project.pbxproj");
    const match = fileExists(pbxproj) && /\bUSE_HERMES = "?(true|false)"?;/.exec(fs.readFileSync(pbxproj, "utf8"));
    if (match) return match[1] === "true";
  }
  return undefined;
}

// `:hermes_enabled => true/false` in the Podfile; undefined if unset
function getPodfileHermesEnabled(podFile?: string): boolean | undefined {
  const podfilePath = podFile || path.join("ios", "Podfile");
  if (fileDoesNotExistOrIsDirectory(podfilePath)) {
    if (podFile) throw new Error(`Unable to find Podfile file "${podfilePath}".`);
    return undefined;
  }
  const match = /^[^#\n]*:?hermes_enabled\s*(?:=>|:)\s*(true|false)/m.exec(fs.readFileSync(podfilePath, "utf8"));
  return match ? match[1] === "true" : undefined;
}

/**
 * Finds the hermesc React Native's own build uses, in the same order:
 * Android: gradle-plugin PathUtils.detectOSAwareHermesCommand; iOS: scripts/react-native-xcode.sh.
 */
export async function findHermesc(platform: string, gradleFile?: string, podFile?: string): Promise<string> {
  const configured = platform === "ios" ? getConfiguredIosHermesc(podFile) : await getConfiguredAndroidHermesc(gradleFile);
  if (configured) return configured;

  const reactNativePath = getReactNativePackagePath();
  // RN <= 0.82 ships sdks/hermesc, RN 0.83+ only hermes-compiler. RN 0.82's hermes-compiler is an empty placeholder
  // unless the app opts into Hermes V1, which Android also has to enable with hermesV1Enabled.
  const bundledHermesc = path.join(reactNativePath, "sdks", "hermesc", OS_BIN, exe("hermesc"));
  const hermesCompiler = resolvePackageFile("hermes-compiler", reactNativePath, "hermesc", OS_BIN, exe("hermesc"));
  const preferBundled = platform === "android" && readGradleProperty("hermesV1Enabled", gradleFile) !== "true";
  const packagedHermesc = preferBundled ? [bundledHermesc, hermesCompiler] : [hermesCompiler, bundledHermesc];

  const candidates = [
    platform === "ios" ? getCocoaPodsHermesc(podFile) : getSourceBuiltAndroidHermesc(reactNativePath),
    ...packagedHermesc,
    // RN < 0.69 shipped hermesc in the hermes-engine package (named "hermes" before RN 0.64) or in hermesvm
    resolvePackageFile("hermes-engine", reactNativePath, OS_BIN, exe("hermesc")),
    resolvePackageFile("hermes-engine", reactNativePath, OS_BIN, exe("hermes")),
    resolvePackageFile("hermesvm", reactNativePath, OS_BIN, exe("hermes")),
  ];

  const hermesc = candidates.find((candidate) => candidate && fileExists(candidate));
  if (hermesc) return hermesc;

  const setting = platform === "ios" ? "HERMES_CLI_PATH" : "react.hermesCommand";
  throw new Error(`Unable to find hermesc. Set ${setting} to the path of the hermesc binary.`);
}

async function getConfiguredAndroidHermesc(gradleFile?: string): Promise<string | undefined> {
  try {
    return (await getGradleHermesCommand(gradleFile))?.replace("%OS-BIN%", OS_BIN);
  } catch (error) {
    log(chalk.yellow(`\nWarning: Unable to read hermesCommand from Gradle, using the default hermesc. ${error.message}\n`));
    return undefined;
  }
}

// react-native-xcode.sh gets HERMES_CLI_PATH from .xcode.env(.local), the environment, or the Pods xcconfig,
// where the hermes-engine pod writes it at pod install. Values may reference $PODS_ROOT or other variables.
function getConfiguredIosHermesc(podFile?: string): string | undefined {
  const hermesCliPath = getXcodeDotEnvValue("HERMES_CLI_PATH") ?? getPodsXcconfigValue("HERMES_CLI_PATH", podFile);
  const variables: Record<string, string | undefined> = { PODS_ROOT: getPodsDir(podFile), ...process.env };
  const expanded = hermesCliPath?.replace(
    /\$(?:\{(\w+)\}|\((\w+)\)|(\w+))/g,
    (match, braced, parenthesized, bare) => variables[braced ?? parenthesized ?? bare] ?? match
  );
  if (expanded?.includes("$")) {
    log(chalk.yellow(`\nWarning: Unable to resolve HERMES_CLI_PATH "${hermesCliPath}", using the default hermesc.\n`));
    return undefined;
  }
  return expanded;
}

function getPodsXcconfigValue(key: string, podFile?: string): string | undefined {
  const supportFilesDir = path.join(getPodsDir(podFile), "Target Support Files");
  const targetDirs = fs.existsSync(supportFilesDir) ? fs.readdirSync(supportFilesDir).filter((dir) => dir.startsWith("Pods-")) : [];
  for (const targetDir of targetDirs) {
    const xcconfigs = fs.readdirSync(path.join(supportFilesDir, targetDir)).filter((file) => file.endsWith(".xcconfig"));
    for (const xcconfig of xcconfigs) {
      const contents = fs.readFileSync(path.join(supportFilesDir, targetDir, xcconfig), "utf8");
      const value = new RegExp(`^${key}\\s*=\\s*(.+)$`, "m").exec(contents)?.[1].trim();
      if (value) return value;
    }
  }
  return undefined;
}

function getPodsDir(podFile?: string): string {
  return path.join(path.dirname(podFile || path.join("ios", "Podfile")), "Pods");
}

function getCocoaPodsHermesc(podFile?: string): string {
  return path.join(getPodsDir(podFile), "hermes-engine", "destroot", "bin", "hermesc");
}

function getSourceBuiltAndroidHermesc(reactNativePath: string): string {
  const overrideHermesDir = process.env.REACT_NATIVE_OVERRIDE_HERMES_DIR;
  return overrideHermesDir
    ? path.join(overrideHermesDir, "build", "bin", exe("hermesc"))
    : path.join(reactNativePath, "ReactAndroid", "hermes-engine", "build", "hermes", "bin", exe("hermesc"));
}

// Resolved from react-native, as they may not be hoisted
function resolvePackageFile(packageName: string, reactNativePath: string, ...segments: string[]): string | undefined {
  try {
    const packageJson = require.resolve(`${packageName}/package.json`, { paths: [reactNativePath] });
    return path.join(path.dirname(packageJson), ...segments);
  } catch {
    return undefined;
  }
}

// Hermes bytecode header (BytecodeFileFormat.h): uint64 magic, uint32 version, little-endian; stable since Hermes v0.1
const BYTECODE_MAGIC = BigInt("0x1F1903C103BC1FC6");
const BYTECODE_HEADER_SIZE = 12;

function readBytecodeVersion(bytecode: Buffer): number | undefined {
  const isHermesBytecode = bytecode.length >= BYTECODE_HEADER_SIZE && bytecode.readBigUInt64LE(0) === BYTECODE_MAGIC;
  return isHermesBytecode ? bytecode.readUInt32LE(8) : undefined;
}

function readFileHeader(file: string, size: number): Buffer {
  const header = Buffer.alloc(size);
  const fd = fs.openSync(file, "r");
  try {
    const bytesRead = fs.readSync(fd, header, 0, size, 0);
    return header.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

/** Compiles an empty input to stdout and reads the bytecode version from the emitted header. */
export function getHermescBytecodeVersion(hermesc: string): number | undefined {
  const result = childProcess.spawnSync(hermesc, ["-emit-binary", "-"], { input: "", timeout: 30000 });
  return result.status === 0 ? readBytecodeVersion(result.stdout) : undefined;
}

/** hermesc -base-bytecode aborts on a base of another bytecode version. The base only optimizes diffs, so it can be skipped. */
export function isBaseBytecodeCompatible(baseBytecode: string, hermesc: string): boolean {
  const baseVersion = readBytecodeVersion(readFileHeader(baseBytecode, BYTECODE_HEADER_SIZE));
  if (baseVersion === undefined) {
    log(chalk.yellow("\nBase release bundle is not Hermes bytecode, skipping -base-bytecode.\n"));
    return false;
  }

  const hermescVersion = getHermescBytecodeVersion(hermesc);
  if (hermescVersion === undefined) {
    log(chalk.yellow("\nCould not detect the Hermes compiler bytecode version, skipping -base-bytecode.\n"));
    return false;
  }

  if (baseVersion !== hermescVersion) {
    log(
      chalk.yellow(
        `\nWarning: base release is Hermes bytecode v${baseVersion}, local compiler produces v${hermescVersion}. ` +
          `Skipping -base-bytecode. Binaries on v${baseVersion} can't run this update.\n`
      )
    );
    return false;
  }
  return true;
}
