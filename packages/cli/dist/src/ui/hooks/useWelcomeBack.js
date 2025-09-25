/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useCallback } from 'react';
import { getProjectSummaryInfo, } from '@qwen-code/qwen-code-core';
import {} from '../../config/settingsSchema.js';
export function useWelcomeBack(config, submitQuery, buffer, settings) {
    const [welcomeBackInfo, setWelcomeBackInfo] = useState(null);
    const [showWelcomeBackDialog, setShowWelcomeBackDialog] = useState(false);
    const [welcomeBackChoice, setWelcomeBackChoice] = useState(null);
    const [shouldFillInput, setShouldFillInput] = useState(false);
    const [inputFillText, setInputFillText] = useState(null);
    // Check for conversation history on startup
    const checkWelcomeBack = useCallback(async () => {
        // Check if welcome back is enabled in settings
        if (settings.enableWelcomeBack === false) {
            return;
        }
        try {
            const info = await getProjectSummaryInfo();
            if (info.hasHistory) {
                setWelcomeBackInfo(info);
                setShowWelcomeBackDialog(true);
            }
        }
        catch (error) {
            // Silently ignore errors - welcome back is not critical
            console.debug('Welcome back check failed:', error);
        }
    }, [settings.enableWelcomeBack]);
    // Handle welcome back dialog selection
    const handleWelcomeBackSelection = useCallback((choice) => {
        setWelcomeBackChoice(choice);
        setShowWelcomeBackDialog(false);
        if (choice === 'continue' && welcomeBackInfo?.content) {
            // Create the context message to fill in the input box
            const contextMessage = `@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation,Let's continue?`;
            // Set the input fill state instead of directly submitting
            setInputFillText(contextMessage);
            setShouldFillInput(true);
        }
        // If choice is 'restart', just close the dialog and continue normally
    }, [welcomeBackInfo]);
    const handleWelcomeBackClose = useCallback(() => {
        setWelcomeBackChoice('restart'); // Default to restart when closed
        setShowWelcomeBackDialog(false);
    }, []);
    const clearInputFill = useCallback(() => {
        setShouldFillInput(false);
        setInputFillText(null);
    }, []);
    // Handle input filling from welcome back
    useEffect(() => {
        if (shouldFillInput && inputFillText) {
            buffer.setText(inputFillText);
            clearInputFill();
        }
    }, [shouldFillInput, inputFillText, buffer, clearInputFill]);
    // Check for welcome back on mount
    useEffect(() => {
        checkWelcomeBack();
    }, [checkWelcomeBack]);
    return {
        // State
        welcomeBackInfo,
        showWelcomeBackDialog,
        welcomeBackChoice,
        shouldFillInput,
        inputFillText,
        // Actions
        handleWelcomeBackSelection,
        handleWelcomeBackClose,
        checkWelcomeBack,
        clearInputFill,
    };
}
//# sourceMappingURL=useWelcomeBack.js.map