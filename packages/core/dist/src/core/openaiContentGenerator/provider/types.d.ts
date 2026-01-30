import type OpenAI from "openai";
export interface ChatCompletionContentPartTextWithCache extends OpenAI.Chat.ChatCompletionContentPartText {
    cache_control?: {
        type: "ephemeral";
    };
}
export type ChatCompletionContentPartWithCache = ChatCompletionContentPartTextWithCache | OpenAI.Chat.ChatCompletionContentPartImage | OpenAI.Chat.ChatCompletionContentPartRefusal;
export interface OpenAICompatibleProvider {
    buildHeaders(): Record<string, string | undefined>;
    buildClient(): OpenAI;
    buildRequest(request: OpenAI.Chat.ChatCompletionCreateParams, userPromptId: string): OpenAI.Chat.ChatCompletionCreateParams;
    /**
     * Override to force the Responses API for models that are not supported by chat/completions.
     */
    shouldUseResponses?(model: string): boolean;
}
export type DashScopeRequestMetadata = {
    metadata: {
        sessionId?: string;
        promptId: string;
    };
};
