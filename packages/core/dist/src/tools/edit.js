/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Diff from "diff";
import { BaseDeclarativeTool, Kind, ToolConfirmationOutcome } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { makeRelative, shortenPath } from "../utils/paths.js";
import { isNodeError } from "../utils/errors.js";
import { ApprovalMode } from "../config/config.js";
import { DEFAULT_DIFF_OPTIONS, getDiffStat } from "./diffOptions.js";
import { ReadFileTool } from "./read-file.js";
import { ToolNames } from "./tool-names.js";
import { IDEConnectionStatus } from "../ide/ide-client.js";
import { FileOperation } from "../telemetry/metrics.js";
import { logFileOperation } from "../telemetry/loggers.js";
import { FileOperationEvent } from "../telemetry/types.js";
import { getProgrammingLanguage } from "../telemetry/telemetry-utils.js";
import { getSpecificMimeType } from "../utils/fileUtils.js";
const CONTEXT_PREVIEW_RADIUS = 3;
const normalizeLineEndings = (value) => value.replace(/\r\n/g, "\n");
const normalizeParams = (params) => {
    params.old_string = normalizeLineEndings(params.old_string);
    params.new_string = normalizeLineEndings(params.new_string);
    if (params.ai_proposed_string) {
        params.ai_proposed_string = normalizeLineEndings(params.ai_proposed_string);
    }
    return params;
};
export function applyReplacement(currentContent, oldString, newString, isNewFile) {
    if (isNewFile) {
        return newString;
    }
    if (currentContent === null) {
        // Should not happen if not a new file, but defensively return empty or newString if oldString is also empty
        return oldString === "" ? newString : "";
    }
    // If oldString is empty and it's not a new file, do not modify the content.
    if (oldString === "" && !isNewFile) {
        return currentContent;
    }
    return currentContent.replaceAll(oldString, newString);
}
class EditToolInvocation {
    config;
    params;
    constructor(config, params) {
        this.config = config;
        this.params = params;
        this.params = normalizeParams(params);
    }
    toolLocations() {
        return [{ path: this.params.file_path }];
    }
    /**
     * Calculates the potential outcome of an edit operation.
     * @param params Parameters for the edit operation
     * @returns An object describing the potential edit outcome
     * @throws File system errors if reading the file fails unexpectedly (e.g., permissions)
     */
    async calculateEdit(params) {
        const expectedReplacements = params.expected_replacements ?? 1;
        let currentContent = null;
        let fileExists = false;
        let isNewFile = false;
        const finalNewString = params.new_string;
        const finalOldString = params.old_string;
        let occurrences = 0;
        let error = undefined;
        try {
            currentContent = await this.config
                .getFileSystemService()
                .readTextFile(params.file_path);
            // Normalize line endings to LF for consistent processing.
            currentContent = currentContent.replace(/\r\n/g, "\n");
            fileExists = true;
        }
        catch (err) {
            if (!isNodeError(err) || err.code !== "ENOENT") {
                // Rethrow unexpected FS errors (permissions, etc.)
                throw err;
            }
            fileExists = false;
        }
        if (params.old_string === "" && !fileExists) {
            // Creating a new file
            isNewFile = true;
        }
        else if (!fileExists) {
            // Trying to edit a nonexistent file (and old_string is not empty)
            error = {
                display: `File not found. Cannot apply edit. Use an empty old_string to create a new file.`,
                raw: `File not found: ${params.file_path}`,
                type: ToolErrorType.FILE_NOT_FOUND,
            };
        }
        else if (currentContent !== null) {
            occurrences = this.countOccurrences(currentContent, params.old_string);
            if (params.old_string === "") {
                // Error: Trying to create a file that already exists
                error = {
                    display: `Failed to edit. Attempted to create a file that already exists.`,
                    raw: `File already exists, cannot create: ${params.file_path}`,
                    type: ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
                };
            }
            else if (occurrences === 0) {
                const contextHint = this.getApproximateContext(currentContent, finalOldString);
                error = {
                    display: `Failed to edit, could not find the string to replace. Re-read the file and copy the exact bytes.`,
                    raw: `Failed to edit, 0 occurrences found for old_string in ${params.file_path}. No edits made. The exact text in old_string was not found. Ensure you're not escaping content incorrectly and check whitespace, indentation, and context. Use ${ReadFileTool.Name} tool to verify.${contextHint ? `\nContext hint (best effort, copy directly from file):\n${contextHint}` : ""}`,
                    type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
                };
            }
            else if (occurrences !== expectedReplacements) {
                const occurrenceTerm = expectedReplacements === 1 ? "occurrence" : "occurrences";
                error = {
                    display: `Failed to edit, expected ${expectedReplacements} ${occurrenceTerm} but found ${occurrences}.`,
                    raw: `Failed to edit, Expected ${expectedReplacements} ${occurrenceTerm} but found ${occurrences} for old_string in file: ${params.file_path}`,
                    type: ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
                };
            }
            else if (finalOldString === finalNewString) {
                error = {
                    display: `No changes to apply. The old_string and new_string are identical.`,
                    raw: `No changes to apply. The old_string and new_string are identical in file: ${params.file_path}`,
                    type: ToolErrorType.EDIT_NO_CHANGE,
                };
            }
        }
        else {
            // Should not happen if fileExists and no exception was thrown, but defensively:
            error = {
                display: `Failed to read content of file.`,
                raw: `Failed to read content of existing file: ${params.file_path}`,
                type: ToolErrorType.READ_CONTENT_FAILURE,
            };
        }
        const newContent = !error
            ? applyReplacement(currentContent, finalOldString, finalNewString, isNewFile)
            : (currentContent ?? "");
        if (!error && fileExists && currentContent === newContent) {
            error = {
                display: "No changes to apply. The new content is identical to the current content.",
                raw: `No changes to apply. The new content is identical to the current content in file: ${params.file_path}`,
                type: ToolErrorType.EDIT_NO_CHANGE,
            };
        }
        return {
            currentContent,
            newContent,
            occurrences,
            error,
            isNewFile,
        };
    }
    /**
     * Counts occurrences of a substring in a string
     */
    countOccurrences(str, substr) {
        if (substr === "") {
            return 0;
        }
        let count = 0;
        let pos = str.indexOf(substr);
        while (pos !== -1) {
            count++;
            pos = str.indexOf(substr, pos + substr.length); // Start search after the current match
        }
        return count;
    }
    /**
     * Provides a best-effort context preview when the exact snippet was not found.
     * Helps the LLM rediscover the correct bytes via a follow-up read.
     */
    getApproximateContext(content, target) {
        const trimmedTarget = target.trim();
        if (!trimmedTarget) {
            return null;
        }
        const contentLines = content.split("\n");
        const targetLines = target
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        if (targetLines.length === 0) {
            return null;
        }
        const sampleTerms = targetLines.length <= 3
            ? targetLines
            : [
                targetLines[0],
                targetLines[Math.floor(targetLines.length / 2)],
                targetLines[targetLines.length - 1],
            ];
        const targetTokens = new Set(target
            .split(/[^A-Za-z0-9_]+/g)
            .map((token) => token.trim())
            .filter((token) => token.length > 2));
        let bestScore = 0;
        let bestIndex = -1;
        contentLines.forEach((line, index) => {
            const trimmedLine = line.trim();
            let score = 0;
            for (const term of sampleTerms) {
                if (term.length > 0 && trimmedLine.includes(term)) {
                    score += term.length;
                }
            }
            if (targetTokens.size > 0) {
                const lineTokens = new Set(trimmedLine
                    .split(/[^A-Za-z0-9_]+/g)
                    .map((token) => token.trim())
                    .filter((token) => token.length > 2));
                lineTokens.forEach((token) => {
                    if (targetTokens.has(token)) {
                        score += token.length;
                    }
                });
            }
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });
        if (bestScore === 0 || bestIndex === -1) {
            return null;
        }
        const start = Math.max(0, bestIndex - CONTEXT_PREVIEW_RADIUS);
        const end = Math.min(contentLines.length, bestIndex + CONTEXT_PREVIEW_RADIUS + 1);
        return contentLines.slice(start, end).join("\n");
    }
    /**
     * Handles the confirmation prompt for the Edit tool in the CLI.
     * It needs to calculate the diff to show the user.
     */
    async shouldConfirmExecute(_abortSignal) {
        if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
            return false;
        }
        let editData;
        try {
            editData = await this.calculateEdit(this.params);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`Error preparing edit: ${errorMsg}`);
            return false;
        }
        if (editData.error) {
            console.log(`Error: ${editData.error.display}`);
            return false;
        }
        const fileName = path.basename(this.params.file_path);
        const fileDiff = Diff.createPatch(fileName, editData.currentContent ?? "", editData.newContent, "Current", "Proposed", DEFAULT_DIFF_OPTIONS);
        const ideClient = this.config.getIdeClient();
        const ideConfirmation = this.config.getIdeMode() &&
            ideClient?.getConnectionStatus().status === IDEConnectionStatus.Connected
            ? ideClient.openDiff(this.params.file_path, editData.newContent)
            : undefined;
        const confirmationDetails = {
            type: "edit",
            title: `Confirm Edit: ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`,
            fileName,
            filePath: this.params.file_path,
            fileDiff,
            originalContent: editData.currentContent,
            newContent: editData.newContent,
            onConfirm: async (outcome) => {
                if (outcome === ToolConfirmationOutcome.ProceedAlways) {
                    this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
                }
                if (ideConfirmation) {
                    const result = await ideConfirmation;
                    if (result.status === "accepted" && result.content) {
                        // TODO(chrstn): See https://github.com/google-gemini/gemini-cli/pull/5618#discussion_r2255413084
                        // for info on a possible race condition where the file is modified on disk while being edited.
                        Object.assign(this.params, {
                            old_string: editData.currentContent ?? "",
                            new_string: result.content,
                        });
                        normalizeParams(this.params);
                    }
                }
            },
            ideConfirmation,
        };
        return confirmationDetails;
    }
    getDescription() {
        const relativePath = makeRelative(this.params.file_path, this.config.getTargetDir());
        if (this.params.old_string === "") {
            return `Create ${shortenPath(relativePath)}`;
        }
        const oldStringSnippet = this.params.old_string.split("\n")[0].substring(0, 30) +
            (this.params.old_string.length > 30 ? "..." : "");
        const newStringSnippet = this.params.new_string.split("\n")[0].substring(0, 30) +
            (this.params.new_string.length > 30 ? "..." : "");
        if (this.params.old_string === this.params.new_string) {
            return `No file changes to ${shortenPath(relativePath)}`;
        }
        return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
    }
    /**
     * Executes the edit operation with the given parameters.
     * @param params Parameters for the edit operation
     * @returns Result of the edit operation
     */
    async execute(_signal) {
        let editData;
        try {
            editData = await this.calculateEdit(this.params);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error preparing edit: ${errorMsg}`,
                returnDisplay: `Error preparing edit: ${errorMsg}`,
                error: {
                    message: errorMsg,
                    type: ToolErrorType.EDIT_PREPARATION_FAILURE,
                },
            };
        }
        if (editData.error) {
            return {
                llmContent: editData.error.raw,
                returnDisplay: `Error: ${editData.error.display}`,
                error: {
                    message: editData.error.raw,
                    type: editData.error.type,
                },
            };
        }
        try {
            this.ensureParentDirectoriesExist(this.params.file_path);
            await this.config
                .getFileSystemService()
                .writeTextFile(this.params.file_path, editData.newContent);
            let displayResult;
            const fileName = path.basename(this.params.file_path);
            const originallyProposedContent = this.params.ai_proposed_string || this.params.new_string;
            const diffStat = getDiffStat(fileName, editData.currentContent ?? "", originallyProposedContent, this.params.new_string);
            if (editData.isNewFile) {
                displayResult = `Created ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`;
            }
            else {
                // Generate diff for display, even though core logic doesn't technically need it
                // The CLI wrapper will use this part of the ToolResult
                const fileDiff = Diff.createPatch(fileName, editData.currentContent ?? "", // Should not be null here if not isNewFile
                editData.newContent, "Current", "Proposed", DEFAULT_DIFF_OPTIONS);
                displayResult = {
                    fileDiff,
                    fileName,
                    originalContent: editData.currentContent,
                    newContent: editData.newContent,
                    diffStat,
                };
            }
            const llmSuccessMessageParts = [
                editData.isNewFile
                    ? `Created new file: ${this.params.file_path} with provided content.`
                    : `Successfully modified file: ${this.params.file_path} (${editData.occurrences} replacements).`,
            ];
            if (this.params.modified_by_user) {
                llmSuccessMessageParts.push(`User modified the \`new_string\` content to be: ${this.params.new_string}.`);
            }
            const lines = editData.newContent.split("\n").length;
            const mimetype = getSpecificMimeType(this.params.file_path);
            const extension = path.extname(this.params.file_path);
            const programming_language = getProgrammingLanguage({
                file_path: this.params.file_path,
            });
            logFileOperation(this.config, new FileOperationEvent(EditTool.Name, editData.isNewFile ? FileOperation.CREATE : FileOperation.UPDATE, lines, mimetype, extension, diffStat, programming_language));
            return {
                llmContent: llmSuccessMessageParts.join(" "),
                returnDisplay: displayResult,
            };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error executing edit: ${errorMsg}`,
                returnDisplay: `Error writing file: ${errorMsg}`,
                error: {
                    message: errorMsg,
                    type: ToolErrorType.FILE_WRITE_FAILURE,
                },
            };
        }
    }
    /**
     * Creates parent directories if they don't exist
     */
    ensureParentDirectoriesExist(filePath) {
        const dirName = path.dirname(filePath);
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }
    }
}
/**
 * Implementation of the Edit tool logic
 */
export class EditTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.EDIT;
    constructor(config) {
        super(EditTool.Name, "Edit", `Critical usage rules:
