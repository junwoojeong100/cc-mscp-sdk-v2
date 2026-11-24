import { CopilotClient, RuntimeConnection } from "@microsoft/copilot-sdk";

// SDK 2 hosts the runtime inside the calling process by default. The bridge
// keeps it in a child process, as SDK 1 did, so the runtime's lifetime, its
// environment and a crash stay separate from the bridge's own.
export function copilotClientOptions({ baseDirectory, logLevel } = {}) {
  return {
    mode: "empty",
    runtime: RuntimeConnection.forSpawnedStdio({ baseDirectory }),
    observability: { logLevel },
  };
}

export function createCopilotClient(options) {
  return new CopilotClient(copilotClientOptions(options));
}
