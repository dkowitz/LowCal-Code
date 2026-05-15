/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
interface LlamaCppSetupPromptProps {
    prepopulatedModelsDir: string;
    prepopulatedPort: string;
    onSubmit: (modelsDir: string, port: string) => void;
    onCancel: () => void;
}
export declare function LlamaCppSetupPrompt({ prepopulatedModelsDir, prepopulatedPort, onSubmit, onCancel, }: LlamaCppSetupPromptProps): React.JSX.Element;
export default LlamaCppSetupPrompt;
