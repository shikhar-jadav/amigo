'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronRight,
  Layers,
  FileCode,
  FileText,
  BookOpen,
  Terminal,
  Globe,
  ArrowDown,
  Zap,
} from 'lucide-react';

// ── JSON SYNTAX HIGHLIGHTER (Claude-exact: red keys, green strings, cyan numbers) ──
function highlightJson(jsonStr: string): React.ReactNode {
  if (!jsonStr) return null;
  const tokenRegex = /("(?:\\.|[^"\\])*")\s*(:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(jsonStr)) !== null) {
    const [full, strToken, colon, keyword, number, punct] = match;
    const before = jsonStr.slice(lastIndex, match.index);
    if (before) result.push(<span key={`ws-${keyIdx++}`} className="text-neutral-400">{before}</span>);

    if (strToken !== undefined) {
      if (colon) {
        result.push(<span key={keyIdx++} className="text-[#f87171]">{strToken}</span>);
        result.push(<span key={keyIdx++} className="text-neutral-400">{colon}</span>);
      } else {
        result.push(<span key={keyIdx++} className="text-[#4ade80]">{strToken}</span>);
      }
    } else if (keyword !== undefined) {
      result.push(<span key={keyIdx++} className="text-[#38bdf8]">{keyword}</span>);
    } else if (number !== undefined) {
      result.push(<span key={keyIdx++} className="text-[#38bdf8]">{number}</span>);
    } else if (punct !== undefined) {
      result.push(<span key={keyIdx++} className="text-neutral-400">{punct}</span>);
    } else {
      result.push(<span key={keyIdx++} className="text-neutral-300">{full}</span>);
    }

    lastIndex = match.index + full.length;
  }

  const trailing = jsonStr.slice(lastIndex);
  if (trailing) result.push(<span key={keyIdx++} className="text-neutral-400">{trailing}</span>);
  return <>{result}</>;
}

export interface ToolEventData {
  toolCallId?: string;
  toolName: string;
  args?: any;
  output?: string;
  status: 'running' | 'completed' | 'failed';
}

export interface StepLineProps {
  toolsExecuted: ToolEventData[];
  onOpenFile?: (filePath: string) => void;
}

interface ParsedSource {
  title: string;
  url: string;
  domain: string;
}

// Cleans raw output and strips Python ToolMessage wrappers e.g. content='...' name='...'
export function cleanToolOutput(raw?: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // Strip Python ToolMessage / AIMessage wrapper if present: content='...' name='...'
  const contentMatch = str.match(/^content=(?:'([\s\S]*?)'|"([\s\S]*?)")\s+name=/);
  if (contentMatch) {
    str = contentMatch[1] || contentMatch[2] || str;
    str = str.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");
  }

  // Try JSON parsing
  try {
    const obj = JSON.parse(str);
    if (typeof obj === 'object' && obj !== null) {
      if (typeof obj.job_id === 'string') {
        const output = typeof obj.output === 'string' ? obj.output.trim() : '';
        if (obj.status === 'input_sent') return 'Response sent; waiting for the command to continue.';
        if (obj.status === 'not_waiting_for_input') return 'The command is not currently waiting for input.';
        if (obj.status === 'input_failed') return `Could not send input: ${obj.error || 'the process closed its input stream'}`;
        if (obj.status === 'running') return output ? `Still running…\n${output}` : 'Running; waiting for command output…';
        if (obj.status === 'waiting_for_input') return `Waiting for input: ${obj.input_prompt || 'The command requested a response.'}${output ? `\n${output}` : ''}`;
        if (obj.status === 'completed') return output || `Completed successfully (exit code ${obj.exit_code ?? 0})`;
        if (obj.status === 'timed_out') return `Timed out${output ? `\n${output}` : ''}`;
        if (obj.status === 'failed') return `Failed (exit code ${obj.exit_code ?? 'unknown'})${output ? `\n${output}` : ''}`;
      }
      if (obj.stdout !== undefined) {
        if (obj.stdout && obj.stdout.trim()) return obj.stdout.trim();
        if (obj.stderr && obj.stderr.trim()) return obj.stderr.trim();
        if (obj.exit_code === 0) return 'Command executed successfully (exit code 0)';
        return `Process exited with code ${obj.exit_code}`;
      }
      if (obj.status === 'success' && obj.path) {
        return `Successfully written to ${obj.path} (${obj.bytes_written || 0} bytes)`;
      }
      if (obj.error) return `Error: ${obj.error}`;
      if (obj.summary) return obj.summary;
      if (obj.title) return obj.title;

      // Handle MCP content wrapper [{"type": "text", "text": "..."}]
      if (Array.isArray(obj.content)) {
        const textParts = obj.content
          .filter((c: any) => c && (c.text || c.type === 'text'))
          .map((c: any) => {
            const raw = c.text || '';
            try {
              const innerObj = JSON.parse(raw);
              return JSON.stringify(innerObj, null, 2);
            } catch {
              return raw;
            }
          });
        if (textParts.length > 0) {
          return textParts.join('\n');
        }
      }

      // Pretty print JSON objects
      return JSON.stringify(obj, null, 2);
    }
  } catch {}

  return str;
}

