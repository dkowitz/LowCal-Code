/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
interface MailboxDialogProps {
    baseDir: string;
    sessionId: string;
    onExit: () => void;
    onUsePayload: (payload: string) => Promise<void>;
}
export declare function MailboxDialog({ baseDir, sessionId, onExit, onUsePayload, }: MailboxDialogProps): React.JSX.Element;
export {};
