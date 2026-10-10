import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

export function getReactNativePackagePath(): string {
  const result = childProcess.spawnSync("node", ["--print", "require.resolve('react-native/package.json')"]);
  const packagePath = path.dirname(result.stdout.toString());
  if (result.status === 0 && directoryExistsSync(packagePath)) {
    return packagePath;
  }

  return path.join("node_modules", "react-native");
}

function directoryExistsSync(dirname: string): boolean {
  try {
    return fs.statSync(dirname).isDirectory();
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  return false;
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
