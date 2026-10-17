// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import debugCommand from "./commands/debug";
import * as fs from "fs";
import * as chalk from "chalk";
import * as os from "os";
import * as path from "path";
import * as cli from "../script/types/cli";
import sign from "./utils/sign";
const ApkReader = require("@devicefarmer/adbkit-apkreader");
import {
  AccessKey,
  Account,
  App,
  CodePushError,
  CollaboratorMap,
  Deployment,
  DeploymentMetrics,
  Package,
  PackageInfo,
  PackageWithMetrics,
  Session,
} from "./types";
import { extractMetadataFromAndroid, parseAabManifest } from "./platforms/android/binary";
import { getAndroidVersionInfo } from "./platforms/android/gradle";
import { extractMetadataFromIOS, getIosVersion } from "./platforms/ios/binary";
import { getIosVersionInfo } from "./platforms/ios/xcode";
import { BundleOptions, runExpoExportEmbedCommand, runReactNativeBundleCommand } from "./platforms/react-native/bundler";
import { isHermesEnabled, runHermesEmitBinaryCommand, takeHermesBaseBytecode } from "./platforms/react-native/hermes";
import { getSourceMapPaths, SourceMapPaths } from "./platforms/react-native/source-maps";
import { fileDoesNotExistOrIsDirectory, fileExists, isBinaryOrZip, extractArchive } from "./utils/file-utils";
import {
  isCommandOptionSpecified,
  throwForInvalidEmail,
  throwForInvalidOutputFormat,
  throwForInvalidSemverRange,
} from "./utils/validation-utils";
import {
  analyzeReleaseContents,
  enforceAssetSizeLimit,
  formatReleaseSizeWarnings,
  formatSourceMapWarning,
  ReleaseSizeAnalysis,
  shouldAnalyzeReleaseSizes,
} from "./utils/release-size-utils";

import AccountManager = require("./management-sdk");
import { ReactNativePackageInfo } from "./types/rest-definitions";
import {
  deleteConnectionInfoCache,
  deserializeConnectionInfo,
  getSdk,
  ILoginConnectionInfo,
  serializeConnectionInfo,
} from "./auth/connection";
import { confirm, createUploadProgress, log, requestAccessKey } from "./ui/terminal";
import {
  printAccessKeys,
  printAppList,
  printCollaboratorsList,
  printDeploymentHistory,
  printDeploymentList,
  printSessions,
} from "./ui/printers";

const opener = require("opener");

export let sdk: AccountManager;

let connectionInfo: ILoginConnectionInfo;

async function accessKeyAdd(command: cli.IAccessKeyAddCommand): Promise<void> {
  const accessKey: AccessKey = await sdk.addAccessKey(command.name, command.ttl);
  log(`Successfully created the "${command.name}" access key: ${accessKey.key}`);
  log("Make sure to save this key value somewhere safe, since you won't be able to view it from the CLI again!");
}

async function accessKeyPatch(command: cli.IAccessKeyPatchCommand): Promise<void> {
  const willUpdateName: boolean = isCommandOptionSpecified(command.newName) && command.oldName !== command.newName;
  const willUpdateTtl: boolean = isCommandOptionSpecified(command.ttl);

  if (!willUpdateName && !willUpdateTtl) {
    throw new Error("A new name and/or TTL must be provided.");
  }

  const accessKey: AccessKey = await sdk.patchAccessKey(command.oldName, command.newName, command.ttl);
  let logMessage: string = "Successfully ";
  if (willUpdateName) {
    logMessage += `renamed the access key "${command.oldName}" to "${command.newName}"`;
  }

  if (willUpdateTtl) {
    const expirationDate = new Date(accessKey.expires).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
    if (willUpdateName) {
      logMessage += ` and changed its expiration date to ${expirationDate}`;
    } else {
      logMessage += `changed the expiration date of the "${command.oldName}" access key to ${expirationDate}`;
    }
  }

  log(`${logMessage}.`);
}

async function accessKeyList(command: cli.IAccessKeyListCommand): Promise<void> {
  throwForInvalidOutputFormat(command.format);

  const accessKeys: AccessKey[] = await sdk.getAccessKeys();
  printAccessKeys(command.format, accessKeys);
}

async function accessKeyRemove(command: cli.IAccessKeyRemoveCommand): Promise<void> {
  if (await confirm()) {
    await sdk.removeAccessKey(command.accessKey);
    log(`Successfully removed the "${command.accessKey}" access key.`);
    return;
  }

  log("Access key removal cancelled.");
}

async function appAdd(command: cli.IAppAddCommand): Promise<void> {
  const app: App = await sdk.addApp(command.appName);
  log('Successfully added the "' + command.appName + '" app, along with the following default deployments:');
  const deploymentListCommand: cli.IDeploymentListCommand = {
    type: cli.CommandType.deploymentList,
    appName: app.name,
    format: "table",
    displayKeys: true,
  };
  await deploymentList(deploymentListCommand, /*showPackage=*/ false);
}

