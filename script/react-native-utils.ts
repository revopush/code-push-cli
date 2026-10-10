import * as fs from "fs";
import * as chalk from "chalk";
import * as path from "path";
import * as childProcess from "child_process";
import { valid } from "semver";
import { downloadBlob, extractArchive } from "./utils/file-utils";
import { findHermesc, isBaseBytecodeCompatible } from "./utils/hermes-utils";
import * as dotenv from "dotenv";
import * as cli from "./types/cli";
import { log, sdk } from "./command-executor";

export function isValidVersion(version: string): boolean {
  return !!valid(version) || /^\d+\.\d+$/.test(version);
}

export function getBundleSourceMapOutput(
  platform: string,
  bundleName: string,
  sourcemapOutputFolder: string,
  isHermes: boolean
): string {
  switch (platform) {
    case "android": {
      // With Hermes, Metro's map is the "packager" one (BundleHermesCTask)
      return path.join(sourcemapOutputFolder, bundleName + (isHermes ? ".packager.map" : ".map"));
    }
    case "ios": {
      // Same name as react-native-xcode.sh, since it ends up in the bundle's sourceMappingURL
      const sourceMapFile = getXcodeDotEnvValue("SOURCEMAP_FILE");
      return path.join(sourcemapOutputFolder, sourceMapFile ? path.basename(sourceMapFile) : bundleName + ".map");
    }
    default:
      throw new Error('Platform must be either "android" or "ios".');
  }
}

export async function takeHermesBaseBytecode(
  command: cli.IReleaseReactCommand,
  baseReleaseTmpFolder: string,
  outputFolder: string,
  bundleName: string
): Promise<string | null> {
  const { bundleBlobUrl } = await sdk.getBaseRelease(
    command.appName,
    command.deploymentName,
    command.appStoreVersion,
    command.buildNumber
  );
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
  command: cli.IReleaseReactCommand,
  bundleName: string,
  outputFolder: string,
  sourcemapOutputFolder: string,
  extraHermesFlags: string[],
  gradleFile: string,
  baseBytecode?: string
): Promise<void> {
  const bundle = path.join(outputFolder, bundleName);
  const bytecode = bundle + ".hbc";
  const hermesc = await findHermesc(command.platform, gradleFile);

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
  ];
  if (sourcemapOutputFolder) {
    hermesArgs.push("-output-source-map");
  }
  if (baseBytecode && isBaseBytecodeCompatible(baseBytecode, hermesc)) {
    hermesArgs.push("-base-bytecode", baseBytecode);
  }

  console.log(chalk.cyan("Converting JS bundle to byte code via Hermes, running command:\n"));
  await runCommand("hermes", hermesc, hermesArgs);
  await fs.promises.rename(bytecode, bundle);

  if (sourcemapOutputFolder) {
    await composeHermesSourceMaps(command, bundleName, outputFolder, sourcemapOutputFolder);
  }
}

// Packager + Hermes source maps = final source map, as RN's build does
async function composeHermesSourceMaps(
  command: cli.IReleaseReactCommand,
  bundleName: string,
  outputFolder: string,
  sourcemapOutputFolder: string
): Promise<void> {
  const composeSourceMaps = path.join(getReactNativePackagePath(), "scripts", "compose-source-maps.js");
  if (!fs.existsSync(composeSourceMaps)) {
    throw new Error("react-native compose-source-maps.js script is not found");
  }

  const hermesSourceMap = path.join(outputFolder, bundleName + ".hbc.map");
  if (!fs.existsSync(hermesSourceMap)) {
    throw new Error(`sourcemap file ${hermesSourceMap} is not found`);
  }

  let packagerSourceMap = sourcemapOutputFolder;
  let combinedSourceMap = sourcemapOutputFolder;
  if (!sourcemapOutputFolder.endsWith(".map")) {
    packagerSourceMap = getBundleSourceMapOutput(command.platform, bundleName, sourcemapOutputFolder, true);
    combinedSourceMap = command.platform === "android" ? path.join(sourcemapOutputFolder, bundleName + ".map") : packagerSourceMap;
  }

  await runCommand("compose-source-maps", "node", [composeSourceMaps, packagerSourceMap, hermesSourceMap, "-o", combinedSourceMap]);
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

export function getMinifyParams(platform: string, isHermes: boolean): (string | boolean)[] {
  switch (platform) {
    case "android": {
      // The RN Gradle plugin minifies unless Hermes is enabled
      return ["--minify", !isHermes];
    }
    case "ios": {
      // react-native-xcode.sh passes "--minify false" only with Hermes
      return isHermes ? ["--minify", false] : [];
    }
    default:
      throw new Error('Platform must be either "android" or "ios".');
  }
}

export function getReactNativePackagePath(): string {
  const result = childProcess.spawnSync("node", ["--print", "require.resolve('react-native/package.json')"]);
  return result.status === 0 ? path.dirname(result.stdout.toString().trim()) : path.join("node_modules", "react-native");
}

export function getReactNativeVersion(): string {
  try {
    const result = childProcess.spawnSync("node", ["--print", "require('react-native/package.json').version"]);
    return result.stdout.toString().trim();
  } catch (error) {
    throw new Error(
      'Unable to resolve "react-native". Please make sure it is installed in your project (e.g. "npm install react-native").'
    );
  }
}

/** As react-native-xcode.sh sees it: ios/.xcode.env.local, then ios/.xcode.env, then the environment */
export function getXcodeDotEnvValue(key: string): string | undefined {
  for (const envFile of [".xcode.env.local", ".xcode.env"]) {
    const envPath = path.join("ios", envFile);
    const value = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath))[key] : undefined;
    if (value !== undefined) {
      return value;
    }
  }
  return process.env[key];
}
