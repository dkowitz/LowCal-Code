/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LoadedSettings } from '../../config/settings.js';
export interface DeviceAuthorizationInfo {
    verification_uri: string;
    verification_uri_complete: string;
    user_code: string;
    expires_in: number;
}
export declare const useQwenAuth: (settings: LoadedSettings, isAuthenticating: boolean) => {
    isQwenAuth: boolean;
    cancelQwenAuth: () => void;
    isQwenAuthenticating: boolean;
    deviceAuth: DeviceAuthorizationInfo | null;
    authStatus: "idle" | "polling" | "success" | "error" | "timeout" | "rate_limit";
    authMessage: string | null;
};
