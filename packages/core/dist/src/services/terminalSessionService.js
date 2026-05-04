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
function appendBounded(current, next) {
    const combined = current + next;
    if (combined.length <= MAX_RECENT_OUTPUT_CHARS) {
        return combined;
    }
    return combined.slice(combined.length - MAX_RECENT_OUTPUT_CHARS);
}
function getFullText(terminal) {
    const buffer = terminal.buffer.active;
    const lines = [];
    const start = Math.max(0, buffer.length - terminal.rows);
    for (let i = start; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        lines.push(line ? line.translateToString(true) : "");
    }
    return lines.join("\n").trimEnd();
}
function getLastNonEmptyLine(text) {
    const lines = text.split("\n");
    for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index]?.trimEnd();
        if (line) {
            return line;
        }
    }
    return "";
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function redactText(text, redactions) {
    return redactions.reduce((current, secret) => {
        if (!secret) {
            return current;
        }
        return current.replace(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]");
    }, text);
}
function createTerminalRegex(pattern) {
    if (pattern.startsWith("(?i)")) {
        return new RegExp(pattern.slice(4), "im");
    }
    return new RegExp(pattern, "m");
}
function getShellCommand() {
    if (os.platform() === "win32") {
        return "cmd.exe";
    }
    return process.env["SHELL"] || "bash";
}
function decodeTerminalInputEscapes(input) {
    return input
        .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\e/g, "\x1b")
        .replace(/\\r/g, "\r")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\b/g, "\b");
}
function normalizeTerminalInput(input, appendEnter) {
    const decoded = decodeTerminalInputEscapes(input);
    // A real terminal Enter key sends carriage return. Passing literal LF bytes
    // to full-screen programs can invoke Ctrl-J commands instead (for example,
    // nano's Justify command), so normalize text newlines into terminal Enter
    // keypresses before writing to the PTY.
    const normalized = decoded.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
    if (!appendEnter) {
        return normalized;
    }
    return decoded.endsWith("\n") || decoded.endsWith("\r")
        ? normalized
        : `${normalized}\r`;
}
export class TerminalSessionService {
    sessions = new Map();
    nextSessionNumber = 1;
    ptyInfo;
    snapshotSubscribers = new Set();
    subscribeToSnapshots(subscriber) {
        this.snapshotSubscribers.add(subscriber);
        for (const session of this.sessions.values()) {
            subscriber(this.createSnapshot(session));
        }
        return () => {
            this.snapshotSubscribers.delete(subscriber);
        };
    }
    async open(options) {
        // Enforce single-session policy: kill all other running sessions before opening a new one.
        await this.ensureSingleSession();
        const id = `term_${this.nextSessionNumber++}`;
        const backend = await this.resolveBackend(options.backend ?? "auto");
        if (backend === "tmux") {
            return this.openTmuxSession(id, options);
        }
        return this.openNativePtySession(id, options);
    }
    /**
     * Ensures only one terminal session is running at a time.
     * Kills all other running sessions and removes them from the map.
     */
    async ensureSingleSession() {
        const runningIds = [...this.sessions.values()]
            .filter((session) => session.running)
            .map((session) => session.id);
        for (const id of runningIds) {
            try {
                await this.close(id);
            }
            catch {
                // Silently skip sessions that fail to close — they're already dead.
            }
        }
    }
    async send(id, options) {
        const session = this.getSession(id);
        if (!session.running) {
            throw new Error(`Terminal session ${id} is not running.`);
        }
        const input = normalizeTerminalInput(options.input, options.appendEnter ?? false);
        if (options.sensitiveInput && options.input) {
            session.redactions.push(options.input);
            if (input !== options.input) {
                session.redactions.push(input);
            }
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
    async read(id) {
        return this.snapshot(id);
    }
    async wait(id, options, onUpdate, baseline) {
        const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
        const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
        const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        const startedAt = Date.now();
        const session = this.getSession(id);
        const cursor = baseline ?? this.createCursor(session);
        let lastObservedVersion = session.outputVersion;
        let lastObservedChangeAt = Date.now();
        const regex = options.type === "regex" ? this.createWaitRegex(options.pattern) : null;
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
            const match = this.getWaitConditionMatch(snapshot, latestOutput, options.type, regex, options.freshOnly ?? true);
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
            if (options.type === "idle" &&
                Date.now() - lastObservedChangeAt >= idleMs) {
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
            outputSinceStart: this.redactForSession(finalSession, this.getOutputSince(finalSession, cursor)),
        };
    }
    async resize(id, cols, rows) {
        const session = this.getSession(id);
        session.cols = cols;
        session.rows = rows;
        if (session.backend === "pty") {
            session.terminal.resize(cols, rows);
            session.ptyProcess.resize?.(cols, rows);
        }
        else {
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
    async close(id) {
        const session = this.getSession(id);
        if (session.running) {
            if (session.backend === "pty") {
                session.ptyProcess.kill("SIGHUP");
                session.running = false;
            }
            else {
                await execFileAsync("tmux", ["kill-session", "-t", session.tmuxName]);
                session.running = false;
            }
            this.notifySnapshotSubscribers(session);
        }
        const snapshot = await this.snapshot(id);
        this.sessions.delete(id);
        return snapshot;
    }
    async closeAll() {
        const ids = [...this.sessions.keys()];
        if (ids.length === 0) {
            return [];
        }
        const results = [];
        for (const id of ids) {
            try {
                results.push(await this.close(id));
            }
            catch {
                // Skip sessions that fail to close
            }
        }
        return results;
    }
    async snapshot(id) {
        const session = this.getSession(id);
        if (session.backend === "tmux") {
            await this.refreshTmuxSession(session);
        }
        return this.createSnapshot(session);
    }
    list() {
        return [...this.sessions.values()].map((session) => this.createSnapshot(session));
    }
    getTranscriptCursor(id) {
        return this.createCursor(this.getSession(id));
    }
    getOutputSinceCursor(id, cursor) {
        const session = this.getSession(id);
        return this.redactForSession(session, this.getOutputSince(session, cursor));
    }
    async attachInteractive(id, options) {
        const session = this.getSession(id);
        if (session.backend !== "pty") {
            throw new Error(`Terminal session ${id} uses tmux. Attach with: ${session.attachCommand}`);
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
        let resolveDetach;
        const detachedPromise = new Promise((resolve) => {
            resolveDetach = resolve;
        });
        const detach = () => {
            if (detached) {
                return;
            }
            detached = true;
            resolveDetach?.();
        };
        const outputListener = (data) => {
            output.write(this.redactForSession(session, data));
        };
        const inputListener = (data) => {
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
            output.write(`Attached to LowCal terminal ${id}. Press ${detachText} to detach.\r\n\r\n`);
            const snapshot = await this.snapshot(id);
            if (snapshot.screen) {
                output.write(`${snapshot.screen}\r\n`);
            }
            await detachedPromise;
        }
        finally {
            clearInterval(exitInterval);
            session.outputSubscribers.delete(outputListener);
            if (input.off) {
                input.off("data", inputListener);
            }
            else {
                input.removeListener?.("data", inputListener);
            }
            if (output.off) {
                output.off("resize", resizeListener);
            }
            else {
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
    async resolveBackend(preference) {
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
    async openNativePtySession(id, options) {
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
        const session = {
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
                }
                catch {
                    session.decoder = new TextDecoder("utf-8");
                }
            }
            const decoded = session.decoder.decode(buffer, { stream: true });
            session.recentOutput = appendBounded(session.recentOutput, stripAnsi(decoded));
            session.outputVersion += 1;
            session.lastOutputAt = Date.now();
            session.terminal.write(decoded, () => {
                this.notifySnapshotSubscribers(session);
            });
            session.outputSubscribers.forEach((subscriber) => subscriber(decoded));
        });
        ptyProcess.onExit(({ exitCode, signal }) => {
            session.running = false;
            session.exitCode = exitCode;
            session.signal = signal;
            session.outputVersion += 1;
            session.lastOutputAt = Date.now();
            this.notifySnapshotSubscribers(session);
        });
        this.sessions.set(id, session);
        this.notifySnapshotSubscribers(session);
        if (options.command?.trim()) {
            ptyProcess.write(`${options.command}\r`);
        }
        return this.createSnapshot(session);
    }
    async openTmuxSession(id, options) {
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
        const session = {
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
        this.notifySnapshotSubscribers(session);
        if (options.command?.trim()) {
            await this.sendTmuxInput(session, `${options.command}\r`);
        }
        return this.snapshot(id);
    }
    async sendTmuxInput(session, input) {
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
    async refreshTmuxSession(session) {
        try {
            await execFileAsync("tmux", ["has-session", "-t", session.tmuxName]);
            session.running = true;
        }
        catch {
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
                this.notifySnapshotSubscribers(session);
            }
        }
        catch {
            if (session.running) {
                throw new Error(`Unable to capture tmux session ${session.id}.`);
            }
        }
    }
    async ensureTmuxAvailable() {
        try {
            await execFileAsync("tmux", ["-V"]);
        }
        catch {
            throw new Error("tmux is not available on PATH.");
        }
    }
    async resizeFromOutput(id, output) {
        const cols = output.columns;
        const rows = output.rows;
        if (typeof cols !== "number" ||
            typeof rows !== "number" ||
            cols < 20 ||
            rows < 5) {
            return;
        }
        await this.resize(id, cols, rows);
    }
    getSession(id) {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`Terminal session ${id} was not found.`);
        }
        return session;
    }
    createWaitRegex(pattern) {
        if (!pattern) {
            throw new Error("pattern is required when wait type is regex.");
        }
        return createTerminalRegex(pattern);
    }
    getWaitConditionMatch(snapshot, freshOutput, type, regex, freshOnly) {
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
                const exhaustiveCheck = type;
                return exhaustiveCheck;
            }
        }
    }
    createCursor(session) {
        return {
            outputVersion: session.outputVersion,
            recentOutput: session.recentOutput,
        };
    }
    getOutputSince(session, cursor) {
        if (session.outputVersion === cursor.outputVersion) {
            return "";
        }
        if (session.recentOutput.startsWith(cursor.recentOutput)) {
            return session.recentOutput.slice(cursor.recentOutput.length);
        }
        return session.recentOutput;
    }
    redactForSession(session, text) {
        return redactText(text, session.redactions);
    }
    async waitForSettle(settleMs) {
        if (settleMs <= 0) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, settleMs));
    }
    notifySnapshotSubscribers(session) {
        if (this.snapshotSubscribers.size === 0) {
            return;
        }
        const snapshot = this.createSnapshot(session);
        this.snapshotSubscribers.forEach((subscriber) => subscriber(snapshot));
    }
    createSnapshot(session) {
        if (session.backend === "pty") {
            const screen = redactText(getFullText(session.terminal), session.redactions);
            const recentOutput = redactText(session.recentOutput, session.redactions);
            const buffer = session.terminal.buffer.active;
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
                cursorX: buffer.cursorX ?? undefined,
                cursorY: buffer.cursorY ?? undefined,
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
//# sourceMappingURL=terminalSessionService.js.map