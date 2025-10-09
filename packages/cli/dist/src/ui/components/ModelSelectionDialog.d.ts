/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
import type { AvailableModel } from "../models/availableModels.js";
export interface ModelSelectionDialogProps {
    availableModels: AvailableModel[];
    currentModel: string;
    onSelect: (modelId: string) => void;
    onCancel: () => void;
}
export declare const ModelSelectionDialog: React.FC<ModelSelectionDialogProps>;
