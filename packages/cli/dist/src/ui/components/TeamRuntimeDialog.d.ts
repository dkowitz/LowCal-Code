/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
interface TeamRuntimeDialogProps {
    baseDir: string;
    onExit: () => void;
    onSubmitCommand: (command: string) => Promise<{
        messageType: string;
        content: string;
    } | undefined>;
}
export declare function TeamRuntimeDialog({ baseDir, onExit, onSubmitCommand, }: TeamRuntimeDialogProps): React.JSX.Element;
export {};
