import * as chalk from "chalk";

const ProgressBar = require("progress");
const prompt = require("prompt");

export function log(message: unknown): void {
  console.log(message);
}

export const confirm = (message: string = "Are you sure?"): Promise<boolean> => {
  message += " (y/N):";
  return new Promise<boolean>((resolve): void => {
    prompt.message = "";
    prompt.delimiter = "";

    prompt.start();

    prompt.get(
      {
        properties: {
          response: {
            description: chalk.cyan(message),
          },
        },
      },
      (err: any, result: any): void => {
        const accepted = result.response && result.response.toLowerCase() === "y";
        const rejected = !result.response || result.response.toLowerCase() === "n";

        if (accepted) {
          resolve(true);
        } else {
          if (!rejected) {
            console.log('Invalid response: "' + result.response + '"');
          }
          resolve(false);
        }
      }
    );
  });
};

export function requestAccessKey(): Promise<string> {
  return new Promise<string>((resolve): void => {
    prompt.message = "";
    prompt.delimiter = "";

    prompt.start();

    prompt.get(
      {
        properties: {
          response: {
            description: chalk.cyan("Enter your access key: "),
          },
        },
      },
      (err: any, result: any): void => {
        if (err) {
          resolve(null);
        } else {
          resolve(result.response.trim());
        }
      }
    );
  });
}

/** Returns a callback that draws upload progress, given the percentage uploaded so far */
export function createUploadProgress(): (currentProgress: number) => void {
  let lastTotalProgress = 0;
  const progressBar = new ProgressBar("Upload progress:[:bar] :percent :etas", {
    complete: "=",
    incomplete: " ",
    width: 50,
    total: 100,
  });

  return (currentProgress: number): void => {
    progressBar.tick(currentProgress - lastTotalProgress);
    lastTotalProgress = currentProgress;
  };
}
