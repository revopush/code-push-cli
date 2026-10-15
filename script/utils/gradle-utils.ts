// Reads the Android app's version and Hermes settings. Groovy DSL is parsed statically; Kotlin DSL versions are
// evaluated by running the Gradle wrapper with an injected task that prints them.

import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import * as chalk from "chalk";

import { fileExists } from "./file-utils";
import { isValidVersion } from "../react-native-utils";

const g2js = require("gradle-to-js/lib/parser");
const properties = require("properties");

const exec = promisify(childProcess.exec);

export interface AndroidVersionInfo {
  appVersion?: string;
  buildNumber?: string;
}

/** Raw values from the build script — literals or references to Gradle properties. */
interface GradleVersionFields {
  versionName: string | null;
  versionCode: string | number | null;
}

const DEFAULT_APP_DIR = path.join("android", "app");
const FALLBACK_HINT = "Pass the version explicitly with --targetBinaryVersion to skip Gradle detection.";

// "revopush"-prefixed to avoid collisions with project tasks; written in Groovy,
// which Gradle accepts as an init script for projects of either DSL.
const PRINT_VERSION_TASK = "_revopushPrintVersion";
const printVersionInitScript = (moduleName: string) => `
allprojects {
  afterEvaluate { proj ->
    if (proj.name == '${moduleName}') {
      task ${PRINT_VERSION_TASK} {
        doLast {
          def android = proj.extensions.findByName('android')
          if (android == null) {
            throw new GradleException("Project ':${moduleName}' does not apply the Android Gradle plugin (no 'android' extension found).")
          }
          println groovy.json.JsonOutput.toJson([
            versionName: android.defaultConfig.versionName,
            versionCode: android.defaultConfig.versionCode?.toString()
          ])
        }
      }
    }
  }
}
`.trim();

// Every `gradleFile` parameter below is the app's build script or its directory; defaults to "android/app".

export async function getAndroidVersionInfo(gradleFile?: string | null): Promise<AndroidVersionInfo> {
  const buildFile = findGradleBuildFile(gradleFile);
  if (!buildFile) {
    throw new Error(`Unable to find gradle file "${gradleFile ?? DEFAULT_APP_DIR}".`);
  }
  const { versionName, versionCode } = buildFile.endsWith(".kts")
    ? await evaluateKotlinDslBuildFile(buildFile)
    : await parseGroovyDslVersion(buildFile);

  const appVersion = resolveAppVersion(versionName, buildFile);
  const buildNumber = resolveBuildNumber(versionCode, buildFile);
  if (!buildNumber) {
    console.log(chalk.yellow(
      `Warning: Unable to read "android.defaultConfig.versionCode" from "${buildFile}". ` +
      `This is expected if it is set dynamically (e.g. on CI). Pass --buildNumber explicitly to include it in the release.`
    ));
  }
  return { appVersion, buildNumber };
}

/** `hermesEnabled` / `react.hermesEnabled`, or RN < 0.71's `enableHermes`; undefined if unset */
export async function getGradleHermesEnabled(gradleFile?: string | null): Promise<boolean | undefined> {
  let enabled = readGradleProperty("hermesEnabled", gradleFile) ?? readGradleProperty("react.hermesEnabled", gradleFile);
  const buildFile = findGradleBuildFile(gradleFile);
  if (enabled === undefined && buildFile && !buildFile.endsWith(".kts")) {
    const parsed = await parseGroovyDslBuildFile(buildFile).catch((): any => ({}));
    enabled = getLegacyReactProperty(parsed, "enableHermes");
  }
  return enabled === undefined ? undefined : enabled.toLowerCase() === "true";
}

/** A literal `hermesCommand`, resolved from the project root like the RN Gradle plugin; expressions are ignored */
export function getGradleHermesCommand(gradleFile?: string | null): string | undefined {
  const buildFile = findGradleBuildFile(gradleFile);
  const buildScript = buildFile ? fs.readFileSync(buildFile, "utf8") : "";
  const hermesCommand = /^\s*hermesCommand\s*(?:=|\.set\()\s*["']([^"']+)["']\s*\)?\s*$/m.exec(buildScript)?.[1];
  if (!hermesCommand) return undefined;

  const androidDir = path.resolve(path.dirname(buildFile), "..");
  const expanded = hermesCommand.replace(/^\$\{?rootDir\}?/, androidDir);
  return expanded.includes("$") ? undefined : path.resolve(androidDir, "..", expanded);
}

/** A property from the app module's or the Android project's gradle.properties. */
export function readGradleProperty(key: string, gradleFile?: string | null): string | undefined {
  const appDir = getAppDir(gradleFile);
  for (const file of [path.join(appDir, "gradle.properties"), path.join(appDir, "..", "gradle.properties")]) {
    if (!fileExists(file)) continue;
    // The properties parser type-converts values (e.g. "2" becomes a number) — normalize back to string.
    const value = properties.parse(fs.readFileSync(file, "utf8"))?.[key]?.toString();
    if (value) return value;
  }
}

