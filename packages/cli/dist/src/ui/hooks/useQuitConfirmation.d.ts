/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { QuitChoice } from "../components/QuitConfirmationDialog.js";
export declare const useQuitConfirmation: () => {
    isQuitConfirmationOpen: boolean;
    showQuitConfirmation: () => void;
    handleQuitConfirmationSelect: (choice: QuitChoice) => {
        shouldQuit: boolean;
        action: string;
    };
};
