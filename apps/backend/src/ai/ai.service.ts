import {
  createAIModel,
  getAvailableModels,
  getDefaultModel,
  isModelSupported,
} from '@backend/ai/models.config';
import { AIProvider, type ModelOptions } from '@backend/ai/types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, streamText, type LanguageModel, type ModelMessage } from 'ai';

/**
 * AI Service
 *
 * Provides a centralized service for interacting with AI models.
 * Supports multiple providers with easy configuration and scaling.
 */
@Injectable()
export class AIService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get API key from environment for a specific provider
   */
  private getProviderApiKey(provider: AIProvider): string {
    const envKey = `${provider.toUpperCase()}_API_KEY`;
    const apiKey = this.configService.get<string>(envKey);

    if (!apiKey) {
      throw new Error(
        `API key not found for provider ${provider}. Please set ${envKey} environment variable.`
      );
    }

    return apiKey;
  }

  /**
   * Create a model instance with the specified configuration
   */
  createModel(options: ModelOptions = {}): LanguageModel {
    return createAIModel(options);
  }

  /**
   * Generate text using the AI model
   *
   * @example
   * ```ts
   * const result = await aiService.generate({
   *   prompt: 'Write a haiku about TypeScript',
   *   model: 'llama-3.3-70b-versatile'
   * });
   * console.log(result.text);
   * ```
   */
  async generate(options: {
    prompt: string;
    model?: string;
    provider?: AIProvider;
    temperature?: number;
    maxTokens?: number;
  }) {
    const { prompt, model, provider, temperature, maxTokens } = options;

    const aiModel = this.createModel({ model, provider });

    return generateText({
      model: aiModel,
      prompt,
      temperature,
      ...(maxTokens && { maxTokens }),
    });
  }

  /**
   * Stream text generation using the AI model with conversation context
   *
   * @example
   * ```ts
   * const stream = await aiService.generateStream({
   *   messages: [
   *     { role: 'user', content: 'Hello!' },
   *     { role: 'assistant', content: 'Hi there!' }
   *   ],
   *   system: 'You are a helpful assistant',
   *   model: 'llama-3.3-70b-versatile'
   * });
   *
   * for await (const chunk of stream.textStream) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  async generateStream(options: {
    messages: ModelMessage[];
    system?: string;
    model?: string;
    provider?: AIProvider;
    temperature?: number;
    maxTokens?: number;
    // Groq-specific options
    reasoningFormat?: 'parsed' | 'hidden' | 'raw';
    reasoningEffort?: 'low' | 'medium' | 'high' | 'none' | 'default';
    parallelToolCalls?: boolean;
    user?: string;
    serviceTier?: 'on_demand' | 'flex' | 'auto';
  }) {
    const {
      messages,
      system,
      model,
      provider,
      temperature,
      maxTokens,
      reasoningFormat,
      reasoningEffort,
      parallelToolCalls,
      user,
      serviceTier,
    } = options;

    const aiModel = this.createModel({ model, provider });

    const streamOptions: Parameters<typeof streamText>[0] = {
      model: aiModel,
      messages,
      system,
      temperature,
      ...(maxTokens && { maxTokens }),
    };

    // Add Groq-specific provider options if applicable
    if (provider === AIProvider.GROQ) {
      const groqOptions: Record<string, unknown> = {};
      if (reasoningFormat) groqOptions.reasoningFormat = reasoningFormat;
      if (reasoningEffort) groqOptions.reasoningEffort = reasoningEffort;
      if (parallelToolCalls !== undefined) groqOptions.parallelToolCalls = parallelToolCalls;
      if (user) groqOptions.user = user;
      if (serviceTier) groqOptions.serviceTier = serviceTier;

      if (Object.keys(groqOptions).length > 0) {
        (streamOptions as Record<string, unknown>).providerOptions = { groq: groqOptions };
      }
    }

    return streamText(streamOptions);
  }

  /**
   * Get available models for a provider
   */
  getAvailableModels(provider: AIProvider = AIProvider.GROQ): string[] {
    return getAvailableModels(provider);
  }

  /**
   * Get default model for a provider
   */
  getDefaultModel(provider: AIProvider = AIProvider.GROQ): string {
    return getDefaultModel(provider);
  }

  /**
   * Validate if a model is supported
   */
  isModelSupported(model: string, provider: AIProvider = AIProvider.GROQ): boolean {
    return isModelSupported(model, provider);
  }
}