async function appList(command: cli.IAppListCommand): Promise<void> {
  throwForInvalidOutputFormat(command.format);
  const retrievedApps: App[] = await sdk.getApps();
  printAppList(command.format, retrievedApps);
}

async function appRemove(command: cli.IAppRemoveCommand): Promise<void> {
  if (await confirm("Are you sure you want to remove this app? Note that its deployment keys will be PERMANENTLY unrecoverable.")) {
    await sdk.removeApp(command.appName);
    log('Successfully removed the "' + command.appName + '" app.');
    return;
  }

  log("App removal cancelled.");
}

async function appRename(command: cli.IAppRenameCommand): Promise<void> {
  await sdk.renameApp(command.currentAppName, command.newAppName);
  log('Successfully renamed the "' + command.currentAppName + '" app to "' + command.newAppName + '".');
}

async function appTransfer(command: cli.IAppTransferCommand): Promise<void> {
  throwForInvalidEmail(command.email);

  if (await confirm()) {
    await sdk.transferApp(command.appName, command.email);
    log('Successfully transferred the ownership of app "' + command.appName + '" to the account with email "' + command.email + '".');
    return;
  }

  log("App transfer cancelled.");
}

async function addCollaborator(command: cli.ICollaboratorAddCommand): Promise<void> {
  throwForInvalidEmail(command.email);

  await sdk.addCollaborator(command.appName, command.email);
  log('Successfully added "' + command.email + '" as a collaborator to the app "' + command.appName + '".');
}

async function listCollaborators(command: cli.ICollaboratorListCommand): Promise<void> {
  throwForInvalidOutputFormat(command.format);

  const retrievedCollaborators: CollaboratorMap = await sdk.getCollaborators(command.appName);
  printCollaboratorsList(command.format, retrievedCollaborators);
}

async function removeCollaborator(command: cli.ICollaboratorRemoveCommand): Promise<void> {
  throwForInvalidEmail(command.email);

  if (await confirm()) {
    await sdk.removeCollaborator(command.appName, command.email);
    log('Successfully removed "' + command.email + '" as a collaborator from the app "' + command.appName + '".');
    return;
  }

  log("App collaborator removal cancelled.");
}

async function deploymentAdd(command: cli.IDeploymentAddCommand): Promise<void> {
  const deployment: Deployment = await sdk.addDeployment(command.appName, command.deploymentName, command.key);
  log(
    'Successfully added the "' +
      command.deploymentName +
      '" deployment with key "' +
      deployment.key +
      '" to the "' +
      command.appName +
      '" app.'
  );
}

async function deploymentHistoryClear(command: cli.IDeploymentHistoryClearCommand): Promise<void> {
  if (await confirm()) {
    await sdk.clearDeploymentHistory(command.appName, command.deploymentName);
    log(
      'Successfully cleared the release history associated with the "' +
        command.deploymentName +
        '" deployment from the "' +
        command.appName +
        '" app.'
    );
    return;
  }

  log("Clear deployment cancelled.");
}

function getTotalActiveFromDeploymentMetrics(metrics: DeploymentMetrics): number {
  let totalActive = 0;
  Object.keys(metrics).forEach((label: string) => {
    totalActive += metrics[label].active;
  });

  return totalActive;
}

export const deploymentList = async (command: cli.IDeploymentListCommand, showPackage: boolean = true): Promise<void> => {
  throwForInvalidOutputFormat(command.format);
  const DEPLOYMENTS_MAX_LENGTH = 10; // Metrics are skipped for apps with more deployments

  const deployments: Deployment[] = await sdk.getDeployments(command.appName);
  if (showPackage && deployments.length < DEPLOYMENTS_MAX_LENGTH) {
    await Promise.all(
      deployments.map(async (deployment: Deployment): Promise<void> => {
        if (!deployment.package) {
          return;
        }

        const metrics: DeploymentMetrics = await sdk.getDeploymentMetrics(command.appName, deployment.name);
        if (metrics[deployment.package.label]) {
          const totalActive: number = getTotalActiveFromDeploymentMetrics(metrics);
          (deployment.package as PackageWithMetrics).metrics = {
            active: metrics[deployment.package.label].active,
            downloaded: metrics[deployment.package.label].downloaded,
            failed: metrics[deployment.package.label].failed,
            installed: metrics[deployment.package.label].installed,
            totalActive: totalActive,
          };
        }
      })
    );
  }

  printDeploymentList(command, deployments, showPackage);
};

async function deploymentRemove(command: cli.IDeploymentRemoveCommand): Promise<void> {
  const wasConfirmed: boolean =
    command.isForce ||
    (await confirm(
      "Are you sure you want to remove this deployment? Note that its deployment key will be PERMANENTLY unrecoverable."
    ));

  if (wasConfirmed) {
    await sdk.removeDeployment(command.appName, command.deploymentName);
    log('Successfully removed the "' + command.deploymentName + '" deployment from the "' + command.appName + '" app.');
    return;
  }

  log("Deployment removal cancelled.");
}

