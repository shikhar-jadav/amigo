'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Save,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Eye,
  Edit3,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProactive } from '@/context/ProactiveContext';

interface StandingOrdersViewProps {
  onBack?: () => void;
}

const DEFAULT_OPENCLAW_AGENTS_MD = `# AGENTS.md - Workspace Operating Instructions

## Role & Mission
You are Talos, an autonomous AI software engineer operating locally in this workspace. You act proactively to keep code healthy, run diagnostic sweeps, and assist with development tasks.

## Operational Boundaries & Approval Gates
- **Always Allowed**: 
  - Running non-destructive diagnostics (\`git status\`, \`git diff\`, \`npm test\`, \`pytest\`, linter checks).
  - Reading project documentation, schema files, and source code.
  - Inspecting local dev server logs and process statuses.
- **Requires Confirmation**: 
  - Deleting files or executing destructive cleanup commands (\`rm -rf\`, \`DROP TABLE\`).
  - Force pushing to git repositories (\`git push --force\`).
  - Exposing, transmitting, or editing sensitive credentials.
- **Protected Files**: 
  - Strictly forbidden from modifying or exfiltrating \`.env\`, \`.git\` internal configs, \`secrets.json\`, and SSH/auth keys.

## Background Automations & Heartbeat Policy
- **Dev Server Monitoring**: Keep local dev servers alive and healthy. If a crash occurs, diagnose the error and alert the user.
- **Quiet-by-Default Execution**:
  - Scheduled audits and heartbeat checks should remain completely silent (\`NO_REPLY\`) when all checks and tests pass.
  - Only dispatch notifications or chat alerts when an issue, test failure, or actionable anomaly requires user attention.

## Coding Standards
- Follow standard TypeScript strict conventions and project architecture patterns.
- Always verify changes with unit tests before completing tasks.
`;

export const StandingOrdersView: React.FC<StandingOrdersViewProps> = ({ onBack }) => {
  const { fetchAgentsMd, saveAgentsMd } = useProactive();

  const [content, setContent] = useState<string>('');
  const [initialContent, setInitialContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      const text = await fetchAgentsMd();
      if (mounted) {
        const initial = text.trim() ? text : DEFAULT_OPENCLAW_AGENTS_MD;
        setContent(initial);
        setInitialContent(initial);
        setIsLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [fetchAgentsMd]);

  const hasUnsavedChanges = content !== initialContent;

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSavedSuccess(false);

    const ok = await saveAgentsMd(content);
    setIsSaving(false);
    if (ok) {
      setInitialContent(content);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
      return;
    }

    // Support indenting with Tab key
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('Reset AGENTS.md to standard OpenClaw template?')) {
      setContent(DEFAULT_OPENCLAW_AGENTS_MD);
    }
  };

  const lineCount = content ? content.split('\n').length : 0;
  const wordCount = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e1e1e] bg-[#0c0c0c] shrink-0">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer mr-0.5"
              title="Back to automations"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <FileText size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-neutral-100 font-mono tracking-tight">AGENTS.md</h2>
              {hasUnsavedChanges && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
              )}
            </div>
            <p className="text-[10px] text-neutral-500">OpenClaw workspace instructions & operating bounds</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex items-center bg-[#161616] border border-neutral-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'edit'
                  ? 'bg-neutral-800 text-white font-medium shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Edit3 size={12} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'preview'
                  ? 'bg-neutral-800 text-white font-medium shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Eye size={12} />
              <span>Preview</span>
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Save AGENTS.md (Ctrl+S)"
          >
            {isSaving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : savedSuccess ? (
              <CheckCircle2 size={13} className="text-black" />
            ) : (
              <Save size={13} />
            )}
            <span>{savedSuccess ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs gap-2">
            <Loader2 size={16} className="animate-spin text-amber-500" />
            <span>Loading AGENTS.md…</span>
          </div>
        ) : activeTab === 'edit' ? (
          <div className="flex-1 flex flex-col relative h-full">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoFocus
              className="flex-1 w-full p-4 font-mono text-[13px] leading-[1.65] bg-[#0c0c0c] border border-[#222222] rounded-xl text-neutral-200 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 resize-none shadow-inner selection:bg-amber-500/30 selection:text-white"
              placeholder="Write workspace instructions, guidelines, and operating bounds for your agent..."
            />
          </div>
        ) : (
          /* Preview Mode */
          <div className="flex-1 w-full overflow-y-auto p-5 bg-[#0c0c0c] border border-[#222222] rounded-xl text-neutral-200 text-xs leading-relaxed space-y-3 prose-talos">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || '_Empty AGENTS.md file_'}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Footer Info & Shortcuts */}
      <div className="px-5 py-2.5 border-t border-[#181818] bg-[#0c0c0c] flex items-center justify-between text-[11px] text-neutral-500 shrink-0">
        <div className="flex items-center gap-3">
          <span>{lineCount} lines</span>
          <span>•</span>
          <span>{wordCount} words</span>
          <span>•</span>
          <span className="font-mono text-neutral-400">./AGENTS.md</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-1 text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer"
            title="Reset to standard OpenClaw template"
          >
            <Sparkles size={11} />
            <span>Template</span>
          </button>
          <span>•</span>
          <span className="text-neutral-500 font-mono">Ctrl+S to save</span>
        </div>
      </div>
    </div>
  );
};
