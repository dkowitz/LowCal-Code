/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
interface OpenAIKeyPromptProps {
    onSubmit: (apiKey: string, baseUrl: string, model: string) => void;
    onCancel: () => void;
}
export declare function OpenAIKeyPrompt({ onSubmit, onCancel, }: OpenAIKeyPromptProps): React.JSX.Element;
export {};
