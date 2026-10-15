import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface TempDirectory {
  /** The current test's directory, with symlinks resolved */
  readonly path: string;
  /**
   * Writes a file, creating parent folders, and returns its absolute path.
   * A relative path is resolved against the directory; an absolute one is used as is.
   */
  write(filePath: string, contents?: string | Buffer): string;
  /** Like `write`, but fills the file with `size` zero bytes */
  writeSized(filePath: string, size: number): string;
}

/**
 * Gives each test in the enclosing `describe` a fresh temp directory, deleted after the test.
 * With `chdir`, the directory is also the working directory during the test.
 */
export function useTempDirectory(prefix: string, { chdir = false }: { chdir?: boolean } = {}): TempDirectory {
  let directory: string;
  let originalCwd: string;

  beforeEach(() => {
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `revopush-${prefix}-`)));
    if (chdir) {
      originalCwd = process.cwd();
      process.chdir(directory);
    }
  });

  afterEach(() => {
    if (chdir && originalCwd) {
      process.chdir(originalCwd);
    }
    if (directory) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  const write = (filePath: string, contents: string | Buffer = ""): string => {
    const file = path.resolve(directory, filePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  };

  return {
    get path() {
      return directory;
    },
    write,
    writeSized(filePath: string, size: number): string {
      const file = write(filePath);
      fs.truncateSync(file, size);
      return file;
    },
  };
}

/** Runs `action` with `directory` as the working directory, then restores the previous one */
export async function inDirectory<T>(directory: string, action: () => Promise<T> | T): Promise<T> {
  const originalCwd = process.cwd();
  process.chdir(directory);
  try {
    return await action();
  } finally {
    process.chdir(originalCwd);
  }
}
