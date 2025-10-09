/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
import { AuthType } from "@qwen-code/qwen-code-core";
import { type LoadedSettings, SettingScope } from "../../config/settings.js";
interface AuthDialogProps {
    onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
    settings: LoadedSettings;
    initialErrorMessage?: string | null;
}
export declare function AuthDialog({ onSelect, settings, initialErrorMessage, }: AuthDialogProps): React.JSX.Element;
export {};