// Strips YAML frontmatter (---\n...\n---) from markdown skills
function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\s*\n?/, '').trim();
}

// Tokenizes bash/terminal commands for exact Claude-style syntax coloring
function highlightBash(cmd: string) {
  if (!cmd) return null;
  const tokenRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|--?[a-zA-Z0-9_\-]+|&&|\|\||\||;|[^\s"';|&]+|\s+)/g;
  const parts = cmd.match(tokenRegex) || [cmd];

  let isCommand = true;
  return parts.map((part, i) => {
    if (/^\s+$/.test(part)) {
      return <span key={i}>{part}</span>;
    }
    if (part === '&&' || part === '||' || part === '|' || part === ';') {
      isCommand = true;
      return <span key={i} className="text-white font-medium">{part}</span>;
    }
    if (part.startsWith('"') || part.startsWith("'")) {
      return <span key={i} className="text-[#4ade80]">{part}</span>;
    }
    if (part.startsWith('-')) {
      return <span key={i} className="text-[#38bdf8]">{part}</span>;
    }
    if (isCommand) {
      isCommand = false;
      return <span key={i} className="text-[#38bdf8] font-medium">{part}</span>;
    }
    if (part.includes('/') || part.includes('\\')) {
      return <span key={i} className="text-[#4ade80]">{part}</span>;
    }
    return <span key={i} className="text-white">{part}</span>;
  });
}

// Syntax highlighter for JavaScript, Python, etc.
function highlightCode(code: string) {
  if (!code) return null;
  const lines = code.split('\n');
  return lines.map((line, lIdx) => {
    const commentIdx = line.indexOf('//');
    const hashCommentIdx = line.indexOf('#');
    let codePart = line;
    let commentPart = '';
    if (commentIdx !== -1) {
      codePart = line.substring(0, commentIdx);
      commentPart = line.substring(commentIdx);
    } else if (hashCommentIdx !== -1 && !line.includes('"#"') && !line.includes("'#'")) {
      codePart = line.substring(0, hashCommentIdx);
      commentPart = line.substring(hashCommentIdx);
    }

    const tokenRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|import|export|from|require|new|class|if|else|for|while|async|await|def|print)\b|[a-zA-Z0-9_$]+|[^\s\w]+|\s+)/g;
    const tokens = codePart.match(tokenRegex) || [codePart];

    return (
      <div key={lIdx} className="leading-relaxed">
        {tokens.map((tok, tIdx) => {
          if (tok.startsWith('"') || tok.startsWith("'")) {
            return <span key={tIdx} className="text-[#4ade80]">{tok}</span>;
          }
          if (/^(?:const|let|var|function|return|import|export|from|require|new|class|if|else|for|while|async|await|def|print)$/.test(tok)) {
            return <span key={tIdx} className="text-[#38bdf8] font-medium">{tok}</span>;
          }
          if (/^[A-Z][a-zA-Z0-9_]*$/.test(tok)) {
            return <span key={tIdx} className="text-[#fbbf24]">{tok}</span>;
          }
          return <span key={tIdx} className="text-[#e2e8f0]">{tok}</span>;
        })}
        {commentPart && <span className="text-[#737373] italic">{commentPart}</span>}
      </div>
    );
  });
}

