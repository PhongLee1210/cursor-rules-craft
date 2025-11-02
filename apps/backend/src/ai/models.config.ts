import { groq } from '@ai-sdk/groq';
import { AIProvider, PROVIDER_CONFIGS, type ModelOptions } from '@backend/ai/types';
import type { LanguageModel } from 'ai';

/**
 * Create an AI model instance based on provider configuration
 *
 * This function provides a unified interface for creating AI models across different providers.
 * Currently supports Groq, but designed to easily scale to multiple providers.
 *
 * @param options - Configuration options for the model
 * @param options.provider - AI provider (defaults to Groq)
 * @param options.model - Model name (defaults to provider's default model)
 * @param options.apiKey - API key (falls back to environment variable)
 * @returns Configured AI model instance
 *
 * @example
 * ```ts
 * // Using Groq (default)
 * const model = createAIModel({
 *   model: 'llama-3.3-70b-versatile'
 * });
 *
 * // With custom API key
 * const model = createAIModel({
 *   apiKey: 'custom-key',
 *   model: 'llama-3.1-70b-versatile'
 * });
 * ```
 */
export function createAIModel(options: ModelOptions = {}): LanguageModel {
  const { provider = AIProvider.GROQ, model, apiKey } = options;

  const config = PROVIDER_CONFIGS[provider];
  const modelName = model || config.defaultModel;

  switch (provider) {
    case AIProvider.GROQ:
      return groq(modelName);

    // Future providers can be added here:
    // case AIProvider.OPENAI:
    //   return createOpenAI({
    //     apiKey: apiKey || process.env.OPENAI_API_KEY,
    //     baseURL: config.baseURL,
    //   })(modelName);

    // case AIProvider.ANTHROPIC:
    //   return createAnthropic({
    //     apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    //   })(modelName);

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * Get available models for a specific provider
 */
export function getAvailableModels(provider: AIProvider = AIProvider.GROQ): string[] {
  return PROVIDER_CONFIGS[provider].models;
}

/**
 * Get default model for a specific provider
 */
export function getDefaultModel(provider: AIProvider = AIProvider.GROQ): string {
  return PROVIDER_CONFIGS[provider].defaultModel;
}

/**
 * Validate if a model is supported by a provider
 */
export function isModelSupported(model: string, provider: AIProvider = AIProvider.GROQ): boolean {
  return PROVIDER_CONFIGS[provider].models.includes(model);
}