- Always call the ${ReadFileTool.Name} tool immediately before editing and paste the exact bytes you see. Do not reconstruct the snippet.
- \`old_string\` must include precise indentation, whitespace, and at least 3 surrounding lines so it uniquely identifies the change.
- Do not escape or partially quote the text. Copy it verbatim.

What the tool does:
- Replaces text within a file. By default it makes one replacement; set \`expected_replacements\` when intentionally touching multiple matches.
- Users may tweak \`new_string\` via the IDE; the final response reports if that happened.

Parameter expectations:
1. \`file_path\` must be absolute and inside the workspace.
2. \`old_string\` is the exact literal snippet to remove.
3. \`new_string\` is the exact literal snippet to insert.
4. The tool fails fast if the snippet does not match exactly or matches the wrong count.

Tip: If an edit fails, re-run ${ReadFileTool.Name} to copy the current file content, update \`old_string\`, and try again.`, Kind.Edit, {
            properties: {
                file_path: {
                    description: "The absolute path to the file to modify. Must start with '/'.",
                    type: "string",
                },
                old_string: {
                    description: `Copy-paste the exact bytes you want to replace. Include at least 3 lines of surrounding context so the snippet is unique. Do not escape or synthesize the text—always read it from the file immediately before editing. For multiple replacements, specify expected_replacements.`,
                    type: "string",
                },
                new_string: {
                    description: "Literal replacement for `old_string`. Ensure it is the exact content you want written to the file (including indentation and newlines).",
                    type: "string",
                },
                expected_replacements: {
                    type: "number",
                    description: "Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences.",
                    minimum: 1,
                },
            },
            required: ["file_path", "old_string", "new_string"],
            type: "object",
        });
        this.config = config;
    }
    /**
     * Validates the parameters for the Edit tool
     * @param params Parameters to validate
     * @returns Error message string or null if valid
     */
    validateToolParamValues(params) {
        if (!params.file_path) {
            return "The 'file_path' parameter must be non-empty.";
        }
        if (!path.isAbsolute(params.file_path)) {
            return `File path must be absolute: ${params.file_path}`;
        }
        const workspaceContext = this.config.getWorkspaceContext();
        if (!workspaceContext.isPathWithinWorkspace(params.file_path)) {
            const directories = workspaceContext.getDirectories();
            return `File path must be within one of the workspace directories: ${directories.join(", ")}`;
        }
        return null;
    }
    createInvocation(params) {
        return new EditToolInvocation(this.config, params);
    }
    getModifyContext(_) {
        return {
            getFilePath: (params) => params.file_path,
            getCurrentContent: async (params) => {
                try {
                    return this.config
                        .getFileSystemService()
                        .readTextFile(params.file_path);
                }
                catch (err) {
                    if (!isNodeError(err) || err.code !== "ENOENT")
                        throw err;
                    return "";
                }
            },
            getProposedContent: async (params) => {
                try {
                    const currentContent = await this.config
                        .getFileSystemService()
                        .readTextFile(params.file_path);
                    return applyReplacement(currentContent, params.old_string, params.new_string, params.old_string === "" && currentContent === "");
                }
                catch (err) {
                    if (!isNodeError(err) || err.code !== "ENOENT")
                        throw err;
                    return "";
                }
            },
            createUpdatedParams: (oldContent, modifiedProposedContent, originalParams) => {
                const content = originalParams.new_string;
                return normalizeParams({
                    ...originalParams,
                    ai_proposed_string: content,
                    old_string: oldContent,
                    new_string: modifiedProposedContent,
                    modified_by_user: true,
                });
            },
        };
    }
}
//# sourceMappingURL=edit.js.map