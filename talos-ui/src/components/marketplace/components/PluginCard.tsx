'use client';

import React from 'react';
import { Bot, Globe, Zap, CheckCircle2, KeyRound } from 'lucide-react';
import { Plugin } from '../types';

interface PluginCardProps {
  plugin: Plugin;
  onSelect: (plugin: Plugin) => void;
  onOpenConnect?: (plugin: Plugin) => void;
  onSelectBuilder?: (username: string) => void;
  isPluginConnected?: (plugin: Plugin) => boolean;
}

export const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  onSelect,
  onOpenConnect,
  onSelectBuilder,
  isPluginConnected,
}) => {
  const isConnected = isPluginConnected ? isPluginConnected(plugin) : false;

  const typeConfig = {
    skill: { label: 'Skill', icon: <Zap size={10} />, color: 'text-violet-400 bg-violet-950/40 border-violet-800/40' },
    agent: { label: 'Sub-Agent', icon: <Bot size={10} />, color: 'text-blue-400 bg-blue-950/40 border-blue-800/40' },
    mcp: { label: 'Remote MCP', icon: <Globe size={10} />, color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' },
  }[plugin.plugin_type];

  const authorHandle = plugin.builder_username || plugin.publisher_handle;
  const authorName = plugin.builder_display_name || plugin.publisher_name;

  return (
    <div
      onClick={() => onSelect(plugin)}
      className="p-4 rounded-2xl bg-[#0f0f0f] border border-[#1e1e1e] hover:border-[#333] hover:bg-[#131313] transition-all cursor-pointer group flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${typeConfig.color}`}>
            {typeConfig.icon}
            {typeConfig.label}
          </span>
          {plugin.is_installed && (
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          )}
        </div>

        <h5 className="text-sm font-semibold text-white group-hover:text-white truncate">
          {plugin.name}
        </h5>

        {/* Builder byline with clickable handle */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[11px] text-[#666]">by</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectBuilder && authorHandle) onSelectBuilder(authorHandle);
            }}
            className="text-[11px] text-[#818cf8] hover:underline font-medium cursor-pointer"
          >
            @{authorHandle}
          </button>
        </div>

        <p className="text-xs text-[#888] mt-2 line-clamp-2 leading-relaxed">
          {plugin.short_desc || plugin.description}
        </p>
      </div>

      <div className="flex items-center justify-between mt-4 pt-2 border-t border-[#1a1a1a]">
        <div className="flex items-center gap-2 text-[11px] text-[#777]">
          <span>
            {plugin.rating_avg ? (
              <span className="text-amber-400 font-medium">⭐ {plugin.rating_avg.toFixed(1)}</span>
            ) : (
              <span className="text-[#666]">⭐ New</span>
            )}
            {plugin.rating_count ? ` (${plugin.rating_count})` : ''}
          </span>
          <span>·</span>
          <span>{plugin.downloads_count.toLocaleString()} installs</span>
        </div>

        {plugin.is_installed && (plugin.plugin_type === 'mcp' || (plugin.configuration_schema && plugin.configuration_schema.length > 0)) && (
          isConnected ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-500/15 border border-emerald-500/40 text-emerald-400"
              title="Connected"
            >
              <CheckCircle2 size={9} /> Connected
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenConnect) onOpenConnect(plugin);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/50 transition-colors cursor-pointer"
            >
              <KeyRound size={9} /> Connect
            </button>
          )
        )}
      </div>
    </div>
  );
};
