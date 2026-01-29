/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
interface OpenAIKeyPromptProps {
    onSubmit: (apiKey: string, baseUrl: string) => void;
    onCancel: () => void;
    prepopulatedApiKey?: string;
    prepopulatedBaseUrl?: string;
}
export declare function OpenAIKeyPrompt({ onSubmit, onCancel, prepopulatedApiKey, prepopulatedBaseUrl, }: OpenAIKeyPromptProps): React.JSX.Element;
export {};
