/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
import fs from 'node:fs';
import path from 'node:path';
export const exportCommand = {
    name: 'export',
    description: 'save the current conversation to a markdown file in the current working directory',
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const history = context.ui.getHistory();
        // Determine filename
        let fileName = 'conversation.md';
        if (args && args.trim()) {
            fileName = args.trim();
            // Sanitize filename
            fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            if (!fileName.endsWith('.md')) {
                fileName += '.md';
            }
        }
        const fullPath = path.join(process.cwd(), fileName);
        // Format markdown content
        let markdownContent = `# Qwen Code Conversation Export\n\n`;
        const now = new Date();
        markdownContent += `**Exported:** ${now.toLocaleString()}\n`;
        markdownContent += `**Session ID:** ${context.services.config?.getSessionId() || 'unknown'}\n\n`;
        // Process history items
        for (const item of history) {
            switch (item.type) {
                case 'user':
                    if (item.text) {
                        markdownContent += `## User Message\n\n${item.text.trim()}\n\n---\n\n`;
                    }
                    break;
                case 'gemini':
                case 'gemini_content':
                    if (item.text) {
                        markdownContent += `## Assistant Response\n\n${item.text.trim()}\n\n---\n\n`;
                    }
                    break;
                case 'info':
                    if (item.text) {
                        markdownContent += `### Info\n\n> ${item.text.trim()}\n\n`;
                    }
                    break;
                case 'error':
                    if (item.text) {
                        markdownContent += `### Error\n\n**Error:** ${item.text.trim()}\n\n`;
                    }
                    break;
                case 'tool_group':
                    markdownContent += `### Tool Execution\n\n`;
                    if (item.tools) {
                        for (const tool of item.tools) {
                            markdownContent += `**Tool:** ${tool.name}\n`;
                            if (tool.resultDisplay) {
                                markdownContent += `**Result:** ${typeof tool.resultDisplay === 'string' ? tool.resultDisplay : JSON.stringify(tool.resultDisplay)}\n`;
                            }
                            markdownContent += `\n`;
                        }
                    }
                    markdownContent += `---\n\n`;
                    break;
                // Add more types as needed
                default:
                    if (item.text) {
                        markdownContent += `### ${item.type.toUpperCase()}\n\n${item.text.trim()}\n\n---\n\n`;
                    }
                    break;
            }
        }
        try {
            fs.writeFileSync(fullPath, markdownContent, 'utf8');
            context.ui.addItem({
                type: 'info',
                text: `✅ Conversation exported successfully to \`${fileName}\``,
            }, Date.now());
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            context.ui.addItem({
                type: 'error',
                text: `❌ Failed to export conversation: ${errorMsg}`,
            }, Date.now());
        }
    },
};
//# sourceMappingURL=exportCommand.js.map