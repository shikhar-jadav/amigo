'use client';

import React, { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Share, RotateCcw, MoreHorizontal } from 'lucide-react';
import {
  ConnectedToolSequence,
  ArtifactCard,
  ToolEventData,
  cleanToolOutput,
} from './StepLine';
import { SubAgentCard, SubAgentExecution } from './SubAgentCard';
import { MermaidDiagram } from './chat/MermaidDiagram';
import { ProactiveCard, ProactiveCardData } from './proactive/ProactiveCard';
import { InterruptCard, InterruptData } from './chat/InterruptCard';

function stripThinkTags(text: string): string {
  return text.replace(/(?:<|&lt;)\/?think(?:>|&gt;)/gi, '');
}

export interface ShowFileOutput {
  status?: string;
  error?: string;
  title?: string;
  file_path?: string;
  file_name?: string;
  description?: string;
}

export interface DelegateSubagentOutput {
  plugin?: string;
  agent_slug?: string;
  execution_id?: string;
  task?: string;
  status?: string;
  result?: string;
  steps?: SubAgentExecution['steps'];
  tool_calls?: SubAgentExecution['tool_calls'];
  files?: SubAgentExecution['files'];
  screenshots?: Array<{ url?: string; title?: string; image: string; timestamp?: string }>;
  logs?: string[];
}

export interface MessagePart {
  type: 'text' | 'tool' | 'subagent' | 'interrupt';
  text?: string;
  tool?: ToolEventData;
  subagent?: SubAgentExecution;
  interrupt?: InterruptData;
}

export interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: MessagePart[];
  isStreaming?: boolean;
  toolsExecuted?: ToolEventData[];
  proactive?: ProactiveCardData;
  interrupt?: InterruptData;
}

