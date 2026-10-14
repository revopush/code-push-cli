// Loaded before any test (see .mocharc.json): point the CLI's config file at an empty home directory,
// so tests can never pick up a real ~/.revopush.config and talk to a real server
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "revopush-test-home-"));
process.env.HOME = home;
process.env.LOCALAPPDATA = home;
// Expected dates in the tests are US Pacific time
process.env.TZ = "America/Los_Angeles";
