import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { copyFileToTmpDir, listFiles } from "../script/utils/file-utils";
import { useTempDirectory } from "./helpers/temp-directory";

describe("file-utils", () => {
  const dir = useTempDirectory("file-utils");

  describe("listFiles", () => {
    it("lists files level by level, joining paths with a slash", async () => {
      dir.write("release/b/deep/c.txt");
      dir.write("release/a.txt");
      dir.write("release/b/b.txt");
      const root = path.join(dir.path, "release");

      assert.deepEqual(await listFiles(root), [`${root}/a.txt`, `${root}/b/b.txt`, `${root}/b/deep/c.txt`]);
    });

    it("lists a symlink to a folder as a file", async () => {
      dir.write("release/folder/a.txt");
      const root = path.join(dir.path, "release");
      fs.symlinkSync("folder", path.join(root, "link"));

      assert.deepEqual((await listFiles(root)).sort(), [`${root}/folder/a.txt`, `${root}/link`]);
    });

    it("rejects when the folder does not exist", async () => {
      await assert.rejects(listFiles(path.join(dir.path, "missing")), { code: "ENOENT" });
    });
  });

  describe("copyFileToTmpDir", () => {
    it("copies the file into a new temp folder", () => {
      const file = dir.write("main.jsbundle", "bundle");

      const folder = copyFileToTmpDir(file);
      try {
        assert.deepEqual(fs.readdirSync(folder), ["main.jsbundle"]);
        assert.equal(fs.readFileSync(path.join(folder, "main.jsbundle"), "utf8"), "bundle");
      } finally {
        fs.rmSync(folder, { recursive: true, force: true });
      }
    });
  });
});
