import { useCallback, useState } from 'react';

import { classifyRuleIntent } from '@frontend/lib/intent-classification';
import type {
  RuleGenerationIntent,
  RuleGenerationRequest,
  RuleGenerationResponse,
  RuleGenerationStreamChunk,
} from '@frontend/types/ai-messages';

export interface RuleGenerationState {
  isGenerating: boolean;
  isStreamingRule: boolean;
  isStreamingFollowUp: boolean;
  currentPhase: 'idle' | 'rule-generation' | 'follow-up-message' | 'completed';
  ruleContent: string;
  followUpContent: string;
  error: string | null;
  metadata?: {
    ruleType: 'PROJECT_RULE' | 'COMMAND' | 'USER_RULE';
    fileName?: string;
  };
}

export interface UseRuleGenerationReturn extends RuleGenerationState {
  generateRule: (
    request: RuleGenerationRequest,
    onChunk?: (chunk: RuleGenerationStreamChunk) => void
  ) => Promise<RuleGenerationResponse>;
  setRuleContent: (
    content: string,
    ruleType?: 'PROJECT_RULE' | 'COMMAND' | 'USER_RULE',
    fileName?: string
  ) => void;
  detectRuleIntent: (message: string) => RuleGenerationIntent;
  reset: () => void;
}

/**
 * Hook for generating cursor rules with phased streaming
 * Supports Gemini-like UX with rule generation + follow-up message
 */
export function useRuleGeneration(): UseRuleGenerationReturn {
  const [state, setState] = useState<RuleGenerationState>({
    isGenerating: false,
    isStreamingRule: false,
    isStreamingFollowUp: false,
    currentPhase: 'idle',
    ruleContent: '',
    followUpContent: '',
    error: null,
  });

  const generateRule = useCallback(
    async (
      request: RuleGenerationRequest,
      onChunk?: (chunk: RuleGenerationStreamChunk) => void
    ): Promise<RuleGenerationResponse> => {
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        currentPhase: 'rule-generation',
        ruleContent: '',
        followUpContent: '',
        error: null,
      }));

      try {
        const response = await fetch('/api/ai/generate-rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';
        let currentRuleContent = '';
        let currentFollowUpContent = '';
        let metadata: RuleGenerationState['metadata'];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === '') continue;

            // Handle SSE format: lines starting with 'data: '
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6); // Remove 'data: ' prefix
              try {
                const chunk: RuleGenerationStreamChunk = JSON.parse(jsonStr);

                // Notify caller of chunk
                onChunk?.(chunk);

                switch (chunk.type) {
                  case 'phase-start':
                    if (chunk.phase === 'rule-generation') {
                      setState((prev) => ({
                        ...prev,
                        isStreamingRule: true,
                        currentPhase: 'rule-generation',
                        metadata: chunk.metadata,
                      }));
                      metadata = chunk.metadata;
                    } else if (chunk.phase === 'follow-up-message') {
                      setState((prev) => ({
                        ...prev,
                        isStreamingRule: false,
                        isStreamingFollowUp: true,
                        currentPhase: 'follow-up-message',
                      }));
                    }
                    break;

                  case 'rule-content':
                    if (chunk.content) {
                      currentRuleContent += chunk.content;
                      setState((prev) => ({
                        ...prev,
                        ruleContent: currentRuleContent,
                      }));
                    }
                    break;

                  case 'follow-up-content':
                    if (chunk.content) {
                      currentFollowUpContent += chunk.content;
                      setState((prev) => ({
                        ...prev,
                        followUpContent: currentFollowUpContent,
                      }));
                    }
                    break;

                  case 'phase-end':
                    if (chunk.phase === 'rule-generation') {
                      currentRuleContent = chunk.finalContent || currentRuleContent;
                      setState((prev) => ({
                        ...prev,
                        ruleContent: currentRuleContent,
                        isStreamingRule: false,
                      }));
                    } else if (chunk.phase === 'follow-up-message') {
                      currentFollowUpContent = chunk.finalContent || currentFollowUpContent;
                      setState((prev) => ({
                        ...prev,
                        followUpContent: currentFollowUpContent,
                        isStreamingFollowUp: false,
                        currentPhase: 'completed',
                        isGenerating: false,
                      }));
                    }
                    break;

                  case 'error':
                    setState((prev) => ({
                      ...prev,
                      error: chunk.errorText || 'Unknown error occurred',
                      isGenerating: false,
                      isStreamingRule: false,
                      isStreamingFollowUp: false,
                      currentPhase: 'idle',
                    }));
                    throw new Error(chunk.errorText || 'Unknown error occurred');
                }
              } catch (parseError) {
                console.warn('Failed to parse streaming chunk:', jsonStr, parseError);
              }
            }
          }
        }

        const result: RuleGenerationResponse = {
          ruleContent: currentRuleContent,
          followUpMessage: currentFollowUpContent,
          ruleType: metadata?.ruleType || 'PROJECT_RULE',
          fileName: metadata?.fileName || 'generated-rule',
          metadata: {
            generatedAt: Date.now(),
            model: request.model || 'llama-3.3-70b-versatile',
            provider: request.provider || 'groq',
          },
        };

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState((prev) => ({
          ...prev,
          error: errorMessage,
          isGenerating: false,
          isStreamingRule: false,
          isStreamingFollowUp: false,
          currentPhase: 'idle',
        }));
        throw error;
      }
    },
    []
  );

  const detectRuleIntent = useCallback((message: string): RuleGenerationIntent => {
    // Use rule-based classification instead of API call
    return classifyRuleIntent(message);
  }, []);

  const setRuleContent = useCallback(
    (
      content: string,
      ruleType: 'PROJECT_RULE' | 'COMMAND' | 'USER_RULE' = 'PROJECT_RULE',
      fileName?: string
    ) => {
      setState((prev) => ({
        ...prev,
        ruleContent: content,
        currentPhase: 'completed',
        metadata: {
          ruleType,
          fileName: fileName || 'agent-generated-rule',
        },
      }));
    },
    []
  );

  const reset = useCallback(() => {
    setState({
      isGenerating: false,
      isStreamingRule: false,
      isStreamingFollowUp: false,
      currentPhase: 'idle',
      ruleContent: '',
      followUpContent: '',
      error: null,
    });
  }, []);

  return {
    ...state,
    generateRule,
    setRuleContent,
    detectRuleIntent,
    reset,
  };
}