async function deploymentRename(command: cli.IDeploymentRenameCommand): Promise<void> {
  await sdk.renameDeployment(command.appName, command.currentDeploymentName, command.newDeploymentName);
  log(
    'Successfully renamed the "' +
      command.currentDeploymentName +
      '" deployment to "' +
      command.newDeploymentName +
      '" for the "' +
      command.appName +
      '" app.'
  );
}

async function deploymentHistory(command: cli.IDeploymentHistoryCommand): Promise<void> {
  throwForInvalidOutputFormat(command.format);

  const [account, deploymentHistory, metrics] = await Promise.all([
    sdk.getAccountInfo(),
    sdk.getDeploymentHistory(command.appName, command.deploymentName),
    sdk.getDeploymentMetrics(command.appName, command.deploymentName),
  ]);
  const totalActive: number = getTotalActiveFromDeploymentMetrics(metrics);
  deploymentHistory.forEach((packageObject: Package) => {
    if (metrics[packageObject.label]) {
      (packageObject as PackageWithMetrics).metrics = {
        active: metrics[packageObject.label].active,
        downloaded: metrics[packageObject.label].downloaded,
        failed: metrics[packageObject.label].failed,
        installed: metrics[packageObject.label].installed,
        totalActive: totalActive,
      };
    }
  });
  printDeploymentHistory(command, deploymentHistory as Package[], account.email);
}

export async function execute(command: cli.ICommand): Promise<void> {
  connectionInfo = deserializeConnectionInfo();

  switch (command.type) {
    // Must not be logged in
    case cli.CommandType.login:
    case cli.CommandType.register:
      if (connectionInfo) {
        throw new Error("You are already logged in from this machine.");
      }
      break;

    // It does not matter whether you are logged in or not
    case cli.CommandType.link:
      break;

    // Must be logged in
    default:
      if (!!sdk) break; // Used by unit tests to skip authentication

      if (!connectionInfo) {
        throw new Error("You are not currently logged in. Run the 'revopush login' command to authenticate with the CodePush server.");
      }

      sdk = getSdk(connectionInfo.accessKey, connectionInfo.customServerUrl);
      break;
  }

  switch (command.type) {
    case cli.CommandType.accessKeyAdd:
      return accessKeyAdd(command as cli.IAccessKeyAddCommand);

    case cli.CommandType.accessKeyPatch:
      return accessKeyPatch(command as cli.IAccessKeyPatchCommand);

    case cli.CommandType.accessKeyList:
      return accessKeyList(command as cli.IAccessKeyListCommand);

    case cli.CommandType.accessKeyRemove:
      return accessKeyRemove(command as cli.IAccessKeyRemoveCommand);

    case cli.CommandType.appAdd:
      return appAdd(command as cli.IAppAddCommand);

    case cli.CommandType.appList:
      return appList(command as cli.IAppListCommand);

    case cli.CommandType.appRemove:
      return appRemove(command as cli.IAppRemoveCommand);

    case cli.CommandType.appRename:
      return appRename(command as cli.IAppRenameCommand);

    case cli.CommandType.appTransfer:
      return appTransfer(command as cli.IAppTransferCommand);

    case cli.CommandType.collaboratorAdd:
      return addCollaborator(command as cli.ICollaboratorAddCommand);

    case cli.CommandType.collaboratorList:
      return listCollaborators(command as cli.ICollaboratorListCommand);

    case cli.CommandType.collaboratorRemove:
      return removeCollaborator(command as cli.ICollaboratorRemoveCommand);

    case cli.CommandType.debug:
      return debugCommand(command as cli.IDebugCommand);

    case cli.CommandType.deploymentAdd:
      return deploymentAdd(command as cli.IDeploymentAddCommand);

    case cli.CommandType.deploymentHistoryClear:
      return deploymentHistoryClear(command as cli.IDeploymentHistoryClearCommand);

    case cli.CommandType.deploymentHistory:
      return deploymentHistory(command as cli.IDeploymentHistoryCommand);

    case cli.CommandType.deploymentList:
      return deploymentList(command as cli.IDeploymentListCommand);

    case cli.CommandType.deploymentRemove:
      return deploymentRemove(command as cli.IDeploymentRemoveCommand);

    case cli.CommandType.deploymentRename:
      return deploymentRename(command as cli.IDeploymentRenameCommand);

    case cli.CommandType.link:
      return link(command as cli.ILinkCommand);

    case cli.CommandType.login:
      return login(command as cli.ILoginCommand);

    case cli.CommandType.logout:
      return logout(command);

    case cli.CommandType.patch:
      return patch(command as cli.IPatchCommand);

    case cli.CommandType.promote:
      return promote(command as cli.IPromoteCommand);

    case cli.CommandType.register:
      return register(command as cli.IRegisterCommand);

    case cli.CommandType.release:
      return release(command as cli.IReleaseCommand);

    case cli.CommandType.releaseReact:
      return releaseReact(command as cli.IReleaseReactCommand);

    case cli.CommandType.releaseExpo:
      return releaseExpo(command as cli.IReleaseReactCommand);

    case cli.CommandType.releaseNative:
      return releaseNative(command as cli.IReleaseNativeCommand);

    case cli.CommandType.rollback:
      return rollback(command as cli.IRollbackCommand);

    case cli.CommandType.sessionList:
      return sessionList(command as cli.ISessionListCommand);

    case cli.CommandType.sessionRemove:
      return sessionRemove(command as cli.ISessionRemoveCommand);

    case cli.CommandType.whoami:
      return whoami(command);

    default:
      // Unreachable: the parser rejects unknown commands
      throw new Error("Invalid command:  " + JSON.stringify(command));
  }
}

