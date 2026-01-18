/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
export interface InputRequestDialogProps {
    prompt: React.ReactNode;
    placeholder?: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
    inputWidth?: number;
}
export declare function InputRequestDialog({ prompt, placeholder, onSubmit, onCancel, inputWidth, }: InputRequestDialogProps): import("react/jsx-runtime").JSX.Element;
