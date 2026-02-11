/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
export interface ResumeCheckpointOption {
    id: string;
    createdAt: Date;
    messageCount: number;
    sessionId: string;
    lastMessagePreview?: string;
}
interface ResumeDialogProps {
    checkpoints: ResumeCheckpointOption[];
    onSelect: (checkpointId: string) => void;
    onClose: () => void;
}
export declare const ResumeDialog: React.FC<ResumeDialogProps>;
export {};
