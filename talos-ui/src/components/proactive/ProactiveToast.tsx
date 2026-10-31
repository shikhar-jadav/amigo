'use client';

import React, { useEffect } from 'react';
import { useProactive } from '@/context/ProactiveContext';
import { Zap, Calendar, X, ArrowRight } from 'lucide-react';

interface ProactiveToastProps {
  onOpenCanvasFile?: (filePath: string) => void;
}

export const ProactiveToast: React.FC<ProactiveToastProps> = ({ onOpenCanvasFile }) => {
  const { activeToast, dismissToast } = useProactive();

  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      dismissToast();
    }, 12000);
    return () => clearTimeout(timer);
  }, [activeToast, dismissToast]);

  if (!activeToast) return null;

  const isAlert = activeToast.notification_type === 'alert';

  return (
    <div className="fixed top-5 right-5 z-[1000] max-w-sm w-full bg-[#0c0c0c] border border-[#262626] rounded-xl shadow-2xl p-4 text-white animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg shrink-0 ${
            isAlert
              ? 'bg-amber-950/50 text-amber-400 border border-amber-800/40'
              : 'bg-cyan-950/50 text-cyan-400 border border-cyan-800/40'
          }`}
        >
          {isAlert ? <Zap size={18} /> : <Calendar size={18} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-neutral-200 truncate">
              {activeToast.title}
            </h4>
            <button
              onClick={dismissToast}
              className="text-neutral-500 hover:text-neutral-300 transition-colors p-0.5"
            >
              <X size={14} />
            </button>
          </div>

          <p className="text-[12px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
            {activeToast.content_markdown.replace(/[#*`]/g, '')}
          </p>

          <div className="flex items-center gap-2 mt-3">
            {activeToast.artifact_path && onOpenCanvasFile && (
              <button
                onClick={() => {
                  onOpenCanvasFile(activeToast.artifact_path!);
                  dismissToast();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
              >
                <span>View in Canvas</span>
                <ArrowRight size={11} />
              </button>
            )}
            <button
              onClick={dismissToast}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-neutral-400 hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
