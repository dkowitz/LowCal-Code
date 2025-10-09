import OpenAI from "openai";
import { DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES } from "../constants.js";
/**
 * Default provider for standard OpenAI-compatible APIs
 */
export class DefaultOpenAICompatibleProvider {
    contentGeneratorConfig;
    cliConfig;
    constructor(contentGeneratorConfig, cliConfig) {
        this.cliConfig = cliConfig;
        this.contentGeneratorConfig = contentGeneratorConfig;
    }
    buildHeaders() {
        const version = this.cliConfig.getCliVersion() || "unknown";
        const userAgent = `QwenCode/${version} (${process.platform}; ${process.arch})`;
        return {
            "User-Agent": userAgent,
        };
    }
    buildClient() {
        const { apiKey, baseUrl, timeout = DEFAULT_TIMEOUT, maxRetries = DEFAULT_MAX_RETRIES, } = this.contentGeneratorConfig;
        const defaultHeaders = this.buildHeaders();
        return new OpenAI({
            apiKey,
            baseURL: baseUrl,
            timeout,
            maxRetries,
            defaultHeaders,
        });
    }
    buildRequest(request, _userPromptId) {
        // Default provider doesn't need special enhancements, just pass through all parameters
        return {
            ...request, // Preserve all original parameters including sampling params
        };
    }
}
//# sourceMappingURL=default.js.map