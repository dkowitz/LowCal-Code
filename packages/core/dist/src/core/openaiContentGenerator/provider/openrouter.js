import { DefaultOpenAICompatibleProvider } from "./default.js";
import { setModelContextLimit } from "../../tokenLimits.js";
function isMiniMaxModel(modelId) {
    if (!modelId)
        return false;
    const normalized = modelId.toLowerCase();
    return normalized.includes("minimax");
}
function isAnthropicModel(modelId) {
    if (!modelId)
        return false;
    const normalized = modelId.toLowerCase();
    return (normalized.includes("anthropic") ||
        normalized.includes("claude") ||
        normalized.includes("opus") ||
        normalized.includes("sonnet") ||
        normalized.includes("haiku"));
}
export class OpenRouterOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
    constructor(contentGeneratorConfig, cliConfig) {
        super(contentGeneratorConfig, cliConfig);
    }
    static isOpenRouterProvider(contentGeneratorConfig) {
        const baseURL = contentGeneratorConfig.baseUrl || "";
        return baseURL.includes("openrouter.ai");
    }
    buildHeaders() {
        // Get base headers from parent class
        const baseHeaders = super.buildHeaders();
        const headers = {
            ...baseHeaders,
            "X-Title": "Qwen Code",
        };
        const referer = process.env["OPENROUTER_HTTP_REFERER"];
        if (referer && referer.trim().length > 0) {
            headers["HTTP-Referer"] = referer.trim();
        }
        else {
            delete headers["HTTP-Referer"];
        }
        return headers;
    }
    buildRequest(request, userPromptId) {
        const baseRequest = super.buildRequest(request, userPromptId);
        const modelId = this.contentGeneratorConfig.model ?? baseRequest.model ?? request.model;
        // Add cache_control for prefix caching optimization
        // This dramatically reduces costs and latency for multi-turn conversations
        if (!this.shouldDisableCacheControl()) {
            const requestWithCache = this.addCacheControl(baseRequest, modelId);
            // MiniMax-specific configuration
            if (isMiniMaxModel(modelId)) {
                const requestWithExtra = requestWithCache;
                const existingExtraBody = requestWithExtra.extra_body ?? {};
                if (existingExtraBody["reasoning_split"] === undefined) {
                    requestWithExtra.extra_body = {
                        ...existingExtraBody,
                        reasoning_split: true,
                    };
                }
                else {
                    requestWithExtra.extra_body = existingExtraBody;
                }
                return requestWithExtra;
            }
            return requestWithCache;
        }
        // MiniMax-specific configuration (when cache control is disabled)
        if (!isMiniMaxModel(modelId)) {
            return baseRequest;
        }
        const requestWithExtra = baseRequest;
        const existingExtraBody = requestWithExtra.extra_body ?? {};
        if (existingExtraBody["reasoning_split"] === undefined) {
            requestWithExtra.extra_body = {
                ...existingExtraBody,
                reasoning_split: true,
            };
        }
        else {
            requestWithExtra.extra_body = existingExtraBody;
        }
        return requestWithExtra;
    }
    /**
     * Add cache_control markers to optimize prefix caching.
     *
     * OpenRouter supports prompt caching across multiple upstream providers:
     * - Automatic: OpenAI, Grok, Moonshot, Groq, DeepSeek, Gemini 2.5
     * - Explicit: Anthropic Claude, older Gemini models
     *
     * For Anthropic models, we add top-level cache_control for automatic multi-turn caching.
     * For all models, we add explicit cache_control breakpoints to system and last messages.
     *
     * Cost savings: Cache reads are 0.1x-0.5x cost depending on provider.
     */
    addCacheControl(request, modelId) {
        const updatedRequest = { ...request };
        // For Anthropic models, add top-level cache_control for automatic multi-turn caching
        // This enables OpenRouter to route directly to Anthropic with cache support
        // See: https://openrouter.ai/docs/features/prompt-caching
        if (isAnthropicModel(modelId)) {
            updatedRequest.cache_control = {
                type: "ephemeral",
            };
        }
        // Add explicit cache_control breakpoints to messages
        // This works for all providers (automatic providers will ignore it, explicit providers need it)
        updatedRequest.messages = this.addCacheControlMarkers(request.messages);
        return updatedRequest;
    }
    /**
     * Add cache_control markers to system and last user messages.
     *
     * Strategy:
     * - System message: ephemeral cache (stays cached during session)
     * - Last user/assistant message: ephemeral cache (most recent turn)
     *
     * This enables prefix caching for conversation history, dramatically reducing
     * token costs and latency for multi-turn conversations.
     */
    addCacheControlMarkers(messages) {
        if (messages.length === 0)
            return messages;
        const updatedMessages = [...messages];
        // Mark system message as cacheable
        const systemIndex = updatedMessages.findIndex((m) => m.role === "system");
        if (systemIndex !== -1) {
            updatedMessages[systemIndex] = this.addCacheToMessage(updatedMessages[systemIndex]);
        }
        // Mark the last user/assistant message as cacheable
        // This helps cache the conversation history prefix
        if (updatedMessages.length > 1) {
            const lastIndex = updatedMessages.length - 1;
            updatedMessages[lastIndex] = this.addCacheToMessage(updatedMessages[lastIndex]);
        }
        return updatedMessages;
    }
    /**
     * Add cache_control marker to a message's content.
     */
    addCacheToMessage(message) {
        if (!("content" in message) || !message.content) {
            return message;
        }
        const content = message.content;
        // Handle string content
        if (typeof content === "string") {
            return {
                ...message,
                content: [
                    {
                        type: "text",
                        text: content,
                        cache_control: { type: "ephemeral" },
                    },
                ],
            };
        }
        // Handle array content
        if (Array.isArray(content)) {
            const updatedContent = [
                ...content,
            ];
            // Add cache_control to the last text part
            for (let i = updatedContent.length - 1; i >= 0; i--) {
                const part = updatedContent[i];
                if (part &&
                    typeof part === "object" &&
                    "type" in part &&
                    part.type === "text") {
                    part.cache_control = {
                        type: "ephemeral",
                    };
                    break;
                }
            }
            return {
                ...message,
                content: updatedContent,
            };
        }
        return message;
    }
    /**
     * Check if cache control should be disabled via config.
     */
    shouldDisableCacheControl() {
        return (typeof this.cliConfig.getContentGeneratorConfig === "function" &&
            this.cliConfig.getContentGeneratorConfig()?.disableCacheControl === true);
    }
    /**
     * After fetching the list of models from OpenRouter, call this helper to
     * apply dynamic context limits reported by the provider. This ensures the
     * UI and TokenBudgetManager use the accurate context window sizes.
     */
    static applyProviderContextLimits(models) {
        if (!Array.isArray(models))
            return;
        for (const model of models) {
            try {
                const m = typeof model === "object" && model !== null
                    ? model
                    : null;
                if (!m) {
                    continue;
                }
                const id = typeof m["id"] === "string"
                    ? m["id"]
                    : typeof m["name"] === "string"
                        ? m["name"]
                        : undefined;
                const topProvider = typeof m["top_provider"] === "object" && m["top_provider"] !== null
                    ? m["top_provider"]
                    : null;
                const ctx = typeof m["context_length"] === "number"
                    ? m["context_length"]
                    : typeof topProvider?.["context_length"] === "number"
                        ? topProvider["context_length"]
                        : undefined;
                if (id && typeof ctx === "number" && Number.isFinite(ctx) && ctx > 0) {
                    // Persist dynamic limit in core tokenLimits map
                    setModelContextLimit(id, ctx);
                }
            }
            catch {
                // ignore per-model failures
                continue;
            }
        }
    }
}
//# sourceMappingURL=openrouter.js.map