function openLoginPage(serverUrl?: string): void {
  const hostname: string = os.hostname();
  const url: string = `${serverUrl || AccountManager.APP_SERVER_URL}/cli-login?hostname=${hostname}`;
  log("Opening your browser...");
  log(`Visit ${url} and enter the code`);
  opener(url);
}

async function link(command: cli.ILinkCommand): Promise<void> {
  openLoginPage(command.serverUrl);
}

async function login(command: cli.ILoginCommand): Promise<void> {
  if (command.accessKey) {
    sdk = getSdk(command.accessKey, command.apiServerUrl);
    if (await sdk.isAuthenticated()) {
      serializeConnectionInfo(command.accessKey, /*preserveAccessKeyOnLogout*/ true, command.apiServerUrl);
    } else {
      throw new Error("Invalid access key.");
    }
  } else {
    await loginWithExternalAuthentication(command.apiServerUrl, command.appServerUrl);
  }
}

async function loginWithExternalAuthentication(apiServerUrl?: string, appServerUrl?: string): Promise<void> {
  openLoginPage(appServerUrl);
  log("");

  const accessKey: string = await requestAccessKey();
  if (accessKey === null) {
    // Cancelled with Ctrl+C
    return;
  }

  sdk = getSdk(accessKey, apiServerUrl);

  if (await sdk.isAuthenticated()) {
    serializeConnectionInfo(accessKey, /*preserveAccessKeyOnLogout*/ false, apiServerUrl);
  } else {
    throw new Error("Invalid access key.");
  }
}

async function logout(_command: cli.ICommand): Promise<void> {
  if (!connectionInfo.preserveAccessKeyOnLogout) {
    const machineName: string = os.hostname();
    try {
      await sdk.removeSession(machineName);
    } catch (error) {
      // Not logged in, or the session is already gone: nothing to remove
      if (error.statusCode !== AccountManager.ERROR_UNAUTHORIZED && error.statusCode !== AccountManager.ERROR_NOT_FOUND) {
        throw error;
      }
    }
  }

  sdk = null;
  deleteConnectionInfoCache();
}

async function register(command: cli.IRegisterCommand): Promise<void> {
  return loginWithExternalAuthentication(command.apiServerUrl, command.appServerUrl);
}

async function promote(command: cli.IPromoteCommand): Promise<void> {
  const packageInfo: PackageInfo = {
    appVersion: command.appStoreVersion,
    description: command.description,
    label: command.label,
    isDisabled: command.disabled,
    isMandatory: command.mandatory,
    rollout: command.rollout,
  };

  try {
    await sdk.promote(command.appName, command.sourceDeploymentName, command.destDeploymentName, packageInfo);
    log(
      "Successfully promoted " +
        (command.label !== null ? '"' + command.label + '" of ' : "") +
        'the "' +
        command.sourceDeploymentName +
        '" deployment of the "' +
        command.appName +
        '" app to the "' +
        command.destDeploymentName +
        '" deployment.'
    );
  } catch (err) {
    releaseErrorHandler(err, command);
  }
}

async function patch(command: cli.IPatchCommand): Promise<void> {
  const packageInfo: PackageInfo = {
    appVersion: command.appStoreVersion,
    description: command.description,
    isMandatory: command.mandatory,
    isDisabled: command.disabled,
    rollout: command.rollout,
    buildNumber: command.buildNumber, // undefined = skip, null = reset to wildcard, string = retarget
  };

  // Other fields are null when not given; buildNumber is undefined, since null resets it
  const hasUpdate = Object.values(packageInfo).some((v) => v !== null && v !== undefined) || command.buildNumber !== undefined;

  if (!hasUpdate) {
    throw new Error("At least one property must be specified to patch a release.");
  }

  await sdk.patchRelease(command.appName, command.deploymentName, command.label, packageInfo);
  log(
    `Successfully updated the "${command.label ? command.label : `latest`}" release of "${command.appName}" app's "${
      command.deploymentName
    }" deployment.`
  );
}

