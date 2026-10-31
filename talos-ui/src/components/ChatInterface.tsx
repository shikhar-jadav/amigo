'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, MessageData, MessagePart } from './ChatMessage';
import { InterruptData } from './chat/InterruptCard';
import { Composer } from './Composer';
import { ToolEventData } from './StepLine';
import { WorkspaceCanvasDrawer } from './WorkspaceCanvasDrawer';
import {
  Globe,
  ChevronLeft,
  Layers,
  Bot,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Calendar,
  Activity,
  Sliders,
} from 'lucide-react';
import { ActiveSubAgentsBar } from './ActiveSubAgentsBar';
import type { SubAgentExecution } from './SubAgentCard';
import { useProactive } from '@/context/ProactiveContext';
import { HeartbeatStatusBadge } from './proactive/HeartbeatStatusBadge';
import { ProactiveToast } from './proactive/ProactiveToast';
import { AutomationsDrawer } from './proactive/AutomationsDrawer';
import { ApprovalModal } from './proactive/ApprovalModal';

function buildSubAgentMessages(execution: SubAgentExecution): { userMessage: MessageData; assistantMessage: MessageData } {
  const isRunning = execution.status === 'running';
  const isCompleted = execution.status === 'completed';

  const userMessage: MessageData = {
    id: `sub-user-${execution.execution_id}`,
    role: 'user',
    content: execution.task,
  };

  const assistantParts: MessagePart[] = [];

  const trace = [
    ...(execution.tool_calls || []).map((tool, index) => ({
      kind: 'tool' as const,
      traceIndex: tool.trace_index ?? index,
      index,
      tool,
    })),
    ...(execution.steps || []).map((step, index) => ({
      kind: 'step' as const,
      traceIndex: step.trace_index ?? (execution.tool_calls || []).length + index,
      index,
      step,
    })),
  ].sort((a, b) => a.traceIndex - b.traceIndex);

  for (const item of trace) {
    if (item.kind === 'tool') {
      const tc = item.tool;
      assistantParts.push({
        type: 'tool',
        tool: {
          toolCallId: tc.toolCallId || `tc-${item.index}`,
          toolName: tc.name,
          args: tc.args || {},
          output: tc.result,
          status: tc.status === 'failed' ? 'failed' : tc.status === 'completed' || isCompleted ? 'completed' : 'running',
        },
      });
    } else {
      const s = item.step;
      const isThought = s.description.startsWith('Thinking:') || s.description.startsWith('Reasoning:');
      const cleanDesc = s.description.replace(/^(Thinking|Reasoning):\s*/, '').trim();

      assistantParts.push({ type: 'text', text: isThought ? cleanDesc : s.description });
    }
  }

  if (execution.files && execution.files.length > 0) {
    for (const f of execution.files) {
      assistantParts.push({
        type: 'tool',
        tool: {
          toolCallId: `file-${f.path}`,
          toolName: 'workspace_show_file',
          args: { file_path: f.path, title: f.path.split('/').pop() || 'Deliverable' },
          output: JSON.stringify({ status: 'shown', file_path: f.path, title: f.path.split('/').pop() }),
          status: 'completed',
        },
      });
    }
  }

  if (execution.result) {
    assistantParts.push({
      type: 'text',
      text: execution.result,
    });
  }

  const assistantMessage: MessageData = {
    id: `sub-assistant-${execution.execution_id}`,
    role: 'assistant',
    content: execution.result || '',
    parts: assistantParts,
    isStreaming: isRunning,
  };

  return { userMessage, assistantMessage };
}

function getWorkspacePathFromToolResult(
  toolName: string,
  args: Record<string, unknown> | undefined,
  output: string,
): string | null {
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(output);
  } catch {
    return toolName === 'workspace_write_file'
      ? String(args?.relative_path || '') || null
      : String(args?.file_path || '') || null;
  }

  if (toolName === 'workspace_show_file') {
    if (result.status !== 'shown') return null;
    return String(result.file_path || args?.file_path || '') || null;
  }
  if (toolName === 'workspace_write_file') {
    if (result.status !== 'success') return null;
    return String(result.path || args?.relative_path || '') || null;
  }
  return null;
}

