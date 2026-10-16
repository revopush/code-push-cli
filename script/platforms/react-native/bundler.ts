import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as chalk from "chalk";

import { log } from "../../ui/terminal";

export const spawn = childProcess.spawn;

export interface BundleOptions {
  platform: string;
  development: boolean;
  outputFolder: string;
  bundleName: string;
  packagerSourceMap: string;
  extraBundlerOptions: string[];
}

export function runReactNativeBundleCommand(
  { platform, development, outputFolder, bundleName, packagerSourceMap, extraBundlerOptions }: BundleOptions,
  entryFile: string,
  isHermes: boolean
): Promise<void> {
  const reactNativePackagePath = getReactNativePackagePath();
  const oldCliPath = path.join(reactNativePackagePath, "local-cli", "cli.js");
  const cliPath = fs.existsSync(oldCliPath) ? oldCliPath : path.join(reactNativePackagePath, "cli.js");

  return runBundler("react-native bundle", [
    cliPath,
    "bundle",
    "--assets-dest",
    outputFolder,
    "--bundle-output",
    path.join(outputFolder, bundleName),
    "--dev",
    String(development),
    "--entry-file",
    entryFile,
    "--platform",
    platform,
    "--reset-cache",
    "--sourcemap-output",
    packagerSourceMap,
    ...getMinifyParams(platform, isHermes),
    ...extraBundlerOptions,
  ]);
}

export function runExpoExportEmbedCommand({
  platform,
  development,
  outputFolder,
  bundleName,
  packagerSourceMap,
  extraBundlerOptions,
}: BundleOptions): Promise<void> {
  return runBundler("expo export:embed", [
    getExpoCliPath(),
    "export:embed",
    "--assets-dest",
    outputFolder,
    "--bundle-output",
    path.join(outputFolder, bundleName),
    "--dev",
    String(development),
    "--platform",
    platform,
    "--minify",
    "false",
    "--reset-cache",
    "--sourcemap-output",
    packagerSourceMap,
    ...extraBundlerOptions,
    process.cwd(),
  ]);
}

// Runs the bundler's script with node; fails unless it exits with code 0
function runBundler(name: string, scriptArgs: string[]): Promise<void> {
  const nodeArgs = [...(process.env.CODE_PUSH_NODE_ARGS?.trim().split(/\s+/).filter(Boolean) ?? []), ...scriptArgs];
  log(chalk.cyan(`Running "${name}" command:\n`));
  const bundlerProcess = spawn("node", nodeArgs);
  log(`node ${nodeArgs.join(" ")}`);

  return new Promise<void>((resolve, reject) => {
    bundlerProcess.stdout.on("data", (data: Buffer) => log(data.toString().trim()));
    bundlerProcess.stderr.on("data", (data: Buffer) => console.error(data.toString().trim()));
    bundlerProcess.on("error", reject);
    bundlerProcess.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`"${name}" command ${signal ? `was stopped by ${signal}` : `exited with code ${exitCode}`}.`));
      }
    });
  });
}

function getMinifyParams(platform: string, isHermes: boolean): string[] {
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

function getExpoCliPath(): string {
  const result = childProcess.spawnSync("node", ["--print", "require.resolve('@expo/cli')"]);
  const cliPath = result.stdout.toString().trim();

  if (result.status === 0 && cliPath) {
    return cliPath;
  }

  throw new Error(
    'Unable to resolve "@expo/cli". Please make sure it is installed in your project (e.g. "npm install --save-dev @expo/cli").'
  );
}

export function getReactNativePackagePath(): string {
  const result = childProcess.spawnSync("node", ["--print", "require.resolve('react-native/package.json')"]);
  return result.status === 0 ? path.dirname(result.stdout.toString().trim()) : path.join("node_modules", "react-native");
}

export function getReactNativeVersion(): string | undefined {
  const packageJson = path.join(getReactNativePackagePath(), "package.json");
  return fs.existsSync(packageJson) ? JSON.parse(fs.readFileSync(packageJson, "utf8")).version : undefined;
}
