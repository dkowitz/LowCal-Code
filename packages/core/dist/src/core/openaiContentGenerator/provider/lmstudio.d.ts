import type { Config } from "../../../config/config.js";
import type { ContentGeneratorConfig } from "../../contentGenerator.js";
import { DefaultOpenAICompatibleProvider } from "./default.js";
export declare class LMStudioOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
    constructor(contentGeneratorConfig: ContentGeneratorConfig, cliConfig: Config);
    static isLMStudioProvider(contentGeneratorConfig: ContentGeneratorConfig): boolean;
    buildHeaders(): Record<string, string | undefined>;
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
    unloadModel(): Promise<void>;
}
