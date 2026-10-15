// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as yargs from "yargs";
import * as chalk from "chalk";

const packageJson = require("../../../package.json");
const ROLLOUT_PERCENTAGE_REGEX: RegExp = /^(100|[1-9][0-9]|[1-9])%?$/;
const USAGE_PREFIX = "Usage: revopush";

// Command categories are:  access-key, app, release, deployment, deployment-key, login, logout, register
// Commands are the verb following the command category (e.g.:  "add" in "app add").
let isValidCommand = false;

let wasHelpShown = false;

export function isHelpShown(): boolean {
  return wasHelpShown;
}

export function showHelp(showRootDescription?: boolean): void {
  if (!wasHelpShown) {
    if (showRootDescription) {
      console.log(
        chalk.blue(`
 ____                 ____            _     
|  _ \\ _____   _____ |  _ \\ _   _ ___| |__  
| |_) / _ \\ \\ / / _ \\| |_) | | | / __| '_ \\ 
|  _ <  __/\\ V / (_) |  __/| |_| \\__ \\ | | |
|_| \\_\\___| \\_/ \\___/|_|    \\__,_|___/_| |_| CLI v${packageJson.version}
============================================`)
      );
      console.log(
        "Revopush is a service that enables you to deploy mobile app updates directly to your users' devices. " +
          "Visit our website https://revopush.org/ \n"
      );
    }

    yargs.showHelp();
    wasHelpShown = true;
  }
}

// Options shared by release-react and release-expo
function addReactReleaseOptions(yargs: yargs.Argv): void {
  yargs
    .option("bundleName", {
      alias: "b",
      default: null,
      demand: false,
      description:
        'Name of the generated JS bundle file. If unspecified, the standard bundle name will be used, depending on the specified platform: "main.jsbundle" (iOS) or "index.android.bundle" (Android)',
      type: "string",
    })
    .option("deploymentName", {
      alias: "d",
      default: "Staging",
      demand: false,
      description: "Deployment to release the update to",
      type: "string",
    })
    .option("description", {
      alias: "des",
      default: null,
      demand: false,
      description: "Description of the changes made to the app with this release",
      type: "string",
    })
    .option("development", {
      alias: "dev",
      default: false,
      demand: false,
      description: "Specifies whether to generate a dev or release build",
      type: "boolean",
    })
    .option("disabled", {
      alias: "x",
      default: false,
      demand: false,
      description: "Specifies whether this release should be immediately downloadable",
      type: "boolean",
    })
    .option("entryFile", {
      alias: "e",
      default: null,
      demand: false,
      description:
        'Path to the app\'s entry Javascript file. If omitted, "index.<platform>.js" and then "index.js" will be used (if they exist)',
      type: "string",
    })
    .option("gradleFile", {
      alias: "g",
      default: null,
      demand: false,
      description: "Path to the gradle file which specifies the binary version you want to target this release at (android only).",
    })
    .option("initial", {
      alias: "i",
      default: false,
      demand: false,
      description: "Specifies whether release is initial (base) for given targetBinaryVersion.",
      type: "boolean",
    })
    .option("mandatory", {
      alias: "m",
      default: false,
      demand: false,
      description: "Specifies whether this release should be considered mandatory",
      type: "boolean",
    })
    .option("noDuplicateReleaseError", {
      default: false,
      demand: false,
      description:
        "When this flag is set, releasing a package that is identical to the latest release will produce a warning instead of an error",
      type: "boolean",
    })
    .option("plistFile", {
      alias: "p",
      default: null,
      demand: false,
      description: "Path to the plist file which specifies the binary version you want to target this release at (iOS only).",
    })
    .option("plistFilePrefix", {
      alias: "pre",
      default: null,
      demand: false,
      description: "Prefix to append to the file name when attempting to find your app's Info.plist file (iOS only).",
    })
    .option("rollout", {
      alias: "r",
      default: "100%",
      demand: false,
      description: "Percentage of users this release should be immediately available to",
      type: "string",
    })
    .option("sourcemapOutput", {
      alias: "s",
      default: null,
      demand: false,
      description:
        "Path to where the sourcemap for the resulting bundle should be written. If omitted, a sourcemap will not be generated.",
      type: "string",
    })
    .option("targetBinaryVersion", {
      alias: "t",
      default: null,
      demand: false,
      description:
        'Semver expression that specifies the binary app version(s) this release is targeting (e.g. 1.1.0, ~1.2.3). If omitted, the release will target the exact version specified in the "Info.plist" (iOS) or "build.gradle" (Android) files.',
      type: "string",
    })
    .option("outputDir", {
      alias: "o",
      default: null,
      demand: false,
      description: "Path to where the bundle and sourcemap should be written. If omitted, a bundle and sourcemap will not be written.",
      type: "string",
    })
    .option("useHermes", {
      alias: "h",
      default: false,
      demand: false,
      description: "Enable hermes and bypass automatic checks",
      type: "boolean",
    })
    .option("podFile", {
      alias: "pod",
      default: null,
      demand: false,
      description: "Path to the cocopods config file (iOS only).",
      type: "string",
    })
    .option("extraHermesFlags", {
      alias: "hf",
      default: [],
      demand: false,
      description: "Flags that get passed to Hermes, JavaScript to bytecode compiler. Can be specified multiple times.",
      type: "array",
    })
    .option("privateKeyPath", {
      alias: "k",
      default: null,
      demand: false,
      description: "Path to private key used for code signing.",
      type: "string",
    })
    .option("xcodeProjectFile", {
      alias: "xp",
      default: null,
      demand: false,
      description: "Path to the Xcode project or project.pbxproj file",
      type: "string",
    })
    .option("xcodeTargetName", {
      alias: "xt",
      default: undefined,
      demand: false,
      description: "Name of target (PBXNativeTarget) which specifies the binary version you want to target this release at (iOS only)",
      type: "string",
    })
    .option("buildConfigurationName", {
      alias: "c",
      default: undefined,
      demand: false,
      description:
        "Name of build configuration which specifies the binary version you want to target this release at. For example, 'Debug' or 'Release' (iOS only)",
      type: "string",
    })
    .option("extraBundlerOption", {
      alias: "eo",
      default: [],
      demand: false,
      description: "Option that gets passed to react-native bundler. Can be specified multiple times.",
      type: "array",
    })
    .option("force", {
      default: false,
      demand: false,
      description: "Release even when generated assets exceed the 500 KiB per-file limit",
      type: "boolean",
    })
    .option("buildNumber", {
      alias: "bn",
      default: null,
      demand: false,
      description:
        "Target clients on a specific native build (CFBundleVersion on iOS, versionCode on Android). Requires an exact appVersion (e.g. 1.2.3, not a range) and an existing native release with that build number. If omitted, targets all clients on the specified appVersion.",
      type: "string",
    })
    .check((argv: any): any => {
      return checkValidReleaseOptions(argv);
    });
}

