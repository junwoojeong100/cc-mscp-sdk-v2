import assert from "node:assert/strict";
import test from "node:test";

import { copilotClientOptions, createCopilotClient } from "../src/copilot-client.mjs";

test("keeps the runtime in a child process instead of SDK 2's in-process default", () => {
  const options = copilotClientOptions({ baseDirectory: "/tmp/copilot-home", logLevel: "error" });
  assert.equal(options.mode, "empty");
  assert.equal(options.runtime.kind, "spawned-stdio");
  assert.equal(options.runtime.baseDirectory, "/tmp/copilot-home");
  assert.deepEqual(options.observability, { logLevel: "error" });
});

test("the installed SDK accepts these client options without starting a runtime", () => {
  const client = createCopilotClient({ baseDirectory: "/tmp/copilot-home", logLevel: "error" });
  assert.equal(typeof client.start, "function");
  assert.equal(typeof client.createSession, "function");
});
