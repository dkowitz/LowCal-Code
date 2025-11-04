import { DefaultOpenAICompatibleProvider } from "./default.js";
import { setModelContextLimit } from "../../tokenLimits.js";
function isMiniMaxModel(modelId) {
    if (!modelId)
        return false;
    const normalized = modelId.toLowerCase();
    return normalized.includes("minimax");
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
     * After fetching the list of models from OpenRouter, call this helper to
     * apply dynamic context limits reported by the provider. This ensures the
     * UI and TokenBudgetManager use the accurate context window sizes.
     */
    static applyProviderContextLimits(models) {
        if (!Array.isArray(models))
            return;
        for (const m of models) {
            try {
                const id = m.id || m.name;
                const ctx = typeof m.context_length === "number"
                    ? m.context_length
                    : typeof m.top_provider?.context_length === "number"
                        ? m.top_provider.context_length
                        : undefined;
                if (id && typeof ctx === "number" && Number.isFinite(ctx) && ctx > 0) {
                    // Persist dynamic limit in core tokenLimits map
                    setModelContextLimit(id, ctx);
                }
            }
            catch (e) {
                // ignore per-model failures
                continue;
            }
        }
    }
}
//# sourceMappingURL=openrouter.js.map