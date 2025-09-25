/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
interface ProviderKeyPromptProps {
    prepopulatedBaseUrl: string;
    prepopulatedApiKey: string;
    onSubmit: (apiKey: string, baseUrl: string) => void;
    onCancel: () => void;
}
export declare function ProviderKeyPrompt({ prepopulatedBaseUrl, prepopulatedApiKey, onSubmit, onCancel, }: ProviderKeyPromptProps): React.JSX.Element;
export default ProviderKeyPrompt;
