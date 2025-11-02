import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { t } from '@lingui/macro';
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  CaretRightIcon,
  ChatCircleDotsIcon,
  FileCodeIcon,
  FolderIcon,
  FolderOpenIcon,
  SpinnerGapIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Button } from '@frontend/components/Button';
import { IconButton } from '@frontend/components/IconButton';
import { useRepositoryService } from '@frontend/hooks/useRepositoryService';
import { cn } from '@frontend/lib/utils';
import type { IFileTreeNode } from '@frontend/services/repository/repository';
import { KindState, type State } from '@frontend/types';
import type { Repository } from '@frontend/types/repository';

import { AIChatPanel, type AIChatPanelRef } from './_components/AIChatPanel';
import { FileTreePanel } from './_components/FileTreePanel';
import { RepositoryHeader } from './_components/RepositoryHeader';

dayjs.extend(relativeTime);

export const RepositoryDetailPage = () => {
  // Refs
  const aiChatPanelRef = useRef<AIChatPanelRef>(null);

  // State
  const [repository, setRepository] = useState<Repository | null>(null);
  const [state, setState] = useState<State>();

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<IFileTreeNode | null>(null);
  const [isGeneratingRules, setIsGeneratingRules] = useState(false);
  const [streamingRuleContent, setStreamingRuleContent] = useState('');
  const [ruleMeta, setRuleMeta] = useState<{
    id: string;
    rule_type: string;
    tech_stack: string[];
    filename: string;
    schema_version: string;
  } | null>(null);
  const [clarifyMessage, setClarifyMessage] = useState<{
    message: string;
    required_fields: string[];
  } | null>(null);

  // External Hooks
  const { id: repositoryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const repositoryService = useRepositoryService();

  // Setup drag and drop sensors with activation constraints
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Start drag after 8px movement to avoid conflicts with clicks
      },
    })
  );

  // Computed Values
  const lastSynced = repository?.lastSyncedAt
    ? dayjs(repository.lastSyncedAt).fromNow()
    : t`Never synced`;

  // Effects
  useEffect(() => {
    const fetchRepository = async () => {
      if (!repositoryId) {
        setState({ kind: KindState.ERROR, message: 'Not found' });
        return;
      }

      setState({ kind: KindState.LOADING });

      try {
        const result = await repositoryService.getRepositoryById(repositoryId);
        if (result.error) {
          throw result.error;
        }
        setRepository(result.data);
        setState({ kind: KindState.SUCCESSFUL, data: result.data });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load repository';
        setState({ kind: KindState.ERROR, message });
      }
    };

    void fetchRepository();
  }, [repositoryId, repositoryService]);

  // Event Handlers
  const handleBack = useCallback(() => {
    navigate('/dashboard/repositories');
  }, [navigate]);

  const handleSync = useCallback(async () => {
    if (!repositoryId) return;

    try {
      const result = await repositoryService.syncRepository(repositoryId);
      if (result.error) {
        throw result.error;
      }
      setRepository(result.data);
    } catch (err) {
      console.error('Failed to sync repository:', err);
    }
  }, [repositoryId, repositoryService]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current) {
      setActiveDragItem(active.data.current as IFileTreeNode);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // If dropped over the chat input
    if (over && over.id === 'chat-input-droppable' && active.data.current) {
      const fileData = active.data.current as {
        name: string;
        path: string;
        type: 'file' | 'directory';
      };
      aiChatPanelRef.current?.handleFileDrop(fileData);
    }

    // Clear the active drag item
    setActiveDragItem(null);
  }, []);

  const handleResetSession = useCallback(() => {
    aiChatPanelRef.current?.resetSession();
    setClarifyMessage(null); // Clear clarify message on session reset
  }, []);

  const handleRuleGenerationStart = useCallback(
    (meta: {
      id: string;
      rule_type: string;
      tech_stack: string[];
      filename: string;
      schema_version: string;
    }) => {
      setIsGeneratingRules(true);
      setRuleMeta(meta);
      setStreamingRuleContent('');
      setShowRightPanel(true);
    },
    []
  );

  const handleRuleGenerationUpdate = useCallback((content: string) => {
    setStreamingRuleContent(content);
  }, []);

  const handleRuleGenerationEnd = useCallback(() => {
    setIsGeneratingRules(false);
  }, []);

  const handleClarify = useCallback((payload: { message: string; required_fields: string[] }) => {
    setClarifyMessage(payload);
    // Clear any previous rule content and meta when clarifying
    setStreamingRuleContent('');
    setRuleMeta(null);
  }, []);

  // Early Returns
  if (state?.kind === KindState.LOADING) {
    return (
      <div className="flex h-screen items-center justify-center">
        <SpinnerGapIcon size={48} className="text-primary animate-spin" />
      </div>
    );
  }

  if (state?.kind === KindState.ERROR) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-error text-lg">{state.message || 'Repository not found'}</p>
        <Button onClick={handleBack}>{t`Back to Repositories`}</Button>
      </div>
    );
  }

  if (!repository) {
    return null;
  }

  // Render
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="bg-background flex h-screen flex-col">
        {/* Header */}
        <RepositoryHeader
          repository={repository}
          lastSynced={lastSynced}
          onBack={handleBack}
          onSync={handleSync}
        />

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - File Tree */}
          <aside
            className={cn(
              'border-border flex flex-col border-r transition-all',
              showLeftPanel ? 'min-w-64' : 'w-fit'
            )}
          >
            <div className="border-border flex h-[57px] items-center justify-between border-b px-4 py-3">
              {showLeftPanel ? (
                <>
                  <div className="flex items-center gap-2">
                    <FolderOpenIcon size={20} className="text-primary" />
                    <span className="font-semibold">{t`Files`}</span>
                  </div>
                  <IconButton
                    onClick={() => setShowLeftPanel(false)}
                    label={t`Hide files`}
                    icon={<ArrowLeftIcon size={18} />}
                    hoverable={false}
                  />
                </>
              ) : (
                <IconButton
                  onClick={() => setShowLeftPanel(true)}
                  label={t`Show files`}
                  icon={<FolderOpenIcon size={18} />}
                  hoverable={false}
                />
              )}
            </div>

            <div
              className={cn(
                'scrollbar-macos flex-1 overflow-y-auto',
                showLeftPanel ? 'min-w-64' : 'w-0'
              )}
            >
              <FileTreePanel repository={repository} />
            </div>
          </aside>

          {/* Center Panel - AI Chat */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="border-border flex h-[57px] items-center justify-between border-b px-4 py-3">
              <div className="flex shrink items-center gap-2 truncate">
                <ChatCircleDotsIcon size={20} className="text-primary" />
                <span className="font-semibold">{t`AI Assistant`}</span>
              </div>
              <div className="flex items-center gap-2">
                <IconButton
                  onClick={handleResetSession}
                  label={t`Reset session`}
                  icon={<ArrowClockwiseIcon size={18} />}
                  hoverable={false}
                />
                <div className="bg-border h-5 w-px" />
                <IconButton
                  onClick={() => setShowRightPanel((prev) => !prev)}
                  label={showRightPanel ? t`Hide rules` : t`Show rules`}
                  icon={showRightPanel ? <CaretRightIcon size={18} /> : <FileCodeIcon size={18} />}
                  hoverable={false}
                />
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <AIChatPanel
                ref={aiChatPanelRef}
                repository={repository}
                onRuleGenerationStart={handleRuleGenerationStart}
                onRuleGenerationUpdate={handleRuleGenerationUpdate}
                onRuleGenerationEnd={handleRuleGenerationEnd}
                onClarify={handleClarify}
              />
            </div>
          </main>

          {/* Right Panel - Cursor Rules */}
          <aside
            className={cn(
              'border-border flex flex-col border-l transition-all',
              showRightPanel ? 'min-w-80' : 'w-fit'
            )}
          >
            <div className="border-border flex h-[57px] items-center justify-between border-b px-4 py-3">
              {showRightPanel ? (
                <>
                  <div className="flex items-center gap-2">
                    <FileCodeIcon size={20} className="text-primary" />
                    <span className="font-semibold">
                      {isGeneratingRules ? 'Generating Rules...' : 'Cursor Rules'}
                    </span>
                  </div>
                  <IconButton
                    onClick={() => setShowRightPanel(false)}
                    label={t`Hide rules`}
                    icon={<CaretRightIcon size={18} />}
                    hoverable={false}
                  />
                </>
              ) : (
                <IconButton
                  onClick={() => setShowRightPanel(true)}
                  label={t`Show rules`}
                  icon={<FileCodeIcon size={18} />}
                  hoverable={false}
                />
              )}
            </div>

            {showRightPanel && (
              <div className="scrollbar-macos flex-1 overflow-y-auto p-4">
                {clarifyMessage ? (
                  <div className="space-y-4">
                    <div className="text-warning">
                      <h3 className="mb-2 font-semibold">Clarification Needed</h3>
                      <p className="text-sm">{clarifyMessage.message}</p>
                      {clarifyMessage.required_fields.length > 0 && (
                        <div className="mt-2">
                          <p className="text-muted-foreground text-xs">Required information:</p>
                          <ul className="mt-1 text-xs">
                            {clarifyMessage.required_fields.map((field) => (
                              <li key={field} className="text-warning">
                                • {field.replace('_', ' ')}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ) : isGeneratingRules ? (
                  <div className="space-y-4">
                    <div className="text-muted-foreground text-sm">
                      <p>
                        <strong>Rule Type:</strong> {ruleMeta?.rule_type}
                      </p>
                      <p>
                        <strong>Filename:</strong> {ruleMeta?.filename}
                      </p>
                      {ruleMeta?.tech_stack && ruleMeta.tech_stack.length > 0 && (
                        <p>
                          <strong>Tech Stack:</strong> {ruleMeta.tech_stack.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {streamingRuleContent || 'Generating...'}
                      </pre>
                    </div>
                  </div>
                ) : streamingRuleContent ? (
                  <div className="space-y-4">
                    <div className="text-muted-foreground text-sm">
                      <p>
                        <strong>Rule Type:</strong> {ruleMeta?.rule_type}
                      </p>
                      <p>
                        <strong>Filename:</strong> {ruleMeta?.filename}
                      </p>
                      {ruleMeta?.tech_stack && ruleMeta.tech_stack.length > 0 && (
                        <p>
                          <strong>Tech Stack:</strong> {ruleMeta.tech_stack.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border p-3">
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {streamingRuleContent}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-center">
                    <p className="text-sm">
                      Cursor rules will appear here when generated by the AI Agent.
                    </p>
                    <p className="mt-2 text-xs">
                      Ask the AI Agent to create cursor rules for your project!
                    </p>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem && (
          <div className="bg-primary/10 border-primary flex items-center gap-2 rounded-lg border-2 px-3 py-2 shadow-lg backdrop-blur-sm">
            {activeDragItem.type === 'directory' ? (
              <FolderIcon size={16} className="text-primary" />
            ) : (
              <FileCodeIcon size={16} className="text-primary" />
            )}
            <span className="text-foreground text-sm font-medium">{activeDragItem.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};
