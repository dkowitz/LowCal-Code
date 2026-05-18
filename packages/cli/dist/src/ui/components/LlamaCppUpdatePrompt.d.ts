/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */
export type UpdateAction = "update" | "later" | "release" | "dismiss";
interface LlamaCppUpdatePromptProps {
    latestTag: string;
    releaseUrl: string;
    onAction: (action: UpdateAction) => void;
}
/**
 * Interactive prompt shown when a llama.cpp update is available.
 * Lets the user choose: Update Now, Remind Later, or Don't Ask Again.
 */
export declare function LlamaCppUpdatePrompt({ latestTag, releaseUrl, onAction, }: LlamaCppUpdatePromptProps): React.JSX.Element;
export default LlamaCppUpdatePrompt;
