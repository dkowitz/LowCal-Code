/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from "vitest";
import { loggingCommand } from "./loggingCommand.js";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import { createMockLoggingController } from "../../test-utils/mockLoggingController.js";

const runCommand = async (input: string) => {
  if (!loggingCommand.action) {
    throw new Error("loggingCommand must define an action");
  }
  const logging = createMockLoggingController();
  const context = createMockCommandContext({
    services: {
      logging,
    },
  });
  await loggingCommand.action(context, input);
  return { context, logging } as const;
};

describe("loggingCommand", () => {
  it("enables logging when /logging on is issued", async () => {
    const { context, logging } = await runCommand("on");
    expect(logging.enableLogging).toHaveBeenCalledTimes(1);
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        text: expect.stringContaining("enabled"),
      }),
      expect.any(Number),
    );
  });

  it("disables logging when /logging off is issued", async () => {
    const { context, logging } = await runCommand("off");
    expect(logging.disableLogging).toHaveBeenCalledWith(
      "Disabled via /logging command",
    );
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        text: expect.stringContaining("disabled"),
      }),
      expect.any(Number),
    );
  });

  it("reports status when invoked without arguments", async () => {
    const logging = createMockLoggingController();
    logging.getStatus = vi.fn(() => ({
      enabled: true,
      logFilePath: "/workspace/logs/session-log.md",
    }));
    expect(logging.enableLogging).not.toHaveBeenCalled();

    const context = createMockCommandContext({
      services: {
        logging,
      },
    });

    if (!loggingCommand.action)
      throw new Error("loggingCommand missing action");
    await loggingCommand.action(context, "");

    expect(logging.getStatus).toHaveBeenCalledTimes(1);
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        text: expect.stringContaining("/workspace/logs/session-log.md"),
      }),
      expect.any(Number),
    );
  });

  it("shows usage for unknown arguments", async () => {
    const { context } = await runCommand("unknown");
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        text: expect.stringContaining("Usage: /logging"),
      }),
      expect.any(Number),
    );
  });
});
