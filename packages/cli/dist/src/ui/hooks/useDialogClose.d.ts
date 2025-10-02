/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SettingScope } from '../../config/settings.js';
import type { AuthType } from '@qwen-code/qwen-code-core';
export interface DialogCloseOptions {
    isThemeDialogOpen: boolean;
    handleThemeSelect: (theme: string | undefined, scope: SettingScope) => void;
    isAuthDialogOpen: boolean;
    handleAuthSelect: (authType: AuthType | undefined, scope: SettingScope) => Promise<void>;
    selectedAuthType: AuthType | undefined;
    isEditorDialogOpen: boolean;
    exitEditorDialog: () => void;
    isSettingsDialogOpen: boolean;
    closeSettingsDialog: () => void;
    isFolderTrustDialogOpen: boolean;
    showPrivacyNotice: boolean;
    setShowPrivacyNotice: (show: boolean) => void;
    showWelcomeBackDialog: boolean;
    handleWelcomeBackClose: () => void;
    quitConfirmationRequest: {
        onConfirm: (shouldQuit: boolean, action?: string) => void;
    } | null;
}
/**
 * Hook that handles closing dialogs when Ctrl+C is pressed.
 * This mimics the ESC key behavior by calling the same handlers that ESC uses.
 * Returns true if a dialog was closed, false if no dialogs were open.
 */
export declare function useDialogClose(options: DialogCloseOptions): {
    closeAnyOpenDialog: () => boolean;
};
