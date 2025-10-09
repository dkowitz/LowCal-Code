/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback } from "react";
import { useStdin } from "ink";
import { spawnSync } from "child_process";
import { useSettings } from "../contexts/SettingsContext.js";
/**
 * Determines the editor command to use based on user preferences and platform.
 */
function getEditorCommand(preferredEditor) {
    if (preferredEditor) {
        return preferredEditor;
    }
    // Platform-specific defaults with UI preference for macOS
    switch (process.platform) {
        case "darwin":
            return "open -t"; // TextEdit in plain text mode
        case "win32":
            return "notepad";
        default:
            return process.env["VISUAL"] || process.env["EDITOR"] || "vi";
    }
}
/**
 * React hook that provides an editor launcher function.
 * Uses settings context and stdin management internally.
 */
export function useLaunchEditor() {
    const settings = useSettings();
    const { stdin, setRawMode } = useStdin();
    const launchEditor = useCallback(async (filePath) => {
        const preferredEditor = settings.merged.general?.preferredEditor;
        const editor = getEditorCommand(preferredEditor);
        // Handle different editor command formats
        let editorCommand;
        let editorArgs;
        if (editor === "open -t") {
            // macOS TextEdit in plain text mode
            editorCommand = "open";
            editorArgs = ["-t", filePath];
        }
        else {
            // Standard editor command
            editorCommand = editor;
            editorArgs = [filePath];
        }
        // Temporarily disable raw mode for editor
        const wasRaw = stdin?.isRaw ?? false;
        try {
            setRawMode?.(false);
            const { status, error } = spawnSync(editorCommand, editorArgs, {
                stdio: "inherit",
            });
            if (error)
                throw error;
            if (typeof status === "number" && status !== 0) {
                throw new Error(`Editor exited with status ${status}`);
            }
        }
        finally {
            if (wasRaw)
                setRawMode?.(true);
        }
    }, [settings.merged.general?.preferredEditor, setRawMode, stdin]);
    return launchEditor;
}
//# sourceMappingURL=useLaunchEditor.js.map