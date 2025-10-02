/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
export class SessionMarkdownLogger {
    cwd;
    enabled = false;
    logFilePath;
    loggingStartedAt;
    lastError;
    writeQueue = Promise.resolve();
    loggedHistoryIds = new Set();
    constructor(cwd = process.cwd()) {
        this.cwd = cwd;
    }
    getStatus() {
        return {
            enabled: this.enabled,
            logFilePath: this.logFilePath,
            loggingStartedAt: this.loggingStartedAt,
            lastError: this.lastError,
        };
    }
    isEnabled() {
        return this.enabled;
    }
    async enable(metadata, initialHistory) {
        if (this.enabled && this.logFilePath) {
            return this.getStatus();
        }
        const logDir = path.join(this.cwd, 'logs');
        await fs.mkdir(logDir, { recursive: true });
        const timestamp = new Date().toISOString();
        const safeTimestamp = timestamp.replace(/[:]/g, '-');
        const filePath = path.join(logDir, `session-log-${safeTimestamp}.md`);
        const header = this.buildHeader(metadata, timestamp);
        await fs.writeFile(filePath, header, 'utf8');
        this.enabled = true;
        this.logFilePath = filePath;
        this.loggingStartedAt = timestamp;
        this.lastError = undefined;
        this.loggedHistoryIds.clear();
        await this.logEvent('Logging enabled', timestamp, {
            message: 'Session logging activated. Subsequent events will appear below.',
            logFilePath: filePath,
        });
        await this.logHistorySnapshot(initialHistory, 'Initial conversation snapshot');
        return this.getStatus();
    }
    async disable(reason) {
        if (!this.enabled) {
            return this.getStatus();
        }
        const timestamp = new Date().toISOString();
        await this.logEvent('Logging disabled', timestamp, {
            message: reason ?? 'Session logging deactivated.',
        });
        this.enabled = false;
        this.loggingStartedAt = undefined;
        this.loggedHistoryIds.clear();
        return this.getStatus();
    }
    async logHistorySnapshot(history, label = 'Conversation snapshot') {
        if (!this.enabled)
            return;
        const timestamp = new Date().toISOString();
        const contentLines = [];
        contentLines.push(`### ${timestamp} — ${label}
`, `Total entries: ${history.length}
`);
        for (const [index, item] of history.entries()) {
            contentLines.push(this.formatHistoryItem(item, index + 1));
            this.loggedHistoryIds.add(item.id);
        }
        await this.enqueueWrite(contentLines.join('\n'));
    }
    async logHistoryItem(item) {
        if (!this.enabled)
            return;
        if (this.loggedHistoryIds.has(item.id))
            return;
        this.loggedHistoryIds.add(item.id);
        const content = this.formatHistoryItem(item);
        await this.enqueueWrite(content);
    }
    async logCommandInvocation(payload) {
        if (!this.enabled)
            return;
        const meta = {
            rawCommand: payload.rawCommand,
            canonicalPath: payload.canonicalPath,
            args: payload.args,
        };
        await this.logEvent(`Command invoked: ${payload.canonicalPath.join(' ') || payload.rawCommand}`, payload.timestamp, meta);
    }
    async logCommandResult(payload) {
        if (!this.enabled)
            return;
        const meta = {
            rawCommand: payload.rawCommand,
            canonicalPath: payload.canonicalPath,
            outcome: payload.outcome,
        };
        if (payload.durationMs !== undefined) {
            meta['durationMs'] = payload.durationMs;
        }
        if (payload.details) {
            meta['details'] = payload.details;
        }
        await this.logEvent(`Command completed: ${payload.canonicalPath.join(' ') || payload.rawCommand}`, payload.timestamp, meta);
    }
    async logAppError(payload) {
        if (!this.enabled)
            return;
        await this.logEvent('Application error', payload.timestamp, {
            message: payload.message,
        });
    }
    async logErrorReport(payload) {
        if (!this.enabled)
            return;
        const meta = {
            type: payload.type,
            baseMessage: payload.baseMessage,
            writeSucceeded: payload.writeSucceeded,
        };
        if (payload.reportPath) {
            meta['reportPath'] = payload.reportPath;
        }
        await this.logEvent('Error report generated', payload.timestamp, meta, {
            json: payload.report,
        });
    }
    syncHistory(previous, current) {
        if (!this.enabled)
            return;
        const previousIds = new Set(previous.map((item) => item.id));
        const currentIds = new Set(current.map((item) => item.id));
        const removed = previous.filter((item) => !currentIds.has(item.id));
        const added = current.filter((item) => !previousIds.has(item.id));
        if (removed.length > 0 && current.length === 0) {
            this.loggedHistoryIds.clear();
            void this.logEvent('History cleared', new Date().toISOString(), {
                removedCount: removed.length,
            });
            return;
        }
        if (removed.length > 0 && added.length > 0) {
            this.loggedHistoryIds.clear();
            void this.logEvent('History replaced', new Date().toISOString(), {
                removedCount: removed.length,
                newCount: current.length,
            });
            void this.logHistorySnapshot(current, 'Conversation snapshot after replacement');
            return;
        }
        if (removed.length > 0) {
            for (const item of removed) {
                this.loggedHistoryIds.delete(item.id);
            }
            void this.logEvent('History entries removed', new Date().toISOString(), {
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
    buildHeader(metadata, timestamp) {
        const lines = [];
        lines.push('# Session Log', '');
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
            lines.push(`- Debug mode: ${metadata.debugMode ? 'on' : 'off'}`);
        }
        if (metadata.additionalContext && Object.keys(metadata.additionalContext).length > 0) {
            lines.push('', '```json');
            lines.push(JSON.stringify(metadata.additionalContext, null, 2));
            lines.push('```');
        }
        lines.push('', '## Timeline', '');
        return lines.join('\n');
    }
    formatHistoryItem(item, position) {
        const timestamp = new Date(item.id).toISOString();
        const headerLabel = position
            ? `${timestamp} — Message #${position} (${item.type})`
            : `${timestamp} — ${item.type}`;
        const lines = [`### ${headerLabel}`, ''];
        if ('text' in item && item.text) {
            lines.push('**Text:**', '```text', item.text, '```', '');
        }
        if (item.type === 'tool_group' && item.tools) {
            lines.push('**Tools:**');
            for (const tool of item.tools) {
                lines.push(`- ${tool.name} (${tool.status})${tool.renderOutputAsMarkdown ? ' [markdown]' : ''}`);
                if (tool.resultDisplay !== undefined) {
                    lines.push('  ```json');
                    lines.push(JSON.stringify(tool.resultDisplay, null, 2));
                    lines.push('  ```');
                }
            }
            lines.push('');
        }
        lines.push('**Raw item:**', '```json', JSON.stringify(item, null, 2), '```', '');
        return lines.join('\n');
    }
    async logEvent(title, timestamp, metadata, extra) {
        if (!this.enabled)
            return;
        const lines = [`### ${timestamp} — ${title}`, ''];
        if (metadata) {
            lines.push('```json');
            lines.push(JSON.stringify(metadata, null, 2));
            lines.push('```', '');
        }
        if (extra?.json !== undefined) {
            lines.push('```json');
            lines.push(JSON.stringify(extra.json, null, 2));
            lines.push('```', '');
        }
        await this.enqueueWrite(lines.join('\n'));
    }
    async enqueueWrite(content) {
        if (!this.enabled || !this.logFilePath) {
            return;
        }
        this.writeQueue = this.writeQueue
            .then(() => fs.appendFile(this.logFilePath, `${content}\n`, 'utf8'))
            .catch((error) => {
            this.lastError = error instanceof Error ? error.message : String(error);
        });
        await this.writeQueue;
    }
}
//# sourceMappingURL=SessionMarkdownLogger.js.map