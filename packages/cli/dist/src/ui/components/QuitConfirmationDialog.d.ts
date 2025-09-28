/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
export declare enum QuitChoice {
    CANCEL = "cancel",
    QUIT = "quit",
    SAVE_AND_QUIT = "save_and_quit",
    SUMMARY_AND_QUIT = "summary_and_quit"
}
interface QuitConfirmationDialogProps {
    onSelect: (choice: QuitChoice) => void;
}
export declare const QuitConfirmationDialog: React.FC<QuitConfirmationDialogProps>;
export {};
