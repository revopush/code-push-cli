import { strict as assert } from "assert";
import * as sinon from "sinon";
import { confirm } from "../script/ui/terminal";

const prompt = require("prompt");

describe("terminal", () => {
  afterEach(() => sinon.restore());

  describe("confirm", () => {
    const answer = (error: Error | null, response?: string) =>
      sinon
        .stub(prompt, "get")
        .callsFake((_schema: unknown, callback: (error: Error | null, result?: unknown) => void) =>
          callback(error, error ? undefined : { response })
        );

    beforeEach(() => sinon.stub(prompt, "start"));

    it("accepts y", async () => {
      answer(null, "y");
      assert.equal(await confirm(), true);
    });

    it("rejects an empty answer", async () => {
      answer(null, "");
      assert.equal(await confirm(), false);
    });

    it("rejects when the prompt is cancelled with Ctrl+C", async () => {
      answer(new Error("canceled"));
      assert.equal(await confirm(), false);
    });

    it("still fails on other prompt errors, so scripts don't treat them as a cancel", async () => {
      answer(new Error("stdin closed"));
      await assert.rejects(confirm(), { message: "stdin closed" });
    });

    it("rejects on a prompt error reported asynchronously, as the real prompt does", async () => {
      sinon
        .stub(prompt, "get")
        .callsFake((_schema: unknown, callback: (error: Error | null) => void) =>
          setImmediate(() => callback(new Error("stdin closed")))
        );
      await assert.rejects(confirm(), { message: "stdin closed" });
    });
  });
});
