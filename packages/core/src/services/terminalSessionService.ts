/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import pkg from "@xterm/headless";
import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import stripAnsi from "strip-ansi";
import { TextDecoder } from "node:util";
import type { PtyImplementation, PtyProcess } from "../utils/getPty.js";
import { getPty } from "../utils/getPty.js";
import { getCachedEncodingForBuffer } from "../utils/systemEncoding.js";

const { Terminal } = pkg;
const execFileAsync = promisify(execFile);
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_SCROLLBACK = 1000;
const MAX_RECENT_OUTPUT_CHARS = 20000;
const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const DEFAULT_IDLE_MS = 500;
const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_SEND_SETTLE_MS = 150;

export type TerminalBackend = "pty" | "tmux";
export type TerminalBackendPreference = "auto" | TerminalBackend;

export interface TerminalOpenOptions {
  command?: string;
  cwd: string;
  cols?: number;
  rows?: number;
  backend?: TerminalBackendPreference;
  name?: string;
}

export interface TerminalSendOptions {
  input: string;
  appendEnter?: boolean;
  sensitiveInput?: boolean;
  settleMs?: number;
}

export type TerminalWaitConditionType = "idle" | "regex" | "exit";

export interface TerminalWaitOptions {
  type: TerminalWaitConditionType;
  pattern?: string;
  timeoutMs?: number;
  idleMs?: number;
  pollIntervalMs?: number;
  freshOnly?: boolean;
}

export interface TerminalSnapshot {
  id: string;
  name: string;
  backend: TerminalBackend;
  pid?: number;
  cwd: string;
  cols: number;
  rows: number;
  running: boolean;
  exitCode?: number;
  signal?: number;
  screen: string;
  recentOutput: string;
  lastLine: string;
  outputVersion: number;
  attachCommand?: string;
}

export interface TerminalWaitResult {
  snapshot: TerminalSnapshot;
  matched: boolean;
  reason: "condition_met" | "timeout";
  condition: TerminalWaitConditionType;
  outputSinceStart: string;
  matchedText?: string;
}

export interface TerminalTranscriptCursor {
  outputVersion: number;
  recentOutput: string;
}

export interface TerminalAttachInput {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
  resume: () => void;
  on: (event: "data", listener: (data: Buffer | string) => void) => void;
  off?: (event: "data", listener: (data: Buffer | string) => void) => void;
  removeListener?: (
    event: "data",
    listener: (data: Buffer | string) => void,
  ) => void;
}

export interface TerminalAttachOutput {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write: (data: string | Buffer) => boolean;
  on?: (event: "resize", listener: () => void) => void;
  off?: (event: "resize", listener: () => void) => void;
  removeListener?: (event: "resize", listener: () => void) => void;
}

export interface TerminalAttachOptions {
  input: TerminalAttachInput;
  output: TerminalAttachOutput;
  escapeSequence?: string;
}

type NativeSession = {
  id: string;
  name: string;
  backend: "pty";
  cwd: string;
  cols: number;
  rows: number;
  ptyProcess: PtyProcess;
  terminal: InstanceType<typeof Terminal>;
  recentOutput: string;
  outputVersion: number;
  lastOutputAt: number;
  redactions: string[];
  outputSubscribers: Set<(data: string) => void>;
  decoder: TextDecoder | null;
  running: boolean;
  exitCode?: number;
  signal?: number;
};

type TmuxSession = {
  id: string;
  name: string;
  backend: "tmux";
  cwd: string;
  cols: number;
  rows: number;
  tmuxName: string;
  running: boolean;
  recentOutput: string;
  outputVersion: number;
  lastOutputAt: number;
  redactions: string[];
  exitCode?: number;
  signal?: number;
  attachCommand: string;
};

type TerminalSession = NativeSession | TmuxSession;

function appendBounded(current: string, next: string): string {
  const combined = current + next;
  if (combined.length <= MAX_RECENT_OUTPUT_CHARS) {
    return combined;
  }
  return combined.slice(combined.length - MAX_RECENT_OUTPUT_CHARS);
}

function getFullText(terminal: InstanceType<typeof Terminal>): string {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  const start = Math.max(0, buffer.length - terminal.rows);
  for (let i = start; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    lines.push(line ? line.translateToString(true) : "");
  }
  return lines.join("\n").trimEnd();
}

function getLastNonEmptyLine(text: string): string {
  const lines = text.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]?.trimEnd();
    if (line) {
      return line;
    }
  }
  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactText(text: string, redactions: string[]): string {
  return redactions.reduce((current, secret) => {
    if (!secret) {
      return current;
    }
    return current.replace(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]");
  }, text);
}

