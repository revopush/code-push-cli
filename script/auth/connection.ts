import * as chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { Headers } from "../types";
import { log } from "../ui/log";
import AccountManager = require("../management-sdk");

const packageJson = require("../../../package.json");

const configFilePath: string = path.join(process.env.LOCALAPPDATA || process.env.HOME, ".revopush.config");

const CLI_HEADERS: Headers = {
  "X-CodePush-CLI-Version": packageJson.version,
};

/** Deprecated */
interface ILegacyLoginConnectionInfo {
  accessKeyName: string;
}

export interface ILoginConnectionInfo {
  accessKey: string;
  customServerUrl?: string; // A custom serverUrl for internal debugging purposes
  preserveAccessKeyOnLogout?: boolean;
}

export function deleteConnectionInfoCache(printMessage: boolean = true): void {
  try {
    fs.unlinkSync(configFilePath);

    if (printMessage) {
      log(`Successfully logged-out. The session file located at ${chalk.cyan(configFilePath)} has been deleted.\r\n`);
    }
  } catch {}
}

export function deserializeConnectionInfo(): ILoginConnectionInfo {
  try {
    const savedConnection: string = fs.readFileSync(configFilePath, {
      encoding: "utf8",
    });
    let connectionInfo: ILegacyLoginConnectionInfo | ILoginConnectionInfo = JSON.parse(savedConnection);

    // If the connection info is in the legacy format, convert it to the modern format
    if ((connectionInfo as ILegacyLoginConnectionInfo).accessKeyName) {
      connectionInfo = {
        accessKey: (connectionInfo as ILegacyLoginConnectionInfo).accessKeyName,
      } as ILoginConnectionInfo;
    }

    return connectionInfo as ILoginConnectionInfo;
  } catch {
    return;
  }
}

export function serializeConnectionInfo(accessKey: string, preserveAccessKeyOnLogout: boolean, customServerUrl?: string): void {
  const connectionInfo: ILoginConnectionInfo = {
    accessKey: accessKey,
    preserveAccessKeyOnLogout: preserveAccessKeyOnLogout,
  };
  if (customServerUrl) {
    connectionInfo.customServerUrl = customServerUrl;
  }

  const json: string = JSON.stringify(connectionInfo);
  fs.writeFileSync(configFilePath, json, { encoding: "utf8" });

  log(
    `\r\nSuccessfully logged-in. Your session file was written to ${chalk.cyan(configFilePath)}. You can run the ${chalk.cyan(
      "revopush logout"
    )} command at any time to delete this file and terminate your session.\r\n`
  );
}

export function getSdk(accessKey: string, customServerUrl: string): AccountManager {
  const sdk: any = new AccountManager(accessKey, CLI_HEADERS, customServerUrl);
  /*
   * If the server returns `Unauthorized`, it must be due to an invalid
   * (or expired) access key. For convenience, we patch every SDK call
   * to delete the cached connection so the user can simply
   * login again instead of having to log out first.
   */
  Object.getOwnPropertyNames(AccountManager.prototype).forEach((functionName: any) => {
    if (typeof sdk[functionName] === "function") {
      const originalFunction = sdk[functionName];
      sdk[functionName] = function () {
        let maybePromise: Promise<any> = originalFunction.apply(sdk, arguments);
        if (maybePromise && maybePromise.then !== undefined) {
          maybePromise = maybePromise.catch((error: any) => {
            if (error.statusCode && error.statusCode === AccountManager.ERROR_UNAUTHORIZED) {
              deleteConnectionInfoCache(/* printMessage */ false);
            }

            throw error;
          });
        }

        return maybePromise;
      };
    }
  });

  return sdk;
}
