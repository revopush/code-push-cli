// Reads the Android app's version and Hermes settings. Groovy DSL is parsed statically; Kotlin DSL is evaluated
// by running the Gradle wrapper with an injected task that prints the values.

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

// Groovy init scripts work for projects of either DSL
const PRINT_TASK = "_revopushPrint";
const printInitScript = (moduleName: string, printJson: string) => `
allprojects {
  afterEvaluate { proj ->
    if (proj.name == '${moduleName}') {
      task ${PRINT_TASK} {
        doLast {
          ${printJson}
        }
      }
    }
  }
}
`.trim();

const PRINT_VERSION = `
          def android = proj.extensions.findByName('android')
          if (android == null) {
            throw new GradleException("Project ':\${proj.name}' does not apply the Android Gradle plugin (no 'android' extension found).")
          }
          println groovy.json.JsonOutput.toJson([
            versionName: android.defaultConfig.versionName,
            versionCode: android.defaultConfig.versionCode?.toString()
          ])`;

const PRINT_REACT_CONFIG = `
          def react = proj.extensions.findByName('react')
          println groovy.json.JsonOutput.toJson([
            hermesCommand: react?.hermesCommand?.getOrElse(''),
            root: react?.root?.get()?.asFile?.absolutePath
          ])`;

// Every `gradleFile` parameter below is the app's build script or its directory; defaults to "android/app".

export async function getAndroidVersionInfo(gradleFile?: string | null): Promise<AndroidVersionInfo> {
  const buildFile = findGradleBuildFile(gradleFile);
  if (!buildFile) {
    throw new Error(`Unable to find gradle file "${gradleFile ?? DEFAULT_APP_DIR}".`);
  }
  const { versionName, versionCode } = isKotlinDsl(buildFile)
    ? await evaluateKotlinDslVersion(buildFile)
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

/** `(react.)hermesEnabled` from gradle.properties, or `enableHermes` from RN < 0.71's `project.ext.react`; undefined if unset. */
export async function getGradleHermesEnabled(gradleFile?: string | null): Promise<boolean | undefined> {
  let enabled = readGradleProperty("hermesEnabled", gradleFile) ?? readGradleProperty("react.hermesEnabled", gradleFile);
  const buildFile = findGradleBuildFile(gradleFile);
  if (enabled === undefined && buildFile && !isKotlinDsl(buildFile)) {
    const parsed = await parseGroovyDslBuildFile(buildFile).catch((): any => ({}));
    enabled = getLegacyReactProperty(parsed, "enableHermes");
  }
  return enabled === undefined ? undefined : enabled.toLowerCase() === "true";
}

/**
 * The app's `react { hermesCommand }` (or RN < 0.71's `project.ext.react`) as an absolute path, resolved from the
 * directory the RN Gradle plugin runs hermesc in. It may still contain the `%OS-BIN%` placeholder.
 */
export async function getGradleHermesCommand(gradleFile?: string | null): Promise<string | undefined> {
  const buildFile = findGradleBuildFile(gradleFile);
  if (!buildFile) return undefined;
  return isKotlinDsl(buildFile) ? evaluateKotlinDslHermesCommand(buildFile) : parseGroovyDslHermesCommand(buildFile);
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

function isKotlinDsl(buildFile: string): boolean {
  return buildFile.endsWith(".kts");
}

function parseGroovyDslBuildFile(buildFile: string): Promise<any> {
  return g2js.parseFile(buildFile).catch(() => {
    throw new Error(`Unable to parse the "${buildFile}" file. Please ensure it is a well-formed Gradle file.`);
  });
}

// RN < 0.71 configured the app with `project.ext.react = [key: value, ...]`. g2js keeps a trailing `// comment`
// at the start of the next entry (RN's template has `enableHermes: false,  // ...`), so strip comments first.
function getLegacyReactProperty(parsed: any, key: string): string | undefined {
  const entries: string[] = parsed["project.ext.react"] || [];
  const entry = entries.map((prop) => prop.replace(/\/\/.*$/gm, "").trim()).find((prop) => prop.startsWith(`${key}:`));
  return entry?.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

// The RN Gradle plugin runs hermesc from react.root (default: the project root); RN < 0.71's react.gradle from the app module
async function parseGroovyDslHermesCommand(buildFile: string): Promise<string | undefined> {
  const gradle = await parseGroovyDslBuildFile(buildFile);
  const appDir = path.resolve(path.dirname(buildFile));
  const variables = { rootDir: path.dirname(appDir), projectDir: appDir };

  if (gradle.react?.hermesCommand) {
    const hermesCommand = toLiteralPath(gradle.react.hermesCommand, variables);
    const root = toLiteralPath(/^file\(["'](.+)["']\)$/.exec(gradle.react.root ?? "")?.[1], variables) ?? "../..";
    return hermesCommand && path.resolve(appDir, root, hermesCommand);
  }

  const legacyHermesCommand = toLiteralPath(getLegacyReactProperty(gradle, "hermesCommand"), variables);
  return legacyHermesCommand && path.resolve(appDir, legacyHermesCommand);
}

// A plain Groovy string with $rootDir / $projectDir expanded; undefined for any other expression, like Expo's
function toLiteralPath(value: unknown, variables: Record<string, string>): string | undefined {
  if (typeof value !== "string") return undefined;
  const expanded = value.replace(/\$(?:\{(\w+)\}|(\w+))/g, (match, braced, bare) => variables[braced ?? bare] ?? match);
  return /["'$()+]/.test(expanded) ? undefined : expanded;
}

// Running Gradle is slow, so only evaluate Kotlin DSL scripts that actually set hermesCommand
async function evaluateKotlinDslHermesCommand(buildFile: string): Promise<string | undefined> {
  if (!/^[^/\n]*\bhermesCommand\b/m.test(fs.readFileSync(buildFile, "utf8"))) {
    return undefined;
  }
  const { hermesCommand, root } = await runGradlePrintTask(buildFile, PRINT_REACT_CONFIG);
  return hermesCommand && root ? path.resolve(root, hermesCommand) : undefined;
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

async function evaluateKotlinDslVersion(buildFile: string): Promise<GradleVersionFields> {
  try {
    return await runGradlePrintTask(buildFile, PRINT_VERSION);
  } catch (error) {
    throw new Error(`${error.message}\n${FALLBACK_HINT}`);
  }
}

/** Runs the project's Gradle wrapper with an injected task and returns the JSON it prints. */
async function runGradlePrintTask(buildFile: string, printJson: string): Promise<any> {
  // android/<module>/build.gradle.kts
  const moduleName = path.basename(path.dirname(path.resolve(buildFile)));
  const androidDir = path.resolve(buildFile, "..", "..");
  const gradlew = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (!fileExists(gradlew)) {
    throw new Error(`No Gradle wrapper found at "${gradlew}", required to evaluate "${buildFile}".`);
  }

  const initScript = path.join(os.tmpdir(), `revopush-init-${process.pid}.gradle`);

  fs.writeFileSync(initScript, printInitScript(moduleName, printJson), "utf8");
  try {
    const { stdout } = await exec(
      `"${gradlew}" --project-dir "${androidDir}" --init-script "${initScript}" -q :${moduleName}:${PRINT_TASK}`,
      { timeout: 120000 }
    );
    // Configuration output may precede the JSON line
    return JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? "");
  } catch (error) {
    throw new Error(`Gradle failed while evaluating "${buildFile}": ${error.message}`);
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
