import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const COPILOT_SDK_PACKAGE = "@microsoft/copilot-sdk";

/** Read installed SDK metadata without loading the SDK or starting its runtime. */
export function readCopilotSdkVersion(runtimeModuleUrl = new URL("../../src/session-manager.mjs", import.meta.url)) {
  try {
    const entry = createRequire(runtimeModuleUrl).resolve(COPILOT_SDK_PACKAGE);
    let directory = path.dirname(entry);
    while (true) {
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
      } catch {}
      // Build directories can have their own manifests; only the SDK's counts.
      if (manifest?.name === COPILOT_SDK_PACKAGE) {
        return typeof manifest.version === "string" && manifest.version.trim() ? manifest.version : null;
      }
      const parent = path.dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
  } catch {
    // Informational metadata must not prevent a run when unavailable.
    return null;
  }
}
