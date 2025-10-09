import React from "react";
import type { AvailableModel } from "../models/availableModels.js";
export interface ModelMappingDialogProps {
    unmatched: AvailableModel[];
    restModels: AvailableModel[];
    onApply: (mappings: Record<string, string>) => void;
    onCancel: () => void;
}
export declare const ModelMappingDialog: React.FC<ModelMappingDialogProps>;