function getEmbeddedBrowserTarget(output: string): { url: string; title: string } | null {
  try {
    const result = JSON.parse(output) as { status?: string; kind?: string; url?: string; title?: string };
    if (result.status !== 'opened' || result.kind !== 'embedded_browser' || typeof result.url !== 'string') return null;
    const parsed = new URL(result.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { url: parsed.toString(), title: typeof result.title === 'string' ? result.title : parsed.hostname };
  } catch {
    return null;
  }
}

function failUnfinishedTools(
  tools: ToolEventData[],
  parts: MessagePart[],
  reason: string,
): number {
  let failedCount = 0;
  for (const tool of tools) {
    if (tool.status !== 'running') continue;
    tool.status = 'failed';
    tool.output = reason;
    failedCount += 1;
  }
  for (const part of parts) {
    if (part.type === 'tool' && part.tool?.status === 'running') {
      part.tool.status = 'failed';
      part.tool.output = reason;
    }
  }
  return failedCount;
}

function cleanErrorMessage(rawError?: string): string {
  if (!rawError) return 'Unknown error occurred.';
  const lower = rawError.toLowerCase();
  if (lower.includes('<!doctype html') || lower.includes('<html') || lower.includes('<title>blocked</title>') || lower.includes('waf') || lower.includes('cloudflare')) {
    const titleMatch = rawError.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Blocked';
    return `Upstream Security Shield (${title}): The upstream provider gateway blocked the connection with a security challenge (HTTP 403). The request was intercepted safely by the Talos resilience shield.`;
  }
  // Strip any embedded html tags
  const stripped = rawError.replace(/<[^>]+>/g, '').trim();
  return stripped.length > 300 ? stripped.substring(0, 300) + '...' : (stripped || 'An unexpected error occurred.');
}

interface ChatInterfaceProps {
  currentSessionId: string;
  initialMessages?: MessageData[];
  onFirstMessageSent?: (threadId: string, firstPrompt: string, userMsg: MessageData, assistantMsg: MessageData) => void;
  onUpdateMessages?: (threadId: string, messages: MessageData[]) => void;
  inspectingSubAgentId?: string | null;
  onInspectSubAgentChange?: (id: string | null) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  currentSessionId,
  initialMessages = [],
  onFirstMessageSent,
  onUpdateMessages,
  inspectingSubAgentId,
  onInspectSubAgentChange,
}) => {
  const [messages, setMessages] = useState<MessageData[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activePort, setActivePort] = useState<number | null>(null);
  const [selectedDrawerFile, setSelectedDrawerFile] = useState<string | null>(null);
  const [embeddedBrowser, setEmbeddedBrowser] = useState<{ url: string; title: string } | null>(null);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const [browserCanvasExecutionId, setBrowserCanvasExecutionId] = useState<string | null>(null);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState<number | null>(null);
  const [activeSubAgents, setActiveSubAgents] = useState<SubAgentExecution[]>([]);
  const [inspectingExecution, setInspectingExecution] = useState<SubAgentExecution | null>(null);
  const [prevSubAgentPropId, setPrevSubAgentPropId] = useState(inspectingSubAgentId);
  const { activeTaskCount, openDrawer: openAutomationsDrawer, latestNotification } = useProactive();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const subAgentEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const parentScrollTopRef = useRef<number>(0);
  const isRestoringScrollRef = useRef<boolean>(false);
  const previousSessionIdRef = useRef(currentSessionId);
  const messagesSessionIdRef = useRef(currentSessionId);
  const lastUsedModelRef = useRef<string>(
    typeof window !== 'undefined'
      ? localStorage.getItem('talos_selected_model') || 'glm-5-2'
      : 'glm-5-2'
  );
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  // Fetch historical proactive notifications for currentSessionId
  useEffect(() => {
    let isCancelled = false;
    const fetchThreadNotifications = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_TALOS_BACKEND_URL || 'http://localhost:8001';
        const res = await fetch(`${backendUrl}/api/proactive/notifications?thread_id=${encodeURIComponent(currentSessionId)}&limit=20`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isCancelled && data.notifications && data.notifications.length > 0) {
          const proactiveMsgs: MessageData[] = data.notifications.map((n: { id: string; notification_type: 'alert' | 'scheduled_report' | 'health_check'; title: string; content_markdown: string; artifact_path?: string; actions?: Array<{ label: string; action: string; path?: string }> }) => ({
            id: `proactive-${n.id}`,
            role: 'assistant' as const,
            content: n.content_markdown || n.title,
            proactive: {
              type: n.notification_type,
              title: n.title,
              markdown: n.content_markdown,
              artifactPath: n.artifact_path,
              actions: n.actions,
            },
          }));

          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = proactiveMsgs.filter((m) => !existingIds.has(m.id));
            if (newOnes.length === 0) return prev;
            return [...prev, ...newOnes];
          });
        }
      } catch {
        // Backend starting up
      }
    };

    fetchThreadNotifications();
    return () => {
      isCancelled = true;
    };
  }, [currentSessionId]);

  // Live SSE proactive notification delivered to chat
  useEffect(() => {
    if (!latestNotification) return;
    if (latestNotification.thread_id && latestNotification.thread_id !== currentSessionId) return;

    const notifMsgId = `proactive-${latestNotification.id}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages((prev) => {
      if (prev.some((m) => m.id === notifMsgId)) return prev;
      const newMsg: MessageData = {
        id: notifMsgId,
        role: 'assistant',
        content: latestNotification.content_markdown || latestNotification.title,
        proactive: {
          type: latestNotification.notification_type,
          title: latestNotification.title,
          markdown: latestNotification.content_markdown,
          artifactPath: latestNotification.artifact_path,
          actions: latestNotification.actions,
        },
      };
      return [...prev, newMsg];
    });
  }, [latestNotification, currentSessionId]);

  useEffect(() => {
    if (previousSessionIdRef.current === currentSessionId) return;
    previousSessionIdRef.current = currentSessionId;
    setSelectedDrawerFile(null);
    setIsDrawerOpen(false);
    setActivePort(null);
    setEmbeddedBrowser(null);
    setBrowserCanvasExecutionId(null);
    setSelectedScreenshotIndex(null);
  }, [currentSessionId]);

  const findExecutionById = useCallback(
    (id?: string | null): SubAgentExecution | null => {
      if (!id) return null;
      const inActive = activeSubAgents.find((e) => e.execution_id === id);
      if (inActive) return inActive;
      for (const msg of messages) {
        const part = (msg.parts || []).find((p) => p.type === 'subagent' && p.subagent?.execution_id === id);
        if (part?.subagent) return part.subagent;
      }
      return null;
    },
    [activeSubAgents, messages]
  );

  if (inspectingSubAgentId !== prevSubAgentPropId) {
    setPrevSubAgentPropId(inspectingSubAgentId);
    setInspectingExecution(inspectingSubAgentId ? findExecutionById(inspectingSubAgentId) : null);
  }

  // Sync state if initialMessages changes externally (e.g. switching threads)
  const messagesRef = useRef<MessageData[]>(initialMessages);
  const onUpdateMessagesRef = useRef(onUpdateMessages);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    onUpdateMessagesRef.current = onUpdateMessages;
  }, [onUpdateMessages]);

  useEffect(() => {
    // Re-sync messages whenever thread changes or initialMessages are loaded from cloud/backend
    if (messagesSessionIdRef.current !== currentSessionId) {
      messagesSessionIdRef.current = currentSessionId;
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
      activeRunIdRef.current = null;
      activeAssistantMessageIdRef.current = null;
      setIsStreaming(false);
      messagesRef.current = initialMessages;
      setMessages(initialMessages);
    } else if (!isStreaming) {
      messagesRef.current = initialMessages;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(initialMessages);
    }
  }, [currentSessionId, initialMessages, isStreaming]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      streamAbortControllerRef.current?.abort();
    };
  }, []);

  const syncToParentImmediate = (msgs: MessageData[]) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    if (onUpdateMessagesRef.current) {
      onUpdateMessagesRef.current(currentSessionId, msgs);
    }
  };

  const syncToParentThrottled = () => {
    if (!onUpdateMessagesRef.current || syncTimeoutRef.current) return;
    syncTimeoutRef.current = setTimeout(() => {
      syncTimeoutRef.current = null;
      if (onUpdateMessagesRef.current) {
        onUpdateMessagesRef.current(currentSessionId, messagesRef.current);
      }
    }, 400);
  };

  const updateAndSyncMessages = (
    updater: (prev: MessageData[]) => MessageData[],
    immediate: boolean = false
  ) => {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
    if (immediate) {
      syncToParentImmediate(next);
    } else {
      syncToParentThrottled();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleStop = () => {
    const activeMessageId = activeAssistantMessageIdRef.current;
    const activeRunId = activeRunIdRef.current;
    if (activeRunId) {
      void fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_run_id: activeRunId, thread_id: currentSessionId }),
      }).catch((error) => console.warn('Could not stop Talos run:', error));
    }
    streamAbortControllerRef.current?.abort();
    streamAbortControllerRef.current = null;
    activeRunIdRef.current = null;
    activeAssistantMessageIdRef.current = null;
    setIsStreaming(false);
    if (activeMessageId) {
      updateAndSyncMessages(
        (prev) =>
          prev.map((message) =>
            message.id === activeMessageId ? { ...message, isStreaming: false } : message
          ),
        true
      );
    }
  };

  const handleSendPrompt = async (promptText: string, model: string) => {
    if (!promptText.trim() || streamAbortControllerRef.current) return;
    lastUsedModelRef.current = model || 'talos-code';

    const userMsgId = `msg-user-${Date.now()}`;
    const assistantMsgId = `msg-assistant-${Date.now()}`;
    const runId = globalThis.crypto.randomUUID();
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;
    activeRunIdRef.current = runId;
    activeAssistantMessageIdRef.current = assistantMsgId;

    const initialUserMsg: MessageData = { id: userMsgId, role: 'user', content: promptText };
    const initialAssistantMsg: MessageData = { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true, toolsExecuted: [], parts: [] };

    const newMessages: MessageData[] = [
      ...messagesRef.current,
      initialUserMsg,
      initialAssistantMsg,
    ];

    messagesRef.current = newMessages;
    setMessages(newMessages);
    setIsStreaming(true);

    const isFirstTurn = messagesRef.current.length === 2;
    if (isFirstTurn && onFirstMessageSent) {
      onFirstMessageSent(currentSessionId, promptText, initialUserMsg, initialAssistantMsg);
    } else {
      syncToParentImmediate(newMessages);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, thread_id: currentSessionId, model, run_id: runId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        let friendlyMessage = errJson.error || `Failed to stream response (HTTP ${response.status})`;
        if (response.status === 402) {
          friendlyMessage = errJson.error || 'Your credit balance is exhausted (0 credits remaining). Please add credits or renew your subscription in Settings > Usage to continue.';
        } else if (response.status === 401) {
          friendlyMessage = errJson.error || 'Please sign in or create an account to start chatting with Talos.';
        } else if (response.status === 403) {
          friendlyMessage = errJson.error || 'You do not own this conversation. Please start a new chat.';
        }
        throw new Error(friendlyMessage);
      }

      let reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available');

      const decoder = new TextDecoder();
      let accumulatedText = '';
      const activeTools: ToolEventData[] = [];
      const messageParts: MessagePart[] = [];
      let pendingLine = '';
      let pendingEventId: number | null = null;
      let lastEventId = 0;
      let runFinished = false;
      let runStatusEventReceived = false;

      while (!runFinished) {
        const { done, value } = await reader.read();
        if (done) {
          if (runFinished || controller.signal.aborted) break;
          let reattached = false;
          let reconnectError = 'The stream disconnected while Talos was still working.';
          for (let attempt = 0; attempt < 8 && !reattached && !controller.signal.aborted; attempt += 1) {
            try {
              await new Promise((resolve) => setTimeout(resolve, Math.min(1000 + attempt * 750, 6000)));
              const resumedResponse = await fetch(
                `/api/chat?run_id=${encodeURIComponent(runId)}&after=${lastEventId}`,
                { signal: controller.signal },
              );
              if (!resumedResponse.ok) {
                const errorBody = await resumedResponse.json().catch(() => ({}));
                throw new Error(errorBody.error || `Could not reconnect to Talos run (${resumedResponse.status})`);
              }
              const resumedReader = resumedResponse.body?.getReader();
              if (!resumedReader) throw new Error('No readable stream available after reconnect');
              reader = resumedReader;
              pendingLine = '';
              pendingEventId = null;
              reattached = true;
            } catch (error) {
              if (controller.signal.aborted) break;
              reconnectError = error instanceof Error ? error.message : String(error);
            }
          }
          if (!reattached && !controller.signal.aborted) {
            throw new Error(`${reconnectError} Talos may still be running; retry this message to reconnect.`);
          }
          continue;
        }

        const chunk = pendingLine + decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        pendingLine = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          if (line.startsWith('id: ')) {
            const eventId = Number.parseInt(line.slice(4), 10);
            pendingEventId = Number.isFinite(eventId) ? eventId : null;
            continue;
          }
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (pendingEventId !== null) {
                lastEventId = pendingEventId;
                pendingEventId = null;
              }
              if (data.type === 'RUN_FINISHED') {
                runFinished = true;
              } else if (data.type === 'TEXT_DELTA') {
                const delta =
                  typeof data.delta === 'string'
                    ? data.delta
                    : Array.isArray(data.delta)
                      ? data.delta
                          .map((part: { text?: unknown }) => typeof part.text === 'string' ? part.text : '')
                          .join('')
                      : '';
                if (!delta) continue;
                accumulatedText += delta;
                const lastPart = messageParts[messageParts.length - 1];
                if (lastPart && lastPart.type === 'text') {
                  lastPart.text = (lastPart.text || '') + delta;
                } else {
                  messageParts.push({ type: 'text', text: delta });
                }
              } else if (data.type === 'TOOL_CALL') {
                if (data.toolName === 'ask_question' || data.toolName === 'delegate_to_subagent') {
                  // ask_question raises GraphInterrupt → handled via INTERRUPT event
                  // delegate_to_subagent → handled via SUBAGENT_STARTED event
                  continue;
                }
                const toolCallId = data.toolCallId || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const newTool: ToolEventData = {
                  toolCallId,
                  toolName: data.toolName,
                  args: data.args,
                  status: 'running',
                };
                activeTools.push(newTool);
                messageParts.push({ type: 'tool', tool: newTool });

              } else if (data.type === 'SUBAGENT_STARTED') {
                const exec: SubAgentExecution = {
                  execution_id: data.execution_id || `exec-${Date.now()}`,
                  plugin_id: data.plugin_id || '',
                  plugin_type: 'agent',
                  agent_name: data.agent_name || 'Sub-Agent',
                  agent_slug: data.agent_slug || '',
                  task: data.task || '',
                  status: 'running',
                  started_at: new Date().toISOString(),
                  steps: [], files: [], tool_calls: [], logs: [], screenshots: []
                };
                setActiveSubAgents(prev => [exec, ...prev.filter(e => e.execution_id !== exec.execution_id)]);
                
                // Add rich SubAgentCard part to message flow if not already present
                const existingSubagentPart = messageParts.find(
                  p => p.type === 'subagent' && p.subagent?.execution_id === exec.execution_id
                );
                if (!existingSubagentPart) {
                  messageParts.push({
                    type: 'subagent',
                    subagent: { ...exec }
                  });
                }
              } else if (data.type === 'SUBAGENT_STEP') {
                const newStep = { id: data.step_id || `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, description: data.description, status: 'running' as const, started_at: new Date().toISOString(), trace_index: data.trace_index };
                const updateStepsList = (prevSteps: NonNullable<SubAgentExecution['steps']> = []) => {
                  const existingIdx = prevSteps.findIndex(s => s.id === data.step_id);
                  if (existingIdx >= 0) {
                    const next = [...prevSteps];
                    next[existingIdx] = { ...next[existingIdx], description: data.description, status: 'running' };
                    return next;
                  }
                  return [...prevSteps, newStep];
                };

                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? { ...e, steps: updateStepsList(e.steps) }
                    : e
                ));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent = { ...targetPart.subagent, steps: updateStepsList(targetPart.subagent.steps) };
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  steps: updateStepsList(prev.steps)
                } : prev);
              } else if (data.type === 'SUBAGENT_STEP_DONE') {
                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? { ...e, steps: (e.steps || []).map(s => s.id === data.step_id ? { ...s, status: 'completed' } : s) }
                    : e
                ));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent = {
                    ...targetPart.subagent,
                    steps: (targetPart.subagent.steps || []).map(s => s.id === data.step_id ? { ...s, status: 'completed' } : s),
                  };
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  steps: (prev.steps || []).map(s => s.id === data.step_id ? { ...s, status: 'completed' } : s)
                } : prev);
              } else if (data.type === 'SUBAGENT_TOOL') {
                const newTool = {
                  toolCallId: data.tool_call_id || `sat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  name: data.tool_name,
                  status: 'running' as const,
                  args: data.args,
                  trace_index: data.trace_index,
                };
                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? { ...e, tool_calls: [...(e.tool_calls || []), newTool] }
                    : e
                ));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent = {
                    ...targetPart.subagent,
                    tool_calls: [...(targetPart.subagent.tool_calls || []), newTool],
                  };
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  tool_calls: [...(prev.tool_calls || []), newTool]
                } : prev);
              } else if (data.type === 'SUBAGENT_TOOL_DONE') {
                setActiveSubAgents(prev => prev.map(e => {
                  if (e.execution_id !== data.execution_id) return e;
                  const tools = [...(e.tool_calls || [])];
                  const lastIdx = data.tool_call_id
                    ? tools.findIndex(t => t.toolCallId === data.tool_call_id)
                    : tools.map(t => t.name).lastIndexOf(data.tool_name);
                  if (lastIdx !== -1) {
                    tools[lastIdx] = { ...tools[lastIdx], status: 'completed', result: data.result };
                  }
                  return { ...e, tool_calls: tools };
                }));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent && targetPart.subagent.tool_calls) {
                  const tools = [...targetPart.subagent.tool_calls];
                  const lastIdx = data.tool_call_id
                    ? tools.findIndex(t => t.toolCallId === data.tool_call_id)
                    : tools.map(t => t.name).lastIndexOf(data.tool_name);
                  if (lastIdx !== -1) {
                    tools[lastIdx] = { ...tools[lastIdx], status: 'completed', result: data.result };
                  }
                  targetPart.subagent = { ...targetPart.subagent, tool_calls: tools };
                }
                setInspectingExecution(prev => {
                  if (!prev || prev.execution_id !== data.execution_id) return prev;
                  const tools = [...(prev.tool_calls || [])];
                  const lastIdx = data.tool_call_id
                    ? tools.findIndex(t => t.toolCallId === data.tool_call_id)
                    : tools.map(t => t.name).lastIndexOf(data.tool_name);
                  if (lastIdx !== -1) {
                    tools[lastIdx] = { ...tools[lastIdx], status: 'completed', result: data.result };
                  }
                  return { ...prev, tool_calls: tools };
                });
              } else if (data.type === 'SUBAGENT_FILE') {
                const file = { path: data.path, action: data.action || 'read' };
                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? {
                        ...e,
                        files: (e.files || []).some((existing) => existing.path === file.path)
                          ? e.files
                          : [...(e.files || []), file],
                      }
                    : e
                ));
                setWorkspaceRefreshKey((key) => key + 1);
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent = {
                    ...targetPart.subagent,
                    files: (targetPart.subagent.files || []).some((existing) => existing.path === file.path)
                      ? targetPart.subagent.files
                      : [...(targetPart.subagent.files || []), file],
                  };
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  files: (prev.files || []).some((existing) => existing.path === file.path)
                    ? prev.files
                    : [...(prev.files || []), file],
                } : prev);
              } else if (data.type === 'SUBAGENT_LOG') {
                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? { ...e, logs: [...(e.logs || []), data.message] }
                    : e
                ));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent = {
                    ...targetPart.subagent,
                    logs: [...(targetPart.subagent.logs || []), data.message],
                  };
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  logs: [...(prev.logs || []), data.message]
                } : prev);
              } else if (data.type === 'SUBAGENT_SCREENSHOT') {
                const shot = {
                  url: data.url,
                  title: data.title,
                  image: data.screenshot,
                  timestamp: new Date().toISOString()
                };
                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? { ...e, screenshots: [...(e.screenshots || []), shot] }
                    : e
                ));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent = {
                    ...targetPart.subagent,
                    screenshots: [...(targetPart.subagent.screenshots || []), shot],
                  };
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  screenshots: [...(prev.screenshots || []), shot]
                } : prev);

                // Auto-route screenshots to Canvas
                setBrowserCanvasExecutionId(data.execution_id);
                setSelectedScreenshotIndex(null);
                setIsDrawerOpen(true);
              } else if (data.type === 'SUBAGENT_COMPLETED') {
                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? {
                        ...e,
                        status: 'completed',
                        result: data.result,
                        files: data.files || e.files,
                        completed_at: new Date().toISOString(),
                      }
                    : e
                ));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent = {
                    ...targetPart.subagent,
                    status: 'completed',
                    result: data.result,
                    files: data.files || targetPart.subagent.files,
                    completed_at: new Date().toISOString(),
                  };
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  status: 'completed',
                  result: data.result,
                  files: data.files || prev.files,
                  completed_at: new Date().toISOString()
                } : prev);
                if (Array.isArray(data.files) && data.files.length > 0) {
                  setWorkspaceRefreshKey((key) => key + 1);
                }
              } else if (data.type === 'SUBAGENT_FAILED') {
                const cleanErr = cleanErrorMessage(data.error);
                setActiveSubAgents(prev => prev.map(e =>
                  e.execution_id === data.execution_id
                    ? { ...e, status: 'failed', error: cleanErr }
                    : e
                ));
                const targetPart = messageParts.find(p => p.type === 'subagent' && p.subagent?.execution_id === data.execution_id);
                if (targetPart && targetPart.subagent) {
                  targetPart.subagent.status = 'failed';
                  targetPart.subagent.error = cleanErr;
                }
                setInspectingExecution(prev => prev && prev.execution_id === data.execution_id ? {
                  ...prev,
                  status: 'failed',
                  error: cleanErr
                } : prev);
              } else if (data.type === 'INTERRUPT') {
                runFinished = true;
                // Backend sends exactly one INTERRUPT per ask_question call.
                // Deduplicate by interruptId to be safe.
                const intId = data.interruptId || `int_${Date.now()}`;
                const alreadyExists = messageParts.some(
                  (p) => p.type === 'interrupt' && p.interrupt?.interruptId === intId
                );
                if (!alreadyExists) {
                  messageParts.push({
                    type: 'interrupt',
                    interrupt: {
                      interruptId: intId,
                      questions: data.questions || [],
                      status: 'pending',
                    },
                  });
                }
              } else if (data.type === 'RUN_ERROR' || data.type === 'RUN_PAUSED') {
                runFinished = true;
                runStatusEventReceived = true;
                const statusMessage = data.type === 'RUN_ERROR'
                  ? `\n\nAgent run failed: ${cleanErrorMessage(data.error)}`
                  : `\n\n${data.message || 'Agent run paused.'}`;
                failUnfinishedTools(activeTools, messageParts, statusMessage.trim());
                accumulatedText += statusMessage;
                messageParts.push({ type: 'text', text: statusMessage });
              } else if (data.type === 'RUN_NOT_FOUND') {
                runFinished = true;
                runStatusEventReceived = true;
                const statusMessage = '\n\nTalos could not reconnect to this run. Any files already created remain in the workspace.';
                accumulatedText += statusMessage;
                messageParts.push({ type: 'text', text: statusMessage });
              } else if (data.type === 'TOOL_CALL_RESULT') {
                if (data.toolName === 'delegate_to_subagent' || data.toolName === 'ask_question') {
                  // Handled via SUBAGENT_COMPLETED or INTERRUPT
                  continue;
                }
                // Strict matching to prevent cross-contamination
                let existing = activeTools.find((t) => t.toolCallId && t.toolCallId === data.toolCallId);
                if (!existing) {
                  existing = activeTools.find((t) => t.toolName === data.toolName && t.status === 'running');
                }
                if (!existing) {
                  existing = activeTools.find((t) => t.status === 'running');
                }
                if (existing) {
                  existing.output = data.output;
                  existing.status = 'completed';
                }

                // Update the part in messageParts as well
                const targetPart = messageParts.find(
                  (p) =>
                    p.type === 'tool' &&
                    p.tool &&
                    ((data.toolCallId && p.tool.toolCallId === data.toolCallId) ||
                      (p.tool.toolName === data.toolName && p.tool.status === 'running') ||
                      p.tool === existing)
                );
                if (targetPart && targetPart.tool) {
                  targetPart.tool.output = data.output;
                  targetPart.tool.status = 'completed';
                }

                if (data.toolName === 'workspace_write_file' || data.toolName === 'workspace_show_file') {
                  const filePath = getWorkspacePathFromToolResult(data.toolName, existing?.args, data.output);
                  if (filePath) {
                    setSelectedDrawerFile(filePath);
                    setIsDrawerOpen(true);
                    setWorkspaceRefreshKey((key) => key + 1);
                  }
                }

                if (data.toolName === 'workspace_open_browser') {
                  const target = getEmbeddedBrowserTarget(data.output);
                  if (target) {
                    setEmbeddedBrowser(target);
                    setIsDrawerOpen(true);
                  }
                }

                // Check if output reveals an active port
                try {
                  const parsed = JSON.parse(data.output);
                  if (parsed.detected_port) {
                    setActivePort(parsed.detected_port);
                    setIsDrawerOpen(true);
                  }
                } catch {}
              }
            } catch {
              // Ignore non-json lines
            }

            updateAndSyncMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: accumulatedText,
                      parts: [...messageParts],
                      toolsExecuted: [...activeTools],
                    }
                  : m
              )
            );
          }
        }
      }

      const unfinishedReason = runFinished
        ? 'Agent run ended before this tool returned a result.'
        : 'The response stream closed before this tool returned a result.';
      const unfinishedCount = failUnfinishedTools(activeTools, messageParts, unfinishedReason);
      if (unfinishedCount > 0 && !accumulatedText.includes('Agent run failed:')) {
        const statusMessage = `\n\n${unfinishedReason}`;
        accumulatedText += statusMessage;
        messageParts.push({ type: 'text', text: statusMessage });
      }
      const hasPendingInterrupt = messageParts.some((part) => part.type === 'interrupt' && part.interrupt?.status === 'pending');
      if (!runFinished && !runStatusEventReceived && !hasPendingInterrupt && unfinishedCount === 0) {
        const statusMessage = '\n\nThe response stream ended before Talos marked this run complete.';
        accumulatedText += statusMessage;
        messageParts.push({ type: 'text', text: statusMessage });
      }
      if (runFinished) void reader.cancel().catch(() => undefined);

      updateAndSyncMessages(
        (prev) => prev.map((m) => m.id === assistantMsgId
          ? { ...m, content: accumulatedText, parts: [...messageParts], toolsExecuted: [...activeTools], isStreaming: false }
          : m),
        true
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateAndSyncMessages(
          (prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m
            ),
          true
        );
        return;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isCreditError = errorMsg.toLowerCase().includes('credit') || errorMsg.toLowerCase().includes('0 credits');
      const isAuthError = errorMsg.toLowerCase().includes('sign in') || errorMsg.toLowerCase().includes('authentication');
      const formattedContent = isCreditError
        ? `⚠️ **Credit balance exhausted**\n\n${errorMsg}\n\n*Go to **Settings → Usage** to top up credits and continue.*`
        : isAuthError
        ? `🔒 **Sign in required**\n\n${errorMsg}`
        : `Error: ${errorMsg}`;

      updateAndSyncMessages(
        (prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: formattedContent,
                  isStreaming: false,
                }
              : m
          ),
        true
      );
    } finally {
      if (streamAbortControllerRef.current === controller) {
        streamAbortControllerRef.current = null;
        activeRunIdRef.current = null;
        activeAssistantMessageIdRef.current = null;
        setIsStreaming(false);
      }
    }
  };

  const handleResumeInterrupt = async (
    targetMsgId: string,
    interruptId: string,
    answers: Record<number, string | string[]>,
    isSkip = false
  ) => {
    if (streamAbortControllerRef.current) return;

    const existingMsg = messagesRef.current.find((m) => m.id === targetMsgId);
    if (!existingMsg) return;

    const hasPendingInterrupt =
      existingMsg.parts?.some(
        (part) =>
          part.type === 'interrupt' &&
          part.interrupt?.interruptId === interruptId &&
          part.interrupt.status !== 'submitted' &&
          part.interrupt.status !== 'skipped'
      ) ||
      (existingMsg.interrupt?.interruptId === interruptId &&
        existingMsg.interrupt.status !== 'submitted' &&
        existingMsg.interrupt.status !== 'skipped');
    if (!hasPendingInterrupt) return;

    const runId = globalThis.crypto.randomUUID();
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;
    activeRunIdRef.current = runId;
    activeAssistantMessageIdRef.current = targetMsgId;

    const initialResolvedParts = (existingMsg.parts || []).map((part) =>
      part.type === 'interrupt' && part.interrupt?.interruptId === interruptId
        ? {
            ...part,
            interrupt: {
              ...part.interrupt,
              status: isSkip ? ('skipped' as const) : ('submitted' as const),
              answers,
              error: undefined,
            },
          }
        : part
    );

    updateAndSyncMessages((prev) =>
      prev.map((m) =>
        m.id === targetMsgId
          ? {
              ...m,
              parts: initialResolvedParts,
              interrupt:
                m.interrupt?.interruptId === interruptId
                  ? {
                      ...m.interrupt,
                      status: isSkip ? ('skipped' as const) : ('submitted' as const),
                      answers,
                      error: undefined,
                    }
                  : m.interrupt,
              isStreaming: true,
            }
          : m
      )
    );
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: currentSessionId,
          resume: answers,
          model: lastUsedModelRef.current || 'talos-code',
          run_id: runId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Failed to resume agent after interrupt');
      }

      let reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available');

      const decoder = new TextDecoder();
      let accumulatedText = existingMsg.content || '';
      const activeTools: ToolEventData[] = [...(existingMsg.toolsExecuted || [])];
      const messageParts: MessagePart[] = [...initialResolvedParts];
      let pendingLine = '';
      let pendingEventId: number | null = null;
      let lastEventId = 0;
      let runFinished = false;
      let runStatusEventReceived = false;

      while (!runFinished) {
        const { done, value } = await reader.read();
        if (done) {
          if (runFinished || controller.signal.aborted) break;
          let reattached = false;
          let reconnectError = 'The stream disconnected while Talos was still working.';
          for (let attempt = 0; attempt < 8 && !reattached && !controller.signal.aborted; attempt += 1) {
            try {
              await new Promise((resolve) => setTimeout(resolve, Math.min(1000 + attempt * 750, 6000)));
              const resumedResponse = await fetch(
                `/api/chat?run_id=${encodeURIComponent(runId)}&after=${lastEventId}`,
                { signal: controller.signal },
              );
              if (!resumedResponse.ok) {
                const errorBody = await resumedResponse.json().catch(() => ({}));
                throw new Error(errorBody.error || `Could not reconnect to Talos run (${resumedResponse.status})`);
              }
              const resumedReader = resumedResponse.body?.getReader();
              if (!resumedReader) throw new Error('No readable stream available after reconnect');
              reader = resumedReader;
              pendingLine = '';
              pendingEventId = null;
              reattached = true;
            } catch (error) {
              if (controller.signal.aborted) break;
              reconnectError = error instanceof Error ? error.message : String(error);
            }
          }
          if (!reattached && !controller.signal.aborted) {
            throw new Error(`${reconnectError} Talos may still be running; retry this message to reconnect.`);
          }
          continue;
        }

        const chunk = pendingLine + decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        pendingLine = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          if (line.startsWith('id: ')) {
            const eventId = Number.parseInt(line.slice(4), 10);
            pendingEventId = Number.isFinite(eventId) ? eventId : null;
            continue;
          }
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (pendingEventId !== null) {
                lastEventId = pendingEventId;
                pendingEventId = null;
              }
              if (data.type === 'RUN_FINISHED') {
                runFinished = true;
              } else if (data.type === 'TEXT_DELTA') {
                const delta =
                  typeof data.delta === 'string'
                    ? data.delta
                    : Array.isArray(data.delta)
                      ? data.delta
                          .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
                          .join('')
                      : '';
                if (!delta) continue;
                accumulatedText += delta;
                const lastPart = messageParts[messageParts.length - 1];
                if (lastPart && lastPart.type === 'text') {
                  lastPart.text = (lastPart.text || '') + delta;
                } else {
                  messageParts.push({ type: 'text', text: delta });
                }
              } else if (data.type === 'TOOL_CALL') {
                if (data.toolName === 'ask_question' || data.toolName === 'delegate_to_subagent') {
                  // ask_question raises GraphInterrupt → handled via INTERRUPT event
                  // delegate_to_subagent → handled via SUBAGENT_STARTED event
                  continue;
                }
                const toolCallId = data.toolCallId || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const newTool: ToolEventData = {
                  toolCallId,
                  toolName: data.toolName,
                  args: data.args,
                  status: 'running',
                };
                activeTools.push(newTool);
                messageParts.push({ type: 'tool', tool: newTool });
              } else if (data.type === 'INTERRUPT') {
                runFinished = true;
                // Backend sends exactly one INTERRUPT per ask_question call.
                // Deduplicate by interruptId to be safe.
                const intId = data.interruptId || `int_${Date.now()}`;
                const alreadyExists = messageParts.some(
                  (p) => p.type === 'interrupt' && p.interrupt?.interruptId === intId
                );
                if (!alreadyExists) {
                  messageParts.push({
                    type: 'interrupt',
                    interrupt: {
                      interruptId: intId,
                      questions: data.questions || [],
                      status: 'pending',
                    },
                  });
                }
              } else if (data.type === 'RUN_ERROR' || data.type === 'RUN_PAUSED') {
                runFinished = true;
                runStatusEventReceived = true;
                const statusMessage = data.type === 'RUN_ERROR'
                  ? `\n\nAgent run failed: ${cleanErrorMessage(data.error)}`
                  : `\n\n${data.message || 'Agent run paused.'}`;
                failUnfinishedTools(activeTools, messageParts, statusMessage.trim());
                accumulatedText += statusMessage;
                messageParts.push({ type: 'text', text: statusMessage });
              } else if (data.type === 'RUN_NOT_FOUND') {
                runFinished = true;
                runStatusEventReceived = true;
                const statusMessage = '\n\nTalos could not reconnect to this run. Any files already created remain in the workspace.';
                accumulatedText += statusMessage;
                messageParts.push({ type: 'text', text: statusMessage });
              } else if (data.type === 'TOOL_CALL_RESULT') {
                if (data.toolName === 'delegate_to_subagent' || data.toolName === 'ask_question') continue;
                let existing = activeTools.find((t) => t.toolCallId && t.toolCallId === data.toolCallId);
                if (!existing) {
                  existing = activeTools.find((t) => t.toolName === data.toolName && t.status === 'running');
                }
                if (!existing) {
                  existing = activeTools.find((t) => t.status === 'running');
                }
                if (existing) {
                  existing.output = data.output;
                  existing.status = 'completed';
                }
                const targetPart = messageParts.find(
                  (p) =>
                    p.type === 'tool' &&
                    p.tool &&
                    ((data.toolCallId && p.tool.toolCallId === data.toolCallId) ||
                      (p.tool.toolName === data.toolName && p.tool.status === 'running') ||
                      p.tool === existing)
                );
                if (targetPart && targetPart.tool) {
                  targetPart.tool.output = data.output;
                  targetPart.tool.status = 'completed';
                }
                if (data.toolName === 'workspace_write_file' || data.toolName === 'workspace_show_file') {
                  const filePath = getWorkspacePathFromToolResult(data.toolName, existing?.args, data.output);
                  if (filePath) {
                    setSelectedDrawerFile(filePath);
                    setIsDrawerOpen(true);
                    setWorkspaceRefreshKey((key) => key + 1);
                  }
                }
                if (data.toolName === 'workspace_open_browser') {
                  const target = getEmbeddedBrowserTarget(data.output);
                  if (target) {
                    setEmbeddedBrowser(target);
                    setIsDrawerOpen(true);
                  }
                }
              }
            } catch {}

            updateAndSyncMessages((prev) =>
              prev.map((m) =>
                m.id === targetMsgId
                  ? {
                      ...m,
                      content: accumulatedText,
                      parts: [...messageParts],
                      toolsExecuted: [...activeTools],
                    }
                  : m
              )
            );
          }
        }
      }

      const unfinishedReason = runFinished
        ? 'Agent run ended before this tool returned a result.'
        : 'The response stream closed before this tool returned a result.';
      const unfinishedCount = failUnfinishedTools(activeTools, messageParts, unfinishedReason);
      if (unfinishedCount > 0 && !accumulatedText.includes('Agent run failed:')) {
        const statusMessage = `\n\n${unfinishedReason}`;
        accumulatedText += statusMessage;
        messageParts.push({ type: 'text', text: statusMessage });
      }
      const hasPendingInterrupt = messageParts.some((part) => part.type === 'interrupt' && part.interrupt?.status === 'pending');
      if (!runFinished && !runStatusEventReceived && !hasPendingInterrupt && unfinishedCount === 0) {
        const statusMessage = '\n\nThe response stream ended before Talos marked this run complete.';
        accumulatedText += statusMessage;
        messageParts.push({ type: 'text', text: statusMessage });
      }
      if (runFinished) void reader.cancel().catch(() => undefined);

      updateAndSyncMessages(
        (prev) =>
          prev.map((m) => {
            if (m.id !== targetMsgId) return m;
            const parts = messageParts.map((part) =>
              part.type === 'interrupt' && part.interrupt?.interruptId === interruptId
                ? {
                    ...part,
                    interrupt: {
                      ...part.interrupt,
                      status: isSkip ? ('skipped' as const) : ('submitted' as const),
                      answers,
                      error: undefined,
                    },
                  }
                : part
            );
            const interrupt =
              m.interrupt?.interruptId === interruptId
                ? {
                    ...m.interrupt,
                    status: isSkip ? ('skipped' as const) : ('submitted' as const),
                    answers,
                    error: undefined,
                  }
                : m.interrupt;
            return { ...m, content: accumulatedText, parts, toolsExecuted: [...activeTools], interrupt, isStreaming: false };
          }),
        true
      );
    } catch (err: unknown) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      const errorMsg = err instanceof Error ? err.message : String(err);
      updateAndSyncMessages(
        (prev) =>
          prev.map((m) => {
            if (m.id !== targetMsgId) return m;
            const setError = (interrupt: InterruptData | undefined) =>
              interrupt?.interruptId === interruptId
                ? { ...interrupt, error: aborted ? undefined : errorMsg }
                : interrupt;
            return {
              ...m,
              parts: m.parts?.map((part) =>
                part.type === 'interrupt' && part.interrupt
                  ? { ...part, interrupt: setError(part.interrupt) }
                  : part
              ),
              interrupt: setError(m.interrupt),
              isStreaming: false,
            };
          }),
        true
      );
    } finally {
      if (streamAbortControllerRef.current === controller) {
        streamAbortControllerRef.current = null;
        activeRunIdRef.current = null;
        activeAssistantMessageIdRef.current = null;
        setIsStreaming(false);
      }
    }
  };

  const handleSetInspectingExecution = (exec: SubAgentExecution | null) => {
    if (exec) {
      if (!inspectingExecution && chatScrollContainerRef.current) {
        parentScrollTopRef.current = chatScrollContainerRef.current.scrollTop;
      }
    } else {
      isRestoringScrollRef.current = true;
    }
    setInspectingExecution(exec);
    onInspectSubAgentChange?.(exec ? exec.execution_id : null);
  };

  useEffect(() => {
    if (inspectingExecution) {
      subAgentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [
    inspectingExecution,
    inspectingExecution?.execution_id,
    inspectingExecution?.steps?.length,
    inspectingExecution?.tool_calls?.length,
    inspectingExecution?.result,
    inspectingExecution?.logs?.length,
  ]);

  useEffect(() => {
    if (!inspectingExecution && isRestoringScrollRef.current) {
      isRestoringScrollRef.current = false;
      if (chatScrollContainerRef.current) {
        chatScrollContainerRef.current.scrollTop = parentScrollTopRef.current;
      }
    }
  }, [inspectingExecution]);

  const hasMessages = messages.length > 0;

  const activeBrowserExecution =
    findExecutionById(browserCanvasExecutionId) ||
    (inspectingExecution?.screenshots?.length ? inspectingExecution : null) ||
    activeSubAgents.find((e) => (e.screenshots || []).length > 0) ||
    null;

  const isInspecting = !!inspectingExecution;
  const subAgentData = inspectingExecution ? buildSubAgentMessages(inspectingExecution) : null;
  const subScreenshots = inspectingExecution?.screenshots || [];
  const subFiles = inspectingExecution?.files || [];
  const isSubRunning = inspectingExecution?.status === 'running';
  const isSubFailed = inspectingExecution?.status === 'failed';

  return (
    <div className="flex-1 flex h-full overflow-hidden relative bg-[#000000]">
      {/* Unified Chat Column */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Top bar: Adapts between standard plan header and Sub-Agent breadcrumb header */}
        <header className="flex h-11 shrink-0 items-center justify-between px-6 select-none border-b border-[#141414] bg-[#000000]">
          {isInspecting ? (
            <>
              <div className="flex items-center gap-2 text-[12px] text-[#737373]">
                <button
                  onClick={() => handleSetInspectingExecution(null)}
                  className="flex items-center gap-1 text-[#888888] hover:text-white transition-colors cursor-pointer mr-1 font-medium"
                  title="Back to parent chat"
                >
                  <ChevronLeft size={15} />
                  <span>Back</span>
                </button>
                <span className="text-neutral-600">/</span>
                <span className="text-neutral-300 font-medium">{inspectingExecution.agent_name || 'Sub-Agent'}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  isSubRunning ? 'text-blue-400 bg-blue-950/40 border-blue-800/40' :
                  isSubFailed ? 'text-red-400 bg-red-950/40 border-red-800/40' :
                  'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
                }`}>
                  {isSubRunning ? <Loader2 size={10} className="animate-spin" /> : isSubFailed ? <AlertCircle size={10} /> : <CheckCircle2 size={10} />}
                  {isSubRunning ? 'Running' : isSubFailed ? 'Failed' : 'Completed'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {subScreenshots.length > 0 && (
                  <button
                    onClick={() => {
                      setBrowserCanvasExecutionId(inspectingExecution.execution_id);
                      setSelectedScreenshotIndex(null);
                      setIsDrawerOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border border-blue-500/40 bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 transition-colors cursor-pointer shadow-sm"
                    title="Open Browser Viewport in Canvas"
                  >
                    <Globe size={13} className="text-blue-400" />
                    <span>Canvas ({subScreenshots.length})</span>
                    <ExternalLink size={11} className="text-blue-400/80 ml-0.5" />
                  </button>
                )}

                {subFiles.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectedDrawerFile(subFiles[0].path);
                      setIsDrawerOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-[#262626] bg-[#141414] hover:bg-[#222222] hover:border-[#383838] text-white transition-colors cursor-pointer"
                  >
                    <Layers size={13} className="text-amber-400" />
                    <span>Files</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <HeartbeatStatusBadge />
              <button
                onClick={openAutomationsDrawer}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-amber-500/30 bg-amber-950/20 hover:bg-amber-900/30 text-amber-300 transition-colors cursor-pointer"
                title="Manage active background automations and watchers"
              >
                <Zap size={12} className="text-amber-400" />
                <span>Automations ({activeTaskCount})</span>
              </button>
              <button
                onClick={() => {
                  setSelectedDrawerFile(null);
                  setIsDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 text-[12px] text-[#888888] hover:text-white transition-colors cursor-pointer"
                title="Open workspace files"
              >
                <Layers size={13} />
                <span>Workspace</span>
              </button>
              <div className="text-[12px] text-[#737373] flex items-center gap-1.5">
                <span>Free plan</span>
                <span>&middot;</span>
                <span className="text-[#a3a3a3] hover:text-white cursor-pointer transition-colors font-medium">
                  Upgrade
                </span>
              </div>
            </div>
          )}
        </header>

        {/* Message Area */}
        {isInspecting ? (
          <div ref={chatScrollContainerRef} className="flex-1 overflow-y-auto pt-4 pb-2">
            {subAgentData && (
              <>
                <ChatMessage
                  message={subAgentData.userMessage}
                  onOpenFile={(filePath) => {
                    setSelectedDrawerFile(filePath);
                    setIsDrawerOpen(true);
                    setWorkspaceRefreshKey((key) => key + 1);
                  }}
                />
                <ChatMessage
                  message={subAgentData.assistantMessage}
                  onOpenFile={(filePath) => {
                    setSelectedDrawerFile(filePath);
                    setIsDrawerOpen(true);
                    setWorkspaceRefreshKey((key) => key + 1);
                  }}
                  onInspectSubAgent={handleSetInspectingExecution}
                  onOpenSubAgentCanvas={(subExec) => {
                    setBrowserCanvasExecutionId(subExec.execution_id);
                    setSelectedScreenshotIndex(null);
                    setIsDrawerOpen(true);
                  }}
                  onResumeInterrupt={(interruptId, answers) => handleResumeInterrupt(subAgentData.assistantMessage.id, interruptId, answers, false)}
                  onSkipInterrupt={(interruptId) => handleResumeInterrupt(subAgentData.assistantMessage.id, interruptId, { 0: 'SKIPPED' }, true)}
                />
              </>
            )}

            {isSubFailed && inspectingExecution.error && (
              <div className="py-2 px-4 md:px-8 max-w-3xl mx-auto">
                <div className="p-4 rounded-2xl bg-red-950/20 border border-red-900/40 text-red-400 text-xs">
                  {inspectingExecution.error}
                </div>
              </div>
            )}
            <div ref={subAgentEndRef} />
          </div>
        ) : !hasMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center -mt-16 px-4">
            <div className="flex items-center justify-center gap-3.5 mb-7 select-none">
              <svg
                className="w-7 h-7 text-[#d97706]"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 2L13.5 8.5L20 7L15.5 12L20 17L13.5 15.5L12 22L10.5 15.5L4 17L8.5 12L4 7L10.5 8.5L12 2Z" />
              </svg>
              <h1
                className="text-[34px] md:text-[38px] text-[#ededed] font-normal tracking-tight font-serif"
                style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", serif' }}
              >
                Up late, Shikhar?
              </h1>
            </div>

            <div className="w-full max-w-[720px]">
              <Composer
                onSend={handleSendPrompt}
                isStreaming={isStreaming}
                onStop={handleStop}
                isCentered={true}
              />

              {/* Proactive Quick Action Chips */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => handleSendPrompt("Keep an eye on my dev server and alert me immediately if it crashes or errors", "claude-3-5-sonnet-20241022")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#141414] border border-[#262626] hover:border-amber-500/50 hover:bg-[#1a1a1a] text-neutral-300 hover:text-white transition-all shadow-xs cursor-pointer"
                >
                  <Zap size={13} className="text-amber-400" />
                  <span>Dev Server Watcher</span>
                </button>
                <button
                  onClick={() => handleSendPrompt("Schedule a daily morning standup report every day at 9:00 AM with git changes and test status", "claude-3-5-sonnet-20241022")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#141414] border border-[#262626] hover:border-blue-500/50 hover:bg-[#1a1a1a] text-neutral-300 hover:text-white transition-all shadow-xs cursor-pointer"
                >
                  <Calendar size={13} className="text-blue-400" />
                  <span>Daily Morning Report</span>
                </button>
                <button
                  onClick={() => handleSendPrompt("Run an hourly test and health sweep to ensure all tests are green and no uncommitted broken code exists", "claude-3-5-sonnet-20241022")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#141414] border border-[#262626] hover:border-emerald-500/50 hover:bg-[#1a1a1a] text-neutral-300 hover:text-white transition-all shadow-xs cursor-pointer"
                >
                  <Activity size={13} className="text-emerald-400" />
                  <span>Hourly Test Sweep</span>
                </button>
                <button
                  onClick={openAutomationsDrawer}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#141414] border border-[#262626] hover:border-neutral-500 hover:bg-[#1a1a1a] text-neutral-400 hover:text-white transition-all shadow-xs cursor-pointer"
                >
                  <Sliders size={13} className="text-neutral-400" />
                  <span>Manage Automations ({activeTaskCount})</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div ref={chatScrollContainerRef} className="flex-1 overflow-y-auto pt-4 pb-2">
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  message={m}
                  onOpenFile={(filePath) => {
                    setSelectedDrawerFile(filePath);
                    setIsDrawerOpen(true);
                  }}
                  onInspectSubAgent={handleSetInspectingExecution}
                  onOpenSubAgentCanvas={(subExec) => {
                    setBrowserCanvasExecutionId(subExec.execution_id);
                    setSelectedScreenshotIndex(null);
                    setIsDrawerOpen(true);
                  }}
                  onResumeInterrupt={(interruptId, answers) => handleResumeInterrupt(m.id, interruptId, answers, false)}
                  onSkipInterrupt={(interruptId) => handleResumeInterrupt(m.id, interruptId, { 0: 'SKIPPED' }, true)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 bg-[#000000]">
              <ActiveSubAgentsBar
                executions={activeSubAgents}
                onInspect={handleSetInspectingExecution}
              />
              <Composer
                onSend={handleSendPrompt}
                isStreaming={isStreaming}
                onStop={handleStop}
                isCentered={false}
              />
            </div>
          </div>
        )}

        {/* Footer when inspecting a sub-agent */}
        {isInspecting && (
          <footer className="shrink-0 border-t border-[#141414] bg-[#000000] px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-blue-400 shrink-0" />
              <span className="text-[11px] text-neutral-400 font-medium">
                {isSubRunning
                  ? `${inspectingExecution.agent_name || 'Sub-Agent'} is running…`
                  : isSubFailed
                  ? `${inspectingExecution.agent_name || 'Sub-Agent'} failed`
                  : `${inspectingExecution.agent_name || 'Sub-Agent'} completed`}
              </span>
            </div>

            <div className="text-[11px] text-neutral-500 font-mono">
              {subScreenshots.length > 0 && `${subScreenshots.length} screenshot${subScreenshots.length > 1 ? 's' : ''} · `}
              {(inspectingExecution.steps || []).length} steps
              {(inspectingExecution.tool_calls || []).length > 0 && ` · ${(inspectingExecution.tool_calls || []).length} tools`}
            </div>
          </footer>
        )}
      </div>

      {/* Right Workspace Canvas Drawer (shared continuously across main chat & sub-agents) */}
      <WorkspaceCanvasDrawer
        key={currentSessionId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        threadId={currentSessionId}
        activePort={activePort}
        selectedFilePath={selectedDrawerFile}
        workspaceRefreshKey={workspaceRefreshKey}
        browserData={
          activeBrowserExecution && (activeBrowserExecution.screenshots || []).length > 0
            ? {
                executionId: activeBrowserExecution.execution_id,
                agentName: activeBrowserExecution.agent_name,
                task: activeBrowserExecution.task,
                screenshots: activeBrowserExecution.screenshots || [],
                activeIndex:
                  selectedScreenshotIndex !== null && selectedScreenshotIndex < (activeBrowserExecution.screenshots || []).length
                    ? selectedScreenshotIndex
                    : (activeBrowserExecution.screenshots || []).length - 1,
              }
            : null
        }
        browserUrl={embeddedBrowser?.url || null}
        browserTitle={embeddedBrowser?.title || null}
        onSelectBrowserScreenshot={(idx: number) => setSelectedScreenshotIndex(idx)}
      />

      {/* Proactive Automations Control Center, Approval Modal & Global Toast */}
      <AutomationsDrawer />
      <ApprovalModal />
      <ProactiveToast
        onOpenCanvasFile={(path) => {
          setSelectedDrawerFile(path);
          setIsDrawerOpen(true);
        }}
      />
    </div>
  );
};