function addCommonConfiguration(yargs: yargs.Argv): void {
  yargs
    .wrap(/*columnLimit*/ null)
    .string("_") // Interpret non-hyphenated arguments as strings (e.g. an app version of '1.10').
    .fail(() => showHelp()); // Suppress the default error message.
}

function isValidRollout(args: any): boolean {
  const rollout: string = args["rollout"];
  if (rollout && !ROLLOUT_PERCENTAGE_REGEX.test(rollout)) {
    return false;
  }

  return true;
}

function checkValidReleaseOptions(args: any): boolean {
  return isValidRollout(args) && !!args["deploymentName"];
}

function accessKeyAdd(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " access-key " + commandName + " <accessKeyName>")
    .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
    .example(
      "access-key " + commandName + ' "VSTS Integration"',
      'Creates a new access key with the name "VSTS Integration", which expires in 60 days'
    )
    .example(
      "access-key " + commandName + ' "One time key" --ttl 5m',
      'Creates a new access key with the name "One time key", which expires in 5 minutes'
    )
    .option("ttl", {
      default: "60d",
      demand: false,
      description: "Duration string which specifies the amount of time that the access key should remain valid for (e.g 5m, 60d, 1y)",
      type: "string",
    });

  addCommonConfiguration(yargs);
}

function accessKeyPatch(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " access-key " + commandName + " <accessKeyName>")
    .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
    .example(
      "access-key " + commandName + ' "Key for build server" --name "Key for CI machine"',
      'Renames the access key named "Key for build server" to "Key for CI machine"'
    )
    .example(
      "access-key " + commandName + ' "Key for build server" --ttl 7d',
      'Updates the access key named "Key for build server" to expire in 7 days'
    )
    .option("name", {
      default: null,
      demand: false,
      description: "Display name for the access key",
      type: "string",
    })
    .option("ttl", {
      default: null,
      demand: false,
      description: "Duration string which specifies the amount of time that the access key should remain valid for (e.g 5m, 60d, 1y)",
      type: "string",
    });
  addCommonConfiguration(yargs);
}