export const release = async (command: cli.IReleaseCommand): Promise<void> => {
  // An initial release is always optional, disabled and without rollout
  const updateMetadata: PackageInfo = {
    description: command.initial ? `Zero release for v${command.appStoreVersion}` : command.description,
    isDisabled: command.initial ? true : command.disabled,
    isMandatory: command.initial ? false : command.mandatory,
    isInitial: command.initial,
    rollout: command.initial ? undefined : command.rollout,
    appVersion: command.appStoreVersion,
    buildNumber: command.buildNumber,
  };

  return doRelease(command, updateMetadata);
};

export const createEmptyTempReleaseFolder = async (folderPath: string): Promise<void> => {
  await deleteFolder(folderPath);
  fs.mkdirSync(folderPath);
};

function deleteFolder(folderPath: string): Promise<void> {
  return fs.promises.rm(folderPath, { recursive: true, force: true, maxRetries: 3 });
}

async function deleteReactTempFolders(): Promise<void> {
  const tempFolder: string = os.tmpdir();
  // An unreadable temp folder means there is nothing to delete
  const names: string[] = await fs.promises.readdir(tempFolder).catch((): string[] => []);
  const reactFolders: string[] = names.filter((name) => name.startsWith("react-"));
  await Promise.all(reactFolders.map((name) => deleteFolder(path.join(tempFolder, name))));
}

async function getReactNativeProjectVersionInfo(
  command: cli.IReleaseReactCommand,
  projectName: string
): Promise<cli.ProjectVersionInfo> {
  log(chalk.cyan(`Detecting ${command.platform} app version:\n`));

  if (command.platform === "ios") {
    return getIosVersionInfo(command, projectName);
  } else if (command.platform === "android") {
    return getAndroidVersionInfo(command.gradleFile);
  }
}

const REQUIRED_OUTPUT_DIR_NAME = "CodePush";

interface ReactReleaseInputs {
  platform: string;
  bundleName: string;
  entryFile: string;
  projectName: string;
}

// Checks a release-react/release-expo command and derives its inputs. The version range is checked later, once it's known
function validateReactReleaseCommand(command: cli.IReleaseReactCommand, options: { resolveEntryFile: boolean }): ReactReleaseInputs {
  const { resolveEntryFile } = options;
  const platform: string = (command.platform = command.platform.toLowerCase());

  if (platform !== "android" && platform !== "ios") {
    throw new Error('Platform must be either "android" or "ios".');
  }

  // Diff updates require the package to live under a "CodePush" folder
  if (command.outputDir && path.basename(command.outputDir) !== REQUIRED_OUTPUT_DIR_NAME) {
    throw new Error(
      `The "--outputDir" path must end with a folder named "${REQUIRED_OUTPUT_DIR_NAME}" ` +
        `(e.g. "./build/${REQUIRED_OUTPUT_DIR_NAME}"). Received: "${command.outputDir}".`
    );
  }

  let projectPackageJson: any;
  try {
    projectPackageJson = require(path.join(process.cwd(), "package.json"));
  } catch {
    throw new Error(
      'Unable to find or read "package.json" in the CWD. The command must be executed in a React Native project folder.'
    );
  }

  const projectName: string = projectPackageJson.name;
  if (!projectName) {
    throw new Error('The "package.json" file in the CWD does not have the "name" field set.');
  }
  if (!projectPackageJson.dependencies?.["react-native"]) {
    throw new Error("The project in the CWD is not a React Native project.");
  }

  let entryFile: string = command.entryFile;
  if (resolveEntryFile) {
    if (!entryFile) {
      entryFile = `index.${platform}.js`;
      if (fileDoesNotExistOrIsDirectory(entryFile)) {
        entryFile = "index.js";
      }
      if (fileDoesNotExistOrIsDirectory(entryFile)) {
        throw new Error(`Entry file "index.${platform}.js" or "index.js" does not exist.`);
      }
    } else if (fileDoesNotExistOrIsDirectory(entryFile)) {
      throw new Error(`Entry file "${entryFile}" does not exist.`);
    }
  }

  const bundleName: string = command.bundleName || (platform === "ios" ? "main.jsbundle" : `index.${platform}.bundle`);

  return { platform, bundleName, entryFile, projectName };
}

interface BundlePlan {
  isHermes: boolean;
  sourceMaps: SourceMapPaths;
  bundleOptions: BundleOptions;
}

async function planBundle(
  command: cli.IReleaseReactCommand,
  outputFolder: string,
  bundleName: string,
  sourcemapOutput: string
): Promise<BundlePlan> {
  const isHermes = command.useHermes || (await isHermesEnabled(command));
  const sourceMaps = getSourceMapPaths(command, bundleName, sourcemapOutput, isHermes);
  return {
    isHermes,
    sourceMaps,
    bundleOptions: {
      platform: command.platform,
      development: command.development || false,
      outputFolder,
      bundleName,
      packagerSourceMap: sourceMaps.packager,
      extraBundlerOptions: command.extraBundlerOptions,
    },
  };
}

