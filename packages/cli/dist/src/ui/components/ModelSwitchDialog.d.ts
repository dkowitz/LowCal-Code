/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
export declare enum VisionSwitchOutcome {
    SwitchOnce = "once",
    SwitchSessionToVL = "session",
    ContinueWithCurrentModel = "persist"
}
export interface ModelSwitchDialogProps {
    onSelect: (outcome: VisionSwitchOutcome) => void;
}
export declare const ModelSwitchDialog: React.FC<ModelSwitchDialogProps>;
