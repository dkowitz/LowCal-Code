import type { Config } from '../../../config/config.js';
import type { ContentGeneratorConfig } from '../../contentGenerator.js';
import { DefaultOpenAICompatibleProvider } from './default.js';
import { setModelContextLimit } from '../../tokenLimits.js';

export class OpenRouterOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    cliConfig: Config,
  ) {
    super(contentGeneratorConfig, cliConfig);
  }

  static isOpenRouterProvider(
    contentGeneratorConfig: ContentGeneratorConfig,
  ): boolean {
    const baseURL = contentGeneratorConfig.baseUrl || '';
    return baseURL.includes('openrouter.ai');
  }

  override buildHeaders(): Record<string, string | undefined> {
    // Get base headers from parent class
    const baseHeaders = super.buildHeaders();

    // Add OpenRouter-specific headers
    return {
      ...baseHeaders,
      'HTTP-Referer': 'https://github.com/QwenLM/qwen-code.git',
      'X-Title': 'Qwen Code',
    };
  }

  /**
   * After fetching the list of models from OpenRouter, call this helper to
   * apply dynamic context limits reported by the provider. This ensures the
   * UI and TokenBudgetManager use the accurate context window sizes.
   */
  static applyProviderContextLimits(models: Array<any>): void {
    if (!Array.isArray(models)) return;
    for (const m of models) {
      try {
        const id = m.id || m.name;
        const ctx =
          typeof m.context_length === 'number'
            ? m.context_length
            : typeof m.top_provider?.context_length === 'number'
            ? m.top_provider.context_length
            : undefined;
        if (id && typeof ctx === 'number' && Number.isFinite(ctx) && ctx > 0) {
          // Persist dynamic limit in core tokenLimits map
          setModelContextLimit(id, ctx);
        }
      } catch (e) {
        // ignore per-model failures
        continue;
      }
    }
  }
}
