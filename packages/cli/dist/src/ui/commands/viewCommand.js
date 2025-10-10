/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { join } from "node:path";
import fs from "fs/promises";
import { CommandKind } from "./types.js";
import { MessageType } from "../types.js";
import { glob } from "glob";
export const viewCommand = {
    name: "view",
    description: "View a text file inline in the chat (markdown formatted)",
    kind: CommandKind.BUILT_IN,
    completion: async (_ctx, partialArg) => {
        const pattern = "**/*";
        const files = await glob(pattern, {
            cwd: process.cwd(),
            nodir: true,
            dot: true,
            ignore: "**/node_modules/**",
        });
        const filter = String(partialArg ?? "").toLowerCase();
        const results = files
            .filter((p) => p.toLowerCase().includes(filter))
            .slice(0, 20);
        return results;
    },
    action: async (context, args) => {
        if (!args?.trim()) {
            context.ui.addItem({
                type: MessageType.ERROR,
                text: "Usage: /view <filename.md> (use @ for file completion)",
            }, Date.now());
            return;
        }
        const filename = args.trim();
        const absolutePath = join(process.cwd(), filename);
        try {
            const content = await fs.readFile(absolutePath, "utf8");
            let tokenCount = Math.ceil(content.length / 4);
            const maybeGen = context.services.config?.getContentGenerator?.();
            const cgConfig = context.services.config?.getContentGeneratorConfig?.();
            const model = cgConfig?.model ?? "gpt-3.5-turbo";
            if (maybeGen && typeof maybeGen.countTokens === "function") {
                try {
                    const request = {
                        model,
                        contents: [
                            {
                                role: "user",
                                parts: [{ text: content }],
                            },
                        ],
                    };
                    const response = await maybeGen.countTokens(request);
                    tokenCount = response?.totalTokens ?? tokenCount;
                }
                catch (err) {
                    // Fall back to heuristic token count if counting fails
                    tokenCount = Math.ceil(content.length / 4);
                }
            }
            const viewItem = {
                type: "view",
                text: content,
                filePath: filename,
                tokenCount,
                totalLines: content.split("\n").length,
            };
            context.ui.addItem(viewItem, Date.now());
        }
        catch (error) {
            if (error.code === "ENOENT") {
                context.ui.addItem({
                    type: MessageType.ERROR,
                    text: `File not found: ${filename}`,
                }, Date.now());
            }
            else {
                context.ui.addItem({
                    type: MessageType.ERROR,
                    text: `Error reading file: ${error.message}`,
                }, Date.now());
            }
        }
    },
};
//# sourceMappingURL=viewCommand.js.map