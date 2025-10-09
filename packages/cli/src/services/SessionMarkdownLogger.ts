/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "node:path";
import { promises as fs } from "node:fs";
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

export class SessionMarkdownLogger {
  private readonly cwd: string;
  private enabled = false;
  private logFilePath: string | undefined;
  private loggingStartedAt: string | undefined;
  private lastError: string | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  private loggedHistoryIds = new Set<number>();

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  getStatus(): LoggingStatus {
    return {
      enabled: this.enabled,
      logFilePath: this.logFilePath,
      loggingStartedAt: this.loggingStartedAt,
      lastError: this.lastError,
    };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async enable(
    metadata: SessionMetadataSummary,
    initialHistory: HistoryItem[],
  ): Promise<LoggingStatus> {
    if (this.enabled && this.logFilePath) {
      return this.getStatus();
    }

    const logDir = path.join(this.cwd, "logs");
    await fs.mkdir(logDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const safeTimestamp = timestamp.replace(/[:]/g, "-");
    const filePath = path.join(logDir, `session-log-${safeTimestamp}.md`);

    const header = this.buildHeader(metadata, timestamp);
    await fs.writeFile(filePath, header, "utf8");

    this.enabled = true;
    this.logFilePath = filePath;
    this.loggingStartedAt = timestamp;
    this.lastError = undefined;
    this.loggedHistoryIds.clear();

    await this.logEvent("Logging enabled", timestamp, {
      message:
        "Session logging activated. Subsequent events will appear below.",
      logFilePath: filePath,
    });
    await this.logHistorySnapshot(
      initialHistory,
      "Initial conversation snapshot",
    );

    return this.getStatus();
  }

  async disable(reason?: string): Promise<LoggingStatus> {
    if (!this.enabled) {
      return this.getStatus();
    }
    const timestamp = new Date().toISOString();
    await this.logEvent("Logging disabled", timestamp, {
      message: reason ?? "Session logging deactivated.",
    });
    this.enabled = false;
    this.loggingStartedAt = undefined;
    this.loggedHistoryIds.clear();
    return this.getStatus();
  }

  async logHistorySnapshot(
    history: HistoryItem[],
    label = "Conversation snapshot",
  ): Promise<void> {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString();
    const contentLines: string[] = [];
    contentLines.push(
      `### ${timestamp} — ${label}
`,
      `Total entries: ${history.length}
`,
    );

    for (const [index, item] of history.entries()) {
      contentLines.push(this.formatHistoryItem(item, index + 1));
      this.loggedHistoryIds.add(item.id);
    }

    await this.enqueueWrite(contentLines.join("\n"));
  }

  async logHistoryItem(item: HistoryItem): Promise<void> {
    if (!this.enabled) return;
    if (this.loggedHistoryIds.has(item.id)) return;
    this.loggedHistoryIds.add(item.id);
    const content = this.formatHistoryItem(item);
    await this.enqueueWrite(content);
  }

  async logCommandInvocation(
    payload: CommandInvocationLogPayload,
  ): Promise<void> {
    if (!this.enabled) return;
    const meta = {
      rawCommand: payload.rawCommand,
      canonicalPath: payload.canonicalPath,
      args: payload.args,
    };
    await this.logEvent(
      `Command invoked: ${payload.canonicalPath.join(" ") || payload.rawCommand}`,
      payload.timestamp,
      meta,
    );
  }

  async logCommandResult(payload: CommandResultLogPayload): Promise<void> {
    if (!this.enabled) return;
    const meta: Record<string, unknown> = {
      rawCommand: payload.rawCommand,
      canonicalPath: payload.canonicalPath,
      outcome: payload.outcome,
    };
    if (payload.durationMs !== undefined) {
      meta["durationMs"] = payload.durationMs;
    }
    if (payload.details) {
      meta["details"] = payload.details;
    }
    await this.logEvent(
      `Command completed: ${payload.canonicalPath.join(" ") || payload.rawCommand}`,
      payload.timestamp,
      meta,
    );
  }

  async logAppError(payload: AppErrorLogPayload): Promise<void> {
    if (!this.enabled) return;
    await this.logEvent("Application error", payload.timestamp, {
      message: payload.message,
    });
  }

  async logErrorReport(payload: ErrorReportLogPayload): Promise<void> {
    if (!this.enabled) return;
    const meta: Record<string, unknown> = {
      type: payload.type,
      baseMessage: payload.baseMessage,
      writeSucceeded: payload.writeSucceeded,
    };
    if (payload.reportPath) {
      meta["reportPath"] = payload.reportPath;
    }
    await this.logEvent("Error report generated", payload.timestamp, meta, {
      json: payload.report,
    });
  }

  syncHistory(previous: HistoryItem[], current: HistoryItem[]): void {
    if (!this.enabled) return;
    const previousIds = new Set(previous.map((item) => item.id));
    const currentIds = new Set(current.map((item) => item.id));

    const removed = previous.filter((item) => !currentIds.has(item.id));
    const added = current.filter((item) => !previousIds.has(item.id));

    if (removed.length > 0 && current.length === 0) {
      this.loggedHistoryIds.clear();
      void this.logEvent("History cleared", new Date().toISOString(), {
        removedCount: removed.length,
      });
      return;
    }

    if (removed.length > 0 && added.length > 0) {
      this.loggedHistoryIds.clear();
      void this.logEvent("History replaced", new Date().toISOString(), {
        removedCount: removed.length,
        newCount: current.length,
      });
      void this.logHistorySnapshot(
        current,
        "Conversation snapshot after replacement",
      );
      return;
    }

    if (removed.length > 0) {
      for (const item of removed) {
        this.loggedHistoryIds.delete(item.id);
      }
      void this.logEvent("History entries removed", new Date().toISOString(), {
        removedCount: removed.length,
        removedIds: removed.map((item) => item.id),
      });
    }

    if (added.length > 0) {
      for (const item of added) {
        void this.logHistoryItem(item);
      }
    }
  }

  private buildHeader(
    metadata: SessionMetadataSummary,
    timestamp: string,
  ): string {
    const lines: string[] = [];
    lines.push("# Session Log", "");
    lines.push(`- Generated at: ${timestamp}`);
    lines.push(`- Working directory: ${metadata.cwd}`);
    if (metadata.sessionId) {
      lines.push(`- Session ID: ${metadata.sessionId}`);
    }
    if (metadata.sessionStartTime) {
      lines.push(`- Session start: ${metadata.sessionStartTime.toISOString()}`);
    }
    if (metadata.model) {
      lines.push(`- Active model: ${metadata.model}`);
    }
    if (metadata.approvalMode) {
      lines.push(`- Approval mode: ${metadata.approvalMode}`);
    }
    if (metadata.debugMode !== undefined) {
      lines.push(`- Debug mode: ${metadata.debugMode ? "on" : "off"}`);
    }
    if (
      metadata.additionalContext &&
      Object.keys(metadata.additionalContext).length > 0
    ) {
      lines.push("", "```json");
      lines.push(JSON.stringify(metadata.additionalContext, null, 2));
      lines.push("```");
    }
    lines.push("", "## Timeline", "");
    return lines.join("\n");
  }

  private formatHistoryItem(item: HistoryItem, position?: number): string {
    const timestamp = new Date(item.id).toISOString();
    const headerLabel = position
      ? `${timestamp} — Message #${position} (${item.type})`
      : `${timestamp} — ${item.type}`;
    const lines: string[] = [`### ${headerLabel}`, ""];

    if ("text" in item && item.text) {
      lines.push("**Text:**", "```text", item.text, "```", "");
    }

    if (item.type === "tool_group" && item.tools) {
      lines.push("**Tools:**");
      for (const tool of item.tools) {
        lines.push(
          `- ${tool.name} (${tool.status})${
            tool.renderOutputAsMarkdown ? " [markdown]" : ""
          }`,
        );
        if (tool.resultDisplay !== undefined) {
          lines.push("  ```json");
          lines.push(JSON.stringify(tool.resultDisplay, null, 2));
          lines.push("  ```");
        }
      }
      lines.push("");
    }

    lines.push(
      "**Raw item:**",
      "```json",
      JSON.stringify(item, null, 2),
      "```",
      "",
    );
    return lines.join("\n");
  }

  private async logEvent(
    title: string,
    timestamp: string,
    metadata?: Record<string, unknown>,
    extra?: { json?: unknown },
  ): Promise<void> {
    if (!this.enabled) return;
    const lines: string[] = [`### ${timestamp} — ${title}`, ""];
    if (metadata) {
      lines.push("```json");
      lines.push(JSON.stringify(metadata, null, 2));
      lines.push("```", "");
    }
    if (extra?.json !== undefined) {
      lines.push("```json");
      lines.push(JSON.stringify(extra.json, null, 2));
      lines.push("```", "");
    }
    await this.enqueueWrite(lines.join("\n"));
  }

  private async enqueueWrite(content: string): Promise<void> {
    if (!this.enabled || !this.logFilePath) {
      return;
    }
    this.writeQueue = this.writeQueue
      .then(() => fs.appendFile(this.logFilePath!, `${content}\n`, "utf8"))
      .catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      });
    await this.writeQueue;
  }
}
