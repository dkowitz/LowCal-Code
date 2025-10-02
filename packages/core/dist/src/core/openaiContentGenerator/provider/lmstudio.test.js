/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LMStudioOpenAICompatibleProvider } from './lmstudio.js';
describe('LMStudioOpenAICompatibleProvider', () => {
    let mockConfig;
    let contentGeneratorConfig;
    beforeEach(() => {
        // Mock config
        mockConfig = {
            getCliVersion: vi.fn().mockReturnValue('1.0.0'),
        };
        // Content generator config for LM Studio
        contentGeneratorConfig = {
            model: 'test-model',
            baseUrl: 'http://localhost:1234/v1',
        };
    });
    describe('isLMStudioProvider', () => {
        it('should return true for LM Studio base URLs', () => {
            const config1 = {
                model: 'test-model',
                baseUrl: 'http://127.0.0.1:1234/v1',
            };
            const config2 = {
                model: 'test-model',
                baseUrl: 'http://localhost:1234/v1',
            };
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config1)).toBe(true);
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config2)).toBe(true);
        });
        it('should return false for non-LM Studio base URLs', () => {
            const config1 = {
                model: 'test-model',
                baseUrl: 'http://openai.com/v1',
            };
            const config2 = {
                model: 'test-model',
                baseUrl: 'http://localhost:5678/v1',
            };
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config1)).toBe(false);
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config2)).toBe(false);
        });
    });
    describe('buildHeaders', () => {
        it('should remove User-Agent header for LM Studio compatibility', () => {
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfig);
            const headers = provider.buildHeaders();
            expect(headers['User-Agent']).toBeUndefined();
        });
    });
    describe('unloadModel', () => {
        it('should attempt to unload the model without throwing an error', async () => {
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfig);
            const unloadPromise = provider.unloadModel();
            await expect(unloadPromise).resolves.not.toThrow();
        });
    });
});
//# sourceMappingURL=lmstudio.test.js.map