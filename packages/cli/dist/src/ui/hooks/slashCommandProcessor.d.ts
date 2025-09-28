/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type PartListUnion } from '@google/genai';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import type { Config } from '@qwen-code/qwen-code-core';
import { ToolConfirmationOutcome } from '@qwen-code/qwen-code-core';
import type { HistoryItemWithoutId, HistoryItem, SlashCommandProcessorResult } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';
import { type CommandContext, type SlashCommand } from '../commands/types.js';
/**
 * Hook to define and process slash commands (e.g., /help, /clear).
 */
export declare const useSlashCommandProcessor: (config: Config | null, settings: LoadedSettings, addItem: UseHistoryManagerReturn["addItem"], clearItems: UseHistoryManagerReturn["clearItems"], loadHistory: UseHistoryManagerReturn["loadHistory"], history: UseHistoryManagerReturn["history"], refreshStatic: () => void, onDebugMessage: (message: string) => void, openThemeDialog: () => void, openAuthDialog: () => void, openEditorDialog: () => void, toggleCorgiMode: () => void, setQuittingMessages: (message: HistoryItem[]) => void, openPrivacyNotice: () => void, openSettingsDialog: () => void, openModelSelectionDialog: () => void, openSubagentCreateDialog: () => void, openAgentsManagerDialog: () => void, toggleVimEnabled: () => Promise<boolean>, setIsProcessing: (isProcessing: boolean) => void, setGeminiMdFileCount: (count: number) => void, _showQuitConfirmation: () => void) => {
    handleSlashCommand: (rawQuery: PartListUnion, oneTimeShellAllowlist?: Set<string>, overwriteConfirmed?: boolean) => Promise<SlashCommandProcessorResult | false>;
    slashCommands: readonly SlashCommand[];
    pendingHistoryItems: HistoryItemWithoutId[];
    commandContext: CommandContext;
    shellConfirmationRequest: {
        commands: string[];
        onConfirm: (outcome: ToolConfirmationOutcome, approvedCommands?: string[]) => void;
    } | null;
    confirmationRequest: {
        prompt: React.ReactNode;
        onConfirm: (confirmed: boolean) => void;
    } | null;
    quitConfirmationRequest: {
        onConfirm: (shouldQuit: boolean, action?: string) => void;
    } | null;
};