function getAppDir(gradleFile?: string | null): string {
  const location = gradleFile || DEFAULT_APP_DIR;
  return fileExists(location) ? path.dirname(location) : location;
}

/** The build script: the given file itself, or inside the app directory (Kotlin DSL preferred). */
function findGradleBuildFile(gradleFile?: string | null): string | undefined {
  const appDir = getAppDir(gradleFile);
  return [gradleFile, path.join(appDir, "build.gradle.kts"), path.join(appDir, "build.gradle")].find(
    (file) => file && fileExists(file)
  );
}

async function parseGroovyDslBuildFile(buildFile: string): Promise<any> {
  try {
    return await g2js.parseFile(buildFile);
  } catch {
    throw new Error(`Unable to parse the "${buildFile}" file. Please ensure it is a well-formed Gradle file.`);
  }
}

// RN < 0.71's `project.ext.react = [key: value]`. g2js prepends a trailing `// comment` to the next entry, so strip it
function getLegacyReactProperty(parsed: any, key: string): string | undefined {
  const entries: string[] = parsed["project.ext.react"] || [];
  const entry = entries.map((prop) => prop.replace(/\/\/.*$/gm, "").trim()).find((prop) => prop.startsWith(`${key}:`));
  return entry?.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

async function parseGroovyDslVersion(buildFile: string): Promise<GradleVersionFields> {
  const parsed = await parseGroovyDslBuildFile(buildFile);
  // g2js yields an array when the file contains multiple 'android' blocks.
  const androidBlocks: any[] = Array.isArray(parsed.android) ? parsed.android : [parsed.android];
  const defaultConfig = androidBlocks.find((block) => block?.defaultConfig)?.defaultConfig;
  if (!defaultConfig && /^\s*val\s+/m.test(fs.readFileSync(buildFile, "utf8"))) {
    throw new Error(
      `"${buildFile}" appears to contain Kotlin DSL syntax. Gradle determines the script language by file extension — ` +
      `rename the file to "${path.basename(buildFile)}.kts" to make it a valid Kotlin DSL build script.`
    );
  }
  return {
    // g2js keeps the Groovy quotes around string literals — strip them.
    versionName: defaultConfig?.versionName?.replace(/"/g, "").trim() ?? null,
    versionCode: defaultConfig?.versionCode ?? null,
  };
}

async function evaluateKotlinDslBuildFile(buildFile: string): Promise<GradleVersionFields> {
  // The build file lives in the application module folder (typically android/app);
  // its parent is the Gradle project root, and the folder name is the module name.
  const moduleName = path.basename(path.dirname(path.resolve(buildFile)));
  const androidDir = path.resolve(buildFile, "..", "..");
  const gradlew = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (!fileExists(gradlew)) {
    throw new Error(`No Gradle wrapper found at "${gradlew}", required to evaluate "${buildFile}". ${FALLBACK_HINT}`);
  }

  const initScript = path.join(os.tmpdir(), `revopush-init-${process.pid}.gradle`);

  fs.writeFileSync(initScript, printVersionInitScript(moduleName), "utf8");
  try {
    const { stdout } = await exec(
      `"${gradlew}" --project-dir "${androidDir}" --init-script "${initScript}" -q :${moduleName}:${PRINT_VERSION_TASK}`,
      { timeout: 120000 }
    );
    // The task's JSON is the last line; configuration-phase output (plugin notices, printlns) may precede it.
    return JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? "");
  } catch (error) {
    throw new Error(`Gradle failed while reading the version from "${buildFile}": ${error.message}\n${FALLBACK_HINT}`);
  } finally {
    fs.rmSync(initScript, { force: true });
  }
}

function resolveAppVersion(versionName: string | null, buildFile: string): string | undefined {
  if (!versionName) return undefined;

  // A value that isn't valid semver and doesn't start with a digit is a property reference.
  const isPropertyRef = !isValidVersion(versionName) && !/^\d/.test(versionName);
  const appVersion = isPropertyRef ? readGradleProperty(versionName.replace("project.", ""), buildFile) : versionName;

  if (!appVersion || !isValidVersion(appVersion)) {
    throw new Error(
      `Unable to resolve a valid semver app version (e.g. 1.3.2) from "android.defaultConfig.versionName" in "${buildFile}" ` +
      `(found: "${versionName}"). ${FALLBACK_HINT}`
    );
  }
  return appVersion;
}

function resolveBuildNumber(versionCode: string | number | null, buildFile: string): string | undefined {
  const text = versionCode?.toString();
  if (!text) return undefined;
  // A non-numeric value is a reference to a Gradle property (e.g. "project.versionCode").
  return (/^\d+$/.test(text) ? text : readGradleProperty(text.replace("project.", ""), buildFile)) || undefined;
}
