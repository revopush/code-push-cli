import * as childProcess from "child_process";

export function getExpoCliPath(): string {
  const result = childProcess.spawnSync("node", ["--print", "require.resolve('@expo/cli')"]);
  const cliPath = result.stdout.toString().trim();

  if (result.status === 0 && cliPath) {
    return cliPath;
  }

  throw new Error(
    'Unable to resolve "@expo/cli". Please make sure it is installed in your project (e.g. "npm install --save-dev @expo/cli").'
  );
}
