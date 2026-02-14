/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
import { type TaskTemplateLevel } from "@qwen-code/qwen-code-core";
import type { LoadedSettings } from "../../config/settings.js";
type DeployMode = "launch" | "schedule";
export interface TaskTemplateDeployRequest {
    templateId: string;
    templateLevel: TaskTemplateLevel;
    deployMode: DeployMode;
    schedule?: string;
    jobId?: string;
}
interface TaskTemplateEditorDialogProps {
    projectRoot: string;
    settings: LoadedSettings;
    currentModel: string;
    onExit: () => void;
    onDeploy: (request: TaskTemplateDeployRequest) => Promise<void>;
}
export declare function TaskTemplateEditorDialog({ projectRoot, settings, currentModel, onExit, onDeploy, }: TaskTemplateEditorDialogProps): React.JSX.Element;
export {};