function createTerminalRegex(pattern: string): RegExp {
  if (pattern.startsWith("(?i)")) {
    return new RegExp(pattern.slice(4), "im");
  }
  return new RegExp(pattern, "m");
}

function getShellCommand(): string {
  if (os.platform() === "win32") {
    return "cmd.exe";
  }
  return process.env["SHELL"] || "bash";
}

function normalizeTerminalInput(input: string, appendEnter: boolean): string {
  if (!appendEnter) {
    return input;
  }
  return input.endsWith("\n") || input.endsWith("\r") ? input : `${input}\r`;
}

export class TerminalSessionService {
  private sessions = new Map<string, TerminalSession>();
  private nextSessionNumber = 1;
  private ptyInfo: PtyImplementation | undefined;

  async open(options: TerminalOpenOptions): Promise<TerminalSnapshot> {
    const id = `term_${this.nextSessionNumber++}`;
    const backend = await this.resolveBackend(options.backend ?? "auto");

    if (backend === "tmux") {
      return this.openTmuxSession(id, options);
    }

    return this.openNativePtySession(id, options);
  }

  async send(
    id: string,
    options: TerminalSendOptions,
  ): Promise<TerminalSnapshot> {
    const session = this.getSession(id);
    if (!session.running) {
      throw new Error(`Terminal session ${id} is not running.`);
    }

    const input = normalizeTerminalInput(
      options.input,
      options.appendEnter ?? false,
    );
    if (options.sensitiveInput && options.input) {
      session.redactions.push(options.input);
    }

    if (session.backend === "pty") {
      session.ptyProcess.write(input);
      await this.waitForSettle(options.settleMs ?? DEFAULT_SEND_SETTLE_MS);
      return this.snapshot(id);
    }

    await this.sendTmuxInput(session, input);
    await this.waitForSettle(options.settleMs ?? DEFAULT_SEND_SETTLE_MS);
    return this.snapshot(id);
  }

  async read(id: string): Promise<TerminalSnapshot> {
    return this.snapshot(id);
  }

  async wait(
    id: string,
    options: TerminalWaitOptions,
    onUpdate?: (snapshot: TerminalSnapshot) => void,
    baseline?: TerminalTranscriptCursor,
  ): Promise<TerminalWaitResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const startedAt = Date.now();
    const session = this.getSession(id);
    const cursor = baseline ?? this.createCursor(session);
    let lastObservedVersion = session.outputVersion;
    let lastObservedChangeAt = Date.now();
    const regex =
      options.type === "regex" ? this.createWaitRegex(options.pattern) : null;