// Compiles the bundle in place, against the base release's bytecode when there is one
async function compileHermesBundle(
  command: cli.IReleaseReactCommand,
  outputFolder: string,
  bundleName: string,
  sourceMaps: SourceMapPaths,
  baseReleaseTmpFolder: string
): Promise<void> {
  await createEmptyTempReleaseFolder(baseReleaseTmpFolder);
  const baseBytecode = await takeHermesBaseBytecode(sdk, command, baseReleaseTmpFolder, outputFolder, bundleName);

  log(chalk.cyan("\nRunning hermes compiler...\n"));
  const bundle = path.join(outputFolder, bundleName);
  await runHermesEmitBinaryCommand(command, bundle, sourceMaps, command.extraHermesFlags, baseBytecode);
}

function validateGeneratedReleaseSizes(
  command: cli.IReleaseReactCommand,
  outputFolder: string,
  bundleName: string,
  platform: string
): ReleaseSizeAnalysis | null {
  if (!shouldAnalyzeReleaseSizes(platform)) {
    return null;
  }

  const analysis = analyzeReleaseContents(outputFolder, bundleName);
  const sourceMapWarning = formatSourceMapWarning(analysis.sourceMaps);
  if (sourceMapWarning) {
    console.warn(chalk.yellow(`\n${sourceMapWarning}\n`));
  }

  enforceAssetSizeLimit(analysis, command.force || false);
  return analysis;
}

function printReleaseSizeWarnings(analysis: ReleaseSizeAnalysis | null, force: boolean): void {
  if (!analysis) {
    return;
  }

  const warning = formatReleaseSizeWarnings(analysis, force);
  if (warning) {
    console.warn(chalk.yellow(`\n${warning}\n`));
  }
}

// The only steps where release-react and release-expo differ
interface ReactBundler {
  resolveEntryFile: boolean;
  bundle(options: BundleOptions, entryFile: string, isHermes: boolean): Promise<void>;
}

const reactNativeBundler: ReactBundler = {
  resolveEntryFile: true,
  bundle: (options, entryFile, isHermes) => runReactNativeBundleCommand(options, entryFile, isHermes),
};

// Expo finds the JS entry file itself
const expoBundler: ReactBundler = {
  resolveEntryFile: false,
  bundle: (options) => runExpoExportEmbedCommand(options),
};

export const releaseReact = (command: cli.IReleaseReactCommand): Promise<void> => releaseReactBundle(command, reactNativeBundler);

export const releaseExpo = (command: cli.IReleaseReactCommand): Promise<void> => releaseReactBundle(command, expoBundler);

async function releaseReactBundle(command: cli.IReleaseReactCommand, bundler: ReactBundler): Promise<void> {
  const { platform, bundleName, entryFile, projectName } = validateReactReleaseCommand(command, bundler);

  const outputFolder: string = command.outputDir || path.join(os.tmpdir(), "CodePush");
  const sourcemapOutputFolder: string = command.sourcemapOutput || path.join(os.tmpdir(), "CodePushSourceMap");
  const baseReleaseTmpFolder: string = path.join(os.tmpdir(), "CodePushBaseRelease");
  // Read before command.outputDir is overwritten below
  const isTempOutputFolder: boolean = !command.outputDir;

  const releaseCommand: cli.IReleaseReactCommand = command;
  releaseCommand.package = outputFolder;
  releaseCommand.outputDir = outputFolder;
  releaseCommand.bundleName = bundleName;
  // Fail fast on a wrong app or deployment name, before the slow bundling
  await sdk.getDeployment(command.appName, command.deploymentName);

  // Only release-native detects the build number; here it comes from --buildNumber
  const appVersion: string = command.appStoreVersion || (await getReactNativeProjectVersionInfo(command, projectName)).appVersion;

  if (!command.sourcemapOutput) {
    await createEmptyTempReleaseFolder(sourcemapOutputFolder);
  }

  throwForInvalidSemverRange(appVersion);
  releaseCommand.appStoreVersion = appVersion;

  await createEmptyTempReleaseFolder(outputFolder);
  // Clears the React Native bundler cache: https://github.com/facebook/react-native/issues/4289
  await deleteReactTempFolders();

  const { isHermes, sourceMaps, bundleOptions } = await planBundle(command, outputFolder, bundleName, sourcemapOutputFolder);
  await bundler.bundle(bundleOptions, entryFile, isHermes);

  if (isHermes) {
    await compileHermesBundle(command, outputFolder, bundleName, sourceMaps, baseReleaseTmpFolder);
  }

  const releaseSizeAnalysis: ReleaseSizeAnalysis | null = validateGeneratedReleaseSizes(command, outputFolder, bundleName, platform);

  if (command.privateKeyPath) {
    log(chalk.cyan("\nSigning the bundle:\n"));
    await sign(command.privateKeyPath, outputFolder);
  } else {
    console.log("private key was not provided");
  }

  log(chalk.cyan("\nReleasing update contents to CodePush:\n"));
  await doRelease(releaseCommand, getReactNativePackageInfo(releaseCommand), () =>
    printReleaseSizeWarnings(releaseSizeAnalysis, command.force || false)
  );

  if (isTempOutputFolder) {
    await deleteFolder(outputFolder);
  }

  if (!command.sourcemapOutput) {
    await deleteFolder(sourcemapOutputFolder);
  }

  await deleteFolder(baseReleaseTmpFolder);
}

