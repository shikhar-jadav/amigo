'use client';

import React, { useState, useRef, useEffect, KeyboardEvent, useMemo } from 'react';
import { Plus, ArrowUp, ChevronDown, Check, X, Sparkles, Mic, AudioLines, FileText, Paperclip, Square } from 'lucide-react';

interface ComposerProps {
  onSend: (text: string, model: string) => void;
  isStreaming: boolean;
  onStop?: () => void;
  isCentered?: boolean;
}

export const MODEL_OPTIONS = [
  { id: "GLM-4.7-Flash", name: "GLM 4.7 Flash", detail: "Z.ai Ultra Fast" },
  { id: "glm-5-2", name: "GLM 5.2", detail: "Fast & Precise" },
  { id: "zai-glm-5-3", name: "Zai GLM 5.3", detail: "Advanced Reasoning" },
  { id: "mistral-medium-latest", name: "Mistral Medium", detail: "Balanced Intelligence" },
  { id: "mistral-large-2512", name: "Mistral Large 2512", detail: "Flagship Reasoning" },
  { id: "codestral-2508", name: "Codestral 2508", detail: "Code Specialist" },
  { id: "codestral-latest", name: "Codestral Latest", detail: "Code Expert" },
  { id: "mistral-small-latest", name: "Mistral Small", detail: "Fast" },
];

// Module-level cached skills to avoid redundant network roundtrips on every input/layout transition
let _cachedSkills: { id: string; name: string; slug: string }[] | null = null;
let _fetchPromise: Promise<{ id: string; name: string; slug: string }[]> | null = null;

