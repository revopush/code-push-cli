// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as childProcess from "child_process";
import * as cli from "../../script/types/cli";

interface IDebugPlatform {
  getLogProcess(): any;
  normalizeLogMessage(message: string): string;
}

class AndroidDebugPlatform implements IDebugPlatform {
  public getLogProcess(): any {
    if (childProcess.spawnSync("adb", ["version"]).error) {
      throw new Error("ADB command not found. Please ensure it is installed and available on your path.");
    }

    const numberOfAvailableDevices = this.getNumberOfAvailableDevices();
    if (numberOfAvailableDevices === 0) {
      throw new Error("No Android devices found. Re-run this command after starting one.");
    }

    // adb logcat can't be pointed at one device here, so it would read whichever adb picks
    if (numberOfAvailableDevices > 1) {
      throw new Error(`Found "${numberOfAvailableDevices}" android devices. Please leave only one device you need to debug.`);
    }

    return childProcess.spawn("adb", ["logcat"]);
  }

  // Counts the "<serial>    device" lines of `adb devices`
  private getNumberOfAvailableDevices(): number {
    const output = childProcess.execSync("adb devices").toString();
    return output.match(/\b(device)\b/gim)?.length ?? 0;
  }

  public normalizeLogMessage(message: string): string {
    // Android Cordova apps append the source URL
    const sourceURLIndex: number = message.indexOf('", source: file:///');
    return sourceURLIndex === -1 ? message : message.substring(0, sourceURLIndex);
  }
}

class iOSDebugPlatform implements IDebugPlatform {
  private getSimulatorID(): string {
    // Devices are grouped by runtime
    const { devices } = JSON.parse(childProcess.execFileSync("xcrun", ["simctl", "list", "devices", "--json"], { encoding: "utf8" }));
    const booted: any = Object.values(devices)
      .flat()
      .find((device: any) => device.state === "Booted");
    return booted?.udid;
  }

  public getLogProcess(): any {
    if (process.platform !== "darwin") {
      throw new Error("iOS debug logs can only be viewed on OS X.");
    }

    const simulatorID: string = this.getSimulatorID();
    if (!simulatorID) {
      throw new Error("No iOS simulators found. Re-run this command after starting one.");
    }

    // Simulators no longer write system.log; their logs are read through unified logging
    return childProcess.spawn("xcrun", [
      "simctl",
      "spawn",
      simulatorID,
      "log",
      "stream",
      "--level",
      "debug",
      "--style",
      "compact",
      "--predicate",
      'eventMessage CONTAINS "[CodePush]"',
    ]);
  }

  public normalizeLogMessage(message: string): string {
    return message;
  }
}

const logMessagePrefix = "[CodePush] ";
function processLogData(logData: Buffer) {
  const content = logData.toString();
  content
    .split("\n")
    .filter((line: string) => line.indexOf(logMessagePrefix) > -1)
    .map((line: string) => {
      line = this.normalizeLogMessage(line);
      const message = line.substring(line.indexOf(logMessagePrefix) + logMessagePrefix.length);

      const timeStamp = new Date().toLocaleTimeString("en-US", { hourCycle: "h23" });
      return `[${timeStamp}] ${message}`;
    })
    .forEach((line: string) => console.log(line));
}

const debugPlatforms: any = {
  android: new AndroidDebugPlatform(),
  ios: new iOSDebugPlatform(),
};

export default function (command: cli.IDebugCommand): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const platform: string = command.platform.toLowerCase();
    const debugPlatform: IDebugPlatform = debugPlatforms[platform];

    if (!debugPlatform) {
      const availablePlatforms = Object.getOwnPropertyNames(debugPlatforms);
      return reject(new Error(`"${platform}" is an unsupported platform. Available options are ${availablePlatforms.join(", ")}.`));
    }

    try {
      const logProcess = debugPlatform.getLogProcess();
      console.log(`Listening for ${platform} debug logs (Press CTRL+C to exit)`);

      logProcess.stdout.on("data", processLogData.bind(debugPlatform));
      // Log tools also print warnings to stderr, so only a failed exit ends the command with an error
      logProcess.stderr.on("data", (data: Buffer) => console.error(data.toString().trim()));
      logProcess.on("error", reject);
      logProcess.on("close", (exitCode: number | null) =>
        exitCode ? reject(new Error(`Reading ${platform} debug logs failed (exit code ${exitCode}).`)) : resolve()
      );
    } catch (e) {
      reject(e);
    }
  });
}