export const releaseNative = async (command: cli.IReleaseNativeCommand): Promise<void> => {
  const platform: string = command.platform.toLowerCase();
  let bundleName: string = command.bundleName;
  const targetBinaryPath: string = command.targetBinary;
  const outputFolder: string = command.outputDir || path.join(os.tmpdir(), "CodePush");
  const extractFolder: string = path.join(os.tmpdir(), "CodePushBinaryExtract");
  if (platform !== "ios" && platform !== "android") {
    throw new Error('Platform must be either "ios" or "android" for the "release-native" command.');
  }
  if (!fileExists(targetBinaryPath)) {
    throw new Error(`Target binary file "${targetBinaryPath}" does not exist.`);
  }
  const targetBinaryPathNormalised = targetBinaryPath.toLowerCase();
  if (platform === "ios" && !targetBinaryPathNormalised.endsWith(".ipa")) {
    throw new Error("For iOS platform, target binary must be an .ipa file.");
  }
  if (platform === "android" && !(targetBinaryPathNormalised.endsWith(".apk") || targetBinaryPathNormalised.endsWith(".aab"))) {
    throw new Error("For Android platform, target binary must be an .apk or .aab file.");
  }

  await sdk.getDeployment(command.appName, command.deploymentName);

  let releaseCommandPartial: Partial<cli.IReleaseReactCommand>;
  try {
    await createEmptyTempReleaseFolder(outputFolder);
    await createEmptyTempReleaseFolder(extractFolder);

    if (!bundleName) {
      bundleName = platform === "ios" ? "main.jsbundle" : `index.android.bundle`;
    }

    if (platform === "ios") {
      log(chalk.cyan(`\nReading IPA file:\n`));
      const metadataZip = await extractMetadataFromIOS(targetBinaryPath, outputFolder);
      const buildVersion = await getIosVersion(targetBinaryPath);
      releaseCommandPartial = {
        package: metadataZip,
        appStoreVersion: buildVersion?.version,
        buildNumber: buildVersion?.build,
      };
    } else {
      if (targetBinaryPathNormalised.endsWith(".apk")) {
        log(chalk.cyan(`\nExtracting APK/ARR file:\n`));
        await extractArchive(targetBinaryPath, extractFolder);

        const reader = await ApkReader.open(targetBinaryPath);
        const { versionName: appStoreVersion, versionCode } = await reader.readManifest();
        const metadataZip = await extractMetadataFromAndroid(extractFolder, outputFolder);
        releaseCommandPartial = {
          package: metadataZip,
          appStoreVersion,
          buildNumber: versionCode?.toString(),
        };
      } else if (targetBinaryPathNormalised.endsWith(".aab")) {
        log(chalk.cyan(`\nExtracting AAB file:\n`));
        await extractArchive(targetBinaryPath, extractFolder);
        const { versionName: appStoreVersion, versionCode } = await parseAabManifest(targetBinaryPath);

        const metadataZip = await extractMetadataFromAndroid(`${extractFolder}/base`, outputFolder); // base folder is nested in AAB
        releaseCommandPartial = {
          package: metadataZip,
          appStoreVersion,
          buildNumber: versionCode?.toString(),
        };
      } else {
        throw new Error("For Android platform, target binary must be an .apk or .aab file.");
      }
    }

    const { package: metadataZip, appStoreVersion, buildNumber: detectedBuildNumber } = releaseCommandPartial;
    const releaseCommand: cli.IReleaseReactCommand = {
      type: cli.CommandType.release,
      appName: command.appName,
      deploymentName: command.deploymentName,
      appStoreVersion: command.appStoreVersion || appStoreVersion,
      buildNumber: command.buildNumber || detectedBuildNumber,
      description: command.description,
      disabled: command.disabled,
      mandatory: command.mandatory,
      rollout: command.rollout,
      initial: command.initial,
      noDuplicateReleaseError: command.noDuplicateReleaseError,
      platform: platform,
      outputDir: outputFolder,
      bundleName: bundleName,
      package: metadataZip,
    };

    await doNativeRelease(releaseCommand);
  } finally {
    try {
      await deleteFolder(extractFolder);
      await deleteFolder(outputFolder);
      // The upload deletes the metadata zip, but not when the release fails before uploading
      if (releaseCommandPartial?.package) {
        await fs.promises.rm(releaseCommandPartial.package, { force: true });
      }
    } catch {}
  }
};

