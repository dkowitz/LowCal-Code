import { DefaultOpenAICompatibleProvider } from './default.js';
export class LMStudioOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
    constructor(contentGeneratorConfig, cliConfig) {
        super(contentGeneratorConfig, cliConfig);
    }
    static isLMStudioProvider(contentGeneratorConfig) {
        const baseURL = contentGeneratorConfig.baseUrl || '';
        return baseURL.includes('127.0.0.1:1234') || baseURL.includes('localhost:1234');
    }
    buildHeaders() {
        // Get base headers from parent class
        const baseHeaders = super.buildHeaders();
        // LM Studio might need specific headers or none at all
        // Remove any headers that might cause issues with LM Studio
        const { 'User-Agent': _userAgent, ...filteredHeaders } = baseHeaders;
        return filteredHeaders;
    }
    /**
     * Attempt to unload the current model in LM Studio.
     *
     * Note: LM Studio does not currently provide a dedicated REST API endpoint for unloading models.
     * Model unloading is typically managed through:
     * 1. SDK methods (model.unload())
     * 2. CLI commands (lms unload)
     * 3. Automatic unloading through Idle TTL and Auto-Evict features
     *
     * This method sends a request that may trigger model unloading in some versions of LM Studio,
     * but it's not guaranteed to work. The most reliable approach is to rely on LM Studio's
     * automatic model management features.
     */
    async unloadModel() {
        try {
            // Create a temporary client for the unload request
            const tempClient = this.buildClient();
            // Send a request that might trigger model unloading
            // This is not guaranteed to work and is provided as a best-effort approach
            await tempClient.chat.completions.create({
                model: this.contentGeneratorConfig.model,
                messages: [{ role: 'user', content: '' }],
                max_tokens: 1,
                temperature: 0,
            });
        }
        catch (error) {
            // We're not concerned with the result of this request
            // The purpose is to potentially trigger LM Studio's model management
            console.debug('LM Studio model unload request sent (result not guaranteed):', error);
        }
    }
}
//# sourceMappingURL=lmstudio.js.map