// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as yargs from "yargs";
import * as cli from "../types/cli";
import backslash = require("backslash");
import parseDuration = require("parse-duration");
// Importing this module defines the commands with yargs, which must happen before argv is parsed
import { isHelpShown } from "./commands";

export function createCommand(): cli.ICommand {
  let cmd: cli.ICommand;

  const argv = yargs.parseSync();

  if (!isHelpShown() && argv._ && argv._.length > 0) {
    // Create a command object
    const arg0: any = argv._[0];
    const arg1: any = argv._[1];
    const arg2: any = argv._[2];
    const arg3: any = argv._[3];
    const arg4: any = argv._[4];

    switch (arg0) {
      case "access-key":
        switch (arg1) {
          case "add":
            if (arg2) {
              cmd = { type: cli.CommandType.accessKeyAdd };
              const accessKeyAddCmd = cmd as cli.IAccessKeyAddCommand;
              accessKeyAddCmd.name = arg2;
              const ttlOption: string = argv["ttl"] as any;
              if (isDefined(ttlOption)) {
                accessKeyAddCmd.ttl = parseDurationMilliseconds(ttlOption);
              }
            }
            break;

          case "patch":
            if (arg2) {
              cmd = { type: cli.CommandType.accessKeyPatch };
              const accessKeyPatchCmd = cmd as cli.IAccessKeyPatchCommand;
              accessKeyPatchCmd.oldName = arg2;

              const newNameOption: string = argv["name"] as any;
              const ttlOption: string = argv["ttl"] as any;
              if (isDefined(newNameOption)) {
                accessKeyPatchCmd.newName = newNameOption;
              }

              if (isDefined(ttlOption)) {
                accessKeyPatchCmd.ttl = parseDurationMilliseconds(ttlOption);
              }
            }
            break;

          case "list":
          case "ls":
            cmd = { type: cli.CommandType.accessKeyList };

            (cmd as cli.IAccessKeyListCommand).format = argv["format"] as any;
            break;

          case "remove":
          case "rm":
            if (arg2) {
              cmd = { type: cli.CommandType.accessKeyRemove };

              (cmd as cli.IAccessKeyRemoveCommand).accessKey = arg2;
            }
            break;
        }
        break;

      case "app":
        switch (arg1) {
          case "add":
            if (arg2) {
              cmd = { type: cli.CommandType.appAdd };

              (cmd as cli.IAppAddCommand).appName = arg2;
            }
            break;

          case "list":
          case "ls":
            cmd = { type: cli.CommandType.appList };

            (cmd as cli.IAppListCommand).format = argv["format"] as any;
            break;

          case "remove":
          case "rm":
            if (arg2) {
              cmd = { type: cli.CommandType.appRemove };

              (cmd as cli.IAppRemoveCommand).appName = arg2;
            }
            break;

          case "rename":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.appRename };

              const appRenameCommand = cmd as cli.IAppRenameCommand;

              appRenameCommand.currentAppName = arg2;
              appRenameCommand.newAppName = arg3;
            }
            break;

          case "transfer":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.appTransfer };

              const appTransferCommand = cmd as cli.IAppTransferCommand;

              appTransferCommand.appName = arg2;
              appTransferCommand.email = arg3;
            }
            break;
        }
        break;

      case "collaborator":
        switch (arg1) {
          case "add":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.collaboratorAdd };

              (cmd as cli.ICollaboratorAddCommand).appName = arg2;
              (cmd as cli.ICollaboratorAddCommand).email = arg3;
            }
            break;

          case "list":
          case "ls":
            if (arg2) {
              cmd = { type: cli.CommandType.collaboratorList };

              (cmd as cli.ICollaboratorListCommand).appName = arg2;
              (cmd as cli.ICollaboratorListCommand).format = argv["format"] as any;
            }
            break;

          case "remove":
          case "rm":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.collaboratorRemove };

              (cmd as cli.ICollaboratorRemoveCommand).appName = arg2;
              (cmd as cli.ICollaboratorRemoveCommand).email = arg3;
            }
            break;
        }
        break;

      case "debug":
        cmd = {
          type: cli.CommandType.debug,
          platform: arg1,
        } as cli.IDebugCommand;

        break;

      case "deployment":
        switch (arg1) {
          case "add":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.deploymentAdd };

              const deploymentAddCommand = cmd as cli.IDeploymentAddCommand;

              deploymentAddCommand.appName = arg2;
              deploymentAddCommand.deploymentName = arg3;
              if (argv["key"]) {
                deploymentAddCommand.key = argv["key"] as any;
              }
            }
            break;

          case "clear":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.deploymentHistoryClear };

              const deploymentHistoryClearCommand = cmd as cli.IDeploymentHistoryClearCommand;

              deploymentHistoryClearCommand.appName = arg2;
              deploymentHistoryClearCommand.deploymentName = arg3;
            }
            break;

          case "list":
          case "ls":
            if (arg2) {
              cmd = { type: cli.CommandType.deploymentList };

              const deploymentListCommand = cmd as cli.IDeploymentListCommand;

              deploymentListCommand.appName = arg2;
              deploymentListCommand.format = argv["format"] as any;
              deploymentListCommand.displayKeys = argv["displayKeys"] as any;
            }
            break;

          case "remove":
          case "rm":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.deploymentRemove };

              const deploymentRemoveCommand = cmd as cli.IDeploymentRemoveCommand;

              deploymentRemoveCommand.appName = arg2;
              deploymentRemoveCommand.deploymentName = arg3;
              deploymentRemoveCommand.isForce = argv["force"] as any;
            }
            break;

          case "rename":
            if (arg2 && arg3 && arg4) {
              cmd = { type: cli.CommandType.deploymentRename };

              const deploymentRenameCommand = cmd as cli.IDeploymentRenameCommand;

              deploymentRenameCommand.appName = arg2;
              deploymentRenameCommand.currentDeploymentName = arg3;
              deploymentRenameCommand.newDeploymentName = arg4;
            }
            break;

          case "history":
          case "h":
            if (arg2 && arg3) {
              cmd = { type: cli.CommandType.deploymentHistory };

              const deploymentHistoryCommand = cmd as cli.IDeploymentHistoryCommand;

              deploymentHistoryCommand.appName = arg2;
              deploymentHistoryCommand.deploymentName = arg3;
              deploymentHistoryCommand.format = argv["format"] as any;
              deploymentHistoryCommand.displayAuthor = argv["displayAuthor"] as any;
            }
            break;
        }
        break;

      /*      case "link":
                    cmd = <cli.ILinkCommand>{
                      type: cli.CommandType.link,
                      serverUrl: getServerUrl(arg1),
                    };
                    break;*/

      case "login":
        cmd = { type: cli.CommandType.login };

        const loginCommand = cmd as cli.ILoginCommand;

        loginCommand.apiServerUrl = getServerUrl(arg1);
        loginCommand.appServerUrl = getServerUrl(arg2);
        loginCommand.accessKey = argv["accessKey"] as any;
        break;

      case "logout":
        cmd = { type: cli.CommandType.logout };
        break;

      case "patch":
        if (arg1 && arg2) {
          cmd = { type: cli.CommandType.patch };

          const patchCommand = cmd as cli.IPatchCommand;

          patchCommand.appName = arg1;
          patchCommand.deploymentName = arg2;
          patchCommand.label = argv["label"] as any;
          // Description must be set to null to indicate that it is not being patched.
          patchCommand.description = argv["description"] ? backslash(argv["description"]) : null;
          patchCommand.disabled = argv["disabled"] as any;
          patchCommand.mandatory = argv["mandatory"] as any;
          patchCommand.rollout = getRolloutValue(argv["rollout"] as any);
          patchCommand.appStoreVersion = argv["targetBinaryVersion"] as any;
          // undefined = not provided (skip); null = reset to wildcard (empty string ""); string = retarget to that build.
          patchCommand.buildNumber = argv["buildNumber"] !== undefined ? (argv["buildNumber"] as string) || null : undefined;
        }
        break;

      case "promote":
        if (arg1 && arg2 && arg3) {
          cmd = { type: cli.CommandType.promote };

          const deploymentPromoteCommand = cmd as cli.IPromoteCommand;

          deploymentPromoteCommand.appName = arg1;
          deploymentPromoteCommand.sourceDeploymentName = arg2;
          deploymentPromoteCommand.destDeploymentName = arg3;
          deploymentPromoteCommand.description = argv["description"] ? backslash(argv["description"]) : "";
          deploymentPromoteCommand.label = argv["label"] as any;
          deploymentPromoteCommand.disabled = argv["disabled"] as any;
          deploymentPromoteCommand.mandatory = argv["mandatory"] as any;
          deploymentPromoteCommand.noDuplicateReleaseError = argv["noDuplicateReleaseError"] as any;
          deploymentPromoteCommand.rollout = getRolloutValue(argv["rollout"] as any);
          deploymentPromoteCommand.appStoreVersion = argv["targetBinaryVersion"] as any;
        }
        break;

      case "register":
        cmd = { type: cli.CommandType.register };

        const registerCommand = cmd as cli.IRegisterCommand;

        registerCommand.serverUrl = getServerUrl(arg1);
        break;

      case "release":
        if (arg1 && arg2 && arg3) {
          cmd = { type: cli.CommandType.release };

          const releaseCommand = cmd as cli.IReleaseCommand;

          releaseCommand.appName = arg1;
          releaseCommand.package = arg2;
          releaseCommand.appStoreVersion = arg3;
          releaseCommand.buildNumber = argv["buildNumber"] as any;
          releaseCommand.deploymentName = argv["deploymentName"] as any;
          releaseCommand.description = argv["description"] ? backslash(argv["description"]) : "";
          releaseCommand.disabled = argv["disabled"] as any;
          releaseCommand.mandatory = argv["mandatory"] as any;
          releaseCommand.noDuplicateReleaseError = argv["noDuplicateReleaseError"] as any;
          releaseCommand.rollout = getRolloutValue(argv["rollout"] as any);
        }
        break;

      case "release-react":
        if (arg1 && arg2) {
          cmd = getReleaseReactCommand(cli.CommandType.releaseReact, arg1, arg2, argv);
        }
        break;

      case "release-expo":
        if (arg1 && arg2) {
          cmd = getReleaseReactCommand(cli.CommandType.releaseExpo, arg1, arg2, argv);
        }
        break;

      case "release-native":
        if (arg1 && arg2 && arg3) {
          cmd = { type: cli.CommandType.releaseNative };

          const releaseBinaryCommand = cmd as cli.IReleaseNativeCommand;

          releaseBinaryCommand.appName = arg1;
          releaseBinaryCommand.platform = arg2;
          releaseBinaryCommand.targetBinary = arg3;
          releaseBinaryCommand.deploymentName = argv["deploymentName"] as any;
          releaseBinaryCommand.appStoreVersion = argv["targetBinaryVersion"] as any;
          releaseBinaryCommand.buildNumber = argv["buildNumber"] as any;
          releaseBinaryCommand.initial = true;
          releaseBinaryCommand.disabled = true;
          releaseBinaryCommand.mandatory = false;
          // TODO add support for releaseBinaryCommand.bundleName
          // TODO add support for releaseBinaryCommand.outputDir
        }
        break;

      case "rollback":
        if (arg1 && arg2) {
          cmd = { type: cli.CommandType.rollback };

          const rollbackCommand = cmd as cli.IRollbackCommand;

          rollbackCommand.appName = arg1;
          rollbackCommand.deploymentName = arg2;
          rollbackCommand.targetRelease = argv["targetRelease"] as any;
        }
        break;

      case "session":
        switch (arg1) {
          case "list":
          case "ls":
            cmd = { type: cli.CommandType.sessionList };

            (cmd as cli.ISessionListCommand).format = argv["format"] as any;
            break;

          case "remove":
          case "rm":
            if (arg2) {
              cmd = { type: cli.CommandType.sessionRemove };

              (cmd as cli.ISessionRemoveCommand).machineName = arg2;
            }
            break;
        }
        break;

      case "whoami":
        cmd = { type: cli.CommandType.whoami };
        break;
    }

    return cmd;
  }
}