// An initial release is always optional, disabled and without rollout
function getReactNativePackageInfo(command: cli.IReleaseReactCommand): ReactNativePackageInfo {
  return {
    description: command.initial ? `Zero release for v${command.appStoreVersion}` : command.description,
    isDisabled: command.initial ? true : command.disabled,
    isMandatory: command.initial ? false : command.mandatory,
    isInitial: command.initial,
    bundleName: command.bundleName,
    outputDir: command.outputDir,
    rollout: command.initial ? undefined : command.rollout,
    appVersion: command.appStoreVersion,
    buildNumber: command.buildNumber,
  };
}

const doRelease = async (
  command: cli.IReleaseCommand | cli.IReleaseReactCommand,
  updateMetadata: PackageInfo,
  onReleaseCompleted?: () => void
): Promise<void> => {
  if (isBinaryOrZip(command.package)) {
    throw new Error(
      "It is unnecessary to package releases in a .zip or binary file. Please specify the direct path to the update content's directory (e.g. /platforms/ios/www) or file (e.g. main.jsbundle)."
    );
  }

  throwForInvalidSemverRange(command.appStoreVersion);
  const filePath: string = command.package;
  let isSingleFilePackage: boolean = true;

  if (fs.lstatSync(filePath).isDirectory()) {
    isSingleFilePackage = false;
  }

  const uploadProgress = createUploadProgress();

  try {
    await sdk.isAuthenticated(true);
    log("Release file path: " + filePath);
    log("Metadata: " + JSON.stringify(updateMetadata));
    await sdk.release(command.appName, command.deploymentName, filePath, updateMetadata, uploadProgress);
    log(
      'Successfully released an update containing the "' +
        command.package +
        '" ' +
        (isSingleFilePackage ? "file" : "directory") +
        ' to the "' +
        command.deploymentName +
        '" deployment of the "' +
        command.appName +
        '" app.'
    );

    if (onReleaseCompleted) {
      onReleaseCompleted();
    }
  } catch (err) {
    releaseErrorHandler(err, command);
  }
};

const doNativeRelease = async (releaseCommand: cli.IReleaseReactCommand): Promise<void> => {
  throwForInvalidSemverRange(releaseCommand.appStoreVersion);

  const filePath: string = releaseCommand.package;

  const updateMetadata: ReactNativePackageInfo = getReactNativePackageInfo(releaseCommand);

  const uploadProgress = createUploadProgress();

  try {
    await sdk.isAuthenticated(true);
    await sdk.releaseNative(releaseCommand.appName, releaseCommand.deploymentName, filePath, updateMetadata, uploadProgress);
    log(
      'Successfully released an update containing the "' +
        releaseCommand.package +
        '" ' +
        "directory" +
        ' to the "' +
        releaseCommand.deploymentName +
        '" deployment of the "' +
        releaseCommand.appName +
        '" app.'
    );
  } catch (err) {
    releaseErrorHandler(err, releaseCommand);
  }
};

async function rollback(command: cli.IRollbackCommand): Promise<void> {
  if (!(await confirm())) {
    log("Rollback cancelled.");
    return;
  }

  await sdk.rollback(command.appName, command.deploymentName, command.targetRelease || undefined);
  log('Successfully performed a rollback on the "' + command.deploymentName + '" deployment of the "' + command.appName + '" app.');
}

async function sessionList(command: cli.ISessionListCommand): Promise<void> {
  throwForInvalidOutputFormat(command.format);

  const sessions: Session[] = await sdk.getSessions();
  printSessions(command.format, sessions);
}

async function sessionRemove(command: cli.ISessionRemoveCommand): Promise<void> {
  if (os.hostname() === command.machineName) {
    throw new Error("Cannot remove the current login session via this command. Please run 'revopush logout' instead.");
  }

  if (await confirm()) {
    await sdk.removeSession(command.machineName);
    log(`Successfully removed the login session for "${command.machineName}".`);
    return;
  }

  log("Session removal cancelled.");
}

function releaseErrorHandler(error: CodePushError, command: cli.ICommand): void {
  if ((command as any).noDuplicateReleaseError && error.statusCode === AccountManager.ERROR_CONFLICT) {
    console.warn(chalk.yellow("[Warning] " + error.message));
  } else {
    throw error;
  }
}

async function whoami(_command: cli.ICommand): Promise<void> {
  const account: Account = await sdk.getAccountInfo();
  const accountInfo = `${account.email} (${account.linkedProviders.join(", ")})`;

  log(accountInfo);
}