function parseSources(output?: string): ParsedSource[] {
  if (!output) return [];
  const clean = cleanToolOutput(output);
  const sources: ParsedSource[] = [];
  try {
    const obj = JSON.parse(clean);
    if (Array.isArray(obj.sources)) {
      for (const s of obj.sources) {
        if (s.url) {
          const cleanUrl = String(s.url).trim();
          const rawTitle = String(s.title || '').replace(/[\r\n]+/g, ' ').trim();
          try {
            const urlObj = new URL(cleanUrl);
            const domain = urlObj.hostname.replace(/^www\./, '');
            sources.push({ title: rawTitle || domain, url: cleanUrl, domain });
          } catch {
            sources.push({ title: rawTitle || cleanUrl, url: cleanUrl, domain: cleanUrl });
          }
        }
      }
      if (sources.length > 0) return sources;
    }
  } catch {}

  const urlRegex = /(?:URL:\s*)(https?:\/\/[^\s\n]+)/g;
  let urlMatch;
  while ((urlMatch = urlRegex.exec(clean)) !== null) {
    const rawUrl = urlMatch[1].trim();
    try {
      const urlObj = new URL(rawUrl);
      const domain = urlObj.hostname.replace(/^www\./, '');
      sources.push({ title: domain, url: rawUrl, domain });
    } catch {
      sources.push({ title: rawUrl, url: rawUrl, domain: rawUrl });
    }
  }
  return sources;
}

const getFaviconUrl = (domain: string) => {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
};