function accessKeyList(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " access-key " + commandName + " [options]")
    .demand(/*count*/ 0, /*max*/ 0)
    .example("access-key " + commandName, "Lists your access keys in tabular format")
    .example("access-key " + commandName + " --format json", "Lists your access keys in JSON format")
    .option("format", {
      default: "table",
      demand: false,
      description: 'Output format to display your access keys with ("json" or "table")',
      type: "string",
    });

  addCommonConfiguration(yargs);
}

function accessKeyRemove(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " access-key " + commandName + " <accessKeyName>")
    .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
    .example("access-key " + commandName + ' "VSTS Integration"', 'Removes the "VSTS Integration" access key');

  addCommonConfiguration(yargs);
}

function appList(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " app " + commandName + " [options]")
    .demand(/*count*/ 0, /*max*/ 0)
    .example("app " + commandName, "List your apps in tabular format")
    .example("app " + commandName + " --format json", "List your apps in JSON format")
    .option("format", {
      default: "table",
      demand: false,
      description: 'Output format to display your apps with ("json" or "table")',
      type: "string",
    });

  addCommonConfiguration(yargs);
}

function appRemove(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " app " + commandName + " <appName>")
    .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
    .example("app " + commandName + " MyApp", 'Removes app "MyApp"');

  addCommonConfiguration(yargs);
}

function listCollaborators(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " collaborator " + commandName + " <appName> [options]")
    .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
    .example("collaborator " + commandName + " MyApp", 'Lists the collaborators for app "MyApp" in tabular format')
    .example("collaborator " + commandName + " MyApp --format json", 'Lists the collaborators for app "MyApp" in JSON format')
    .option("format", {
      default: "table",
      demand: false,
      description: 'Output format to display collaborators with ("json" or "table")',
      type: "string",
    });

  addCommonConfiguration(yargs);
}

function removeCollaborator(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " collaborator " + commandName + " <appName> <email>")
    .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
    .example("collaborator " + commandName + " MyApp foo@bar.com", 'Removes foo@bar.com as a collaborator from app "MyApp"');

  addCommonConfiguration(yargs);
}

function sessionList(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " session " + commandName + " [options]")
    .demand(/*count*/ 0, /*max*/ 0)
    .example("session " + commandName, "Lists your sessions in tabular format")
    .example("session " + commandName + " --format json", "Lists your login sessions in JSON format")
    .option("format", {
      default: "table",
      demand: false,
      description: 'Output format to display your login sessions with ("json" or "table")',
      type: "string",
    });

  addCommonConfiguration(yargs);
}

function sessionRemove(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " session " + commandName + " <machineName>")
    .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
    .example("session " + commandName + ' "John\'s PC"', 'Removes the existing login session from "John\'s PC"');

  addCommonConfiguration(yargs);
}

function deploymentHistoryClear(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " deployment " + commandName + " <appName> <deploymentName>")
    .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
    .example(
      "deployment " + commandName + " MyApp MyDeployment",
      'Clears the release history associated with deployment "MyDeployment" from app "MyApp"'
    );

  addCommonConfiguration(yargs);
}

function deploymentList(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " deployment " + commandName + " <appName> [options]")
    .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
    .example("deployment " + commandName + " MyApp", 'Lists the deployments for app "MyApp" in tabular format')
    .example("deployment " + commandName + " MyApp --format json", 'Lists the deployments for app "MyApp" in JSON format')
    .option("format", {
      default: "table",
      demand: false,
      description: 'Output format to display your deployments with ("json" or "table")',
      type: "string",
    })
    .option("displayKeys", {
      alias: "k",
      default: false,
      demand: false,
      description: "Specifies whether to display the deployment keys",
      type: "boolean",
    });
  addCommonConfiguration(yargs);
}

