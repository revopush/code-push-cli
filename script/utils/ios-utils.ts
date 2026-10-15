import * as fs from "fs";
import * as path from "path";
import * as cli from "../types/cli";
import { isValidVersion } from "../react-native-utils";
import { fileExists } from "./file-utils";

const plist = require("plist");
const xcode = require("xcode");

export interface IosVersionInfo {
  appVersion?: string;
  buildNumber?: string;
}

/** Reads the app version from Info.plist, or from the Xcode project when the plist refers to its build settings */
export async function getIosVersionInfo(command: cli.IReleaseReactCommand, projectName: string): Promise<IosVersionInfo> {
  let resolvedPlistFile: string = command.plistFile;
  if (resolvedPlistFile) {
    // If a plist file path is explicitly provided, then we don't
    // need to attempt to "resolve" it within the well-known locations.
    if (!fileExists(resolvedPlistFile)) {
      throw new Error("The specified plist file doesn't exist. Please check that the provided path is correct.");
    }
  } else {
    // Allow the plist prefix to be specified with or without a trailing
    // separator character, but prescribe the use of a hyphen when omitted,
    // since this is the most commonly used convention for plist files.
    if (command.plistFilePrefix && /.+[^-.]$/.test(command.plistFilePrefix)) {
      command.plistFilePrefix += "-";
    }

    const iOSDirectory = "ios";
    const plistFileName = `${command.plistFilePrefix || ""}Info.plist`;

    const knownLocations = [path.join(iOSDirectory, projectName, plistFileName), path.join(iOSDirectory, plistFileName)];

    resolvedPlistFile = knownLocations.find(fileExists);

    if (!resolvedPlistFile) {
      throw new Error(
        `Unable to find either of the following plist files in order to infer your app's binary version: "${knownLocations.join(
          '", "'
        )}". If your plist has a different name, or is located in a different directory, consider using either the "--plistFile" or "--plistFilePrefix" parameters to help inform the CLI how to find it.`
      );
    }
  }

  const plistContents = fs.readFileSync(resolvedPlistFile).toString();

  let parsedPlist: any;

  try {
    parsedPlist = plist.parse(plistContents);
  } catch {
    throw new Error(`Unable to parse "${resolvedPlistFile}". Please ensure it is a well-formed plist file.`);
  }

  const rawShortVersion: string | undefined = parsedPlist.CFBundleShortVersionString;
  const rawBundleVersion: string | undefined = parsedPlist.CFBundleVersion;

  // Both keys may reference Xcode build settings — delegate to the project file if either does
  if (rawShortVersion === "$(MARKETING_VERSION)" || rawBundleVersion === "$(CURRENT_PROJECT_VERSION)") {
    return getAppVersionFromXcodeProject(command, projectName);
  }

  if (rawShortVersion && !isValidVersion(rawShortVersion)) {
    throw new Error(
      `The "CFBundleShortVersionString" key in the "${resolvedPlistFile}" file needs to specify a valid semver string (e.g. 1.3.2).`
    );
  }

  return { appVersion: rawShortVersion, buildNumber: rawBundleVersion };
}

async function getAppVersionFromXcodeProject(command: cli.IReleaseReactCommand, projectName: string): Promise<IosVersionInfo> {
  const pbxprojFileName = "project.pbxproj";
  let resolvedPbxprojFile: string = command.xcodeProjectFile;
  if (resolvedPbxprojFile) {
    // If the xcode project file path is explicitly provided, then we don't
    // need to attempt to "resolve" it within the well-known locations.
    if (!resolvedPbxprojFile.endsWith(pbxprojFileName)) {
      // Specify path to pbxproj file if the provided file path is an Xcode project file.
      resolvedPbxprojFile = path.join(resolvedPbxprojFile, pbxprojFileName);
    }
    if (!fileExists(resolvedPbxprojFile)) {
      throw new Error("The specified pbx project file doesn't exist. Please check that the provided path is correct.");
    }
  } else {
    const iOSDirectory = "ios";
    const xcodeprojDirectory = `${projectName}.xcodeproj`;
    const pbxprojKnownLocations = [
      path.join(iOSDirectory, xcodeprojDirectory, pbxprojFileName),
      path.join(iOSDirectory, pbxprojFileName),
    ];
    resolvedPbxprojFile = pbxprojKnownLocations.find(fileExists);

    if (!resolvedPbxprojFile) {
      throw new Error(
        `Unable to find either of the following pbxproj files in order to infer your app's binary version: "${pbxprojKnownLocations.join(
          '", "'
        )}".`
      );
    }
  }

  const xcodeProj = xcode.project(resolvedPbxprojFile).parseSync();
  const marketingVersion = xcodeProj.getBuildProperty("MARKETING_VERSION", command.buildConfigurationName, command.xcodeTargetName);
  if (!isValidVersion(marketingVersion)) {
    throw new Error(
      `The "MARKETING_VERSION" key in the "${resolvedPbxprojFile}" file needs to specify a valid semver string, containing both a major and minor version (e.g. 1.3.2, 1.1).`
    );
  }

  const currentProjectVersion = xcodeProj.getBuildProperty(
    "CURRENT_PROJECT_VERSION",
    command.buildConfigurationName,
    command.xcodeTargetName
  );
  if (!currentProjectVersion) {
    throw new Error(`The "CURRENT_PROJECT_VERSION" key doesn't exist in the "${resolvedPbxprojFile}" file.`);
  }

  return { appVersion: marketingVersion, buildNumber: String(currentProjectVersion) };
}
