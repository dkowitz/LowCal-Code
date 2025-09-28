/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Error thrown when a subagent operation fails.
 */
export class SubagentError extends Error {
    code;
    subagentName;
    constructor(message, code, subagentName) {
        super(message);
        this.code = code;
        this.subagentName = subagentName;
        this.name = 'SubagentError';
    }
}
/**
 * Error codes for subagent operations.
 */
export const SubagentErrorCode = {
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    INVALID_CONFIG: 'INVALID_CONFIG',
    INVALID_NAME: 'INVALID_NAME',
    FILE_ERROR: 'FILE_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
};
/**
 * Describes the possible termination modes for a subagent.
 * This enum provides a clear indication of why a subagent's execution might have ended.
 */
export var SubagentTerminateMode;
(function (SubagentTerminateMode) {
    /**
     * Indicates that the subagent's execution terminated due to an unrecoverable error.
     */
    SubagentTerminateMode["ERROR"] = "ERROR";
    /**
     * Indicates that the subagent's execution terminated because it exceeded the maximum allowed working time.
     */
    SubagentTerminateMode["TIMEOUT"] = "TIMEOUT";
    /**
     * Indicates that the subagent's execution successfully completed all its defined goals.
     */
    SubagentTerminateMode["GOAL"] = "GOAL";
    /**
     * Indicates that the subagent's execution terminated because it exceeded the maximum number of turns.
     */
    SubagentTerminateMode["MAX_TURNS"] = "MAX_TURNS";
    /**
     * Indicates that the subagent's execution was cancelled via an abort signal.
     */
    SubagentTerminateMode["CANCELLED"] = "CANCELLED";
})(SubagentTerminateMode || (SubagentTerminateMode = {}));
//# sourceMappingURL=types.js.map