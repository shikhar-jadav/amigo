'use client';

import React, { useState } from 'react';
import { Copy, Check, Share, RotateCcw, MoreHorizontal } from 'lucide-react';
import { StepLine, ToolEventData } from './StepLine';

export interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  toolsExecuted?: ToolEventData[];
}

interface ChatMessageProps {
  message: MessageData;
  onRetry?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRetry }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── USER MESSAGE BUBBLE (Exact match to Image 4: blue pill on the right) ───────
  if (isUser) {
    return (
      <div className="py-2.5 px-4 md:px-8 max-w-3xl mx-auto flex justify-end">
        <div
          className="rounded-[22px] px-5 py-2.5 text-[15px] text-white font-normal max-w-[85%] break-words leading-relaxed"
          style={{ background: "#1d4ed8" }} // Deep vibrant blue matching Image 4
        >
          {message.content}
        </div>
      </div>
    );
  }

  // ── ASSISTANT MESSAGE (Exact match to Image 4: clean text on black background with action icons below) ──
  return (
    <div className="py-3 px-4 md:px-8 max-w-3xl mx-auto flex flex-col gap-2">
      {/* Tool / Reasoning execution step accordion if web search was called */}
      {message.toolsExecuted && message.toolsExecuted.length > 0 && (
        <div className="mb-1">
          <StepLine toolsExecuted={message.toolsExecuted} />
        </div>
      )}

      {/* Main message text in clean sans-serif */}
      <div className="text-[15.5px] leading-[1.7] text-[#ececec] whitespace-pre-wrap break-words">
        {message.content}
        {message.isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1.5 align-middle bg-[#a3e635] animate-pulse"></span>
        )}
      </div>

      {/* Bottom Action icons (matching Image 4: copy, share, retry, more) */}
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