interface ChatMessageProps {
  message: MessageData;
  onRetry?: () => void;
  onOpenFile?: (filePath: string) => void;
  onInspectSubAgent?: (execution: SubAgentExecution) => void;
  onOpenSubAgentCanvas?: (execution: SubAgentExecution) => void;
  onResumeInterrupt?: (interruptId: string, answers: Record<number, string | string[]>) => Promise<void> | void;
  onSkipInterrupt?: (interruptId: string) => Promise<void> | void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onRetry,
  onOpenFile,
  onInspectSubAgent,
  onOpenSubAgentCanvas,
  onResumeInterrupt,
  onSkipInterrupt,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  // Extract shown files for legacy fallback
  const shownFiles = (message.toolsExecuted || []).filter(
    (t) => t.toolName === 'workspace_show_file' && t.status === 'completed'
  ).map((t) => {
    try {
      return typeof t.output === 'string' ? JSON.parse(t.output) : t.output;
    } catch {
      return { file_path: t.args?.file_path || 'file', title: t.args?.title || 'Interactive Artifact' };
    }
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── USER MESSAGE BUBBLE (Deep blue pill on the right) ───────
  if (isUser) {
    return (
      <div className="py-2.5 px-4 md:px-8 max-w-3xl mx-auto flex justify-end">
        <div
          className="rounded-[22px] px-5 py-2.5 text-[15px] text-white font-normal max-w-[85%] break-words leading-relaxed"
          style={{ background: "#1d4ed8" }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Common Markdown rendering components
  const markdownComponents: Components = {
    p: ({ children }) => <div className="mb-3 last:mb-0 leading-relaxed">{children}</div>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }) => <h1 className="text-xl font-semibold text-white mt-4 mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-lg font-semibold text-white mt-3 mb-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-semibold text-white mt-2 mb-1">{children}</h3>,
    pre: ({ children }) => {
      const child = React.Children.toArray(children)[0];
      if (
        React.isValidElement<{ className?: string }>(child) &&
        typeof child.props?.className === 'string' &&
        child.props.className.includes('language-mermaid')
      ) {
        return <>{children}</>;
      }
      return (
        <div className="my-3 rounded-xl bg-[#141414] border border-[#262626] overflow-hidden">
          <pre className="p-3.5 text-xs font-mono text-[#e5e5e5] overflow-x-auto">
            {children}
          </pre>
        </div>
      );
    },
    code: ({ className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match && typeof children === 'string' && !children.includes('\n');
      if (isInline) {
        return (
          <code className="bg-[#242424] text-[#a3e635] px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
            {children}
          </code>
        );
      }
      if (match && match[1] === 'mermaid') {
        return <MermaidDiagram chartCode={String(children).trim()} />;
      }
      return (
        <code className="text-xs font-mono text-[#e5e5e5]" {...props}>
          {children}
        </code>
      );
    },
    table: ({ children }) => (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full divide-y divide-[#333333] border border-[#2b2b2b] text-xs">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => <th className="px-3 py-2 bg-[#1c1c1c] text-left text-neutral-300 font-semibold">{children}</th>,
    td: ({ children }) => <td className="px-3 py-2 border-t border-[#262626] text-neutral-300">{children}</td>,
    a: ({ href, children, ...props }) => {
      if (!href) {
        return <span className="text-neutral-300">{children}</span>;
      }
      const isWorkspaceFile =
        !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href) &&
        /\.(?:md|markdown|html?|pptx?|docx?|pdf|xlsx?|csv|txt|json|ya?ml|xml|svg|png|jpe?g|gif|webp|css|scss|js|jsx|ts|tsx|py|ipynb|zip)(?:[?#].*)?$/i.test(href);
      return (
        <a
          {...props}
          href={href}
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
          onClick={(event) => {
            if (!isWorkspaceFile || !onOpenFile || !href) return;
            event.preventDefault();
            const filePath = href.split(/[?#]/, 1)[0];
            try {
              onOpenFile(decodeURIComponent(filePath).replace(/^\.\//, ''));
            } catch {
              onOpenFile(filePath.replace(/^\.\//, ''));
            }
          }}
        >
          {children}
        </a>
      );
    },
  };

  // ── ASSISTANT MESSAGE (Chronological Interleaved Lineup: CoT -> Tools -> Response) ──
  const hasInterleavedParts = message.parts && message.parts.length > 0;

  type GroupedPart =
    | { kind: 'text'; text: string; idx: number }
    | { kind: 'toolGroup'; tools: ToolEventData[]; idx: number }
    | { kind: 'artifact'; file: { title: string; filePath?: string; description?: string }; idx: number }
    | { kind: 'subagent'; subagent: SubAgentExecution; idx: number }
    | { kind: 'interrupt'; interrupt: InterruptData; idx: number };

  const groupedParts: GroupedPart[] = [];
  if (hasInterleavedParts) {
    for (let i = 0; i < message.parts!.length; i++) {
      const part = message.parts![i];

      if (part.type === 'text') {
        const raw = part.text?.trim() || '';
        // Check if raw text is JSON workspace_show_file
        if (raw.startsWith('{') && raw.endsWith('}')) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.status === 'shown' && (parsed.file_path || parsed.file_name)) {
              groupedParts.push({
                kind: 'artifact',
                file: {
                  title: parsed.title || parsed.file_name || 'Interactive Artifact',
                  filePath: parsed.file_path || parsed.file_name,
                  description: parsed.description || `Interactive artifact · ${(parsed.extension || 'file').toUpperCase()}`,
                },
                idx: i,
              });
              continue;
            }
            if (parsed.status && (parsed.command || parsed.bytes_written || parsed.exit_code !== undefined)) {
              continue;
            }
          } catch {}
        }

        if (raw) {
          groupedParts.push({ kind: 'text', text: part.text || '', idx: i });
        }
      } else if (part.type === 'tool' && part.tool) {
        if (part.tool.toolName === 'workspace_show_file') {
          let sf: ShowFileOutput = {};
          try {
            sf = (typeof part.tool.output === 'string' ? JSON.parse(cleanToolOutput(part.tool.output)) : part.tool.output || {}) as ShowFileOutput;
          } catch {
            sf = (part.tool.args || {}) as ShowFileOutput;
          }
          const filePath = sf.file_path || sf.file_name || (part.tool.args?.file_path as string | undefined);
          if (sf.status === 'error' || !filePath) {
            groupedParts.push({
              kind: 'text',
              text: `Could not open the workspace file: ${sf.error || 'The file path was not returned.'}`,
              idx: i,
            });
            continue;
          }
          groupedParts.push({
            kind: 'artifact',
            file: {
              title: sf.title || part.tool.args?.title || sf.file_path?.split('/').pop() || 'Interactive Artifact',
              filePath,
              description: sf.description || (part.tool.args?.description as string | undefined) || 'Interactive artifact · Deliverable',
            },
            idx: i,
          });
        } else if (part.tool.toolName === 'delegate_to_subagent') {
          const args = part.tool.args || {};
          let outputObj: DelegateSubagentOutput = {};
          try {
            outputObj = (typeof part.tool.output === 'string' ? JSON.parse(cleanToolOutput(part.tool.output)) : (part.tool.output || {})) as DelegateSubagentOutput;
          } catch {
            outputObj = {};
          }
          const pluginSlug = args.plugin_slug || outputObj.plugin || outputObj.agent_slug || 'subagent';
          const agentName = pluginSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          const exec: SubAgentExecution = {
            execution_id: outputObj.execution_id || part.tool.toolCallId || `exec-${i}`,
            plugin_id: pluginSlug,
            plugin_type: 'agent',
            agent_name: agentName,
            agent_slug: pluginSlug,
            task: args.task || outputObj.task || 'Subagent execution',
            status: part.tool.status === 'running' ? 'running' : (outputObj.status === 'failed' ? 'failed' : 'completed'),
            result: typeof outputObj.result === 'string' ? outputObj.result : (typeof part.tool.output === 'string' ? part.tool.output : ''),
            steps: outputObj.steps || [],
            tool_calls: outputObj.tool_calls || [],
            files: outputObj.files || [],
            screenshots: outputObj.screenshots || [],
            logs: outputObj.logs || [],
          };
          groupedParts.push({ kind: 'subagent', subagent: exec, idx: i });
        } else if (part.tool.toolName === 'ask_question') {
          let rawQ = part.tool.args?.questions || part.tool.args || [];
          if (typeof rawQ === 'string') {
            try { rawQ = JSON.parse(rawQ); } catch {}
          }
          const qList = Array.isArray(rawQ) ? rawQ : [rawQ];
          const intData: InterruptData = {
            interruptId: part.tool.toolCallId || `int-${i}`,
            questions: qList.map((q: any) => ({
              question: typeof q === 'string' ? q : q?.question || '',
              options: Array.isArray(q?.options) ? q.options : ['Yes', 'No'],
              is_multi_select: Boolean(q?.is_multi_select),
            })),
            status: part.tool.status === 'completed' ? 'submitted' : 'pending',
          };
          groupedParts.push({ kind: 'interrupt', interrupt: intData, idx: i });
        } else {
          // Join consecutive tool parts into a continuous timeline sequence
          const last = groupedParts[groupedParts.length - 1];
          if (last && last.kind === 'toolGroup') {
            last.tools.push(part.tool);
          } else {
            groupedParts.push({ kind: 'toolGroup', tools: [part.tool], idx: i });
          }
        }
      } else if (part.type === 'subagent' && part.subagent) {
        groupedParts.push({ kind: 'subagent', subagent: part.subagent, idx: i });
      } else if (part.type === 'interrupt' && part.interrupt) {
        groupedParts.push({ kind: 'interrupt', interrupt: part.interrupt, idx: i });
      }
    }
  }

  return (
    <div className="py-3 px-4 md:px-8 max-w-3xl mx-auto flex flex-col gap-2">
      {hasInterleavedParts ? (
        /* CHRONOLOGICAL ORDER: Thoughts, Skills, Tools, Artifacts, and Response text */
        <div className="space-y-3">
          {groupedParts.map((gp) => {
            if (gp.kind === 'text') {
              if (!gp.text?.trim()) return null;
              return (
                <div key={gp.idx} className="text-[15.5px] leading-[1.7] text-[#ececec] prose-talos">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {stripThinkTags(gp.text)}
                  </ReactMarkdown>
                </div>
              );
            } else if (gp.kind === 'toolGroup') {
              return (
                <div key={gp.idx}>
                  <ConnectedToolSequence tools={gp.tools} onOpenFile={onOpenFile} isMessageStreaming={Boolean(message.isStreaming)} />
                </div>
              );
            } else if (gp.kind === 'artifact') {
              return (
                <div key={gp.idx}>
                  <ArtifactCard
                    title={gp.file.title}
                    filePath={gp.file.filePath}
                    description={gp.file.description}
                    onOpenFile={onOpenFile}
                  />
                </div>
              );
            } else if (gp.kind === 'subagent') {
              return (
                <div key={gp.idx} className="space-y-2">
                  <SubAgentCard
                    execution={gp.subagent}
                    onInspect={onInspectSubAgent}
                    onOpenCanvas={onOpenSubAgentCanvas}
                  />
                  {(gp.subagent.files || []).map((file, fileIndex) => (
                    <ArtifactCard
                      key={`${file.path}-${fileIndex}`}
                      title={file.path.split('/').pop() || 'Deliverable'}
                      filePath={file.path}
                      description="Generated by sub-agent"
                      onOpenFile={onOpenFile}
                    />
                  ))}
                </div>
              );
            } else if (gp.kind === 'interrupt') {
              return (
                <div key={gp.idx}>
                  <InterruptCard
                    interrupt={gp.interrupt}
                    onSubmit={(interruptId, answers) => onResumeInterrupt?.(interruptId, answers)}
                    onSkip={(interruptId) => onSkipInterrupt?.(interruptId)}
                    isSubmitting={Boolean(message.isStreaming)}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      ) : (
        /* LEGACY FALLBACK for historical messages */
        <>
          {(() => {
            const normalTools: ToolEventData[] = [];
            const subagents: SubAgentExecution[] = [];
            const legacyInterrupts: InterruptData[] = [];
            for (const t of (message.toolsExecuted || [])) {
              if (t.toolName === 'delegate_to_subagent') {
                const args = t.args || {};
                let outObj: DelegateSubagentOutput = {};
                try {
                  outObj = (typeof t.output === 'string' ? JSON.parse(cleanToolOutput(t.output)) : (t.output || {})) as DelegateSubagentOutput;
                } catch {}
                const pluginSlug = args.plugin_slug || outObj.plugin || outObj.agent_slug || 'subagent';
                const agentName = pluginSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                subagents.push({
                  execution_id: outObj.execution_id || t.toolCallId || 'exec-default',
                  plugin_id: pluginSlug,
                  plugin_type: 'agent',
                  agent_name: agentName,
                  agent_slug: pluginSlug,
                  task: args.task || outObj.task || 'Subagent execution',
                  status: t.status === 'running' ? 'running' : (outObj.status === 'failed' ? 'failed' : 'completed'),
                  result: typeof outObj.result === 'string' ? outObj.result : (typeof t.output === 'string' ? t.output : ''),
                  steps: outObj.steps || [],
                  tool_calls: outObj.tool_calls || [],
                  files: outObj.files || [],
                  screenshots: outObj.screenshots || [],
                  logs: outObj.logs || [],
                });
              } else if (t.toolName === 'ask_question') {
                let rawQ = t.args?.questions || t.args || [];
                if (typeof rawQ === 'string') {
                  try { rawQ = JSON.parse(rawQ); } catch {}
                }
                const qList = Array.isArray(rawQ) ? rawQ : [rawQ];
                legacyInterrupts.push({
                  interruptId: t.toolCallId || `int-legacy`,
                  questions: qList.map((q: any) => ({
                    question: typeof q === 'string' ? q : q?.question || '',
                    options: Array.isArray(q?.options) ? q.options : ['Yes', 'No'],
                    is_multi_select: Boolean(q?.is_multi_select),
                  })),
                  status: t.status === 'completed' ? 'submitted' : 'pending',
                });
              } else {
                normalTools.push(t);
              }
            }
            return (
              <>
                {subagents.map((sub, sIdx) => (
                  <div key={sIdx} className="mb-2">
                    <SubAgentCard execution={sub} onInspect={onInspectSubAgent} onOpenCanvas={onOpenSubAgentCanvas} />
                  </div>
                ))}
                {legacyInterrupts.map((lint, lIdx) => (
                  <div key={lIdx} className="mb-2">
                    <InterruptCard
                      interrupt={lint}
                      onSubmit={(interruptId, answers) => onResumeInterrupt?.(interruptId, answers)}
                      onSkip={(interruptId) => onSkipInterrupt?.(interruptId)}
                      isSubmitting={Boolean(message.isStreaming)}
                    />
                  </div>
                ))}
                {normalTools.length > 0 && (
                  <div className="mb-1">
                    <ConnectedToolSequence tools={normalTools} onOpenFile={onOpenFile} isMessageStreaming={Boolean(message.isStreaming)} />
                  </div>
                )}
              </>
            );
          })()}

          {shownFiles.length > 0 && (
            <div className="space-y-2 mb-2">
              {shownFiles.map((sf, idx) => (
                <ArtifactCard
                  key={idx}
                  title={sf.title || sf.file_name || 'Interactive Artifact'}
                  filePath={sf.file_path || sf.file_name}
                  description={sf.description}
                  onOpenFile={onOpenFile}
                />
              ))}
            </div>
          )}

          {message.interrupt && (
            <div className="mb-2">
              <InterruptCard
                interrupt={message.interrupt}
                onSubmit={(interruptId, answers) => onResumeInterrupt?.(interruptId, answers)}
                onSkip={(interruptId) => onSkipInterrupt?.(interruptId)}
                isSubmitting={Boolean(message.isStreaming)}
              />
            </div>
          )}

          {message.proactive ? (
            <ProactiveCard data={message.proactive} onOpenFile={onOpenFile} />
          ) : (() => {
            const rawContent = message.content?.trim() || '';
            if (rawContent.startsWith('{') && rawContent.endsWith('}')) {
              try {
                const parsed = JSON.parse(rawContent);
                if (parsed.status === 'shown' && (parsed.file_path || parsed.file_name)) {
                  return (
                    <ArtifactCard
                      title={parsed.title || parsed.file_name || 'Interactive Artifact'}
                      filePath={parsed.file_path || parsed.file_name}
                      description={parsed.description || `Interactive artifact · ${(parsed.extension || 'file').toUpperCase()}`}
                      onOpenFile={onOpenFile}
                    />
                  );
                }
                if (parsed.status && (parsed.command || parsed.bytes_written || parsed.exit_code !== undefined)) {
                  return null;
                }
              } catch {}
            }

            if (!rawContent) return null;

            return (
              <div className="text-[15.5px] leading-[1.7] text-[#ececec] prose-talos">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {stripThinkTags(rawContent)}
                </ReactMarkdown>
              </div>
            );
          })()}
        </>
      )}

      {message.isStreaming && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#a3e635] animate-pulse" />
          <span>Working…</span>
        </div>
      )}

      {/* Action icons below message */}
      {!message.isStreaming && message.content && (
        <div className="flex items-center gap-1.5 pt-1 text-[#888888]">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
            title="Copy message"
          >
            {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
          </button>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ text: message.content }).catch(() => {});
              } else {
                handleCopy();
              }
            }}
            className="p-1.5 rounded-lg hover:text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
            title="Share"
          >
            <Share size={15} />
          </button>

          {onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 rounded-lg hover:text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
              title="Regenerate"
            >
              <RotateCcw size={15} />
            </button>
          )}

          <button
            className="p-1.5 rounded-lg hover:text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
            title="More actions"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      )}
    </div>
  );
};
