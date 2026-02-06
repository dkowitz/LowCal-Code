/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { executeToolCall, shutdownTelemetry, isTelemetrySdkInitialized, GeminiEventType, parseAndFormatApiError, FatalInputError, FatalTurnLimitedError, } from "@qwen-code/qwen-code-core";
import { ConsolePatcher } from "./ui/utils/ConsolePatcher.js";
import { handleAtCommand } from "./ui/hooks/atCommandProcessor.js";
export async function runNonInteractive(config, input, prompt_id) {
    const prettyOutput = process.env["LOWCAL_HEADLESS_PRETTY"] === "1";
    const consolePatcher = prettyOutput
        ? null
        : new ConsolePatcher({
            stderr: true,
            debugMode: config.getDebugMode(),
        });
    const COLORS = {
        reset: "\x1b[0m",
        dim: "\x1b[2m",
        bold: "\x1b[1m",
        italic: "\x1b[3m",
        brightBlue: "\x1b[94m",
        brightCyan: "\x1b[96m",
        brightGreen: "\x1b[92m",
        brightYellow: "\x1b[93m",
        brightMagenta: "\x1b[95m",
        brightRed: "\x1b[91m",
        cyan: "\x1b[36m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        magenta: "\x1b[35m",
        red: "\x1b[31m",
    };
    const prettyHeader = (label, color) => `${COLORS.bold}${color}┌─ ${label}${COLORS.reset}`;
    const prettyLine = (text, style = "", borderColor = COLORS.brightCyan) => `${borderColor}│${COLORS.reset} ${style}${text}${COLORS.reset}`;
    const prettyFooter = (borderColor = COLORS.brightCyan) => `${borderColor}└────────────────────────${COLORS.reset}`;
    const formatToolResult = (value) => {
        if (!value)
            return "";
        if (typeof value === "string")
            return value;
        if ("fileDiff" in value) {
            return `File: ${value.fileName}\n${value.fileDiff}`;
        }
        if ("type" in value) {
            if (value.type === "todo_list") {
                return value.todos
                    .map((todo) => `- [${todo.status}] ${todo.content}`)
                    .join("\n");
            }
            if (value.type === "plan_summary") {
                return `${value.message}\n${value.plan}`;
            }
            if (value.type === "task_execution") {
                const statusLine = `Status: ${value.status}`;
                const resultLine = value.result ? `Result: ${value.result}` : "";
                return [statusLine, resultLine].filter(Boolean).join("\n");
            }
        }
        return JSON.stringify(value, null, 2);
    };
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug,
    };
    try {
        consolePatcher?.patch();
        if (prettyOutput) {
            let inToolArgs = false;
            const formatLine = (line) => {
                if (!line)
                    return null;
                if (line.startsWith("┌") ||
                    line.startsWith("│") ||
                    line.startsWith("└") ||
                    line.startsWith("╭") ||
                    line.startsWith("╰")) {
                    return line;
                }
                if (line.startsWith("Usage: node daemon.ts")) {
                    return null;
                }
                if (line.startsWith("[Agent]")) {
                    const msg = line.replace("[Agent]", "").trim();
                    return `${COLORS.bold}${COLORS.brightBlue}AGENT${COLORS.reset} ${msg}`;
                }
                if (line.startsWith("[Tool]")) {
                    const msg = line.replace("[Tool]", "").trim();
                    if (msg.startsWith("Args:")) {
                        inToolArgs = true;
                        const rest = msg.replace("Args:", "").trim();
                        if (rest) {
                            return `${COLORS.bold}${COLORS.brightYellow}TOOL ARGS${COLORS.reset} ${COLORS.dim}${rest}${COLORS.reset}`;
                        }
                        return `${COLORS.bold}${COLORS.brightYellow}TOOL ARGS${COLORS.reset}`;
                    }
                    return `${COLORS.bold}${COLORS.brightYellow}TOOL${COLORS.reset} ${msg}`;
                }
                if (inToolArgs) {
                    if (line.includes("}")) {
                        inToolArgs = false;
                    }
                    return `${COLORS.dim}${line}${COLORS.reset}`;
                }
                return line;
            };
            const formatAndWrite = (args) => {
                const text = args.map((arg) => String(arg)).join(" ");
                const lines = text.split(/\r?\n/);
                for (const line of lines) {
                    const formatted = formatLine(line);
                    if (formatted !== null) {
                        originalConsole.log(formatted);
                    }
                }
            };
            console.log = (...args) => formatAndWrite(args);
            console.info = (...args) => formatAndWrite(args);
            console.warn = (...args) => formatAndWrite(args);
            console.error = (...args) => formatAndWrite(args);
            console.debug = (...args) => formatAndWrite(args);
        }
        // Handle EPIPE errors when the output is piped to a command that closes early.
        process.stdout.on("error", (err) => {
            if (err.code === "EPIPE") {
                // Exit gracefully if the pipe is closed.
                process.exit(0);
            }
        });
        const geminiClient = config.getGeminiClient();
        const abortController = new AbortController();
        const { processedQuery, shouldProceed } = await handleAtCommand({
            query: input,
            config,
            addItem: (_item, _timestamp) => 0,
            onDebugMessage: () => { },
            messageId: Date.now(),
            signal: abortController.signal,
        });
        if (!shouldProceed || !processedQuery) {
            // An error occurred during @include processing (e.g., file not found).
            // The error message is already logged by handleAtCommand.
            throw new FatalInputError("Exiting due to an error processing the @ command.");
        }
        let currentMessages = [
            { role: "user", parts: processedQuery },
        ];
        let turnCount = 0;
        while (true) {
            turnCount++;
            if (config.getMaxSessionTurns() >= 0 &&
                turnCount > config.getMaxSessionTurns()) {
                throw new FatalTurnLimitedError("Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.");
            }
            const toolCallRequests = [];
            let currentAssistantText = "";
            let sawThought = false;
            const responseStream = geminiClient.sendMessageStream(currentMessages[0]?.parts || [], abortController.signal, prompt_id);
            for await (const event of responseStream) {
                if (abortController.signal.aborted) {
                    console.error("Operation cancelled.");
                    return;
                }
                if (event.type === GeminiEventType.Content) {
                    if (prettyOutput) {
                        currentAssistantText += event.value;
                    }
                    else {
                        process.stdout.write(event.value);
                    }
                }
                else if (event.type === GeminiEventType.Thought) {
                    sawThought = true;
                    if (prettyOutput) {
                        const thoughtText = event.value
                            ? `${event.value.subject}${event.value.description ? `: ${event.value.description}` : ""}`
                            : "";
                        if (thoughtText) {
                            console.log([
                                prettyHeader("THOUGHT", COLORS.brightMagenta),
                                prettyLine(thoughtText, COLORS.italic, COLORS.brightMagenta),
                                prettyFooter(COLORS.brightMagenta),
                            ].join("\n"));
                        }
                    }
                }
                else if (event.type === GeminiEventType.Error) {
                    const message = event.value?.error?.message ?? "Unknown error from model.";
                    if (prettyOutput) {
                        console.log([
                            prettyHeader("ERROR", COLORS.brightRed),
                            prettyLine(message, "", COLORS.brightRed),
                            prettyFooter(COLORS.brightRed),
                        ].join("\n"));
                    }
                    throw new Error(message);
                }
                else if (event.type === GeminiEventType.ToolCallRequest) {
                    toolCallRequests.push(event.value);
                }
            }
            if (prettyOutput && currentAssistantText.trim().length > 0) {
                const cleaned = currentAssistantText.trimEnd();
                const lines = cleaned.split(/\r?\n/);
                console.log(prettyHeader("LLM", COLORS.brightCyan));
                for (const line of lines) {
                    console.log(prettyLine(line, COLORS.italic, COLORS.brightCyan));
                }
                console.log(prettyFooter(COLORS.brightCyan));
            }
            else if (!prettyOutput &&
                sawThought &&
                currentAssistantText.length === 0) {
                process.stdout.write("\n");
            }
            if (toolCallRequests.length > 0) {
                const toolResponseParts = [];
                for (const requestInfo of toolCallRequests) {
                    if (prettyOutput) {
                        const argsText = requestInfo.args && Object.keys(requestInfo.args).length > 0
                            ? JSON.stringify(requestInfo.args, null, 2)
                            : "";
                        console.log(prettyHeader(`TOOL CALL: ${requestInfo.name}`, COLORS.brightYellow));
                        if (argsText) {
                            for (const line of argsText.split(/\r?\n/)) {
                                console.log(prettyLine(line, "", COLORS.brightYellow));
                            }
                        }
                        else {
                            console.log(prettyLine("(no args)", "", COLORS.brightYellow));
                        }
                        console.log(prettyFooter(COLORS.brightYellow));
                    }
                    const toolResponse = await executeToolCall(config, requestInfo, abortController.signal);
                    if (toolResponse.error) {
                        console.error(`Error executing tool ${requestInfo.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`);
                        if (prettyOutput) {
                            const errText = formatToolResult(toolResponse.resultDisplay) ||
                                toolResponse.error.message;
                            console.log(prettyHeader(`TOOL ERROR: ${requestInfo.name}`, COLORS.brightRed));
                            console.log(prettyLine(errText, "", COLORS.brightRed));
                            console.log(prettyFooter(COLORS.brightRed));
                        }
                    }
                    if (toolResponse.responseParts) {
                        toolResponseParts.push(...toolResponse.responseParts);
                    }
                    if (prettyOutput && toolResponse.resultDisplay) {
                        console.log(prettyHeader(`TOOL RESULT: ${requestInfo.name}`, COLORS.brightGreen));
                        const formatted = formatToolResult(toolResponse.resultDisplay);
                        for (const line of formatted.split(/\r?\n/)) {
                            console.log(prettyLine(line, "", COLORS.brightGreen));
                        }
                        console.log(prettyFooter(COLORS.brightGreen));
                    }
                }
                currentMessages = [{ role: "user", parts: toolResponseParts }];
            }
            else {
                process.stdout.write("\n"); // Ensure a final newline
                return;
            }
        }
    }
    catch (error) {
        console.error(parseAndFormatApiError(error, config.getContentGeneratorConfig()?.authType));
        throw error;
    }
    finally {
        if (prettyOutput) {
            console.log = originalConsole.log;
            console.warn = originalConsole.warn;
            console.error = originalConsole.error;
            console.info = originalConsole.info;
            console.debug = originalConsole.debug;
        }
        consolePatcher?.cleanup();
        if (isTelemetrySdkInitialized()) {
            await shutdownTelemetry(config);
        }
    }
}
//# sourceMappingURL=nonInteractiveCli.js.map