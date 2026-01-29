/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
interface GeminiKeyPromptProps {
    onSubmit: (apiKey: string) => void;
    onCancel: () => void;
    prepopulatedApiKey?: string;
}
export declare function GeminiKeyPrompt({ onSubmit, onCancel, prepopulatedApiKey, }: GeminiKeyPromptProps): React.JSX.Element;
export {};
