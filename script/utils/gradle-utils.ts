// Detects the Android versionName/versionCode a CodePush release should target.
// Groovy DSL (build.gradle) is parsed statically; Kotlin DSL (build.gradle.kts) may
// compute values from arbitrary expressions, so it is evaluated by running the
// project's Gradle wrapper with an injected task that prints the resolved values.

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

/** @param gradleFile build script path or its directory; defaults to "android/app". */
export async function getAndroidVersionInfo(gradleFile?: string | null): Promise<AndroidVersionInfo> {
  const buildFile = resolveGradleBuildFile(gradleFile ?? path.join("android", "app"));
  const { versionName, versionCode } = buildFile.endsWith(".kts")
    ? await evaluateKotlinDslBuildFile(buildFile)
    : await parseGroovyDslBuildFile(buildFile);

  const appVersion = resolveAppVersion(versionName, buildFile);
  const buildNumber = resolveBuildNumber(versionCode);
  if (!buildNumber) {
    console.log(chalk.yellow(
      `Warning: Unable to read "android.defaultConfig.versionCode" from "${buildFile}". ` +
      `This is expected if it is set dynamically (e.g. on CI). Pass --buildNumber explicitly to include it in the release.`
    ));
  }
  return { appVersion, buildNumber };
}

/** Locates the build script: the given file itself, or inside the given directory (Kotlin DSL preferred). */
function resolveGradleBuildFile(gradleFile: string): string {
  const candidates = [gradleFile, path.join(gradleFile, "build.gradle.kts"), path.join(gradleFile, "build.gradle")];
  const buildFile = candidates.find(fileExists);
  if (!buildFile) {
    throw new Error(`Unable to find gradle file "${gradleFile}".`);
  }
  return buildFile;
}

async function parseGroovyDslBuildFile(buildFile: string): Promise<GradleVersionFields> {
  const parsed: any = await g2js.parseFile(buildFile).catch(() => {
    throw new Error(`Unable to parse the "${buildFile}" file. Please ensure it is a well-formed Gradle file.`);
  });
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
  const appVersion = isPropertyRef ? lookupGradleProperty(versionName.replace("project.", "")) : versionName;

  if (!appVersion || !isValidVersion(appVersion)) {
    throw new Error(
      `Unable to resolve a valid semver app version (e.g. 1.3.2) from "android.defaultConfig.versionName" in "${buildFile}" ` +
      `(found: "${versionName}"). ${FALLBACK_HINT}`
    );
  }
  return appVersion;
}

function resolveBuildNumber(versionCode: string | number | null): string | undefined {
  const text = versionCode?.toString();
  if (!text) return undefined;
  // A non-numeric value is a reference to a Gradle property (e.g. "project.versionCode").
  return (/^\d+$/.test(text) ? text : lookupGradleProperty(text.replace("project.", ""))) || undefined;
}

function lookupGradleProperty(key: string): string | undefined {
  const files = [path.join("android", "app", "gradle.properties"), path.join("android", "gradle.properties")];
  for (const file of files) {
    if (!fileExists(file)) continue;
    // The properties parser type-converts values (e.g. "2" becomes a number) — normalize back to string.
    const value = properties.parse(fs.readFileSync(file, "utf8"))?.[key]?.toString();
    if (value) return value;
  }
}
