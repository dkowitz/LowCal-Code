/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs";
import path from "node:path";
import { terminalSessionService, } from "../services/terminalSessionService.js";
import { getCommandRoots, isCommandNeedsPermission, stripShellWrapper, } from "../utils/shell-utils.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind, ToolConfirmationOutcome, } from "./tools.js";
const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 24;
const DEFAULT_TERMINAL_OUTPUT_CHARS = 6000;
const MAX_TERMINAL_OUTPUT_CHARS = 50000;
const TERMINAL_SCREEN_CHARS = 4000;
function resolveCwd(config, directory) {
    const targetDir = config.getTargetDir();
    if (!directory) {
        return targetDir;
    }
    return path.resolve(targetDir, directory);
}
function validateRelativeDirectory(config, directory) {
    if (!directory) {
        return null;
    }
    if (path.isAbsolute(directory)) {
        return "Directory cannot be absolute. Use a path relative to the workspace root.";
    }
    const targetDir = config.getTargetDir();
    const resolved = path.resolve(targetDir, directory);
    const relative = path.relative(targetDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return "Directory must stay inside the workspace root.";
    }
    if (!fs.existsSync(resolved)) {
        return `Directory '${directory}' does not exist.`;
    }
    if (!fs.statSync(resolved).isDirectory()) {
        return `Directory '${directory}' is not a directory.`;
    }
    return null;
}
function validatePositiveInteger(value, name, min, max) {
    if (value === undefined) {
        return null;
    }
    if (!Number.isInteger(value) || value < min || value > max) {
        return `${name} must be an integer between ${min} and ${max}.`;
    }
    return null;
}
function validateRegexPattern(pattern) {
    try {
        if (pattern.startsWith("(?i)")) {
            new RegExp(pattern.slice(4), "im");
        }
        else {
            new RegExp(pattern, "m");
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `wait_for.pattern is not a valid regular expression: ${message}`;
    }
    return null;
}
function sanitizeTerminalText(value) {
    return value
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("")
        .filter((character) => {
        const code = character.charCodeAt(0);
        return code === 9 || code === 10 || (code >= 32 && code !== 127);
    })
        .join("");
}
function compactTerminalText(value, maxChars) {
    const sanitized = sanitizeTerminalText(value);
    if (sanitized.length <= maxChars) {
        return sanitized;
    }
    const marker = `\n... [terminal output truncated: omitted ${(sanitized.length - maxChars).toLocaleString()} characters]\n`;
    const headLength = Math.max(0, Math.floor((maxChars - marker.length) * 0.65));
    const tailLength = Math.max(0, maxChars - marker.length - headLength);
    return `${sanitized.slice(0, headLength)}${marker}${sanitized.slice(sanitized.length - tailLength)}`;
}
function getMaxOutputChars(params) {
    return params.max_output_chars ?? DEFAULT_TERMINAL_OUTPUT_CHARS;
}
function formatSnapshot(snapshot, options = {}) {
    const maxOutputChars = options.maxOutputChars ?? DEFAULT_TERMINAL_OUTPUT_CHARS;
    const screen = compactTerminalText(snapshot.screen, Math.min(maxOutputChars, TERMINAL_SCREEN_CHARS));
    const activeLine = compactTerminalText(snapshot.lastLine, 500);
    const outputSince = options.outputSince
        ? compactTerminalText(options.outputSince.value, maxOutputChars)
        : undefined;
    const recentTranscript = options.includeRecentTranscript
        ? compactTerminalText(snapshot.recentOutput, maxOutputChars)
        : undefined;
    return [
        `Session: ${snapshot.id}`,
        `Name: ${snapshot.name}`,
        `Backend: ${snapshot.backend}`,
        `Status: ${snapshot.running ? "running" : "exited"}`,
        `PID: ${snapshot.pid ?? "(none)"}`,
        `Directory: ${snapshot.cwd}`,
        `Size: ${snapshot.cols}x${snapshot.rows}`,
        snapshot.attachCommand ? `Attach Command: ${snapshot.attachCommand}` : "",
        snapshot.exitCode === undefined ? "" : `Exit Code: ${snapshot.exitCode}`,
        snapshot.signal === undefined ? "" : `Signal: ${snapshot.signal}`,
        `Output Version: ${snapshot.outputVersion}`,
        `Active Line: ${activeLine || "(empty)"}`,
        options.outputSince ? `${options.outputSince.label}:` : "",
        options.outputSince ? outputSince || "(none)" : "",
        "Visible Screen:",
        screen || "(empty)",
        recentTranscript === undefined ? "" : "Recent Transcript:",
        recentTranscript === undefined ? "" : recentTranscript || "(empty)",
    ]
        .filter(Boolean)
        .join("\n");
}
function formatWaitResult(result, options = {}) {
    const maxOutputChars = options.maxOutputChars ?? DEFAULT_TERMINAL_OUTPUT_CHARS;
    return [
        `Wait: ${result.matched ? "matched" : "timed out"}`,
        `Condition: ${result.condition}`,
        result.matchedText
            ? `Matched Text: ${compactTerminalText(result.matchedText, 500)}`
            : "",
        `${options.outputLabel ?? "New Output Since Wait Started"}:`,
        compactTerminalText(result.outputSinceStart, maxOutputChars) || "(none)",
        formatSnapshot(result.snapshot, {
            includeRecentTranscript: options.includeRecentTranscript,
            maxOutputChars,
        }),
    ]
        .filter(Boolean)
        .join("\n");
}
function formatSessionList(snapshots) {
    if (snapshots.length === 0) {
        return "No interactive terminal sessions are open.";
    }
    return snapshots
        .map((snapshot) => [
        `Session: ${snapshot.id}`,
        `Name: ${snapshot.name}`,
        `Backend: ${snapshot.backend}`,
        `Status: ${snapshot.running ? "running" : "exited"}`,
        snapshot.attachCommand
            ? `Attach Command: ${snapshot.attachCommand}`
            : "",
    ]
        .filter(Boolean)
        .join("\n"))
        .join("\n\n");
}
function normalizeWaitOptions(options) {
    if (!options) {
        return undefined;
    }
    return {
        type: options.type,
        pattern: options.pattern,
        timeoutMs: options.timeoutMs,
        idleMs: options.idleMs,
        pollIntervalMs: options.pollIntervalMs,
        freshOnly: options.freshOnly ?? options.fresh_only,
    };
}
function getWaitOptions(params) {
    if (params.wait_for) {
        return normalizeWaitOptions(params.wait_for);
    }
    if (!params.type) {
        return undefined;
    }
    return normalizeWaitOptions({
        type: params.type,
        pattern: params.pattern,
        timeoutMs: params.timeoutMs,
        idleMs: params.idleMs,
        pollIntervalMs: params.pollIntervalMs,
        freshOnly: params.freshOnly,
        fresh_only: params.fresh_only,
    });
}
function validateWaitOptions(options) {
    if (!options) {
        return null;
    }
    if (!["idle", "regex", "exit"].includes(options.type)) {
        return "wait_for.type must be one of: idle, regex, exit.";
    }
    if (options.type === "regex" && !options.pattern?.trim()) {
        return "wait_for.pattern is required when wait_for.type is regex.";
    }
    const patternError = options.pattern
        ? validateRegexPattern(options.pattern)
        : null;
    return (patternError ||
        validatePositiveInteger(options.timeoutMs, "wait_for.timeoutMs", 100, 120000) ||
        validatePositiveInteger(options.idleMs, "wait_for.idleMs", 100, 30000) ||
        validatePositiveInteger(options.pollIntervalMs, "wait_for.pollIntervalMs", 50, 5000));
}
function requireSessionId(params) {
    if (!params.session_id?.trim()) {
        return "session_id is required for this action.";
    }
    return null;
}
function getActionDescription(params) {
    const waitOptions = getWaitOptions(params);
    switch (params.action) {
        case "open":
            return params.command
                ? `open interactive terminal and run: ${params.command}`
                : "open interactive terminal";
        case "send":
            return `send input to interactive terminal ${params.session_id ?? "(missing session)"}`;
        case "wait":
            return `wait for ${waitOptions?.type ?? "condition"} in interactive terminal ${params.session_id ?? "(missing session)"}`;
        case "read":
            return `read interactive terminal ${params.session_id ?? "(missing session)"}`;
        case "list":
            return "list interactive terminal sessions";
        case "close":
            return `close interactive terminal ${params.session_id ?? "(missing session)"}`;
        default: {
            const exhaustiveCheck = params.action;
            return exhaustiveCheck;
        }
    }
}
class InteractiveTerminalInvocation extends BaseToolInvocation {
    config;
    allowlist;
    constructor(config, params, allowlist) {
        super(params);
        this.config = config;
        this.allowlist = allowlist;
    }
    getDescription() {
        return getActionDescription(this.params);
    }
    async shouldConfirmExecute() {
        if (this.params.action !== "open" || !this.params.command?.trim()) {
            return false;
        }
        const command = stripShellWrapper(this.params.command);
        const rootCommands = [...new Set(getCommandRoots(command))];
        const commandsToConfirm = rootCommands.filter((rootCommand) => !this.allowlist.has(rootCommand));
        if (commandsToConfirm.length === 0) {
            return false;
        }
        const permissionCheck = isCommandNeedsPermission(command);
        if (!permissionCheck.requiresPermission) {
            return false;
        }
        const confirmationDetails = {
            type: "exec",
            title: "Confirm Interactive Terminal",
            command: this.params.command,
            rootCommand: commandsToConfirm.join(", "),
            onConfirm: async (outcome) => {
                if (outcome === ToolConfirmationOutcome.ProceedAlways) {
                    commandsToConfirm.forEach((rootCommand) => this.allowlist.add(rootCommand));
                }
            },
        };
        return confirmationDetails;
    }
    async execute(_signal, updateOutput) {
        try {
            switch (this.params.action) {
                case "open":
                    return await this.open();
                case "send":
                    return await this.send(updateOutput);
                case "wait":
                    return await this.wait(updateOutput);
                case "read":
                    return await this.read();
                case "list":
                    return this.list();
                case "close":
                    return await this.close();
                default: {
                    const exhaustiveCheck = this.params.action;
                    return exhaustiveCheck;
                }
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error using interactive terminal: ${message}`,
                returnDisplay: message,
                error: {
                    message,
                    type: ToolErrorType.EXECUTION_FAILED,
                },
            };
        }
    }
    async open() {
        const snapshot = await terminalSessionService.open({
            command: this.params.command,
            cwd: resolveCwd(this.config, this.params.directory),
            cols: this.params.cols ?? DEFAULT_TERMINAL_COLS,
            rows: this.params.rows ?? DEFAULT_TERMINAL_ROWS,
            backend: this.params.backend ?? "auto",
            name: this.params.name,
        });
        return this.resultFromDisplay(this.formatSnapshot(snapshot));
    }
    async send(updateOutput) {
        const sessionId = this.params.session_id;
        const baseline = terminalSessionService.getTranscriptCursor(sessionId);
        const waitOptions = getWaitOptions(this.params);
        const snapshot = await terminalSessionService.send(sessionId, {
            input: this.params.input ?? "",
            appendEnter: this.params.append_enter ?? false,
            sensitiveInput: this.params.sensitive_input ?? false,
            settleMs: this.params.settle_ms,
        });
        if (!waitOptions) {
            return this.resultFromDisplay(this.formatSnapshot(snapshot, {
                label: "New Output Since Action",
                value: terminalSessionService.getOutputSinceCursor(sessionId, baseline),
            }));
        }
        updateOutput?.(this.formatSnapshot(snapshot));
        const waitResult = await terminalSessionService.wait(sessionId, waitOptions, (nextSnapshot) => updateOutput?.(this.formatSnapshot(nextSnapshot)), baseline);
        return this.resultFromDisplay(this.formatWaitResult(waitResult, "New Output Since Action"));
    }
    async wait(updateOutput) {
        const sessionId = this.params.session_id;
        const waitOptions = getWaitOptions(this.params);
        const baseline = terminalSessionService.getTranscriptCursor(sessionId);
        const waitResult = await terminalSessionService.wait(sessionId, waitOptions, (snapshot) => updateOutput?.(this.formatSnapshot(snapshot)), baseline);
        return this.resultFromDisplay(this.formatWaitResult(waitResult));
    }
    async read() {
        const snapshot = await terminalSessionService.read(this.params.session_id);
        return this.resultFromDisplay(this.formatSnapshot(snapshot));
    }
    list() {
        return this.resultFromDisplay(formatSessionList(terminalSessionService.list()));
    }
    async close() {
        const snapshot = await terminalSessionService.close(this.params.session_id);
        return this.resultFromDisplay(this.formatSnapshot(snapshot));
    }
    formatSnapshot(snapshot, outputSince) {
        return formatSnapshot(snapshot, {
            outputSince,
            includeRecentTranscript: this.params.include_recent_transcript ?? false,
            maxOutputChars: getMaxOutputChars(this.params),
        });
    }
    formatWaitResult(result, outputLabel) {
        return formatWaitResult(result, {
            outputLabel,
            includeRecentTranscript: this.params.include_recent_transcript ?? false,
            maxOutputChars: getMaxOutputChars(this.params),
        });
    }
    resultFromDisplay(display) {
        return {
            llmContent: display,
            returnDisplay: display,
        };
    }
}
export class InteractiveTerminalTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.INTERACTIVE_TERMINAL;
    allowlist = new Set();
    constructor(config) {
        super(InteractiveTerminalTool.Name, "Interactive Terminal", `Operate persistent interactive terminal sessions for SSH, screen/tmux, REPLs, prompts, and commands that need ongoing input. Use action=open to create a session, action=send to type, action=wait to wait for idle/regex/exit, action=read to inspect, action=list to recover session ids, and action=close to end a session. Prefer ${ToolNames.SHELL} for ordinary non-interactive commands.`, Kind.Execute, {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["open", "send", "wait", "read", "list", "close"],
                    description: "Operation to perform on interactive terminal sessions.",
                },
                session_id: {
                    type: "string",
                    description: "Terminal session id. Required for send, wait, read, and close.",
                },
                command: {
                    type: "string",
                    description: "Initial command for action=open, such as `ssh host` or `python`.",
                },
                directory: {
                    type: "string",
                    description: "Start directory for action=open, relative to the workspace root.",
                },
                backend: {
                    type: "string",
                    enum: ["auto", "pty", "tmux"],
                    description: "Terminal backend for action=open. Use auto unless tmux/native PTY is explicitly useful.",
                },
                cols: {
                    type: "number",
                    description: "Terminal width in columns for action=open.",
                },
                rows: {
                    type: "number",
                    description: "Terminal height in rows for action=open.",
                },
                name: {
                    type: "string",
                    description: "Optional label for action=open.",
                },
                input: {
                    type: "string",
                    description: "Text or control sequence for action=send. Common escaped key notation is decoded before sending, so \\u0003, \\x03, and actual control bytes all work for Ctrl-C; \\e works for Escape. Embedded newlines are sent as Enter keypresses. For modal full-screen programs, send control keys and confirmation Enter as separate sends when possible.",
                },
                append_enter: {
                    type: "boolean",
                    description: "For action=send, press Enter after input. Default is false.",
                },
                sensitive_input: {
                    type: "boolean",
                    description: "For action=send, redact this input from later terminal snapshots. Use for passwords and tokens.",
                },
                settle_ms: {
                    type: "number",
                    description: "Milliseconds to let terminal output settle after action=send before returning. Default is 150.",
                },
                include_recent_transcript: {
                    type: "boolean",
                    description: "Include recent terminal scrollback in the response. Default is false to avoid repeating history every call.",
                },
                max_output_chars: {
                    type: "number",
                    description: "Maximum characters per terminal output section. Default is 6000.",
                },
                wait_for: {
                    type: "object",
                    description: "Wait condition for action=wait, or optional post-send wait for action=send. Regex waits match fresh output and the active line by default.",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["idle", "regex", "exit"],
                            description: "Wait for output to become idle, text matching pattern, or session exit.",
                        },
                        pattern: {
                            type: "string",
                            description: "Regular expression pattern required when type is regex.",
                        },
                        timeoutMs: {
                            type: "number",
                            description: "Maximum wait time in milliseconds.",
                        },
                        idleMs: {
                            type: "number",
                            description: "Milliseconds without output before idle is considered matched.",
                        },
                        pollIntervalMs: {
                            type: "number",
                            description: "Polling interval in milliseconds. Usually leave unset.",
                        },
                        freshOnly: {
                            type: "boolean",
                            description: "For regex waits, match only fresh output plus the active line. Default is true.",
                        },
                        fresh_only: {
                            type: "boolean",
                            description: "Alias for freshOnly.",
                        },
                    },
                    required: ["type"],
                },
                type: {
                    type: "string",
                    enum: ["idle", "regex", "exit"],
                    description: "Top-level alias for wait_for.type, accepted for action=wait and send-with-wait.",
                },
                pattern: {
                    type: "string",
                    description: "Top-level alias for wait_for.pattern.",
                },
                timeoutMs: {
                    type: "number",
                    description: "Top-level alias for wait_for.timeoutMs.",
                },
                idleMs: {
                    type: "number",
                    description: "Top-level alias for wait_for.idleMs.",
                },
                pollIntervalMs: {
                    type: "number",
                    description: "Top-level alias for wait_for.pollIntervalMs.",
                },
                freshOnly: {
                    type: "boolean",
                    description: "Top-level alias for wait_for.freshOnly.",
                },
                fresh_only: {
                    type: "boolean",
                    description: "Top-level alias for wait_for.freshOnly.",
                },
            },
            required: ["action"],
        }, false, true);
        this.config = config;
    }
    validateToolParamValues(params) {
        switch (params.action) {
            case "open":
                return (validateRelativeDirectory(this.config, params.directory) ||
                    validatePositiveInteger(params.cols, "cols", 20, 300) ||
                    validatePositiveInteger(params.rows, "rows", 5, 100));
            case "send":
                return (requireSessionId(params) ||
                    validatePositiveInteger(params.settle_ms, "settle_ms", 0, 30000) ||
                    validatePositiveInteger(params.max_output_chars, "max_output_chars", 500, MAX_TERMINAL_OUTPUT_CHARS) ||
                    validateWaitOptions(getWaitOptions(params)));
            case "wait":
                return (requireSessionId(params) ||
                    validatePositiveInteger(params.max_output_chars, "max_output_chars", 500, MAX_TERMINAL_OUTPUT_CHARS) ||
                    (!getWaitOptions(params)
                        ? "wait_for is required for action=wait. Top-level type/pattern aliases are also accepted."
                        : validateWaitOptions(getWaitOptions(params))));
            case "read":
            case "close":
                return (requireSessionId(params) ||
                    validatePositiveInteger(params.max_output_chars, "max_output_chars", 500, MAX_TERMINAL_OUTPUT_CHARS));
            case "list":
                return null;
            default: {
                const exhaustiveCheck = params.action;
                return exhaustiveCheck;
            }
        }
    }
    createInvocation(params) {
        return new InteractiveTerminalInvocation(this.config, params, this.allowlist);
    }
}
//# sourceMappingURL=terminal.js.map