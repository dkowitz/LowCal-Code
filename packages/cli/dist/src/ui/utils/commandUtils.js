/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawn } from "node:child_process";
/**
 * Checks if a query string potentially represents an '@' command.
 * It triggers if the query starts with '@' or contains '@' preceded by whitespace
 * and followed by a non-whitespace character.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '@' command, false otherwise.
 */
export const isAtCommand = (query) => 
// Check if starts with @ OR has a space, then @
query.startsWith("@") || /\s@/.test(query);
/**
 * Checks if a query string potentially represents an '/' command.
 * It triggers if the query starts with '/' but excludes code comments like '//' and '/*'.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '/' command, false otherwise.
 */
export const isSlashCommand = (query) => {
    if (!query.startsWith("/")) {
        return false;
    }
    // Exclude line comments that start with '//'
    if (query.startsWith("//")) {
        return false;
    }
    // Exclude block comments that start with '/*'
    if (query.startsWith("/*")) {
        return false;
    }
    return true;
};
const hasRemoteSession = () => Boolean(process.env["SSH_CONNECTION"] ||
    process.env["SSH_CLIENT"] ||
    process.env["SSH_TTY"]);
const shouldPreferTerminalClipboard = () => process.platform === "linux" &&
    Boolean(process.stdout.isTTY) &&
    Boolean(hasRemoteSession() || process.env["TMUX"] || process.env["ZELLIJ"]);
const writeOsc52ToTerminal = (text) => {
    const encoded = Buffer.from(text, "utf8").toString("base64");
    const osc52 = `\u001b]52;c;${encoded}\u0007`;
    if (process.env["TMUX"]) {
        const tmuxWrapped = `\u001bPtmux;\u001b${osc52.replaceAll("\u001b", "\u001b\u001b")}\u001b\\`;
        process.stdout.write(tmuxWrapped);
        return;
    }
    process.stdout.write(osc52);
};
// Copies a string snippet to the clipboard for different platforms
export const copyToClipboard = async (text) => {
    const run = (cmd, args, options) => new Promise((resolve, reject) => {
        const child = options ? spawn(cmd, args, options) : spawn(cmd, args);
        let stderr = "";
        if (child.stderr) {
            child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
        }
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0)
                return resolve();
            const errorMsg = stderr.trim();
            reject(new Error(`'${cmd}' exited with code ${code}${errorMsg ? `: ${errorMsg}` : ""}`));
        });
        if (child.stdin) {
            child.stdin.on("error", reject);
            child.stdin.write(text);
            child.stdin.end();
        }
        else {
            reject(new Error("Child process has no stdin stream to write to."));
        }
    });
    // Configure stdio for Linux clipboard commands.
    // - stdin: 'pipe' to write the text that needs to be copied.
    // - stdout: 'inherit' since we don't need to capture the command's output on success.
    // - stderr: 'pipe' to capture error messages (e.g., "command not found") for better error handling.
    const linuxOptions = { stdio: ["pipe", "inherit", "pipe"] };
    switch (process.platform) {
        case "win32":
            return run("clip", []);
        case "darwin":
            return run("pbcopy", []);
        case "linux":
            if (shouldPreferTerminalClipboard()) {
                writeOsc52ToTerminal(text);
                return;
            }
            try {
                await run("xclip", ["-selection", "clipboard"], linuxOptions);
            }
            catch (primaryError) {
                try {
                    // If xclip fails for any reason, try xsel as a fallback.
                    await run("xsel", ["--clipboard", "--input"], linuxOptions);
                }
                catch (fallbackError) {
                    if (process.stdout.isTTY) {
                        const xclipDisplayError = primaryError instanceof Error &&
                            primaryError.message.includes("Can't open display:");
                        const xselDisplayError = fallbackError instanceof Error &&
                            fallbackError.message.includes("Can't open display:");
                        if (xclipDisplayError ||
                            xselDisplayError ||
                            hasRemoteSession() ||
                            !process.env["DISPLAY"]) {
                            writeOsc52ToTerminal(text);
                            return;
                        }
                    }
                    const xclipNotFound = primaryError instanceof Error &&
                        primaryError.code === "ENOENT";
                    const xselNotFound = fallbackError instanceof Error &&
                        fallbackError.code === "ENOENT";
                    if (xclipNotFound && xselNotFound) {
                        throw new Error("Please ensure xclip or xsel is installed and configured.");
                    }
                    let primaryMsg = primaryError instanceof Error
                        ? primaryError.message
                        : String(primaryError);
                    if (xclipNotFound) {
                        primaryMsg = `xclip not found`;
                    }
                    let fallbackMsg = fallbackError instanceof Error
                        ? fallbackError.message
                        : String(fallbackError);
                    if (xselNotFound) {
                        fallbackMsg = `xsel not found`;
                    }
                    throw new Error(`All copy commands failed. "${primaryMsg}", "${fallbackMsg}". `);
                }
            }
            return;
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
};
export const getUrlOpenCommand = () => {
    // --- Determine the OS-specific command to open URLs ---
    let openCmd;
    switch (process.platform) {
        case "darwin":
            openCmd = "open";
            break;
        case "win32":
            openCmd = "start";
            break;
        case "linux":
            openCmd = "xdg-open";
            break;
        default:
            // Default to xdg-open, which appears to be supported for the less popular operating systems.
            openCmd = "xdg-open";
            console.warn(`Unknown platform: ${process.platform}. Attempting to open URLs with: ${openCmd}.`);
            break;
    }
    return openCmd;
};
//# sourceMappingURL=commandUtils.js.map