'use client';

import React from 'react';
import { X, Globe, Zap, Bot, ArrowRight, ShieldCheck, Cpu } from 'lucide-react';

export type SelectedConnectorType = 'mcp' | 'skill' | 'agent';

interface ConnectorTypeChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: SelectedConnectorType) => void;
}

export const ConnectorTypeChooserModal: React.FC<ConnectorTypeChooserModalProps> = ({
  isOpen,
  onClose,
  onSelectType,
}) => {
  if (!isOpen) return null;

  const connectors = [
    {
      id: 'mcp' as SelectedConnectorType,
      title: 'Model Context Protocol (MCP)',
      badge: 'Live Connector',
      badgeColor: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
      icon: <Globe className="text-emerald-400" size={24} />,
      description:
        'Connect live tools, resources, and databases via the open Model Context Protocol. Includes real-time probing and zero versioning.',
      features: ['Live server verification', 'Automatic auth detection', 'Zero version management'],
      accentHover: 'hover:border-emerald-500/50 hover:bg-emerald-950/10',
    },
    {
      id: 'skill' as SelectedConnectorType,
      title: 'Workflow Skill',
      badge: 'Markdown & Workflows',
      badgeColor: 'text-violet-400 bg-violet-950/40 border-violet-800/40',
      icon: <Zap className="text-violet-400" size={24} />,
      description:
        'Custom prompt workflows, role instructions, and helper scripts. Runs deep static AST and prompt-injection security scans on upload.',
      features: ['AST script security check', 'Prompt injection defense', 'SKILL.md frontmatter sync'],
      accentHover: 'hover:border-violet-500/50 hover:bg-violet-950/10',
    },
    {
      id: 'agent' as SelectedConnectorType,
      title: 'Specialist Sub-Agent',
      badge: 'Delegatable Agent',
      badgeColor: 'text-blue-400 bg-blue-950/40 border-blue-800/40',
      icon: <Bot className="text-blue-400" size={24} />,
      description: 'Publish a focused instruction-based agent that Talos can call for specialist work.',
      features: ['Runs through Talos model relay', 'No package code execution', 'Visible delegated task progress'],
      accentHover: 'hover:border-blue-500/50 hover:bg-blue-950/10',
    },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-[760px] overflow-hidden rounded-3xl bg-[#0c0c0c] border border-[#1e1e1e] shadow-2xl p-6 sm:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-[#666] hover:text-white hover:bg-[#1e1e1e] transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#666]">Publish to Talos</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Choose connector type</h2>
          <p className="text-xs sm:text-sm text-[#888] mt-1">
            Select what you want to publish to the Talos ecosystem. Real-time verification runs automatically.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {connectors.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectType(c.id)}
              className={`group flex flex-col text-left p-5 rounded-2xl bg-[#121212] border border-[#202020] transition-all duration-200 cursor-pointer ${c.accentHover} hover:scale-[1.01]`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-[#181818] border border-[#2a2a2a] group-hover:scale-105 transition-transform">
                  {c.icon}
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.badgeColor}`}>
                  {c.badge}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-white mb-1.5 group-hover:text-white flex items-center justify-between">
                <span>{c.title}</span>
                <ArrowRight size={13} className="text-[#555] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </h3>

              <p className="text-xs text-[#777] leading-relaxed mb-4 flex-1">
                {c.description}
              </p>

              <div className="space-y-1.5 border-t border-[#1c1c1c] pt-3">
                {c.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px] text-[#999]">
                    <div className="w-1 h-1 rounded-full bg-[#555]" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Security Assurance Footer */}
        <div className="mt-6 pt-4 border-t border-[#1a1a1a] flex items-center justify-between text-xs text-[#666]">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Automated security scanning & sandbox execution verified</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-[#888] hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