async function getInstalledSkills(): Promise<{ id: string; name: string; slug: string }[]> {
  if (_cachedSkills) return _cachedSkills;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch('/api/skills/installed');
      if (res.ok) {
        const data = await res.json();
        if (data.skills && Array.isArray(data.skills)) {
          _cachedSkills = data.skills;
          return _cachedSkills;
        }
      }
    } catch {}

    // Fallback: check active user plugins
    try {
      const pRes = await fetch('/api/marketplace/user/plugins');
      if (pRes.ok) {
        const pData = await pRes.json();
        const installed = (pData.installed || [])
          .filter((p: any) => p.plugin_type === 'skill' && p.is_active !== false)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            slug: p.slug
          }));
        _cachedSkills = installed;
        return installed;
      }
    } catch {}

    _cachedSkills = [];
    return [];
  })().finally(() => {
    _fetchPromise = null;
  });

  return _fetchPromise;
}

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  isStreaming,
  onStop,
  isCentered = false,
}) => {
  const [value, setValue] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('talos_selected_model');
      if (saved) {
        const found = MODEL_OPTIONS.find((m) => m.id === saved);
        if (found) return found;
      }
    }
    return MODEL_OPTIONS[0];
  });
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'cowork'>('chat');
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);

  // Available skills for / slash command autocomplete
  const [availableSkills, setAvailableSkills] = useState<{ id: string; name: string; slug: string }[]>(
    () => _cachedSkills || []
  );

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    getInstalledSkills().then((skills) => {
      if (mounted) {
        setAvailableSkills(skills);
      }
    });

    const handleStorage = () => {
      _cachedSkills = null;
      getInstalledSkills().then((skills) => {
        if (mounted) setAvailableSkills(skills);
      });
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Determine if slash command popup should be open
  const isSlashActive = value.startsWith('/') && !value.includes(' ');
  const slashQuery = isSlashActive ? value.slice(1).toLowerCase() : '';

  const matchedSkills = useMemo(() => {
    if (!isSlashActive) return [];
    if (!slashQuery) return availableSkills;
    return availableSkills.filter(
      (s) => s.slug.toLowerCase().includes(slashQuery) || s.name.toLowerCase().includes(slashQuery)
    );
  }, [isSlashActive, slashQuery, availableSkills]);

  const handleSelectSkill = (slug: string) => {
    setValue(`/${slug} `);
    if (taRef.current) {
      taRef.current.focus();
    }
  };

  const handleSend = () => {
    if (!value.trim() || isStreaming) return;
    onSend(value, selectedModel.id);
    setValue('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSlashActive && matchedSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex((prev) => (prev + 1) % matchedSkills.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex((prev) => (prev - 1 + matchedSkills.length) % matchedSkills.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectSkill(matchedSkills[slashMenuIndex]?.slug || matchedSkills[0].slug);
        return;
      }
      if (e.key === 'Escape') {
        setValue('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className={`w-full select-none ${isCentered ? 'px-4' : 'px-4 pb-5 pt-2'}`}>
      <div className="mx-auto max-w-[720px] flex flex-col gap-2 relative">
        {/* Pending attachments pill bar */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {pendingFiles.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-lg border border-[#2b2b2b] bg-[#1a1a1a] px-2.5 py-1 text-[12px] font-mono text-[#cccccc]"
              >
                <span>{f}</span>
                <button
                  onClick={() => setPendingFiles(pendingFiles.filter((_, idx) => idx !== i))}
                  className="hover:text-red-400 p-0.5 rounded cursor-pointer transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── SLASH POPUP (MATCHING IMAGE 5: / POPUP LIST) ── */}
        {isSlashActive && (
          <div className="absolute bottom-[calc(100%+8px)] left-2 w-64 rounded-2xl bg-[#1e1e1e] border border-[#2d2d2d] shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
            {/* Add files row */}
            <div
              onClick={() => {
                fileInputRef.current?.click();
                setValue('');
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#cccccc] hover:text-white hover:bg-[#282828] cursor-pointer transition-colors mb-0.5"
            >
              <Paperclip size={14} className="text-[#888888]" />
              <span>Add files</span>
            </div>

            {/* List of skills */}
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {matchedSkills.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[#777777]">No matching skills</div>
              ) : (
                matchedSkills.map((s, idx) => (
                  <div
                    key={s.slug}
                    onClick={() => handleSelectSkill(s.slug)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      idx === slashMenuIndex
                        ? 'bg-[#2b2b2b] text-white'
                        : 'text-[#cccccc] hover:bg-[#262626] hover:text-white'
                    }`}
                  >
                    <FileText size={14} className="text-[#888888]" />
                    <span className="font-mono">{s.slug}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── CLAUDE STYLE INPUT CARD (MATCHING IMAGES 4 & 5) ── */}
        <div className="relative flex flex-col rounded-[24px] border border-[#2c2c2c] bg-[#1e1e1e] shadow-2xl transition-all">
          {/* Main textarea with slash command styling matching media_1790845599898.png */}
          {(() => {
            const slashMatch = value.match(/^(\/[a-zA-Z0-9_\-]+)([\s\S]*)?$/);
            const isCommandActive = !!slashMatch;
            const commandPrefix = slashMatch ? slashMatch[1] : '';
            const querySuffix = slashMatch ? (slashMatch[2] || '') : '';

            return (
              <div className="relative w-full">
                {isCommandActive && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 px-5 pt-4 pb-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words font-sans z-0 select-none overflow-hidden"
                    style={{ fontKerning: 'none', letterSpacing: 'normal' }}
                  >
                    <span className="text-[#38bdf8] font-medium">{commandPrefix}</span>
                    <span className="text-[#f3f3f3]">{querySuffix}</span>
                  </div>
                )}
                <textarea
                  ref={taRef}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    autoGrow();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={isCentered ? "How can I help you today?" : "Reply..."}
                  rows={isCentered ? 2 : 1}
                  style={{ fontKerning: 'none', letterSpacing: 'normal' }}
                  className={`relative z-10 w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed focus:outline-none placeholder:text-[#6a6a6a] font-sans ${
                    isCommandActive ? 'text-transparent caret-white' : 'text-[#f3f3f3]'
                  }`}
                />
              </div>
            );
          })()}

          {/* Footer toolbar */}
          <div className="flex items-center justify-between px-3.5 pb-3 pt-1">
            {/* Left controls: Plus icon + Chat/Cowork toggle pill */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    const names = Array.from(e.target.files).map(f => f.name);
                    setPendingFiles([...pendingFiles, ...names]);
                  }
                }}
                className="hidden"
              />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8c8c8c] hover:text-white hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                  title="Add attachment or skill"
                >
                  <Plus size={18} />
                </button>

                {showAttachmentMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl bg-[#1e1e1e] border border-[#2d2d2d] shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                        setShowAttachmentMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#cccccc] hover:text-white hover:bg-[#282828] cursor-pointer transition-colors text-left"
                    >
                      <Paperclip size={14} className="text-[#888888]" />
                      <span>Add files</span>
                    </button>

                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium text-[#777777] uppercase tracking-wider">
                      Installed Skills
                    </div>
                    {availableSkills.slice(0, 5).map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => {
                          handleSelectSkill(s.slug);
                          setShowAttachmentMenu(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#cccccc] hover:text-white hover:bg-[#282828] cursor-pointer transition-colors text-left font-mono"
                      >
                        <FileText size={14} className="text-[#888888]" />
                        <span>/{s.slug}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right controls: Model name + Mic + Audio + Orange Send button */}
            <div className="flex items-center gap-2">
              {/* Model Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-[#a6a6a6] hover:text-white transition-colors cursor-pointer py-1 px-1.5"
                >
                  <span>{selectedModel.name}</span>
                  <span className="text-[11px] text-[#6e6e6e]">{selectedModel.detail}</span>
                  <ChevronDown size={13} className="text-[#6e6e6e]" />
                </button>

                {showModelDropdown && (
                  <div className="absolute bottom-full right-0 mb-2 w-52 rounded-2xl border border-[#333333] bg-[#222222] p-1.5 shadow-2xl z-50 animate-fade-in">
                    {MODEL_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(m);
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('talos_selected_model', m.id);
                          }
                          setShowModelDropdown(false);
                        }}
                        className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer text-[#cccccc] hover:bg-[#2d2d2d] hover:text-white"
                      >
                        <div>
                          <div className="font-semibold text-white">{m.name}</div>
                          <div className="text-[10px] text-[#888888]">{m.detail}</div>
                        </div>
                        {m.id === selectedModel.id && <Check size={14} className="text-[#a3e635]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mic Icon */}
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8c8c8c] hover:text-white hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                title="Voice input"
              >
                <Mic size={16} />
              </button>

              {/* Submit / stop button */}
              <button
                type="button"
                onClick={isStreaming ? onStop : handleSend}
                disabled={isStreaming ? !onStop : !value.trim()}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer shadow-md active:scale-95 ml-1 ${
                  isStreaming
                    ? 'bg-red-700 text-white hover:bg-red-600'
                    : value.trim()
                      ? 'bg-[#d96538] text-white hover:bg-[#e07548]'
                      : 'bg-[#292929] text-[#666666] cursor-not-allowed'
                }`}
                title={isStreaming ? 'Stop response' : 'Send message'}
                aria-label={isStreaming ? 'Stop response' : 'Send message'}
              >
                {isStreaming ? <Square size={13} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
