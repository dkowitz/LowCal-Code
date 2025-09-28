/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSlashCompletion } from './useSlashCompletion.js';
import { useState } from 'react';
// Test harness to capture the state from the hook's callbacks.
function useTestHarnessForSlashCompletion(enabled, query, slashCommands, commandContext) {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isPerfectMatch, setIsPerfectMatch] = useState(false);
    const { completionStart, completionEnd } = useSlashCompletion({
        enabled,
        query,
        slashCommands,
        commandContext,
        setSuggestions,
        setIsLoadingSuggestions,
        setIsPerfectMatch,
    });
    return {
        suggestions,
        isLoadingSuggestions,
        isPerfectMatch,
        completionStart,
        completionEnd,
    };
}
describe('useSlashCompletion', () => {
    // A minimal mock is sufficient for these tests.
    const mockCommandContext = {};
    describe('Top-Level Commands', () => {
        it('should suggest all top-level commands for the root slash', async () => {
            const slashCommands = [
                { name: 'help', altNames: ['?'], description: 'Show help' },
                {
                    name: 'stats',
                    altNames: ['usage'],
                    description: 'check session stats. Usage: /stats [model|tools]',
                },
                { name: 'clear', description: 'Clear the screen' },
                {
                    name: 'memory',
                    description: 'Manage memory',
                    subCommands: [{ name: 'show', description: 'Show memory' }],
                },
                { name: 'chat', description: 'Manage chat history' },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/', slashCommands, mockCommandContext));
            expect(result.current.suggestions.length).toBe(slashCommands.length);
            expect(result.current.suggestions.map((s) => s.label)).toEqual(expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']));
        });
        it('should filter commands based on partial input', async () => {
            const slashCommands = [
                { name: 'memory', description: 'Manage memory' },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/mem', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toEqual([
                { label: 'memory', value: 'memory', description: 'Manage memory' },
            ]);
        });
        it('should suggest commands based on partial altNames', async () => {
            const slashCommands = [
                {
                    name: 'stats',
                    altNames: ['usage'],
                    description: 'check session stats. Usage: /stats [model|tools]',
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/usag', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toEqual([
                {
                    label: 'stats',
                    value: 'stats',
                    description: 'check session stats. Usage: /stats [model|tools]',
                },
            ]);
        });
        it('should NOT provide suggestions for a perfectly typed command that is a leaf node', async () => {
            const slashCommands = [
                { name: 'clear', description: 'Clear the screen', action: vi.fn() },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/clear', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toHaveLength(0);
        });
        it.each([['/?'], ['/usage']])('should not suggest commands when altNames is fully typed', async (query) => {
            const mockSlashCommands = [
                {
                    name: 'help',
                    altNames: ['?'],
                    description: 'Show help',
                    action: vi.fn(),
                },
                {
                    name: 'stats',
                    altNames: ['usage'],
                    description: 'check session stats. Usage: /stats [model|tools]',
                    action: vi.fn(),
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, query, mockSlashCommands, mockCommandContext));
            expect(result.current.suggestions).toHaveLength(0);
        });
        it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
            const slashCommands = [
                { name: 'clear', description: 'Clear the screen' },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/clear ', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toHaveLength(0);
        });
        it('should not provide suggestions for an unknown command', async () => {
            const slashCommands = [
                { name: 'help', description: 'Show help' },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/unknown-command', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toHaveLength(0);
        });
    });
    describe('Sub-Commands', () => {
        it('should suggest sub-commands for a parent command', async () => {
            const slashCommands = [
                {
                    name: 'memory',
                    description: 'Manage memory',
                    subCommands: [
                        { name: 'show', description: 'Show memory' },
                        { name: 'add', description: 'Add to memory' },
                    ],
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/memory', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toHaveLength(2);
            expect(result.current.suggestions).toEqual(expect.arrayContaining([
                { label: 'show', value: 'show', description: 'Show memory' },
                { label: 'add', value: 'add', description: 'Add to memory' },
            ]));
        });
        it('should suggest all sub-commands when the query ends with the parent command and a space', async () => {
            const slashCommands = [
                {
                    name: 'memory',
                    description: 'Manage memory',
                    subCommands: [
                        { name: 'show', description: 'Show memory' },
                        { name: 'add', description: 'Add to memory' },
                    ],
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/memory ', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toHaveLength(2);
            expect(result.current.suggestions).toEqual(expect.arrayContaining([
                { label: 'show', value: 'show', description: 'Show memory' },
                { label: 'add', value: 'add', description: 'Add to memory' },
            ]));
        });
        it('should filter sub-commands by prefix', async () => {
            const slashCommands = [
                {
                    name: 'memory',
                    description: 'Manage memory',
                    subCommands: [
                        { name: 'show', description: 'Show memory' },
                        { name: 'add', description: 'Add to memory' },
                    ],
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/memory a', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toEqual([
                { label: 'add', value: 'add', description: 'Add to memory' },
            ]);
        });
        it('should provide no suggestions for an invalid sub-command', async () => {
            const slashCommands = [
                {
                    name: 'memory',
                    description: 'Manage memory',
                    subCommands: [
                        { name: 'show', description: 'Show memory' },
                        { name: 'add', description: 'Add to memory' },
                    ],
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/memory dothisnow', slashCommands, mockCommandContext));
            expect(result.current.suggestions).toHaveLength(0);
        });
    });
    describe('Argument Completion', () => {
        it('should call the command.completion function for argument suggestions', async () => {
            const availableTags = [
                'my-chat-tag-1',
                'my-chat-tag-2',
                'another-channel',
            ];
            const mockCompletionFn = vi
                .fn()
                .mockImplementation(async (_context, partialArg) => availableTags.filter((tag) => tag.startsWith(partialArg)));
            const slashCommands = [
                {
                    name: 'chat',
                    description: 'Manage chat history',
                    subCommands: [
                        {
                            name: 'resume',
                            description: 'Resume a saved chat',
                            completion: mockCompletionFn,
                        },
                    ],
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/chat resume my-ch', slashCommands, mockCommandContext));
            await waitFor(() => {
                expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, 'my-ch');
            });
            await waitFor(() => {
                expect(result.current.suggestions).toEqual([
                    { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
                    { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
                ]);
            });
        });
        it('should call command.completion with an empty string when args start with a space', async () => {
            const mockCompletionFn = vi
                .fn()
                .mockResolvedValue(['my-chat-tag-1', 'my-chat-tag-2', 'my-channel']);
            const slashCommands = [
                {
                    name: 'chat',
                    description: 'Manage chat history',
                    subCommands: [
                        {
                            name: 'resume',
                            description: 'Resume a saved chat',
                            completion: mockCompletionFn,
                        },
                    ],
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/chat resume ', slashCommands, mockCommandContext));
            await waitFor(() => {
                expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
            });
            await waitFor(() => {
                expect(result.current.suggestions).toHaveLength(3);
            });
        });
        it('should handle completion function that returns null', async () => {
            const completionFn = vi.fn().mockResolvedValue(null);
            const slashCommands = [
                {
                    name: 'chat',
                    description: 'Manage chat history',
                    subCommands: [
                        {
                            name: 'resume',
                            description: 'Resume a saved chat',
                            completion: completionFn,
                        },
                    ],
                },
            ];
            const { result } = renderHook(() => useTestHarnessForSlashCompletion(true, '/chat resume ', slashCommands, mockCommandContext));
            await waitFor(() => {
                expect(result.current.suggestions).toHaveLength(0);
            });
        });
    });
});
//# sourceMappingURL=useSlashCompletion.test.js.map