/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
interface TeamManagementDialogProps {
    baseDir: string;
    projectRoot: string;
    onExit: () => void;
    onSubmitCommand: (command: string) => Promise<void>;
}
export declare function TeamManagementDialog({ baseDir, projectRoot, onExit, onSubmitCommand, }: TeamManagementDialogProps): React.JSX.Element;
export {};
