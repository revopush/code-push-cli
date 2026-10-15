import { strict as assert } from "assert";

export function assertIncludes(text: string, expected: string): void {
  assert.ok(text.includes(expected), `Expected ${expected} in: ${text}`);
}
