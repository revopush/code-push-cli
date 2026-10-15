const ProgressBar = require("progress");

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
