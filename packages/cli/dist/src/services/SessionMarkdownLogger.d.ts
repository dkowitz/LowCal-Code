/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HistoryItem } from "../ui/types.js";
export interface LoggingStatus {
    enabled: boolean;
    logFilePath?: string;
    loggingStartedAt?: string;
    lastError?: string;
}
export interface SessionMetadataSummary {
    sessionId?: string;
    sessionStartTime?: Date;
    model?: string | null;
    approvalMode?: string | null;
    debugMode?: boolean;
    cwd: string;
    additionalContext?: Record<string, unknown>;
}
export interface CommandInvocationLogPayload {
    timestamp: string;
    rawCommand: string;
    canonicalPath: string[];
    args: string;
}
export interface CommandResultLogPayload {
    timestamp: string;
    canonicalPath: string[];
    rawCommand: string;
    outcome: string;
    durationMs?: number;
    details?: Record<string, unknown>;
}
export interface ErrorReportLogPayload {
    timestamp: string;
    type: string;
    baseMessage: string;
    reportPath?: string;
    report: unknown;
    writeSucceeded: boolean;
}
export interface AppErrorLogPayload {
    timestamp: string;
    message: string;
}
export interface SessionLoggingController {
    enableLogging(): Promise<LoggingStatus>;
    disableLogging(reason?: string): Promise<LoggingStatus>;
    getStatus(): LoggingStatus;
    logCommandInvocation(payload: CommandInvocationLogPayload): void;
    logCommandResult(payload: CommandResultLogPayload): void;
    logAppError(message: string): void;
    logErrorReport(payload: ErrorReportLogPayload): void;
}
export declare class SessionMarkdownLogger {
    private readonly cwd;
    private enabled;
    private logFilePath;
    private loggingStartedAt;
    private lastError;
    private writeQueue;
    private loggedHistoryIds;
    constructor(cwd?: string);
    getStatus(): LoggingStatus;
    isEnabled(): boolean;
    enable(metadata: SessionMetadataSummary, initialHistory: HistoryItem[]): Promise<LoggingStatus>;
    disable(reason?: string): Promise<LoggingStatus>;
    logHistorySnapshot(history: HistoryItem[], label?: string): Promise<void>;
    logHistoryItem(item: HistoryItem): Promise<void>;
    logCommandInvocation(payload: CommandInvocationLogPayload): Promise<void>;
    logCommandResult(payload: CommandResultLogPayload): Promise<void>;
    logAppError(payload: AppErrorLogPayload): Promise<void>;
    logErrorReport(payload: ErrorReportLogPayload): Promise<void>;
    syncHistory(previous: HistoryItem[], current: HistoryItem[]): void;
    private buildHeader;
    private formatHistoryItem;
    private logEvent;
    private enqueueWrite;
}
