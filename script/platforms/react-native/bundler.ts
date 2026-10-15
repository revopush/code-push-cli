import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as chalk from "chalk";

import { log } from "../../ui/log";
import { getReactNativePackagePath } from "./project";

export const spawn = childProcess.spawn;

export interface BundleOptions {
  platform: string;
  development: boolean;
  outputFolder: string;
  bundleName: string;
  packagerSourceMap: string;
  extraBundlerOptions: string[];
}

export const runReactNativeBundleCommand = async (
  { platform, development, outputFolder, bundleName, packagerSourceMap, extraBundlerOptions }: BundleOptions,
  entryFile: string,
  isHermes: boolean
) => {
  const reactNativeBundleArgs: string[] = [];
  const envNodeArgs: string = process.env.CODE_PUSH_NODE_ARGS;

  if (typeof envNodeArgs !== "undefined") {
    reactNativeBundleArgs.push(...envNodeArgs.trim().split(/\s+/));
  }

  const reactNativePackagePath = getReactNativePackagePath();
  const oldCliPath = path.join(reactNativePackagePath, "local-cli", "cli.js");
  const cliPath = fs.existsSync(oldCliPath) ? oldCliPath : path.join(reactNativePackagePath, "cli.js");

  reactNativeBundleArgs.push(
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
    "--reset-cache"
  );

  reactNativeBundleArgs.push("--sourcemap-output", packagerSourceMap);

  reactNativeBundleArgs.push(...getMinifyParams(platform, isHermes));

  if (extraBundlerOptions.length > 0) {
    reactNativeBundleArgs.push(...extraBundlerOptions);
  }

  log(chalk.cyan('Running "react-native bundle" command:\n'));
  const reactNativeBundleProcess = spawn("node", reactNativeBundleArgs);
  log(`node ${reactNativeBundleArgs.join(" ")}`);

  return new Promise<void>((resolve, reject) => {
    reactNativeBundleProcess.stdout.on("data", (data: Buffer) => {
      log(data.toString().trim());
    });

    reactNativeBundleProcess.stderr.on("data", (data: Buffer) => {
      console.error(data.toString().trim());
    });

    reactNativeBundleProcess.on("close", (exitCode: number) => {
      if (exitCode) {
        reject(new Error(`"react-native bundle" command exited with code ${exitCode}.`));
      }

      resolve();
    });
  });
};

export const runExpoExportEmbedCommand = async ({
  platform,
  development,
  outputFolder,
  bundleName,
  packagerSourceMap,
  extraBundlerOptions,
}: BundleOptions) => {
  const expoBundleArgs: string[] = [];
  const envNodeArgs: string = process.env.CODE_PUSH_NODE_ARGS;

  if (typeof envNodeArgs !== "undefined") {
    expoBundleArgs.push(...envNodeArgs.trim().split(/\s+/));
  }

  const expoCliPath = getExpoCliPath();

  expoBundleArgs.push(
    expoCliPath,
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
    "--reset-cache"
  );

  expoBundleArgs.push("--sourcemap-output", packagerSourceMap);

  if (extraBundlerOptions.length > 0) {
    expoBundleArgs.push(...extraBundlerOptions);
  }

  log(chalk.cyan('Running "expo export:embed" command:\n'));

  const projectRoot = process.cwd();
  expoBundleArgs.push(projectRoot);

  log("expoBundleArgs raw:" + JSON.stringify(expoBundleArgs, null, 2));

  const expoBundleProcess = spawn("node", expoBundleArgs);
  log(`node ${expoBundleArgs.join(" ")}`);

  return new Promise<void>((resolve, reject) => {
    expoBundleProcess.stdout.on("data", (data: Buffer) => {
      log(data.toString().trim());
    });

    expoBundleProcess.stderr.on("data", (data: Buffer) => {
      console.error(data.toString().trim());
    });

    expoBundleProcess.on("close", (exitCode: number) => {
      if (exitCode) {
        reject(new Error(`"expo export:embed" command exited with code ${exitCode}.`));
      }

      resolve();
    });
  });
};

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
