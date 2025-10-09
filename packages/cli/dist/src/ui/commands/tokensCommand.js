/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CommandKind } from "./types.js";
import { MessageType } from "../types.js";
import { glob } from "glob";
export const tokensCommand = {
    name: "tokens",
    description: "count tokens in a file (use @ for file completion)",
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
        const { services, ui } = context;
        const { config } = services;
        if (!args?.trim()) {
            ui.addItem({
                type: MessageType.ERROR,
                text: "Please provide a filename. Use @ for file completion.",
            }, Date.now());
            return;
        }
        const filePath = args.trim();
        try {
            // Read the file content
            const absolutePath = join(process.cwd(), filePath);
            const fileContent = readFileSync(absolutePath, "utf-8");
            // Try to obtain a content generator if available via config, else fallback
            const maybeGen = config?.getContentGenerator?.();
            const cgConfig = config?.getContentGeneratorConfig?.();
            const model = cgConfig?.model ?? "gpt-3.5-turbo";
            let tokenCountValue = 0;
            if (maybeGen && typeof maybeGen.countTokens === "function") {
                const countTokensRequest = {
                    model,
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: fileContent }],
                        },
                    ],
                };
                const tokenCount = await maybeGen.countTokens(countTokensRequest);
                tokenCountValue = tokenCount?.totalTokens ?? 0;
            }
            else {
                // Fallback to character-based estimation if content generator is not available
                tokenCountValue = Math.ceil(fileContent.length / 4);
            }
            ui.addItem({
                type: MessageType.INFO,
                text: `File: ${filePath}\nTokens: ${tokenCountValue}`,
            }, Date.now());
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            ui.addItem({
                type: MessageType.ERROR,
                text: `Error reading file '${filePath}': ${errorMessage}`,
            }, Date.now());
        }
    },
};
//# sourceMappingURL=tokensCommand.js.map