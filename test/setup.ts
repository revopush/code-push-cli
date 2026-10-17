// Loaded before any test (see .mocharc.json): point the CLI's config file at an empty home directory,
// so tests can never pick up a real ~/.revopush.config and talk to a real server
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-test-home-"));
process.env.HOME = home;
process.env.LOCALAPPDATA = home;
// Release flows clear react-* and CodePush* folders in the temp dir, so they get a temp dir of their own
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-test-tmp-"));
process.env.TMPDIR = process.env.TMP = process.env.TEMP = tmp;
process.on("exit", () => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});
// Expected dates in the tests are US Pacific time
process.env.TZ = "America/Los_Angeles";