    while (Date.now() - startedAt <= timeoutMs) {
      const snapshot = await this.snapshot(id);
      const latestSession = this.getSession(id);

      if (onUpdate) {
        onUpdate(snapshot);
      }

      if (latestSession.outputVersion !== lastObservedVersion) {
        lastObservedVersion = latestSession.outputVersion;
        lastObservedChangeAt = Date.now();
      }

      const latestOutput = this.getOutputSince(latestSession, cursor);
      const match = this.getWaitConditionMatch(
        snapshot,
        latestOutput,
        options.type,
        regex,
        options.freshOnly ?? true,
      );
      if (match.matched) {
        return {
          snapshot,
          matched: true,
          reason: "condition_met",
          condition: options.type,
          outputSinceStart: this.redactForSession(latestSession, latestOutput),
          matchedText: match.matchedText
            ? this.redactForSession(latestSession, match.matchedText)
            : undefined,
        };
      }

      if (
        options.type === "idle" &&
        Date.now() - lastObservedChangeAt >= idleMs
      ) {
        return {
          snapshot,
          matched: true,
          reason: "condition_met",
          condition: options.type,
          outputSinceStart: this.redactForSession(latestSession, latestOutput),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const snapshot = await this.snapshot(id);
    if (onUpdate) {
      onUpdate(snapshot);
    }
    const finalSession = this.getSession(id);
    return {
      snapshot,
      matched: false,
      reason: "timeout",
      condition: options.type,
      outputSinceStart: this.redactForSession(
        finalSession,
        this.getOutputSince(finalSession, cursor),
      ),
    };
  }

  async resize(
    id: string,
    cols: number,
    rows: number,
  ): Promise<TerminalSnapshot> {
    const session = this.getSession(id);
    session.cols = cols;
    session.rows = rows;

    if (session.backend === "pty") {
      session.terminal.resize(cols, rows);
      session.ptyProcess.resize?.(cols, rows);
    } else {
      await execFileAsync("tmux", [
        "resize-pane",
        "-t",
        session.tmuxName,
        "-x",
        String(cols),
        "-y",
        String(rows),
      ]);
    }

    return this.snapshot(id);
  }

  async close(id: string): Promise<TerminalSnapshot> {
    const session = this.getSession(id);

    if (session.running) {
      if (session.backend === "pty") {
        session.ptyProcess.kill("SIGHUP");
        session.running = false;
      } else {
        await execFileAsync("tmux", ["kill-session", "-t", session.tmuxName]);
        session.running = false;
      }
    }

    const snapshot = await this.snapshot(id);
    this.sessions.delete(id);
    return snapshot;
  }

  async snapshot(id: string): Promise<TerminalSnapshot> {
    const session = this.getSession(id);
    if (session.backend === "tmux") {
      await this.refreshTmuxSession(session);
    }

    return this.createSnapshot(session);
  }

  list(): TerminalSnapshot[] {
    return [...this.sessions.values()].map((session) =>
      this.createSnapshot(session),
    );
  }

  getTranscriptCursor(id: string): TerminalTranscriptCursor {
    return this.createCursor(this.getSession(id));
  }

  getOutputSinceCursor(id: string, cursor: TerminalTranscriptCursor): string {
    const session = this.getSession(id);
    return this.redactForSession(session, this.getOutputSince(session, cursor));
  }

  async attachInteractive(
    id: string,
    options: TerminalAttachOptions,
  ): Promise<void> {
    const session = this.getSession(id);
    if (session.backend !== "pty") {
      throw new Error(
        `Terminal session ${id} uses tmux. Attach with: ${session.attachCommand}`,
      );
    }
    if (!session.running) {
      throw new Error(`Terminal session ${id} is not running.`);
    }

    const escapeSequence = options.escapeSequence ?? "\x1d";
    const input = options.input;
    const output = options.output;
    const previousRawMode = input.isRaw ?? false;
    const detachText = "Ctrl+]";

    await this.resizeFromOutput(id, output);

    let detached = false;
    let resolveDetach: (() => void) | undefined;
    const detachedPromise = new Promise<void>((resolve) => {
      resolveDetach = resolve;
    });

    const detach = () => {
      if (detached) {
        return;
      }
      detached = true;
      resolveDetach?.();
    };

    const outputListener = (data: string) => {
      output.write(this.redactForSession(session, data));
    };

    const inputListener = (data: Buffer | string) => {
      const chunk = Buffer.isBuffer(data) ? data.toString("utf8") : data;
      const escapeIndex = chunk.indexOf(escapeSequence);
      if (escapeIndex >= 0) {
        const beforeEscape = chunk.slice(0, escapeIndex);
        if (beforeEscape) {
          session.ptyProcess.write(beforeEscape);
        }
        detach();
        return;
      }
      session.ptyProcess.write(chunk);
    };

    const resizeListener = () => {
      void this.resizeFromOutput(id, output);
    };
    const exitInterval = setInterval(() => {
      if (!session.running) {
        detach();
      }
    }, 250);

    try {
      session.outputSubscribers.add(outputListener);
      input.on("data", inputListener);
      output.on?.("resize", resizeListener);
      if (input.isTTY && input.setRawMode) {
        input.setRawMode(true);
      }
      input.resume();

      if (output.isTTY) {
        output.write("\x1b[?1049h\x1b[H\x1b[2J");
      }
      output.write(
        `Attached to LowCal terminal ${id}. Press ${detachText} to detach.\r\n\r\n`,
      );
      const snapshot = await this.snapshot(id);
      if (snapshot.screen) {
        output.write(`${snapshot.screen}\r\n`);
      }

      await detachedPromise;
    } finally {
      clearInterval(exitInterval);
      session.outputSubscribers.delete(outputListener);
      if (input.off) {
        input.off("data", inputListener);
      } else {
        input.removeListener?.("data", inputListener);
      }
      if (output.off) {
        output.off("resize", resizeListener);
      } else {
        output.removeListener?.("resize", resizeListener);
      }
      if (input.isTTY && input.setRawMode) {
        input.setRawMode(previousRawMode);
      }
      if (output.isTTY) {
        output.write("\x1b[?1049l");
      }
    }
  }

  private async resolveBackend(
    preference: TerminalBackendPreference,
  ): Promise<TerminalBackend> {
    if (preference === "tmux") {
      await this.ensureTmuxAvailable();
      return "tmux";
    }

    if (preference === "pty") {
      this.ptyInfo = await getPty();
      if (!this.ptyInfo) {
        throw new Error("No PTY implementation is available.");
      }
      return "pty";
    }

    this.ptyInfo = await getPty();
    if (this.ptyInfo) {
      return "pty";
    }

    await this.ensureTmuxAvailable();
    return "tmux";
  }

  private async openNativePtySession(
    id: string,
    options: TerminalOpenOptions,
  ): Promise<TerminalSnapshot> {
    if (!this.ptyInfo) {
      this.ptyInfo = await getPty();
    }
    if (!this.ptyInfo) {
      throw new Error("No PTY implementation is available.");
    }

    const cols = options.cols ?? DEFAULT_COLS;
    const rows = options.rows ?? DEFAULT_ROWS;
    const shell = getShellCommand();
    const ptyProcess = this.ptyInfo.module.spawn(shell, [], {
      cwd: options.cwd,
      name: "xterm-256color",
      cols,
      rows,
      env: {
        ...process.env,
        QWEN_CODE: "1",
        TERM: "xterm-256color",
      },
      handleFlowControl: true,
    });

    const session: NativeSession = {
      id,
      name: options.name || options.command || shell,
      backend: "pty",
      cwd: options.cwd,
      cols,
      rows,
      ptyProcess,
      terminal: new Terminal({
        allowProposedApi: true,
        cols,
        rows,
        scrollback: DEFAULT_SCROLLBACK,
      }),
      recentOutput: "",
      outputVersion: 0,
      lastOutputAt: Date.now(),
      redactions: [],
      outputSubscribers: new Set(),
      decoder: null,
      running: true,
    };

    ptyProcess.onData((data) => {
      const buffer = Buffer.from(data, "utf8");
      if (!session.decoder) {
        const encoding = getCachedEncodingForBuffer(buffer);
        try {
          session.decoder = new TextDecoder(encoding);
        } catch {
          session.decoder = new TextDecoder("utf-8");
        }
      }
      const decoded = session.decoder.decode(buffer, { stream: true });
      session.recentOutput = appendBounded(
        session.recentOutput,
        stripAnsi(decoded),
      );
      session.outputVersion += 1;
      session.lastOutputAt = Date.now();
      session.terminal.write(decoded);
      session.outputSubscribers.forEach((subscriber) => subscriber(decoded));
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      session.running = false;
      session.exitCode = exitCode;
      session.signal = signal;
      session.outputVersion += 1;
      session.lastOutputAt = Date.now();
    });

    this.sessions.set(id, session);

    if (options.command?.trim()) {
      ptyProcess.write(`${options.command}\r`);
    }

    return this.createSnapshot(session);
  }

  private async openTmuxSession(
    id: string,
    options: TerminalOpenOptions,
  ): Promise<TerminalSnapshot> {
    await this.ensureTmuxAvailable();
    const cols = options.cols ?? DEFAULT_COLS;
    const rows = options.rows ?? DEFAULT_ROWS;
    const tmuxName = `lowcal_${id}`;
    const shell = getShellCommand();

    await execFileAsync("tmux", [
      "new-session",
      "-d",
      "-s",
      tmuxName,
      "-c",
      options.cwd,
      "-x",
      String(cols),
      "-y",
      String(rows),
      shell,
    ]);

    const session: TmuxSession = {
      id,
      name: options.name || options.command || shell,
      backend: "tmux",
      cwd: options.cwd,
      cols,
      rows,
      tmuxName,
      running: true,
      recentOutput: "",
      outputVersion: 0,
      lastOutputAt: Date.now(),
      redactions: [],
      attachCommand: `tmux attach-session -t ${tmuxName}`,
    };

    this.sessions.set(id, session);

    if (options.command?.trim()) {
      await this.sendTmuxInput(session, `${options.command}\r`);
    }

    return this.snapshot(id);
  }

  private async sendTmuxInput(
    session: TmuxSession,
    input: string,
  ): Promise<void> {
    const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const endsWithEnter = normalized.endsWith("\n");
    const body = endsWithEnter ? normalized.slice(0, -1) : normalized;
    const parts = body.split("\n");

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (part) {
        await execFileAsync("tmux", [
          "send-keys",
          "-t",
          session.tmuxName,
          "-l",
          part,
        ]);
      }
      if (index < parts.length - 1 || endsWithEnter) {
        await execFileAsync("tmux", [
          "send-keys",
          "-t",
          session.tmuxName,
          "C-m",
        ]);
      }
    }
  }

  private async refreshTmuxSession(session: TmuxSession): Promise<void> {
    try {
      await execFileAsync("tmux", ["has-session", "-t", session.tmuxName]);
      session.running = true;
    } catch {
      session.running = false;
    }

    try {
      const { stdout } = await execFileAsync("tmux", [
        "capture-pane",
        "-t",
        session.tmuxName,
        "-p",
        "-S",
        "-",
      ]);
      const nextOutput = appendBounded("", stdout.trimEnd());
      if (nextOutput !== session.recentOutput) {
        session.recentOutput = nextOutput;
        session.outputVersion += 1;
        session.lastOutputAt = Date.now();
      }
    } catch {
      if (session.running) {
        throw new Error(`Unable to capture tmux session ${session.id}.`);
      }
    }
  }

  private async ensureTmuxAvailable(): Promise<void> {
    try {
      await execFileAsync("tmux", ["-V"]);
    } catch {
      throw new Error("tmux is not available on PATH.");
    }
  }

  private async resizeFromOutput(
    id: string,
    output: TerminalAttachOutput,
  ): Promise<void> {
    const cols = output.columns;
    const rows = output.rows;
    if (
      typeof cols !== "number" ||
      typeof rows !== "number" ||
      cols < 20 ||
      rows < 5
    ) {
      return;
    }
    await this.resize(id, cols, rows);
  }

  private getSession(id: string): TerminalSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Terminal session ${id} was not found.`);
    }
    return session;
  }

  private createWaitRegex(pattern: string | undefined): RegExp {
    if (!pattern) {
      throw new Error("pattern is required when wait type is regex.");
    }
    return createTerminalRegex(pattern);
  }

  private getWaitConditionMatch(
    snapshot: TerminalSnapshot,
    freshOutput: string,
    type: TerminalWaitConditionType,
    regex: RegExp | null,
    freshOnly: boolean,
  ): { matched: boolean; matchedText?: string } {
    switch (type) {
      case "regex": {
        const searchText = freshOnly
          ? `${snapshot.lastLine}\n${freshOutput}`
          : `${snapshot.lastLine}\n${freshOutput}\n${snapshot.screen}\n${snapshot.recentOutput}`;
        const match = regex ? searchText.match(regex) : null;
        return { matched: Boolean(match), matchedText: match?.[0] };
      }
      case "exit":
        return { matched: !snapshot.running };
      case "idle":
        return { matched: false };
      default: {
        const exhaustiveCheck: never = type;
        return exhaustiveCheck;
      }
    }
  }

  private createCursor(session: TerminalSession): TerminalTranscriptCursor {
    return {
      outputVersion: session.outputVersion,
      recentOutput: session.recentOutput,
    };
  }

  private getOutputSince(
    session: TerminalSession,
    cursor: TerminalTranscriptCursor,
  ): string {
    if (session.outputVersion === cursor.outputVersion) {
      return "";
    }
    if (session.recentOutput.startsWith(cursor.recentOutput)) {
      return session.recentOutput.slice(cursor.recentOutput.length);
    }
    return session.recentOutput;
  }

  private redactForSession(session: TerminalSession, text: string): string {
    return redactText(text, session.redactions);
  }

  private async waitForSettle(settleMs: number): Promise<void> {
    if (settleMs <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }

  private createSnapshot(session: TerminalSession): TerminalSnapshot {
    if (session.backend === "pty") {
      const screen = redactText(
        getFullText(session.terminal),
        session.redactions,
      );
      const recentOutput = redactText(session.recentOutput, session.redactions);
      return {
        id: session.id,
        name: session.name,
        backend: session.backend,
        pid: session.ptyProcess.pid,
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
        running: session.running,
        exitCode: session.exitCode,
        signal: session.signal,
        screen,
        recentOutput,
        lastLine: getLastNonEmptyLine(screen),
        outputVersion: session.outputVersion,
      };
    }

    const screen = redactText(session.recentOutput, session.redactions);
    return {
      id: session.id,
      name: session.name,
      backend: session.backend,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      running: session.running,
      exitCode: session.exitCode,
      signal: session.signal,
      screen,
      recentOutput: screen,
      lastLine: getLastNonEmptyLine(screen),
      outputVersion: session.outputVersion,
      attachCommand: session.attachCommand,
    };
  }
}

export const terminalSessionService = new TerminalSessionService();
