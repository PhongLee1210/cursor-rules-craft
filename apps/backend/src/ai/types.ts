/**
 * AI Provider Types
 * Define supported AI providers and their configurations
 */

export enum AIProvider {
  GROQ = 'groq',
  // Future providers can be added here:
  // OPENAI = 'openai',
  // ANTHROPIC = 'anthropic',
  // GOOGLE = 'google',
}

export interface ProviderConfig {
  baseURL?: string; // Optional for native providers like Groq
  defaultModel: string;
  models: string[];
}

export interface ModelOptions {
  provider?: AIProvider;
  model?: string;
  apiKey?: string;
}

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  [AIProvider.GROQ]: {
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      // Latest Llama models
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'llama3-70b-8192',
      'llama3-8b-8192',

      // Mixtral models
      'mixtral-8x7b-32768',

      // Gemma models
      'gemma2-9b-it',
      'gemma-7b-it',

      // Reasoning models
      'qwen/qwen3-32b',
      'qwen-qwq-32b',
      'deepseek-r1-distill-llama-70b',
      'deepseek-r1-distill-qwen-32b',

      // Other models
      'qwen-2.5-32b',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'moonshotai/kimi-k2-instruct',
      'distil-whisper-large-v3-en',
      'whisper-large-v3',
      'whisper-large-v3-turbo',

      // Guard models
      'meta-llama/llama-guard-4-12b',
      'meta-llama/llama-prompt-guard-2-22m',
      'meta-llama/llama-prompt-guard-2-86m',
      'llama-guard-3-8b',
    ],
  },
  // Future provider configs can be added here:
  // [AIProvider.OPENAI]: {
  //   baseURL: 'https://api.openai.com/v1',
  //   defaultModel: 'gpt-4-turbo-preview',
  //   models: ['gpt-4-turbo-preview', 'gpt-3.5-turbo'],
  // },
};
