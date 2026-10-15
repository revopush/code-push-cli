import { strict as assert } from "assert";
import { ChildProcess } from "child_process";

export function argValue(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  assert.notEqual(index, -1, `Expected the "${flag}" argument`);
  return args[index + 1];
}

/** Stands in for the bundler's child process, which exits successfully right away */
export function fakeBundlerProcess(args: unknown[]): ChildProcess {
  assert.ok(
    args.every((arg) => typeof arg === "string"),
    `Bundler arguments must be strings: ${JSON.stringify(args)}`
  );
  return {
    stdout: { on() {} },
    stderr: { on() {} },
    on(event: string, callback: (exitCode: number) => void) {
      if (event === "close") {
        callback(0);
      }
    },
  } as unknown as ChildProcess;
}
