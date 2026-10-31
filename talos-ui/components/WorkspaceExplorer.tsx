'use client';

import React from 'react';
import { X, Folder, FileCode, ChevronRight } from 'lucide-react';

interface WorkspaceExplorerProps {
  onClose: () => void;
}

export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = ({ onClose }) => {
  const sampleFiles = [
    { name: 'talos-cloud/', isDir: true },
    { name: '  main.py', isDir: false },
    { name: '  relay.py', isDir: false },
    { name: '  config.py', isDir: false },
    { name: '  auth.py', isDir: false },
    { name: 'talos-backend/', isDir: true },
    { name: '  main.py', isDir: false },
    { name: '  agent/graph.py', isDir: false },
    { name: '  protocols/agui/bridge.py', isDir: false },
    { name: 'talos-ui/', isDir: true },
    { name: '  app/page.tsx', isDir: false },
    { name: '  components/Composer.tsx', isDir: false },
    { name: 'start.ps1', isDir: false },
    { name: 'stop.ps1', isDir: false },
  ];

  return (
    <div
      className="w-72 h-full border-l flex flex-col select-none transition-all animate-fade-in shrink-0"
      style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-subtle)" }}
    >
      <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2 font-semibold text-xs" style={{ color: "var(--text-primary)" }}>
          <Folder size={15} style={{ color: "var(--accent)" }} />
          <span>Workspace Explorer</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs font-mono">
        {sampleFiles.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer hover:bg-neutral-800/60 ${
              item.isDir ? 'font-bold text-slate-200' : 'text-slate-400'
            }`}
          >
            {item.isDir ? <ChevronRight size={13} style={{ color: "var(--accent)" }} /> : <FileCode size={13} className="ml-2 text-slate-500" />}
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
