/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type MockedFunction } from 'vitest';
import { exportCommand } from './exportCommand.js';
import type { CommandContext } from './types.js';
import type { HistoryItem } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { Config } from '@qwen-code/qwen-code-core';
import type { Logger } from '@qwen-code/qwen-code-core';
import type { GitService } from '@qwen-code/qwen-code-core';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import { createMockLoggingController } from '../../test-utils/mockLoggingController.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
  };
});

vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path');
  return {
    ...actual,
    join: vi.fn(() => '/mock/path/conversation.md'),
  };
});

describe('exportCommand', () => {
  let mockContext: CommandContext;
  let mockAddItem: ReturnType<typeof vi.fn>;
  let mockWriteFileSync: ReturnType<typeof vi.fn>;
  let mockPathJoin: ReturnType<typeof vi.fn>;
  let mockGetHistory: MockedFunction<() => HistoryItem[]>;
  let mockConfig: Partial<Config>;
  let mockSettings: Partial<LoadedSettings>;
  let mockGitService: Partial<GitService>;
  let mockLogger: Partial<Logger>;
  let mockSessionStats: SessionStatsState;
  let mockLogging: ReturnType<typeof createMockLoggingController>;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockWriteFileSync = vi.fn();
    mockPathJoin = vi.fn(() => '/mock/path/conversation.md');
    mockGetHistory = vi.fn<() => HistoryItem[]>();
    
    mockConfig = {
      getSessionId: vi.fn(() => 'test-session-id'),
    };
    mockSettings = {};
    mockGitService = {};
    mockLogger = {};
    mockSessionStats = {
      sessionId: 'test-session-id',
      sessionStartTime: new Date(),
      metrics: {} as SessionStatsState['metrics'],
      lastPromptTokenCount: 0,
      currentContextTokenCount: 0,
      promptCount: 0,
    };
    mockLogging = createMockLoggingController();

    vi.mocked(require('node:fs')).writeFileSync = mockWriteFileSync;
    vi.mocked(require('node:path')).join = mockPathJoin;

    mockContext = {
      services: {
        config: mockConfig as Config,
        settings: mockSettings as LoadedSettings,
        git: mockGitService as GitService,
        logger: mockLogger as Logger,
        logging: mockLogging,
      },
      ui: {
        addItem: mockAddItem,
        clear: vi.fn(),
        setDebugMessage: vi.fn(),
        pendingItem: null,
        setPendingItem: vi.fn(),
        loadHistory: vi.fn(),
        getHistory: mockGetHistory,
        toggleCorgiMode: vi.fn(),
        toggleVimEnabled: vi.fn(),
        setGeminiMdFileCount: vi.fn(),
        reloadCommands: vi.fn(),
      },
      session: {
        stats: mockSessionStats,
        sessionShellAllowlist: new Set<string>(),
      },
    };
  });

  it('should have correct name and description', () => {
    expect(exportCommand.name).toBe('export');
    expect(exportCommand.description).toBe(
      'save the current conversation to a markdown file in the current working directory'
    );
  });

  it('should export conversation with default filename', async () => {
    const mockHistory: HistoryItem[] = [
      {
        id: 1,
        type: 'user',
        text: 'Hello, how are you?',
      },
      {
        id: 2,
        type: 'gemini',
        text: 'I am doing well, thank you!',
      },
    ];
    mockGetHistory.mockReturnValue(mockHistory);

    const action = exportCommand.action;
    if (!action) {
      throw new Error('export command action is undefined');
    }

    await action(mockContext, '');

    expect(mockContext.ui.getHistory).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('✅ Conversation exported successfully to `conversation.md`'),
      }),
      expect.any(Number)
    );
  });

  it('should handle custom filename', async () => {
    const mockHistory: HistoryItem[] = [];
    mockGetHistory.mockReturnValue(mockHistory);
    mockPathJoin.mockReturnValue('/mock/path/my-chat.md');

    const action = exportCommand.action;
    if (!action) {
      throw new Error('export command action is undefined');
    }

    await action(mockContext, 'my-chat.md');

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('✅ Conversation exported successfully to `my-chat.md`'),
      }),
      expect.any(Number)
    );
  });

  it('should handle export error', async () => {
    const mockHistory: HistoryItem[] = [];
    mockGetHistory.mockReturnValue(mockHistory);
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const action = exportCommand.action;
    if (!action) {
      throw new Error('export command action is undefined');
    }

    await action(mockContext, '');

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text: expect.stringContaining('❌ Failed to export conversation: Permission denied'),
      }),
      expect.any(Number)
    );
  });
});
