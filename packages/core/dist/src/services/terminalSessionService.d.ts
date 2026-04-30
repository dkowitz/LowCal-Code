/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
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
export type TerminalSnapshotSubscriber = (snapshot: TerminalSnapshot) => void;
export interface TerminalAttachInput {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
    resume: () => void;
    on: (event: "data", listener: (data: Buffer | string) => void) => void;
    off?: (event: "data", listener: (data: Buffer | string) => void) => void;
    removeListener?: (event: "data", listener: (data: Buffer | string) => void) => void;
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
export declare class TerminalSessionService {
    private sessions;
    private nextSessionNumber;
    private ptyInfo;
    private snapshotSubscribers;
    subscribeToSnapshots(subscriber: TerminalSnapshotSubscriber): () => void;
    open(options: TerminalOpenOptions): Promise<TerminalSnapshot>;
    send(id: string, options: TerminalSendOptions): Promise<TerminalSnapshot>;
    read(id: string): Promise<TerminalSnapshot>;
    wait(id: string, options: TerminalWaitOptions, onUpdate?: (snapshot: TerminalSnapshot) => void, baseline?: TerminalTranscriptCursor): Promise<TerminalWaitResult>;
    resize(id: string, cols: number, rows: number): Promise<TerminalSnapshot>;
    close(id: string): Promise<TerminalSnapshot>;
    snapshot(id: string): Promise<TerminalSnapshot>;
    list(): TerminalSnapshot[];
    getTranscriptCursor(id: string): TerminalTranscriptCursor;
    getOutputSinceCursor(id: string, cursor: TerminalTranscriptCursor): string;
    attachInteractive(id: string, options: TerminalAttachOptions): Promise<void>;
    private resolveBackend;
    private openNativePtySession;
    private openTmuxSession;
    private sendTmuxInput;
    private refreshTmuxSession;
    private ensureTmuxAvailable;
    private resizeFromOutput;
    private getSession;
    private createWaitRegex;
    private getWaitConditionMatch;
    private createCursor;
    private getOutputSince;
    private redactForSession;
    private waitForSettle;
    private notifySnapshotSubscribers;
    private createSnapshot;
}
export declare const terminalSessionService: TerminalSessionService;
