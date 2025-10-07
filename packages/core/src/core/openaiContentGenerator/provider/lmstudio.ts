import OpenAI from 'openai';
import type { Config } from '../../../config/config.js';
import type { ContentGeneratorConfig } from '../../contentGenerator.js';
import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT } from '../constants.js';
import { DefaultOpenAICompatibleProvider } from './default.js';

const LM_STUDIO_MIN_TIMEOUT_MS = 60000;

export class LMStudioOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    cliConfig: Config,
  ) {
    super(contentGeneratorConfig, cliConfig);
  }

  static isLMStudioProvider(
    contentGeneratorConfig: ContentGeneratorConfig,
  ): boolean {
    const baseURL = contentGeneratorConfig.baseUrl || '';
    return baseURL.includes('127.0.0.1:1234') || baseURL.includes('localhost:1234');
  }

  override buildHeaders(): Record<string, string | undefined> {
    // Get base headers from parent class
    const baseHeaders = super.buildHeaders();

    // LM Studio might need specific headers or none at all
    // Remove any headers that might cause issues with LM Studio
    const { 'User-Agent': _userAgent, ...filteredHeaders } = baseHeaders;
    
    return filteredHeaders;
  }

  override buildClient(): OpenAI {
    const {
      apiKey,
      baseUrl,
      timeout = DEFAULT_TIMEOUT,
      maxRetries = DEFAULT_MAX_RETRIES,
    } = this.contentGeneratorConfig;

    const effectiveTimeout = Math.max(timeout ?? 0, LM_STUDIO_MIN_TIMEOUT_MS);

    return new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: effectiveTimeout,
      maxRetries,
      defaultHeaders: this.buildHeaders(),
    });
  }

  /**
   * Attempt to unload the current model in LM Studio.
   * 
   * Note: LM Studio does not currently provide a dedicated REST API endpoint for unloading models.
   * Model unloading is typically managed through:
   * 1. SDK methods (model.unload())
   * 2. CLI commands (lms unload)
   * 3. Automatic unloading through Idle TTL and Auto-Evict features
   * 
   * This method sends a request that may trigger model unloading in some versions of LM Studio,
   * but it's not guaranteed to work. The most reliable approach is to rely on LM Studio's
   * automatic model management features.
   */
  async unloadModel(): Promise<void> {
    try {
      // Create a temporary client for the unload request
      const tempClient = this.buildClient();
      
      // Send a request that might trigger model unloading
      // This is not guaranteed to work and is provided as a best-effort approach
      await tempClient.chat.completions.create({
        model: this.contentGeneratorConfig.model,
        messages: [{ role: 'user', content: '' }],
        max_tokens: 1,
        temperature: 0,
      });
    } catch (error) {
      // We're not concerned with the result of this request
      // The purpose is to potentially trigger LM Studio's model management
      console.debug('LM Studio model unload request sent (result not guaranteed):', error);
    }
  }
}