function deploymentRemove(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " deployment " + commandName + " <appName> <deploymentName>")
    .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
    .example("deployment " + commandName + " MyApp MyDeployment", 'Removes deployment "MyDeployment" from app "MyApp"')
    .option("force", {
      default: false,
      demand: false,
      description: "Bypass confirmation when removing deployments",
      type: "boolean",
    });

  addCommonConfiguration(yargs);
}

function deploymentHistory(commandName: string, yargs: yargs.Argv): void {
  isValidCommand = true;
  yargs
    .usage(USAGE_PREFIX + " deployment " + commandName + " <appName> <deploymentName> [options]")
    .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
    .example(
      "deployment " + commandName + " MyApp MyDeployment",
      'Displays the release history for deployment "MyDeployment" from app "MyApp" in tabular format'
    )
    .example(
      "deployment " + commandName + " MyApp MyDeployment --format json",
      'Displays the release history for deployment "MyDeployment" from app "MyApp" in JSON format'
    )
    .option("format", {
      default: "table",
      demand: false,
      description: 'Output format to display the release history with ("json" or "table")',
      type: "string",
    })
    .option("displayAuthor", {
      alias: "a",
      default: false,
      demand: false,
      description: "Specifies whether to display the release author",
      type: "boolean",
    });

  addCommonConfiguration(yargs);
}

