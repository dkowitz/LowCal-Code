/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalSessionService } from "./terminalSessionService.js";

const mockPty = vi.hoisted(() => {
  const writes: string[] = [];
  return {
    writes,
    spawn: vi.fn(() => ({
      pid: 1234,
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn((data: string) => {
        writes.push(data);
      }),
      resize: vi.fn(),
      kill: vi.fn(),
    })),
  };
});

vi.mock("../utils/getPty.js", () => ({
  getPty: vi.fn(async () => ({
    module: {
      spawn: mockPty.spawn,
    },
    name: "node-pty",
  })),
}));

describe("TerminalSessionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPty.writes.length = 0;
  });

  it("normalizes text newlines to Enter keypresses for native PTY sends", async () => {
    const service = new TerminalSessionService();
    const snapshot = await service.open({
      cwd: process.cwd(),
      backend: "pty",
      cols: 80,
      rows: 24,
    });

    await service.send(snapshot.id, {
      input: "first line\nsecond line\r\nthird line",
      settleMs: 0,
    });

    expect(mockPty.writes).toEqual(["first line\rsecond line\rthird line"]);
  });

  it("appends Enter after normalizing embedded newlines", async () => {
    const service = new TerminalSessionService();
    const snapshot = await service.open({
      cwd: process.cwd(),
      backend: "pty",
      cols: 80,
      rows: 24,
    });

    await service.send(snapshot.id, {
      input: "echo one\necho two",
      appendEnter: true,
      settleMs: 0,
    });

    expect(mockPty.writes).toEqual(["echo one\recho two\r"]);
  });

  it("decodes common escaped control-key notation before sending", async () => {
    const service = new TerminalSessionService();
    const snapshot = await service.open({
      cwd: process.cwd(),
      backend: "pty",
      cols: 80,
      rows: 24,
    });

    await service.send(snapshot.id, {
      input: "\\u000f\\x18\\e[A\\n",
      settleMs: 0,
    });

    expect(mockPty.writes).toEqual(["\x0f\x18\x1b[A\r"]);
  });
});
