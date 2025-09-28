/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { CodeAssistServer, LoggingContentGenerator, UserTierId, } from '@qwen-code/qwen-code-core';
import { usePrivacySettings } from './usePrivacySettings.js';
// Mock the dependencies
vi.mock('@qwen-code/qwen-code-core', () => {
    // Mock classes for instanceof checks
    class MockCodeAssistServer {
        projectId = 'test-project-id';
        loadCodeAssist = vi.fn();
        getCodeAssistGlobalUserSetting = vi.fn();
        setCodeAssistGlobalUserSetting = vi.fn();
        constructor(_client, _projectId, _httpOptions, _sessionId, _userTier) { }
    }
    class MockLoggingContentGenerator {
        getWrapped = vi.fn();
        constructor(_wrapped, _config) { }
    }
    return {
        Config: vi.fn(),
        CodeAssistServer: MockCodeAssistServer,
        LoggingContentGenerator: MockLoggingContentGenerator,
        GeminiClient: vi.fn(),
        UserTierId: {
            FREE: 'free-tier',
            LEGACY: 'legacy-tier',
            STANDARD: 'standard-tier',
        },
    };
});
describe('usePrivacySettings', () => {
    let mockConfig;
    let mockClient;
    let mockCodeAssistServer;
    let mockLoggingContentGenerator;
    beforeEach(() => {
        vi.clearAllMocks();
        // Create mock CodeAssistServer instance
        mockCodeAssistServer = new CodeAssistServer(null, 'test-project-id');
        mockCodeAssistServer.loadCodeAssist.mockResolvedValue({
            currentTier: { id: UserTierId.FREE },
        });
        mockCodeAssistServer.getCodeAssistGlobalUserSetting.mockResolvedValue({
            freeTierDataCollectionOptin: true,
        });
        mockCodeAssistServer.setCodeAssistGlobalUserSetting.mockResolvedValue({
            freeTierDataCollectionOptin: false,
        });
        // Create mock LoggingContentGenerator that wraps the CodeAssistServer
        mockLoggingContentGenerator = new LoggingContentGenerator(mockCodeAssistServer, null);
        mockLoggingContentGenerator.getWrapped.mockReturnValue(mockCodeAssistServer);
        // Create mock GeminiClient
        mockClient = {
            getContentGenerator: vi.fn().mockReturnValue(mockLoggingContentGenerator),
        };
        // Create mock Config
        mockConfig = {
            getGeminiClient: vi.fn().mockReturnValue(mockClient),
        };
    });
    it('should handle LoggingContentGenerator wrapper correctly and not throw "Oauth not being used" error', async () => {
        const { result } = renderHook(() => usePrivacySettings(mockConfig));
        // Initial state should be loading
        expect(result.current.privacyState.isLoading).toBe(true);
        expect(result.current.privacyState.error).toBeUndefined();
        // Wait for the hook to complete
        await waitFor(() => {
            expect(result.current.privacyState.isLoading).toBe(false);
        });
        // Should not have the "Oauth not being used" error
        expect(result.current.privacyState.error).toBeUndefined();
        expect(result.current.privacyState.isFreeTier).toBe(true);
        expect(result.current.privacyState.dataCollectionOptIn).toBe(true);
        // Verify that getWrapped was called to unwrap the LoggingContentGenerator
        expect(mockLoggingContentGenerator.getWrapped).toHaveBeenCalled();
    });
    it('should work with direct CodeAssistServer (no wrapper)', async () => {
        // Test case where the content generator is directly a CodeAssistServer
        const directServer = new CodeAssistServer(null, 'test-project-id');
        directServer.loadCodeAssist.mockResolvedValue({
            currentTier: { id: UserTierId.FREE },
        });
        directServer.getCodeAssistGlobalUserSetting.mockResolvedValue({
            freeTierDataCollectionOptin: true,
        });
        mockClient.getContentGenerator = vi.fn().mockReturnValue(directServer);
        const { result } = renderHook(() => usePrivacySettings(mockConfig));
        await waitFor(() => {
            expect(result.current.privacyState.isLoading).toBe(false);
        });
        expect(result.current.privacyState.error).toBeUndefined();
        expect(result.current.privacyState.isFreeTier).toBe(true);
        expect(result.current.privacyState.dataCollectionOptIn).toBe(true);
    });
    it('should handle paid tier users correctly', async () => {
        // Mock paid tier response
        mockCodeAssistServer.loadCodeAssist.mockResolvedValue({
            currentTier: { id: UserTierId.STANDARD },
        });
        const { result } = renderHook(() => usePrivacySettings(mockConfig));
        await waitFor(() => {
            expect(result.current.privacyState.isLoading).toBe(false);
        });
        expect(result.current.privacyState.error).toBeUndefined();
        expect(result.current.privacyState.isFreeTier).toBe(false);
        expect(result.current.privacyState.dataCollectionOptIn).toBeUndefined();
    });
    it('should throw error when content generator is not a CodeAssistServer', async () => {
        // Mock a non-CodeAssistServer content generator
        const mockOtherGenerator = { someOtherMethod: vi.fn() };
        mockLoggingContentGenerator.getWrapped.mockReturnValue(mockOtherGenerator);
        const { result } = renderHook(() => usePrivacySettings(mockConfig));
        await waitFor(() => {
            expect(result.current.privacyState.isLoading).toBe(false);
        });
        expect(result.current.privacyState.error).toBe('Oauth not being used');
    });
    it('should throw error when CodeAssistServer has no projectId', async () => {
        // Mock CodeAssistServer without projectId
        const mockServerNoProject = {
            ...mockCodeAssistServer,
            projectId: undefined,
        };
        mockLoggingContentGenerator.getWrapped.mockReturnValue(mockServerNoProject);
        const { result } = renderHook(() => usePrivacySettings(mockConfig));
        await waitFor(() => {
            expect(result.current.privacyState.isLoading).toBe(false);
        });
        expect(result.current.privacyState.error).toBe('Oauth not being used');
    });
    it('should update data collection opt-in setting', async () => {
        const { result } = renderHook(() => usePrivacySettings(mockConfig));
        // Wait for initial load
        await waitFor(() => {
            expect(result.current.privacyState.isLoading).toBe(false);
        });
        // Update the setting
        await result.current.updateDataCollectionOptIn(false);
        // Wait for update to complete
        await waitFor(() => {
            expect(result.current.privacyState.dataCollectionOptIn).toBe(false);
        });
        expect(mockCodeAssistServer.setCodeAssistGlobalUserSetting).toHaveBeenCalledWith({
            cloudaicompanionProject: 'test-project-id',
            freeTierDataCollectionOptin: false,
        });
    });
});
//# sourceMappingURL=usePrivacySettings.test.js.map