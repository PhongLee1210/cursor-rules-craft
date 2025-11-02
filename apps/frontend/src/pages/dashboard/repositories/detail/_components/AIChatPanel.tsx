import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, TextUIPart } from 'ai';

import { MessageBubble } from '@frontend/components/chat';
import { ChatInput, type MentionedFile } from '@frontend/components/ChatInput';
import { cn } from '@frontend/lib/utils';
import type { Repository } from '@frontend/types/repository';

interface StreamingEvent {
  event: 'meta' | 'chunk' | 'progress' | 'file' | 'done' | 'error' | 'clarify';
  payload?: {
    id?: string;
    rule_type?: string;
    tech_stack?: string[];
    filename?: string;
    schema_version?: string;
    content?: string;
    message?: string;
  };
}

interface RuleMeta {
  id: string;
  rule_type: string;
  tech_stack: string[];
  filename: string;
  schema_version: string;
}

interface ClarifyPayload {
  message: string;
  required_fields: string[];
}

interface AIChatPanelProps {
  repository: Repository;
  selectedFile?: string | null;
  onClearFileSelection?: () => void;
  onRuleGenerationStart?: (meta: RuleMeta) => void;
  onRuleGenerationUpdate?: (content: string) => void;
  onRuleGenerationEnd?: () => void;
  onClarify?: (payload: ClarifyPayload) => void;
}

export interface AIChatPanelRef {
  handleFileDrop: (file: { name: string; path: string; type: 'file' | 'directory' }) => void;
  resetSession: () => void;
}

