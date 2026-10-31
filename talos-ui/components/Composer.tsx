'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Plus, ArrowUp, ChevronDown, Check, X, Sparkles, Mic, AudioLines } from 'lucide-react';

interface ComposerProps {
  onSend: (text: string, model: string) => void;
  isStreaming: boolean;
  onStop?: () => void;
  isCentered?: boolean;
}

const MODEL_OPTIONS = [
  { id: "codestral-2508", name: "Sonnet 5.5", detail: "Medium" },
  { id: "mistral-small-latest", name: "Mistral Small", detail: "Fast" },
  { id: "mistral-medium-latest", name: "Mistral Medium", detail: "Advanced" },
  { id: "codestral-latest", name: "Codestral Latest", detail: "Code Expert" },
];

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  isStreaming,
  onStop,
  isCentered = false,
}) => {
  const [value, setValue] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!value.trim() || isStreaming) return;
    onSend(value, selectedModel.id);
    setValue('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      <div className="mx-auto max-w-[720px] flex flex-col gap-2">
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

        {/* Claude Style Input Box Container (Matching Image 3) */}
        <div
          className="relative flex flex-col rounded-[24px] border border-[#2c2c2c] bg-[#1e1e1e] shadow-2xl transition-all"
        >
          {/* Main textarea */}
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              autoGrow();
            }}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            rows={isCentered ? 2 : 1}
            className="w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed text-[#f3f3f3] focus:outline-none placeholder:text-[#6a6a6a]"
          />

          {/* Footer toolbar inside the card (Image 3 design) */}
          <div className="flex items-center justify-between px-3.5 pb-3 pt-1">
            {/* Left controls: Plus icon */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingFiles([...pendingFiles, `file_${pendingFiles.length + 1}.txt`])}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8c8c8c] hover:text-white hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                title="Add attachment"
              >
                <Plus size={18} />
              </button>
            </div>

            {/* Right controls: Model name + Voice/Audio icons + Send button */}
            <div className="flex items-center gap-2">
              {/* Model Dropdown Selector */}
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

              {/* Audio waveform icon */}
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8c8c8c] hover:text-white hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                title="Audio mode"
              >
                <AudioLines size={16} />
              </button>

              {/* Submit Button (if text entered, show active arrow button) */}
              {value.trim() && (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isStreaming}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black hover:bg-[#e2e2e2] transition-all cursor-pointer shadow-md active:scale-95 ml-1"
                  title="Send message"
                >
                  <ArrowUp size={15} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
