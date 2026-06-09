/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
import { type LlamaCppBackend } from "@qwen-code/qwen-code-core";
interface LlamaCppSetupPromptProps {
    prepopulatedModelsDir: string;
    prepopulatedPort: string;
    prepopulatedBackend?: string;
    prepopulatedBinaryPath?: string;
    onSubmit: (modelsDir: string, port: string, backend: LlamaCppBackend, binaryPath: string) => void;
    onCancel: () => void;
}
export declare function LlamaCppSetupPrompt({ prepopulatedModelsDir, prepopulatedPort, prepopulatedBackend, prepopulatedBinaryPath, onSubmit, onCancel, }: LlamaCppSetupPromptProps): React.JSX.Element;
export default LlamaCppSetupPrompt;