// ── PARSES RAW TOOL DATA INTO STANDARDIZED CLAUDE-STYLE METADATA ──
export function getToolSummaryInfo(tool: ToolEventData): {
  title: string;
  badge: string;
  iconType: 'command' | 'file_write' | 'file_read' | 'search' | 'mcp' | 'generic';
  filePath?: string;
  command?: string;
  content?: string;
} {
  const name = tool.toolName;
  const args = typeof tool.args === 'string'
    ? (() => { try { return JSON.parse(tool.args); } catch { return {}; } })()
    : (tool.args || {});

  if (name === 'workspace_open_browser') {
    return {
      title: `Open embedded browser: ${String(args.title || args.url || 'web preview')}`,
      badge: 'Browser',
      iconType: 'generic',
    };
  }

  if (name === 'terminal_run_command' || name === 'terminal_start_job' || name === 'terminal_wait_for_job' || name === 'terminal_send_job_input' || name === 'terminal_stop_job' || name === 'bash' || name === 'run_command') {
    const cmd = args.command || args.cmd || '';
    const desc = args.description || args.title || '';
    let title = desc || (name === 'terminal_start_job'
      ? 'Start long-running command'
      : name === 'terminal_wait_for_job'
        ? 'Wait for command job'
        : name === 'terminal_send_job_input'
          ? 'Respond to command prompt'
        : name === 'terminal_stop_job'
          ? 'Stop command job'
          : '');
    if (!title) {
      if (cmd.startsWith('npm install') || cmd.startsWith('pnpm add') || cmd.startsWith('pip install')) {
        title = 'Install dependencies';
      } else if (cmd.includes('create_presentation.js')) {
        title = 'Create presentation script';
      } else if (cmd.startsWith('node ') || cmd.startsWith('python ')) {
        const parts = cmd.split(' ');
        title = `Execute ${parts[1] || 'script'}`;
      } else if (cmd.length > 0 && cmd.length <= 40) {
        title = cmd;
      } else if (cmd.length > 40) {
        title = `Run ${cmd.substring(0, 36)}...`;
      } else {
        title = 'Ran a command';
      }
    }
    return {
      title,
      badge: 'Script',
      iconType: 'command',
      command: cmd,
    };
  }

  if (name === 'workspace_write_file' || name === 'write_workspace_file' || name === 'write_to_file') {
    const fpath = args.file_path || args.relative_path || args.path || args.TargetFile || 'file';
    const fname = fpath.split('/').pop()?.split('\\').pop() || fpath;
    const desc = args.description || args.title;
    const title = desc || `Backend ${fname}`.replace('Backend Backend', 'Backend') || `Create ${fname}`;
    return {
      title,
      badge: fname,
      iconType: 'file_write',
      filePath: fpath,
      content: args.content || args.CodeContent || '',
    };
  }

  if (name === 'workspace_read_file' || name === 'read_workspace_file' || name === 'view_file') {
    const fpath = args.file_path || args.relative_path || args.path || args.AbsolutePath || 'file';
    const fname = fpath.split('/').pop()?.split('\\').pop() || fpath;
    const isSkill = fpath.toLowerCase().includes('skill') || fname.toLowerCase() === 'skill.md';
    if (isSkill) {
      let skillName = fname.replace('.md', '').replace('SKILL', '').replace(/[-_]/g, ' ').trim();
      if (!skillName) {
        const parts = fpath.replace(/\\/g, '/').split('/');
        const pIdx = parts.findIndex((p: string) => p.toLowerCase().includes('skill'));
        if (pIdx !== -1 && parts[pIdx + 1] && parts[pIdx + 1] !== 'SKILL.md') {
          skillName = parts[pIdx + 1];
        } else if (pIdx > 0 && parts[pIdx - 1]) {
          skillName = parts[pIdx - 1];
        }
      }
      return {
        title: `Load ${skillName || 'pptx'} Skill`,
        badge: 'Skill',
        iconType: 'file_read',
        filePath: fpath,
      };
    }
    return {
      title: `Read ${fname}`,
      badge: fname,
      iconType: 'file_read',
      filePath: fpath,
    };
  }

  if (name === 'delegate_to_subagent') {
    const slug = args.plugin_slug || 'subagent';
    const aName = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return {
      title: `Invoked ${aName}`,
      badge: 'Sub-Agent',
      iconType: 'generic',
    };
  }

  if (name === 'browser_goal') {
    return {
      title: args.goal || 'Browser goal',
      badge: 'Goal',
      iconType: 'generic',
    };
  }

  if (name === 'reasoning') {
    return {
      title: 'Reasoning',
      badge: 'Thought',
      iconType: 'generic',
    };
  }

  if (name === 'web_search' || name === 'tavily_search' || name === 'search_web') {
    const q = args.query || args.q || args.search_query || '';
    return {
      title: q ? `Searched the web "${q}"` : 'Searched the web',
      badge: 'Search',
      iconType: 'search',
    };
  }

  if (name === 'mcp_call_tool' || name.startsWith('mcp_')) {
    const sName = args.server_slug_or_id || args.server_name || 'MCP';
    const toolSub = args.tool_name || name;
    return {
      title: `Used ${sName} (${toolSub})`,
      badge: sName,
      iconType: 'mcp',
    };
  }

  return {
    title: `Ran ${name}`,
    badge: name,
    iconType: 'generic',
  };
}