function getReleaseReactCommand(
  type: cli.CommandType,
  appName: string,
  platform: string,
  argv: yargs.Arguments
): cli.IReleaseReactCommand {
  const releaseReactCommand = { type } as cli.IReleaseReactCommand;

  releaseReactCommand.appName = appName;
  releaseReactCommand.platform = platform;

  releaseReactCommand.appStoreVersion = argv["targetBinaryVersion"] as any;
  releaseReactCommand.buildNumber = argv["buildNumber"] as any;
  releaseReactCommand.bundleName = argv["bundleName"] as any;
  releaseReactCommand.deploymentName = argv["deploymentName"] as any;
  releaseReactCommand.disabled = argv["disabled"] as any;
  releaseReactCommand.description = argv["description"] ? backslash(argv["description"]) : "";
  releaseReactCommand.development = argv["development"] as any;
  releaseReactCommand.entryFile = argv["entryFile"] as any;
  releaseReactCommand.gradleFile = argv["gradleFile"] as any;
  releaseReactCommand.mandatory = argv["mandatory"] as any;
  releaseReactCommand.initial = argv["initial"] as any;
  releaseReactCommand.noDuplicateReleaseError = argv["noDuplicateReleaseError"] as any;
  releaseReactCommand.plistFile = argv["plistFile"] as any;
  releaseReactCommand.plistFilePrefix = argv["plistFilePrefix"] as any;
  releaseReactCommand.rollout = getRolloutValue(argv["rollout"] as any);
  releaseReactCommand.sourcemapOutput = argv["sourcemapOutput"] as any;
  releaseReactCommand.outputDir = argv["outputDir"] as any;
  releaseReactCommand.useHermes = argv["useHermes"] as any;
  releaseReactCommand.extraHermesFlags = argv["extraHermesFlags"] as any;
  releaseReactCommand.podFile = argv["podFile"] as any;
  releaseReactCommand.privateKeyPath = argv["privateKeyPath"] as any;
  releaseReactCommand.xcodeProjectFile = argv["xcodeProjectFile"] as any;
  releaseReactCommand.xcodeTargetName = argv["xcodeTargetName"] as any;
  releaseReactCommand.buildConfigurationName = argv["buildConfigurationName"] as any;
  releaseReactCommand.extraBundlerOptions = argv["extraBundlerOption"] as any;
  releaseReactCommand.force = argv["force"] as any;

  return releaseReactCommand;
}

function getRolloutValue(input: string): number {
  return input ? parseInt(input.replace("%", "")) : null;
}

function getServerUrl(url: string): string {
  if (!url) return null;

  // Trim whitespace and a trailing slash (/) character.
  url = url.trim();
  if (url[url.length - 1] === "/") {
    url = url.substring(0, url.length - 1);
  }

  url = url.replace(/^(https?):\\/, "$1://"); // Replace 'http(s):\' with 'http(s)://' for Windows Git Bash

  return url;
}

function isDefined(object: any): boolean {
  return object !== undefined && object !== null;
}

function parseDurationMilliseconds(durationString: string): number {
  // parse-duration v2 is ESM: the parser is `.default`, and `?? 0` restores v1's
  // handling of unparseable input (v2 returns null instead of 0).
  return Math.floor(parseDuration.default(durationString) ?? 0);
}