yargs
  .usage(USAGE_PREFIX + " <command>")
  .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option argument.
  .command("access-key", "View and manage the access keys associated with your account", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " access-key <command>")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments.
      .command("add", "Create a new access key associated with your account", (yargs: yargs.Argv) => accessKeyAdd("add", yargs))
      .command("patch", "Update the name and/or TTL of an existing access key", (yargs: yargs.Argv) => accessKeyPatch("patch", yargs))
      .command("remove", "Remove an existing access key", (yargs: yargs.Argv) => accessKeyRemove("remove", yargs))
      .command("rm", "Remove an existing access key", (yargs: yargs.Argv) => accessKeyRemove("rm", yargs))
      .command("list", "List the access keys associated with your account", (yargs: yargs.Argv) => accessKeyList("list", yargs))
      .command("ls", "List the access keys associated with your account", (yargs: yargs.Argv) => accessKeyList("ls", yargs))
      .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

    addCommonConfiguration(yargs);
  })
  .command("app", "View and manage your CodePush apps", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " app <command>")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments.
      .command("add", "Add a new app to your account", (yargs: yargs.Argv): void => {
        isValidCommand = true;
        yargs
          .usage(USAGE_PREFIX + " app add <appName>")
          .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
          .example("app add MyApp", 'Adds app "MyApp"');

        addCommonConfiguration(yargs);
      })
      .command("remove", "Remove an app from your account", (yargs: yargs.Argv) => appRemove("remove", yargs))
      .command("rm", "Remove an app from your account", (yargs: yargs.Argv) => appRemove("rm", yargs))
      .command("rename", "Rename an existing app", (yargs: yargs.Argv) => {
        isValidCommand = true;
        yargs
          .usage(USAGE_PREFIX + " app rename <currentAppName> <newAppName>")
          .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
          .example("app rename CurrentName NewName", 'Renames app "CurrentName" to "NewName"');

        addCommonConfiguration(yargs);
      })
      .command("list", "Lists the apps associated with your account", (yargs: yargs.Argv) => appList("list", yargs))
      .command("ls", "Lists the apps associated with your account", (yargs: yargs.Argv) => appList("ls", yargs))
      .command("transfer", "Transfer the ownership of an app to another account", (yargs: yargs.Argv) => {
        isValidCommand = true;
        yargs
          .usage(USAGE_PREFIX + " app transfer <appName> <email>")
          .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
          .example("app transfer MyApp foo@bar.com", 'Transfers the ownership of app "MyApp" to an account with email "foo@bar.com"');

        addCommonConfiguration(yargs);
      })
      .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

    addCommonConfiguration(yargs);
  })
  .command("collaborator", "View and manage app collaborators", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " collaborator <command>")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments.
      .command("add", "Add a new collaborator to an app", (yargs: yargs.Argv): void => {
        isValidCommand = true;
        yargs
          .usage(USAGE_PREFIX + " collaborator add <appName> <email>")
          .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
          .example("collaborator add MyApp foo@bar.com", 'Adds foo@bar.com as a collaborator to app "MyApp"');

        addCommonConfiguration(yargs);
      })
      .command("remove", "Remove a collaborator from an app", (yargs: yargs.Argv) => removeCollaborator("remove", yargs))
      .command("rm", "Remove a collaborator from an app", (yargs: yargs.Argv) => removeCollaborator("rm", yargs))
      .command("list", "List the collaborators for an app", (yargs: yargs.Argv) => listCollaborators("list", yargs))
      .command("ls", "List the collaborators for an app", (yargs: yargs.Argv) => listCollaborators("ls", yargs))
      .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

    addCommonConfiguration(yargs);
  })
  .command("debug", "View the CodePush debug logs for a running app", (yargs: yargs.Argv) => {
    isValidCommand = true;
    yargs
      .usage(USAGE_PREFIX + " debug <platform>")
      .demand(/*count*/ 1, /*max*/ 1) // Require exactly one non-option arguments
      .example("debug android", "View the CodePush debug logs for an Android emulator or device")
      .example("debug ios", "View the CodePush debug logs for the iOS simulator");

    addCommonConfiguration(yargs);
  })
  .command("deployment", "View and manage your app deployments", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " deployment <command>")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments.
      .command("add", "Add a new deployment to an app", (yargs: yargs.Argv): void => {
        isValidCommand = true;
        yargs
          .usage(USAGE_PREFIX + " deployment add <appName> <deploymentName>")
          .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
          .example("deployment add MyApp MyDeployment", 'Adds deployment "MyDeployment" to app "MyApp"')
          .example("deployment add MyApp MyDeployment -k abc123", 'Adds deployment key "abc123"')
          .option("key", {
            alias: "k",
            demand: false,
            description: "Specify deployment key",
            type: "string",
          });

        addCommonConfiguration(yargs);
      })
      .command("clear", "Clear the release history associated with a deployment", (yargs: yargs.Argv) =>
        deploymentHistoryClear("clear", yargs)
      )
      .command("remove", "Remove a deployment from an app", (yargs: yargs.Argv) => deploymentRemove("remove", yargs))
      .command("rm", "Remove a deployment from an app", (yargs: yargs.Argv) => deploymentRemove("rm", yargs))
      .command("rename", "Rename an existing deployment", (yargs: yargs.Argv) => {
        isValidCommand = true;
        yargs
          .usage(USAGE_PREFIX + " deployment rename <appName> <currentDeploymentName> <newDeploymentName>")
          .demand(/*count*/ 3, /*max*/ 3) // Require exactly three non-option arguments
          .example(
            "deployment rename MyApp CurrentDeploymentName NewDeploymentName",
            'Renames deployment "CurrentDeploymentName" to "NewDeploymentName"'
          );

        addCommonConfiguration(yargs);
      })
      .command("list", "List the deployments associated with an app", (yargs: yargs.Argv) => deploymentList("list", yargs))
      .command("ls", "List the deployments associated with an app", (yargs: yargs.Argv) => deploymentList("ls", yargs))
      .command("history", "Display the release history for a deployment", (yargs: yargs.Argv) => deploymentHistory("history", yargs))
      .command("h", "Display the release history for a deployment", (yargs: yargs.Argv) => deploymentHistory("h", yargs))
      .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

    addCommonConfiguration(yargs);
  })
  /*  .command("link", "Link an additional authentication provider (e.g. GitHub) to an existing CodePush account", (yargs: yargs.Argv) => {
        isValidCommand = true;
        yargs
          .usage(USAGE_PREFIX + " link")
          .demand(/!*count*!/ 0, /!*max*!/ 1) //set 'max' to one to allow usage of serverUrl undocument parameter for testing
          .example("link", "Links an account on the CodePush server")
          .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

        addCommonConfiguration(yargs);
      })*/
  .command("login", "Authenticate with the CodePush server in order to begin managing your apps", (yargs: yargs.Argv) => {
    isValidCommand = true;
    yargs
      .usage(USAGE_PREFIX + " login [options]")
      .demand(/*count*/ 0, /*max*/ 2) //set 'max' to one to allow usage of serverUrl undocument parameter for testing
      .example("login", "Logs in to the CodePush server")
      .example("login --accessKey mykey", 'Logs in on behalf of the user who owns and created the access key "mykey"')
      .option("accessKey", {
        alias: "key",
        default: null,
        demand: false,
        description:
          "Access key to authenticate against the CodePush server with, instead of providing your username and password credentials",
        type: "string",
      })
      .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

    addCommonConfiguration(yargs);
  })
  .command("logout", "Log out of the current session", (yargs: yargs.Argv) => {
    isValidCommand = true;
    yargs
      .usage(USAGE_PREFIX + " logout")
      .demand(/*count*/ 0, /*max*/ 0)
      .example("logout", "Logs out and ends your current session");
    addCommonConfiguration(yargs);
  })
  .command("patch", "Update the metadata for an existing release", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " patch <appName> <deploymentName> [options]")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
      .example(
        'patch MyApp Production --des "Updated description" -r 50%',
        'Updates the description of the latest release for "MyApp" app\'s "Production" deployment and updates the rollout value to 50%'
      )
      .example(
        'patch MyApp Production -l v3 --des "Updated description for v3"',
        'Updates the description of the release with label v3 for "MyApp" app\'s "Production" deployment'
      )
      .option("label", {
        alias: "l",
        default: null,
        demand: false,
        description: "Label of the release to update. Defaults to the latest release within the specified deployment",
        type: "string",
      })
      .option("description", {
        alias: "des",
        default: null,
        demand: false,
        description: "Description of the changes made to the app with this release",
        type: "string",
      })
      .option("disabled", {
        alias: "x",
        default: null,
        demand: false,
        description: "Specifies whether this release should be immediately downloadable",
        type: "boolean",
      })
      .option("mandatory", {
        alias: "m",
        default: null,
        demand: false,
        description: "Specifies whether this release should be considered mandatory",
        type: "boolean",
      })
      .option("rollout", {
        alias: "r",
        default: null,
        demand: false,
        description:
          "Percentage of users this release should be immediately available to. This attribute can only be increased from the current value.",
        type: "string",
      })
      .option("targetBinaryVersion", {
        alias: "t",
        default: null,
        demand: false,
        description: "Semver expression that specifies the binary app version(s) this release is targeting (e.g. 1.1.0, ~1.2.3).",
        type: "string",
      })
      .option("buildNumber", {
        alias: "bn",
        default: undefined,
        demand: false,
        description:
          'Retarget this release to a specific native build (e.g. "100"). Pass an empty string ("") to reset to wildcard (all builds).',
        type: "string",
      })
      .check((argv: any): any => {
        return isValidRollout(argv);
      });

    addCommonConfiguration(yargs);
  })
  .command("promote", "Promote the latest release from one app deployment to another", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " promote <appName> <sourceDeploymentName> <destDeploymentName> [options]")
      .demand(/*count*/ 3, /*max*/ 3) // Require exactly three non-option arguments
      .example(
        "promote MyApp Staging Production",
        'Promotes the latest release within the "Staging" deployment of "MyApp" to "Production"'
      )
      .example(
        'promote MyApp Staging Production --des "Production rollout" -r 25',
        'Promotes the latest release within the "Staging" deployment of "MyApp" to "Production", with an updated description, and targeting only 25% of the users'
      )
      .option("description", {
        alias: "des",
        default: null,
        demand: false,
        description:
          "Description of the changes made to the app with this release. If omitted, the description from the release being promoted will be used.",
        type: "string",
      })
      .option("label", {
        alias: "l",
        default: null,
        demand: false,
        description: "Label of the source release that will be taken. If omitted, the latest release being promoted will be used.",
        type: "string",
      })
      .option("disabled", {
        alias: "x",
        default: null,
        demand: false,
        description:
          "Specifies whether this release should be immediately downloadable. If omitted, the disabled attribute from the release being promoted will be used.",
        type: "boolean",
      })
      .option("mandatory", {
        alias: "m",
        default: null,
        demand: false,
        description:
          "Specifies whether this release should be considered mandatory. If omitted, the mandatory property from the release being promoted will be used.",
        type: "boolean",
      })
      .option("noDuplicateReleaseError", {
        default: false,
        demand: false,
        description:
          "When this flag is set, promoting a package that is identical to the latest release on the target deployment will produce a warning instead of an error",
        type: "boolean",
      })
      .option("rollout", {
        alias: "r",
        default: "100%",
        demand: false,
        description: "Percentage of users this update should be immediately available to",
        type: "string",
      })
      .option("targetBinaryVersion", {
        alias: "t",
        default: null,
        demand: false,
        description:
          "Semver expression that specifies the binary app version(s) this release is targeting (e.g. 1.1.0, ~1.2.3). If omitted, the target binary version property from the release being promoted will be used.",
        type: "string",
      })
      .check((argv: any): any => {
        return isValidRollout(argv);
      });

    addCommonConfiguration(yargs);
  })
  .command("register", "Register a new CodePush account", (yargs: yargs.Argv) => {
    isValidCommand = true;
    yargs
      .usage(USAGE_PREFIX + " register")
      .demand(/*count*/ 0, /*max*/ 1) //set 'max' to one to allow usage of serverUrl undocument parameter for testing
      .example("register", "Registers a new CodePush account")
      .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

    addCommonConfiguration(yargs);
  })
  .command("release", "Release an update to an app deployment", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " release <appName> <updateContentsPath> <targetBinaryVersion> [options]")
      .demand(/*count*/ 3, /*max*/ 3) // Require exactly three non-option arguments.
      .example(
        'release MyApp app.js "*"',
        'Releases the "app.js" file to the "MyApp" app\'s "Staging" deployment, targeting any binary version using the "*" wildcard range syntax.'
      )
      .example(
        "release MyApp ./platforms/ios/www 1.0.3 -d Production",
        'Releases the "./platforms/ios/www" folder and all its contents to the "MyApp" app\'s "Production" deployment, targeting only the 1.0.3 binary version'
      )
      .example(
        "release MyApp ./platforms/ios/www 1.0.3 -d Production -r 20",
        'Releases the "./platforms/ios/www" folder and all its contents to the "MyApp" app\'s "Production" deployment, targeting the 1.0.3 binary version and rolling out to about 20% of the users'
      )
      .option("deploymentName", {
        alias: "d",
        default: "Staging",
        demand: false,
        description: "Deployment to release the update to",
        type: "string",
      })
      .option("description", {
        alias: "des",
        default: null,
        demand: false,
        description: "Description of the changes made to the app in this release",
        type: "string",
      })
      .option("disabled", {
        alias: "x",
        default: false,
        demand: false,
        description: "Specifies whether this release should be immediately downloadable",
        type: "boolean",
      })
      .option("mandatory", {
        alias: "m",
        default: false,
        demand: false,
        description: "Specifies whether this release should be considered mandatory",
        type: "boolean",
      })
      .option("noDuplicateReleaseError", {
        default: false,
        demand: false,
        description:
          "When this flag is set, releasing a package that is identical to the latest release will produce a warning instead of an error",
        type: "boolean",
      })
      .option("rollout", {
        alias: "r",
        default: "100%",
        demand: false,
        description: "Percentage of users this release should be available to",
        type: "string",
      })
      .option("buildNumber", {
        alias: "bn",
        default: null,
        demand: false,
        description:
          "Target clients on a specific native build (CFBundleVersion on iOS, versionCode on Android). Requires an exact appVersion (e.g. 1.2.3, not a range) and an existing native release with that build number. If omitted, targets all clients on the specified appVersion.",
        type: "string",
      })
      .check((argv: any): any => {
        return checkValidReleaseOptions(argv);
      });

    addCommonConfiguration(yargs);
  })
  .command("release-react", "Release a React Native update to an app deployment", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " release-react <appName> <platform> [options]")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
      .example(
        "release-react MyApp ios",
        'Releases the React Native iOS project in the current working directory to the "MyApp" app\'s "Staging" deployment'
      )
      .example(
        "release-react MyApp android -d Production",
        'Releases the React Native Android project in the current working directory to the "MyApp" app\'s "Production" deployment'
      );

    addReactReleaseOptions(yargs);

    addCommonConfiguration(yargs);
  })
  .command("release-expo", "Release an Expo / React Native update to an app deployment", (yargs: yargs.Argv) => {
    isValidCommand = true;

    yargs
      .usage(USAGE_PREFIX + " release-expo <appName> <platform> [options]")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
      .example(
        "release-expo MyApp ios",
        'Releases the Expo-managed iOS project in the current working directory to the "MyApp" app\'s "Staging" deployment'
      )
      .example(
        "release-expo MyApp android -d Production",
        'Releases the Expo-managed Android project in the current working directory to the "MyApp" app\'s "Production" deployment'
      );

    addReactReleaseOptions(yargs);

    addCommonConfiguration(yargs);
  })
  .command("release-native", "Release a binary update to an app deployment", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " release-native <appName> <platform> <targetBinary> [options]")
      .demand(/*count*/ 3, /*max*/ 3) // Require exactly three non-option arguments
      .example(
        "release-native MyApp ios ./app.ipa",
        'Releases the React Native iOS project from "./app.ipa" to the "MyApp" app\'s "Staging" deployment'
      )
      .example(
        "release-native MyApp android ./app.apk -d Production",
        'Releases the React Native Android project from "./app.apk" to the "MyApp" app\'s "Production" deployment'
      )
      .option("deploymentName", {
        alias: "d",
        default: "Staging",
        demand: false,
        description: "Deployment to release the update to",
        type: "string",
      })
      .option("targetBinaryVersion", {
        alias: "t",
        default: null,
        demand: false,
        description: "Semver expression that specifies the binary app version(s) this release is targeting (e.g. 1.1.0, ~1.2.3).",
        type: "string",
      })
      .option("buildNumber", {
        alias: "bn",
        default: null,
        demand: false,
        description:
          "Targets this release to clients running a specific native binary build — CFBundleVersion on iOS or versionCode on Android. If omitted, auto-detected from the target binary (IPA/APK/AAB). Override when the value is set dynamically (e.g. on CI).",
        type: "string",
      })
      .check((argv: any): any => {
        return checkValidReleaseOptions(argv);
      });

    addCommonConfiguration(yargs);
  })
  .command("rollback", "Rollback the latest release for an app deployment", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " rollback <appName> <deploymentName> [options]")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments
      .example("rollback MyApp Production", 'Performs a rollback on the "Production" deployment of "MyApp"')
      .example(
        "rollback MyApp Production --targetRelease v4",
        'Performs a rollback on the "Production" deployment of "MyApp" to the v4 release'
      )
      .option("targetRelease", {
        alias: "r",
        default: null,
        demand: false,
        description:
          "Label of the release to roll the specified deployment back to (e.g. v4). If omitted, the deployment will roll back to the previous release.",
        type: "string",
      });

    addCommonConfiguration(yargs);
  })
  .command("session", "View and manage the current login sessions associated with your account", (yargs: yargs.Argv) => {
    yargs
      .usage(USAGE_PREFIX + " session <command>")
      .demand(/*count*/ 2, /*max*/ 2) // Require exactly two non-option arguments.
      .command("remove", "Remove an existing login session", (yargs: yargs.Argv) => sessionRemove("remove", yargs))
      .command("rm", "Remove an existing login session", (yargs: yargs.Argv) => sessionRemove("rm", yargs))
      .command("list", "List the current login sessions associated with your account", (yargs: yargs.Argv) =>
        sessionList("list", yargs)
      )
      .command("ls", "List the current login sessions associated with your account", (yargs: yargs.Argv) => sessionList("ls", yargs))
      .check((): any => isValidCommand); // Report unrecognized, non-hyphenated command category.

    addCommonConfiguration(yargs);
  })
  .command("whoami", "Display the account info for the current login session", (yargs: yargs.Argv) => {
    isValidCommand = true;
    yargs
      .usage(USAGE_PREFIX + " whoami")
      .demand(/*count*/ 0, /*max*/ 0)
      .example("whoami", "Display the account info for the current login session");
    addCommonConfiguration(yargs);
  })
  .alias("v", "version")
  .version(packageJson.version)
  .wrap(/*columnLimit*/ null)
  .fail(() => showHelp(/*showRootDescription*/ true)).argv; // Suppress the default error message.
