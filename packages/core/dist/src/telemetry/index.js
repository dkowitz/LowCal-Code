/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export var TelemetryTarget;
(function (TelemetryTarget) {
    TelemetryTarget["GCP"] = "gcp";
    TelemetryTarget["LOCAL"] = "local";
    TelemetryTarget["QWEN"] = "qwen";
})(TelemetryTarget || (TelemetryTarget = {}));
const DEFAULT_TELEMETRY_TARGET = TelemetryTarget.LOCAL;
const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4317';
export { SpanStatusCode, ValueType } from '@opentelemetry/api';
export { SemanticAttributes } from '@opentelemetry/semantic-conventions';
export { logApiError, logApiRequest, logApiResponse, logChatCompression, logCliConfiguration, logConversationFinishedEvent, logFlashFallback, logKittySequenceOverflow, logSlashCommand, logToolCall, logUserPrompt, } from './loggers.js';
export { initializeTelemetry, isTelemetrySdkInitialized, shutdownTelemetry, } from './sdk.js';
export { ApiErrorEvent, ApiRequestEvent, ApiResponseEvent, ConversationFinishedEvent, EndSessionEvent, FlashFallbackEvent, KittySequenceOverflowEvent, makeChatCompressionEvent, makeSlashCommandEvent, SlashCommandStatus, StartSessionEvent, ToolCallEvent, UserPromptEvent, } from './types.js';
export * from './uiTelemetry.js';
export { DEFAULT_OTLP_ENDPOINT, DEFAULT_TELEMETRY_TARGET };
//# sourceMappingURL=index.js.map