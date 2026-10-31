'use client';

import React from 'react';
import { Zap, Calendar, Activity, ExternalLink, Download } from 'lucide-react';

export interface ProactiveCardData {
  type: 'alert' | 'scheduled_report' | 'health_check';
  title: string;
  markdown: string;
  artifactPath?: string;
  actions?: Array<{ label: string; action: string; path?: string }>;
}

interface ProactiveCardProps {
  data: ProactiveCardData;
  onOpenFile?: (filePath: string) => void;
}

export const ProactiveCard: React.FC<ProactiveCardProps> = ({ data, onOpenFile }) => {
  const isAlert = data.type === 'alert';
  const isReport = data.type === 'scheduled_report';

  return (
    <div className="my-3 rounded-2xl bg-[#0d0d0d] border border-[#222222] p-5 shadow-lg overflow-hidden">
      {/* Header Tag */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
            isAlert
              ? 'bg-amber-950/40 text-amber-400 border-amber-800/40'
              : isReport
              ? 'bg-cyan-950/40 text-cyan-400 border-cyan-800/40'
              : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
          }`}
        >
          {isAlert ? <Zap size={13} /> : isReport ? <Calendar size={13} /> : <Activity size={13} />}
          <span>{isAlert ? 'Proactive Alert' : isReport ? 'Scheduled Report' : 'System Health'}</span>
        </span>
        <h4 className="text-sm font-semibold text-neutral-200">{data.title}</h4>
      </div>

      {/* Main Content Area */}
      <div className="text-xs text-neutral-300 leading-relaxed space-y-2 whitespace-pre-wrap font-sans">
        {data.markdown}
      </div>

      {/* Action Footer */}
      {(data.artifactPath || (data.actions && data.actions.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-[#1a1a1a]">
          {data.artifactPath && onOpenFile && (
            <button
              onClick={() => onOpenFile(data.artifactPath!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1a1a] hover:bg-[#252525] text-neutral-200 border border-[#2c2c2c] transition-colors cursor-pointer"
            >
              <ExternalLink size={13} className="text-cyan-400" />
              <span>Open in Canvas Drawer</span>
            </button>
          )}

          {data.artifactPath && (
            <a
              href={`/api/workspace/files/download?path=${encodeURIComponent(data.artifactPath)}`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>Download .md</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
};
