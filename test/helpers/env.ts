/** Restores `process.env` after each test in the enclosing `describe`, so tests can set variables freely */
export function restoreEnvAfterEach(): void {
  let snapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    snapshot = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, snapshot);
  });
}
