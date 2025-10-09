/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type DetectedIde } from "@qwen-code/qwen-code-core";
export type IdeIntegrationNudgeResult = {
    userSelection: "yes" | "no" | "dismiss";
    isExtensionPreInstalled: boolean;
};
interface IdeIntegrationNudgeProps {
    ide: DetectedIde;
    onComplete: (result: IdeIntegrationNudgeResult) => void;
}
export declare function IdeIntegrationNudge({ ide, onComplete, }: IdeIntegrationNudgeProps): import("react/jsx-runtime").JSX.Element;
export {};
