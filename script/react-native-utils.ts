import * as fs from "fs";
import * as chalk from "chalk";
import * as path from "path";
import * as childProcess from "child_process";
import { valid } from "semver";
import { downloadBlob, extractArchive } from "./utils/file-utils";
import { findHermesc, isBaseBytecodeCompatible } from "./utils/hermes-utils";
import { restoreSourceMapMetadata } from "./utils/source-map-utils";
import * as dotenv from "dotenv";
import * as cli from "./types/cli";
import { log } from "./ui/log";
import type AccountManager = require("./management-sdk");

export function isValidVersion(version: string): boolean {
  return !!valid(version) || /^\d+\.\d+$/.test(version);
}

export interface SourceMapPaths {
  /** Written by Metro */
  packager: string;
  /** Released; differs from the packager map only for Hermes on Android */
  final: string;
}

/** sourcemapOutput is a folder or the .map file itself; file names match RN's builds */
export function getSourceMapPaths(
  { platform, podFile }: cli.NativeProject,
  bundleName: string,
  sourcemapOutput: string,
  isHermes: boolean
): SourceMapPaths {
  if (sourcemapOutput.endsWith(".map")) {
    return { packager: sourcemapOutput, final: sourcemapOutput };
  }
  if (platform === "android") {
    const final = path.join(sourcemapOutput, bundleName + ".map");
    // With Hermes, Metro's map is the "packager" one (BundleHermesCTask)
    const packager = isHermes ? path.join(sourcemapOutput, bundleName + ".packager.map") : final;
    return { packager, final };
  }
  // Same name as react-native-xcode.sh, since it ends up in the bundle's sourceMappingURL
  const sourceMapFile = getXcodeDotEnvValue("SOURCEMAP_FILE", podFile);
  const sourceMap = path.join(sourcemapOutput, sourceMapFile ? path.basename(sourceMapFile) : bundleName + ".map");
  return { packager: sourceMap, final: sourceMap };
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

export function getMinifyParams(platform: string, isHermes: boolean): string[] {
  switch (platform) {
    case "android": {
      // The RN Gradle plugin minifies unless Hermes is enabled
      return ["--minify", String(!isHermes)];
    }
    case "ios": {
      // react-native-xcode.sh passes "--minify false" only with Hermes
      return isHermes ? ["--minify", "false"] : [];
    }
    default:
      throw new Error('Platform must be either "android" or "ios".');
  }
}

export function getReactNativePackagePath(): string {
  const result = childProcess.spawnSync("node", ["--print", "require.resolve('react-native/package.json')"]);
  return result.status === 0 ? path.dirname(result.stdout.toString().trim()) : path.join("node_modules", "react-native");
}

export function getReactNativeVersion(): string | undefined {
  const packageJson = path.join(getReactNativePackagePath(), "package.json");
  return fs.existsSync(packageJson) ? JSON.parse(fs.readFileSync(packageJson, "utf8")).version : undefined;
}

/**
 * As react-native-xcode.sh sees it: .xcode.env.local, then .xcode.env, then the environment.
 * The files sit next to the Podfile: --podFile, else PODFILE_DIR (set in Xcode builds), else ios/
 */
export function getXcodeDotEnvValue(key: string, podFile?: string): string | undefined {
  const podfileDir = podFile ? path.dirname(podFile) : process.env.PODFILE_DIR || "ios";
  for (const envFile of [".xcode.env.local", ".xcode.env"]) {
    const envPath = path.join(podfileDir, envFile);
    const value = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath))[key] : undefined;
    if (value !== undefined) {
      return value;
    }
  }
  return process.env[key];
}
