import * as fs from "fs";
import * as path from "path";
import * as childProcess from "child_process";

export function getReactNativePackagePath(): string {
  const result = childProcess.spawnSync("node", ["--print", "require.resolve('react-native/package.json')"]);
  return result.status === 0 ? path.dirname(result.stdout.toString().trim()) : path.join("node_modules", "react-native");
}

export function getReactNativeVersion(): string | undefined {
  const packageJson = path.join(getReactNativePackagePath(), "package.json");
  return fs.existsSync(packageJson) ? JSON.parse(fs.readFileSync(packageJson, "utf8")).version : undefined;
}