export const AIChatPanel = forwardRef<AIChatPanelRef, AIChatPanelProps>(
  (
    {
      repository: _repository,
      selectedFile,
      onClearFileSelection,
      onRuleGenerationStart,
      onRuleGenerationUpdate,
      onRuleGenerationEnd,
      onClarify,
    },
    ref
  ) => {
    // Refs
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // State
    const [mentionedFiles, setMentionedFiles] = useState<MentionedFile[]>([]);
    const [input, setInput] = useState<string>('');
    const [isGeneratingRules, setIsGeneratingRules] = useState(false);
    const [ruleContent, setRuleContent] = useState<string>('');
    const [eventOnlyMessageIds, setEventOnlyMessageIds] = useState<Set<string>>(new Set()); // Track messages that contain only events
    const pendingEventsRef = useRef<StreamingEvent[]>([]);
    const processedMessageIdsRef = useRef<Set<string>>(new Set());

    // Use ai-sdk useChat hook for CursorRuleCraft AI Agent interactions
    const chatHelpers = useChat({
      transport: new DefaultChatTransport({
        prepareSendMessagesRequest: ({ id, messages }) => {
          return {
            api: '/api/ai/chat',
            body: {
              id,
              messages,
            },
          };
        },
      }),
    });

    // Destructure chat helpers
    const { messages: chatMessages, sendMessage, status } = chatHelpers;

    // Local state for optimistic message updates
    const [optimisticMessages, setOptimisticMessages] = useState<typeof chatMessages>([]);

    // Use optimistic messages if they exist, otherwise use chat messages
    const messages = useMemo(() => {
      return optimisticMessages.length > 0 ? optimisticMessages : chatMessages;
    }, [chatMessages, optimisticMessages]);

    // Computed Values
    const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

    // Effects
    // Focus input when file is selected but don't auto-populate text
    useEffect(() => {
      if (selectedFile) {
        inputRef.current?.focus();
      }
    }, [selectedFile]);

    // Clear optimistic messages when chat messages update (API response received)
    useEffect(() => {
      if (optimisticMessages.length > 0 && chatMessages.length > 0) {
        // Defer clearing to avoid setState during render
        const timeoutId = setTimeout(() => setOptimisticMessages([]), 0);
        return () => clearTimeout(timeoutId);
      }
    }, [chatMessages.length, optimisticMessages.length]);

    const handleStreamingEvent = useCallback(
      (event: StreamingEvent) => {
        switch (event.event) {
          case 'meta':
            setIsGeneratingRules(true);
            setRuleContent('');
            if (event.payload) {
              onRuleGenerationStart?.(event.payload as RuleMeta);
            }
            break;
          case 'chunk':
            if (isGeneratingRules) {
              setRuleContent((prev) => prev + (event.payload?.content || ''));
              onRuleGenerationUpdate?.(ruleContent + (event.payload?.content || ''));
            }
            break;
          case 'done':
            setIsGeneratingRules(false);
            onRuleGenerationEnd?.();
            break;
          case 'error':
            setIsGeneratingRules(false);
            onRuleGenerationEnd?.();
            break;
          case 'clarify':
            setIsGeneratingRules(false);
            onRuleGenerationEnd?.();
            if (event.payload) {
              onClarify?.(event.payload as ClarifyPayload);
            }
            break;
        }
      },
      [
        isGeneratingRules,
        ruleContent,
        onRuleGenerationStart,
        onRuleGenerationUpdate,
        onRuleGenerationEnd,
        onClarify,
      ]
    );

    // Monitor messages for rule generation events - wait for complete messages
    useEffect(() => {
      console.log('🔍 [Event Parser] Checking messages:', chatMessages.length, 'messages');

      // Process events from assistant messages, whether streaming or completed
      // According to our system prompt, AI should ONLY send JSON events

      const lastMessage = chatMessages[chatMessages.length - 1];
      console.log('🔍 [Event Parser] Last message:', lastMessage?.id, lastMessage?.role);

      if (!lastMessage || lastMessage.role !== 'assistant') {
        console.log('🔍 [Event Parser] Skipping non-assistant message');
        return;
      }

      // Check if message is still streaming or done
      const isStreaming = lastMessage.parts?.some(
        (part): part is TextUIPart => part.type === 'text' && part.state === 'streaming'
      );
      const isDone = lastMessage.parts?.every(
        (part): part is TextUIPart => part.type !== 'text' || part.state === 'done'
      );

      console.log('🔍 [Event Parser] Message state - streaming:', isStreaming, 'done:', isDone);

      // Only process messages when they're complete (done streaming)
      if (!isDone) {
        console.log('🔍 [Event Parser] Skipping incomplete streaming message:', lastMessage.id);
        return;
      }

      // Skip if we've already processed this complete message
      if (processedMessageIdsRef.current.has(lastMessage.id)) {
        console.log('🔍 [Event Parser] Already processed complete message:', lastMessage.id);
        return;
      }

      processedMessageIdsRef.current.add(lastMessage.id);
      console.log('🔍 [Event Parser] Processing complete message:', lastMessage.id);

      const msgWithParts = lastMessage;

      console.log('🔍 [Event Parser] Full message:', JSON.stringify(lastMessage, null, 2));
      console.log('🔍 [Event Parser] Message parts:', msgWithParts.parts?.length);

      if (!Array.isArray(msgWithParts.parts)) {
        console.log('🔍 [Event Parser] No parts array');
        return;
      }

      let hasEvents = false;

      // First, try to parse the entire message content directly
      // For backward compatibility, check if there's a content property (fallback for older message format)
      const messageContent =
        'content' in lastMessage ? (lastMessage as { content?: string }).content : undefined;
      if (messageContent) {
        console.log('🔍 [Event Parser] Trying to parse message content directly:', messageContent);

        try {
          const event = JSON.parse(messageContent.trim()) as StreamingEvent;
          console.log('🔍 [Event Parser] Parsed from message content:', event.event, event);

          if (
            event.event &&
            typeof event.event === 'string' &&
            ['meta', 'chunk', 'progress', 'file', 'done', 'error', 'clarify'].includes(event.event)
          ) {
            pendingEventsRef.current.push(event);
            hasEvents = true;
            console.log('✅ [Event Parser] Valid event added from message content:', event.event);
          }
        } catch (error) {
          console.log('❌ [Event Parser] Message content parse error:', error);
        }
      }

      // Also check parts for any JSON content
      for (const part of msgWithParts.parts) {
        console.log(
          '🔍 [Event Parser] Processing part:',
          part.type,
          'full part:',
          JSON.stringify(part, null, 2)
        );

        if (part.type === 'text' && 'text' in part && part.text) {
          const lines = part.text.split('\n');
          console.log('🔍 [Event Parser] Split into', lines.length, 'lines');

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine === '') continue;

            console.log('🔍 [Event Parser] Processing line:', trimmedLine.substring(0, 50));

            // Direct JSON parsing - no complex validation needed
            try {
              const event = JSON.parse(trimmedLine) as StreamingEvent;
              console.log('🔍 [Event Parser] Parsed event:', event.event, event);

              if (
                event.event &&
                typeof event.event === 'string' &&
                ['meta', 'chunk', 'progress', 'file', 'done', 'error', 'clarify'].includes(
                  event.event
                )
              ) {
                pendingEventsRef.current.push(event);
                hasEvents = true;
                console.log('✅ [Event Parser] Valid event added:', event.event);
              } else {
                console.log('❌ [Event Parser] Invalid event type:', event.event);
              }
            } catch (error) {
              console.log('❌ [Event Parser] JSON parse error:', error, 'for line:', trimmedLine);
            }
          }
        }
      }

      // Mark this message as containing only events (hide from chat)
      // Note: setState in effect is intentional here - we're deriving eventOnlyMessageIds state from chatMessages data
      console.log('🔍 [Event Parser] Has events:', hasEvents, 'for message:', lastMessage.id);
      if (hasEvents) {
        // eslint-disable-next-line
        setEventOnlyMessageIds((prev) => new Set([...prev, lastMessage.id]));
        console.log('✅ [Event Parser] Marked as event-only:', lastMessage.id);
      }
    }, [chatMessages, status]);

    // Process pending events asynchronously
    useEffect(() => {
      console.log('🔄 [Event Processor] Pending events:', pendingEventsRef.current.length);

      if (pendingEventsRef.current.length > 0) {
        const events = [...pendingEventsRef.current];
        pendingEventsRef.current = [];

        console.log(
          '🔄 [Event Processor] Processing events:',
          events.map((e) => e.event)
        );

        // Process events asynchronously to avoid cascading renders
        setTimeout(() => {
          events.forEach((event) => {
            console.log('🔄 [Event Processor] Handling event:', event.event, event.payload);
            handleStreamingEvent(event);
          });
        }, 0);
      }
    }, [chatMessages, handleStreamingEvent]);

    // Event Handlers
    const handleSend = useCallback(
      async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || status === 'streaming') return;

        // Show user message immediately (optimistic update)
        setOptimisticMessages((prev) => [
          ...prev,
          {
            id: `optimistic-${Date.now()}`,
            role: 'user',
            parts: [{ type: 'text', text: input }],
          },
        ]);

        const messageToSend = input;
        setInput('');

        // Send message to CursorRuleCraft AI Agent
        sendMessage({ text: messageToSend });
      },
      [input, sendMessage, setOptimisticMessages, status]
    );

    const handleRemoveMention = useCallback((path: string) => {
      setMentionedFiles((prev) => prev.filter((f) => f.path !== path));
    }, []);

    const handleFileDrop = useCallback(
      (file: { name: string; path: string; type: 'file' | 'directory' }) => {
        setMentionedFiles((prev) => {
          // Check if file is already mentioned
          const isAlreadyMentioned = prev.some((f) => f.path === file.path);
          if (isAlreadyMentioned) {
            return prev;
          }
          return [...prev, file];
        });
      },
      []
    );

    const resetSession = useCallback(() => {
      // Note: useChat doesn't have a built-in reset, so we'll need to reload the page
      // or implement custom reset logic. For now, we'll just clear mentioned files
      setOptimisticMessages([]);
      setMentionedFiles([]);
      setInput('');
      setIsGeneratingRules(false);
      setRuleContent('');
      processedMessageIdsRef.current.clear(); // Reset processed message tracking
      setEventOnlyMessageIds(new Set()); // Reset event-only message tracking
      onRuleGenerationEnd?.();
    }, [onRuleGenerationEnd]);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      handleFileDrop,
      resetSession,
    }));

    // Render
    return (
      <div className="relative flex h-full flex-col">
        {/* Messages Area */}
        {hasMessages && (
          <div
            className="scrollbar-hide relative overflow-y-auto p-4"
            style={{ height: 'calc(100vh - 57px - 81px - 170px)' }}
          >
            <div className="mx-auto max-w-3xl space-y-4">
              {/* Chat Messages */}
              {messages.map((message, index) => {
                // Handle user messages
                if (message.role === 'user') {
                  const firstTextPart = message.parts?.find(
                    (part): part is TextUIPart => part.type === 'text'
                  );
                  const userContent = firstTextPart?.text || '';

                  return (
                    <MessageBubble
                      key={message.id || `msg-${index}`}
                      role="user"
                      content={userContent}
                    />
                  );
                }

                // Handle assistant messages
                if (message.role === 'assistant') {
                  console.log(
                    '🎨 [Renderer] Assistant message:',
                    message.id,
                    'full message:',
                    JSON.stringify(message, null, 2)
                  );

                  // Don't render messages that contain only events
                  if (eventOnlyMessageIds.has(message.id)) {
                    console.log('🎨 [Renderer] Filtering out event-only message:', message.id);
                    return null;
                  }

                  // Handle streaming parts for assistant messages
                  if (Array.isArray(message.parts)) {
                    return message.parts.map((part, i) => {
                      if (part.type === 'text' && 'text' in part) {
                        return (
                          <MessageBubble
                            key={`${message.id || `msg-${index}`}-part-${i}`}
                            role="assistant"
                            content={part.text || ''}
                          />
                        );
                      }
                      return null;
                    });
                  }

                  // Fallback for normal assistant message content (backward compatibility)
                  const fallbackContent =
                    'content' in message ? (message as { content?: string }).content : '';
                  return (
                    <MessageBubble
                      key={message.id || `msg-${index}`}
                      role="assistant"
                      content={fallbackContent || ''}
                    />
                  );
                }

                return null;
              })}
            </div>
          </div>
        )}

        {/* Chat Input - Always positioned at bottom */}
        <div
          className={cn(
            'bg-background/95 supports-[backdrop-filter]:bg-background/60 absolute inset-x-0 backdrop-blur',
            'transition-all ease-out',
            hasMessages ? 'bottom-0' : 'inset-y-1/3'
          )}
        >
          <div className="mx-auto max-w-3xl p-4">
            <ChatInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSend={handleSend}
              hasMessages={hasMessages}
              selectedFile={selectedFile}
              onClearFileSelection={onClearFileSelection}
              mentionedFiles={mentionedFiles}
              onRemoveMention={handleRemoveMention}
              isLoading={status === 'streaming'}
            />
          </div>
        </div>
      </div>
    );
  }
);

AIChatPanel.displayName = 'AIChatPanel';
