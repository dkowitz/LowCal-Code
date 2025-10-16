import { CommandKind } from "./types.js";
import { MessageType } from "../types.js";
// Import core utilities to construct the prompt.
import { toolConfig, getCoreSystemPrompt } from "@qwen-code/qwen-code-core";
/**
 * Helper to estimate token count if the genai client is unavailable.
 */
function estimateTokens(text) {
    // Roughly 1 token per 4 characters as used elsewhere in the project.
    return Math.ceil(text.length / 4);
}
export const promptInfoCommand = {
    name: "promptinfo",
    description: "Show the current full system prompt and its token count (core, tools, memory).",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        // Build the core system prompt using the same logic as the runtime.
        const userMemory = undefined; // Memory is injected elsewhere; not available here.
        const fullPrompt = getCoreSystemPrompt(userMemory, undefined, undefined);
        // Split the prompt into core description, tool usage section, and memory suffix.
        const coreSeparator = "## Tool Usage";
        const sections = fullPrompt.split(coreSeparator);
        const corePart = sections[0] ?? ""; // before tools list
        const afterCore = sections[1] ?? "";
        // The tool usage section ends at the next top‑level header (e.g., ## Operational Guidelines).
        const toolEndIndex = afterCore.search(/##\s/);
        const toolPart = toolEndIndex >= 0 ? afterCore.slice(0, toolEndIndex) : afterCore;
        const memorySeparator = "\n\n---\n\n";
        const [toolRest, memoryPart] = toolPart.split(memorySeparator);
        // In case the separator is not present, treat entire toolPart as tool content.
        const finalToolPart = toolRest ?? toolPart;
        // Helper to count tokens using genai client or fallback.
        const countTokens = async (text) => {
            try {
                const maybeGen = global.geminiClient ?? null;
                if (maybeGen && typeof maybeGen.countTokens === "function") {
                    const request = { content: text };
                    const response = await maybeGen.countTokens(request);
                    return response?.totalTokens ?? estimateTokens(text);
                }
            }
            catch (_) { }
            return estimateTokens(text);
        };
        const coreTokenCount = await countTokens(corePart);
        const toolTokenCount = await countTokens(finalToolPart);
        const memoryTokenCount = await countTokens(memoryPart || "");
        const totalTokenCount = coreTokenCount + toolTokenCount + memoryTokenCount;
        const infoText = `Current prompt mode: ${toolConfig.promptMode}\n` +
            `Active tool collection: ${toolConfig.activeCollection}\n` +
            `Core tokens: ${coreTokenCount}, Tool tokens: ${toolTokenCount}, Memory tokens: ${memoryTokenCount}, Total: ${totalTokenCount}\n\n--- Prompt Start ---\n${fullPrompt}\n--- Prompt End ---`;
        const infoItem = {
            type: MessageType.INFO,
            text: infoText,
        };
        context.ui.addItem(infoItem, Date.now());
    },
};
//# sourceMappingURL=promptInfoCommand.js.map