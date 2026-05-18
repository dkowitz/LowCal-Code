/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from "./types.js";
import { CommandKind } from "./types.js";
import { appEvents, AppEvent } from "../../utils/events.js";

export const llamaUpdateCommand: SlashCommand = {
  name: "llama-update",
  altNames: ["llamaupdate", "llama-update-now"],
  description: "Force llama.cpp update check now (bypass cache).",
  kind: CommandKind.BUILT_IN,
  action: async () => {
    appEvents.emit(AppEvent.ShowInfo, "[llama.cpp] Checking for updates (forced)...");
    try {
      const { checkForLlamaCppUpdate } = await import(
        "../../utils/llamaCppUpdateChecker.js"
      );
      const updateInfo = await checkForLlamaCppUpdate(true);
      if (updateInfo) {
        // Trigger the existing UI prompt flow
        appEvents.emit(AppEvent.LlamaCppUpdateAvailable, updateInfo);
      } else {
        appEvents.emit(AppEvent.ShowInfo, "[llama.cpp] Up to date (forced check).");
      }
    } catch (err) {
      appEvents.emit(
        AppEvent.ShowInfo,
        `[llama.cpp] Forced update check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { type: "message", messageType: "info", content: "" } as const;
  },
};
