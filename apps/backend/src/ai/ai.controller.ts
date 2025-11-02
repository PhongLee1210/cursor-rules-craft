import { AIService } from '@backend/ai/ai.service';
import { PromptTemplateService } from '@backend/ai/prompt-template.service';
import { AIProvider } from '@backend/ai/types';
import { Public } from '@backend/auth/decorators/public.decorator';
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { UIMessage } from 'ai';
import { convertToModelMessages } from 'ai';
import { Response } from 'express';

interface ChatRequestBody {
  messages?: UIMessage[];
  message?: unknown;
  model?: string;
  provider?: AIProvider;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI Controller
 *
 * Provides a single endpoint for CursorRuleCraft AI Agent interactions.
 * The AI Agent specializes exclusively in generating cursor rules.
 */
@Controller('ai')
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly promptTemplate: PromptTemplateService
  ) {}

  /**
   * Get available models for a provider
   *
   * @example GET /ai/models?provider=groq
   */
  @Get('models')
  @Public()
  getModels(@Query('provider') provider?: AIProvider) {
    return {
      provider: provider || AIProvider.GROQ,
      defaultModel: this.aiService.getDefaultModel(provider),
      models: this.aiService.getAvailableModels(provider),
    };
  }

  /**
   * Stream CursorRuleCraft AI Agent responses for cursor rule generation
   *
   * @example
   * POST /ai/chat
   * {
   *   "messages": [
   *     { "role": "user", "content": "Create React component rules" }
   *   ],
   *   "model": "llama-3.3-70b-versatile",
   *   "temperature": 0.7
   * }
   */
  @Post('chat')
  @Public()
  async chat(@Body() body: unknown, @Res() res: Response) {
    // Handle ai-sdk useChat format - extract messages from the request
    let messages: UIMessage[]; // UIMessage[] from frontend
    let model: string | undefined;
    let provider: AIProvider | undefined;
    let temperature: number | undefined;
    let maxTokens: number | undefined;

    try {
      // Type guard for request body
      const isChatRequestBody = (obj: unknown): obj is ChatRequestBody => {
        return typeof obj === 'object' && obj !== null;
      };

      if (Array.isArray(body)) {
        // useChat sends messages as an array directly (when body is just the messages array)
        messages = body; // Keep as UIMessages for conversion later
      } else if (isChatRequestBody(body)) {
        // Handle object format with messages array or single message
        if (body.messages && Array.isArray(body.messages)) {
          messages = body.messages; // Keep as UIMessages for conversion later
        } else if (body.message) {
          // Single message format - ensure content is a string
          const text =
            typeof body.message === 'string' ? body.message : JSON.stringify(body.message);
          messages = [
            { role: 'user', id: 'user-msg', parts: [{ type: 'text', text }] },
          ] as UIMessage[];
        } else {
          throw new Error('No messages found in request body');
        }

        // Extract additional parameters
        model = body.model;
        provider = body.provider;
        temperature = body.temperature;
        maxTokens = body.maxTokens;
      } else {
        throw new Error('Invalid body format');
      }
    } catch (error) {
      console.error('Failed to parse request body:', error);
      res.status(400).send('Invalid request body format');
      return;
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      // Get the last user message to validate the request
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        res.status(400).send('Last message must be from user');
        return;
      }

      // Additional validation for message content
      const messageContent = (lastMessage as { content?: string }).content || '';
      const hasParts = lastMessage.parts && lastMessage.parts.length > 0;

      if (!messageContent && !hasParts) {
        res.status(400).send('Last message must have content');
        return;
      }

      // Get CursorRuleCraft system prompt
      const systemPrompt = this.promptTemplate.loadTemplate('chat');

      // Convert UIMessages to ModelMessages for AI SDK
      const modelMessages = convertToModelMessages(messages);

      // Use lower temperature for rule generation (more deterministic)
      // Configure Groq-specific options for optimal JSON event streaming
      const stream = await this.aiService.generateStream({
        messages: modelMessages,
        system: systemPrompt,
        model,
        provider,
        temperature: temperature || 0.3, // Lower temperature for consistent rule generation
        maxTokens,
        // Groq-specific optimizations
        parallelToolCalls: true, // Enable parallel function calling
        serviceTier: 'flex', // Use flex tier for higher throughput
      });

      return stream.pipeUIMessageStreamToResponse(res);
    } catch (error) {
      console.error('CursorRuleCraft chat streaming error:', error);
      res.status(500).send('Internal server error');
    }
  }
}
