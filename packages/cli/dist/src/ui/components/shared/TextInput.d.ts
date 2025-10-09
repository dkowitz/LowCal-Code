/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export interface TextInputProps {
    value: string;
    onChange: (text: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    height?: number;
    isActive?: boolean;
    validationErrors?: string[];
    inputWidth?: number;
}
export declare function TextInput({ value, onChange, onSubmit, placeholder, height, isActive, validationErrors, inputWidth, }: TextInputProps): import("react/jsx-runtime").JSX.Element | null;