// ── COMPUTES SMART CLAUDE-STYLE GROUP SUMMARY ──
export function buildGroupSummary(tools: ToolEventData[]): string {
  if (tools.length === 1) {
    if (tools[0].toolName === 'browser_goal' || tools[0].toolName === 'reasoning') {
      return '1 progress update';
    }
    const info = getToolSummaryInfo(tools[0]);
    if (info.iconType === 'command') {
      return 'Ran 1 commands';
    }
    if (info.iconType === 'file_write') {
      return 'Created 1 files';
    }
    if (info.iconType === 'file_read') {
      return 'Ran 1 commands';
    }
    return 'Ran 1 commands';
  }

  let writes = 0;
  let commands = 0;
  let reads = 0;
  let searches = 0;
  let mcps = 0;
  let progressUpdates = 0;

  for (const t of tools) {
    if (t.toolName === 'browser_goal' || t.toolName === 'reasoning') {
      progressUpdates++;
      continue;
    }
    const info = getToolSummaryInfo(t);
    if (info.iconType === 'file_write') writes++;
    else if (info.iconType === 'command') commands++;
    else if (info.iconType === 'file_read') reads++;
    else if (info.iconType === 'search') searches++;
    else if (info.iconType === 'mcp') mcps++;
  }

  const parts: string[] = [];
  if (commands > 0 || reads > 0) {
    const totalCmds = commands + reads;
    parts.push(totalCmds === 1 ? 'Ran 1 commands' : `Ran ${totalCmds} commands`);
  }
  if (writes > 0) parts.push(writes === 1 ? 'created 1 files' : `created ${writes} files`);
  if (searches > 0) parts.push(searches === 1 ? 'searched the web' : `ran ${searches} searches`);
  if (mcps > 0) parts.push(mcps === 1 ? 'used 1 integrations' : `used ${mcps} integrations`);
  if (progressUpdates > 0) {
    parts.push(`${progressUpdates} progress update${progressUpdates === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return `Ran ${tools.length} commands`;
  }

  const summary = parts.join(', ');
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

// ── INTERACTIVE ARTIFACT CARD (EXACT MATCH TO CLAUDE SCREENSHOT 2) ──
export const ArtifactCard: React.FC<{
  title: string;
  filePath?: string;
  description?: string;
  onOpenFile?: (path: string) => void;
}> = ({ title, filePath, description, onOpenFile }) => {
  return (
    <div className="w-full max-w-2xl my-2.5">
      <div
        onClick={() => onOpenFile && filePath && onOpenFile(filePath)}
        className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#121212] border border-[#222222] hover:border-[#383838] transition-all cursor-pointer group shadow-lg"
      >
        <div className="w-10 h-10 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center text-neutral-300 group-hover:text-white group-hover:scale-105 transition-all shrink-0">
          <Layers size={18} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[14.5px] font-medium text-white truncate group-hover:text-amber-300 transition-colors">
              {title}
            </h4>
            <ExternalLink size={12} className="text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-[12.5px] text-neutral-400 truncate mt-0.5">
            {description || 'Interactive artifact · Deliverable'}
          </p>
        </div>
      </div>
    </div>
  );
};

// ── CONNECTED CONTINUOUS TOOL SEQUENCE (EXACT MATCH TO CLAUDE SCREENSHOTS) ──
export const ConnectedToolSequence: React.FC<{
  tools: ToolEventData[];
  onOpenFile?: (path: string) => void;
  isMessageStreaming?: boolean;
}> = ({ tools, onOpenFile, isMessageStreaming = false }) => {
  if (!tools || tools.length === 0) return null;

  const displayTools = isMessageStreaming ? tools : tools.map((tool) =>
    tool.status === 'running'
      ? { ...tool, status: 'failed' as const, output: tool.output || 'Talos ended this run before the tool returned a result. Check the run error or backend logs.' }
      : tool
  );
  const anyRunning = displayTools.some((t) => t.status === 'running');
  const anyFailed = displayTools.some((t) => t.status === 'failed');
  // Starts collapsed by default when done (Claude-style), open when actively running
  const [isGroupFolded, setIsGroupFolded] = useState(!anyRunning);

  // Per-step detailed expansion inside timeline
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});

  const toggleStep = (id: string) => {
    setExpandedStepIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const summaryLabel = buildGroupSummary(displayTools);

  return (
    <div className="w-full max-w-2xl my-1.5 font-sans select-none">
      {/* ── Top Summary Header: Lightning bolt + Title + Chevron ── */}
      <button
        onClick={() => setIsGroupFolded(!isGroupFolded)}
        className="flex items-center gap-1.5 text-[14px] font-sans text-neutral-300 hover:text-white transition-colors cursor-pointer py-1 group select-none text-left"
      >
        <Zap size={14} className="text-neutral-400 group-hover:text-amber-400 transition-colors shrink-0" />
        <span className={`font-normal transition-colors ${anyFailed ? 'text-red-300 group-hover:text-red-200' : 'text-[#c5c5c5] group-hover:text-white'}`}>
          {anyFailed && !anyRunning ? `${summaryLabel} · failed` : summaryLabel}
        </span>
        {isGroupFolded ? (
          <ChevronRight size={13} className="text-neutral-500 group-hover:text-white transition-colors shrink-0" />
        ) : (
          <ChevronDown size={13} className="text-neutral-500 group-hover:text-white transition-colors shrink-0" />
        )}
        {anyRunning && <Loader2 size={12} className="text-neutral-400 animate-spin ml-1 shrink-0" />}
      </button>

      {/* ── Connected Branch with Curved Elbow and Bullet Dot ── */}
      {!isGroupFolded && (
        <div className="relative pl-[7px] mt-0.5 space-y-0.5">
          {displayTools.map((tool, idx) => {
            const isLast = idx === tools.length - 1;
            const info = getToolSummaryInfo(tool);
            const stepId = tool.toolCallId || `step_${idx}`;
            const isStepExpanded = !!expandedStepIds[stepId];
            const isRunning = tool.status === 'running';
            const cleanOutput = cleanToolOutput(tool.output);
            const argsJson = tool.args && typeof tool.args === 'object'
              ? JSON.stringify(tool.args, null, 2) || ''
              : '';

            return (
              <div key={stepId} className="relative flex flex-col">
                <div className="flex items-center gap-1.5 py-1 group/step">
                  {/* Connector curve & bullet dot */}
                  <div className="relative w-6 h-6 shrink-0 flex items-center">
                    {/* Vertical trunk line continuing to next items */}
                    {!isLast && (
                      <div className="absolute left-0 top-0 bottom-0 w-[1.5px] bg-[#3a3a3a]" />
                    )}
                    {/* Curved elbow to the bullet dot */}
                    <div className="absolute left-0 top-0 w-3.5 h-[13px] border-l-[1.5px] border-b-[1.5px] border-[#3a3a3a] rounded-bl-[6px]" />
                    {/* Bullet dot */}
                    <div className={`absolute left-[16px] w-[5px] h-[5px] rounded-full shrink-0 ${tool.status === 'failed' ? 'bg-red-400' : tool.status === 'completed' ? 'bg-emerald-400' : 'bg-[#888888]'}`} />
                  </div>

                  {/* Step label */}
                  <div
                    onClick={() => toggleStep(stepId)}
                    className="flex items-center gap-2 cursor-pointer select-none min-w-0 flex-1"
                  >
                    <span className="text-[13.5px] text-[#c5c5c5] hover:text-white transition-colors truncate">
                      {info.title}
                    </span>

                    {/* Badge pill if any */}
                    {info.badge && info.badge !== 'Skill' && (
                      <span className="px-1.5 py-0.2 rounded text-[10.5px] font-mono bg-[#181818] text-neutral-400 border border-[#262626]">
                        {info.badge}
                      </span>
                    )}

                    {/* Download/open icon if file */}
                    {info.filePath && onOpenFile && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFile(info.filePath!);
                        }}
                        className="p-1 rounded text-neutral-500 hover:text-white transition-colors"
                        title="Open in Canvas"
                      >
                        <ArrowDown size={12} />
                      </button>
                    )}

                    {/* Chevron toggle */}
                    <span className="text-neutral-500 hover:text-neutral-300 transition-colors">
                      {isStepExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                  </div>
                </div>

                {/* Step expanded detail box */}
                {isStepExpanded && (
                  <div className="ml-7 mb-2 text-xs font-mono select-text">
                    {info.iconType === 'command' && (
                      <div className="bg-[#111111] border border-[#242424] rounded-xl p-3 space-y-2">
                        <div className="text-neutral-500 font-mono text-[11px]">bash</div>
                        <div className="text-[12.5px] font-mono text-neutral-200 overflow-x-auto whitespace-pre-wrap">
                          {highlightBash(info.command || '')}
                        </div>
                        <div className="text-neutral-500 font-mono text-[11px] pt-1">Output</div>
                        <div className="text-[#ececec] font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                          {cleanOutput || (isRunning ? 'Executing...' : 'ok')}
                        </div>
                      </div>
                    )}

                    {info.iconType === 'file_write' && (
                      <div className="bg-[#111111] border border-[#242424] rounded-xl p-3 space-y-2">
                        <div className="text-neutral-400 font-mono text-[11px] flex items-center justify-between">
                          <span>{info.filePath}</span>
                          {info.content && <span>{info.content.split('\n').length} lines</span>}
                        </div>
                        {info.content && (
                          <div className="rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] p-2.5 max-h-48 overflow-y-auto overflow-x-auto text-[11.5px]">
                            {highlightCode(info.content)}
                          </div>
                        )}
                        <div className="text-emerald-400 font-mono text-[11.5px]">
                          {cleanOutput || (isRunning ? 'Writing file...' : 'File written successfully')}
                        </div>
                      </div>
                    )}

                    {info.iconType === 'file_read' && (
                      <div className="bg-[#111111] border border-[#242424] rounded-xl p-3 space-y-2">
                        <div className="text-neutral-400 font-mono text-[11px] flex items-center gap-1.5">
                          <BookOpen size={12} className="text-amber-400" />
                          <span>{info.filePath}</span>
                        </div>
                        <div className="rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] p-3 max-h-60 overflow-y-auto text-[12px] font-sans text-neutral-300 leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {stripFrontmatter(cleanOutput || (isRunning ? 'Reading...' : 'No content'))}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {info.iconType === 'search' && (
                      <div className="bg-[#111111] border border-[#242424] rounded-xl p-3 space-y-2">
                        {parseSources(tool.output).length > 0 ? (
                          <div className="space-y-2 pt-0.5">
                            {parseSources(tool.output).map((s, sIdx) => (
                              <a
                                key={sIdx}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between py-0.5 text-[12.5px] hover:text-white transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                                  <img
                                    src={getFaviconUrl(s.domain)}
                                    alt=""
                                    className="w-3.5 h-3.5 rounded shrink-0 bg-[#1c1c1c]"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                  <span className="text-[#e2e8f0] truncate">{s.title}</span>
                                </div>
                                <span className="text-neutral-500 text-[11px] shrink-0 font-mono">
                                  {s.domain}
                                </span>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="text-neutral-400 text-[11.5px]">
                            {cleanOutput || 'Search completed'}
                          </div>
                        )}
                      </div>
                    )}

                    {info.iconType === 'mcp' && (
                      <div className="bg-[#111111] border border-[#242424] rounded-xl p-3 space-y-2">
                        <div className="text-neutral-500 font-mono text-[11px]">Output</div>
                        <div className="text-[#ececec] font-mono text-[12px] whitespace-pre-wrap">
                          {cleanOutput || 'Completed'}
                        </div>
                      </div>
                    )}

                    {info.iconType === 'generic' && (
                      <div className="bg-[#111111] border border-[#242424] rounded-xl p-3 space-y-2">
                        <div className="text-neutral-500 font-mono text-[11px]">{tool.toolName}</div>
                        {argsJson && (
                          <div className="text-neutral-300 font-mono text-[12px] whitespace-pre-wrap">
                            {highlightJson(argsJson)}
                          </div>
                        )}
                        <div className="text-neutral-300 font-mono text-[12px] whitespace-pre-wrap">
                          {cleanOutput || (isRunning ? 'Running...' : 'Completed')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── SINGLE TOOL CARD COMPONENT ──
export const SingleToolCard: React.FC<{
  tool: ToolEventData;
  onOpenFile?: (path: string) => void;
}> = ({ tool, onOpenFile }) => {
  if (tool.toolName === 'workspace_open_browser') {
    let result: Record<string, unknown> = {};
    try {
      result = typeof tool.output === 'string'
        ? JSON.parse(cleanToolOutput(tool.output))
        : tool.output && typeof tool.output === 'object'
          ? tool.output as Record<string, unknown>
          : {};
    } catch {}
    const failed = tool.status === 'failed' || result.status === 'error';
    return (
      <div className={`my-2 rounded-xl border px-4 py-3 text-sm ${failed ? 'border-red-900/50 bg-red-950/20 text-red-300' : 'border-blue-900/40 bg-blue-950/10 text-neutral-200'}`}>
        <div className="flex items-center gap-2 font-medium">
          <Globe size={14} className={failed ? 'text-red-400' : 'text-blue-400'} />
          <span>{failed ? 'Could not open embedded browser' : 'Opened in Talos Workspace Browser'}</span>
        </div>
        <div className="mt-1 truncate text-xs text-neutral-400">{String(result.url || tool.args?.url || result.error || 'No URL returned.')}</div>
      </div>
    );
  }
  // If artifact deliverable, render ArtifactCard
  if (tool.toolName === 'workspace_show_file') {
    let sf: any = {};
    try {
      sf = typeof tool.output === 'string' ? JSON.parse(cleanToolOutput(tool.output)) : tool.output || {};
    } catch {
      sf = tool.args || {};
    }
    const filePath = sf.file_path || sf.file_name || tool.args?.file_path;
    if (sf.status === 'error' || !filePath) {
      return (
        <div role="alert" className="my-2 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          Could not open the workspace file: {sf.error || 'The file path was not returned.'}
        </div>
      );
    }
    const title = sf.title || tool.args?.title || filePath.split('/').pop();
    const desc = sf.description || tool.args?.description || 'Interactive artifact · Deliverable';
    return <ArtifactCard title={title} filePath={filePath} description={desc} onOpenFile={onOpenFile} />;
  }

  // Otherwise render single-item ConnectedToolSequence
  return <ConnectedToolSequence tools={[tool]} onOpenFile={onOpenFile} />;
};

// ── MCP TOOL GROUP CARD ──
export const McpToolGroupCard: React.FC<{ tools: ToolEventData[] }> = ({ tools }) => {
  return <ConnectedToolSequence tools={tools} />;
};

// ── BATCH STEPLINE FOR LEGACY COMPATIBILITY ──
export const StepLine: React.FC<StepLineProps> = ({ toolsExecuted, onOpenFile }) => {
  if (!toolsExecuted || toolsExecuted.length === 0) return null;

  // Separate any workspace_show_file tools from other tools
  const regularTools = toolsExecuted.filter((t) => t.toolName !== 'workspace_show_file');
  const artifactTools = toolsExecuted.filter((t) => t.toolName === 'workspace_show_file');

  return (
    <div className="my-2 select-none font-sans space-y-2">
      {regularTools.length > 0 && (
        <ConnectedToolSequence tools={regularTools} onOpenFile={onOpenFile} />
      )}
      {artifactTools.map((at, idx) => (
        <SingleToolCard key={idx} tool={at} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
};
