// Hermes detection, hermesc lookup and bytecode version checks

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as chalk from "chalk";
import { coerce, gte } from "semver";

import * as cli from "../types/cli";
import { log } from "../command-executor";
import { fileExists } from "./file-utils";
import { getGradleHermesCommand, getGradleHermesEnabled, readGradleProperty } from "./gradle-utils";
import { getReactNativePackagePath, getReactNativeVersion, getXcodeDotEnvValue } from "../react-native-utils";

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
function getIosHermesEnabled(podFile = path.join("ios", "Podfile")): boolean | undefined {
  const iosDir = path.dirname(podFile);
  const xcodeProjects = fs.existsSync(iosDir) ? fs.readdirSync(iosDir).filter((file) => file.endsWith(".xcodeproj")) : [];
  const pbxprojs = xcodeProjects.map((project) => path.join(iosDir, project, "project.pbxproj"));
  const value =
    matchInFiles(pbxprojs, /\bUSE_HERMES = "?(true|false)"?;/) ??
    matchInFiles([podFile], /^[^#\n]*:?hermes_enabled\s*(?:=>|:)\s*(true|false)/m);
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
