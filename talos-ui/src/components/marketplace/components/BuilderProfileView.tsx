'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Globe, Package, Loader2 } from 'lucide-react';
import { Builder, Plugin } from '../types';
import { PluginCard } from './PluginCard';

interface BuilderProfileViewProps {
  username: string;
  onBack: () => void;
  onSelectPlugin: (plugin: Plugin) => void;
  isPluginConnected?: (plugin: Plugin) => boolean;
}

export const BuilderProfileView: React.FC<BuilderProfileViewProps> = ({
  username,
  onBack,
  onSelectPlugin,
  isPluginConnected,
}) => {
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchProfile = async () => {
      setIsLoading(true);
      try {
        const [bRes, pRes] = await Promise.all([
          fetch(`/api/marketplace/builders/${username}`),
          fetch(`/api/marketplace/builders/${username}/plugins`),
        ]);
        if (active) {
          if (bRes.ok) setBuilder(await bRes.json());
          if (pRes.ok) {
            const pData = await pRes.json();
            setPlugins(pData.plugins || []);
          }
        }
      } catch (err) {
        console.error('Failed to load builder profile', err);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchProfile();
    return () => { active = false; };
  }, [username]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#666]">
        <Loader2 size={24} className="animate-spin mb-2" />
        <p className="text-xs">Loading @{username}...</p>
      </div>
    );
  }

  if (!builder) {
    return (
      <div className="p-6 text-center text-[#666]">
        <p className="text-sm">Builder profile not found.</p>
        <button onClick={onBack} className="mt-3 text-xs text-indigo-400 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_TALOS_CLOUD_URL || 'http://localhost:8000';

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Top Header */}
      <div className="p-5 pr-16 border-b border-[#1a1a1a] flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white transition-colors cursor-pointer">
          <ArrowLeft size={14} /> Back
        </button>
        <a
          href={`${baseUrl}/builders/${builder.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-indigo-400 hover:underline"
        >
          View public web page <ExternalLink size={11} />
        </a>
      </div>

      {/* Profile Card */}
      <div className="p-6 border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#181828] border-2 border-indigo-500/40 flex items-center justify-center text-xl font-bold text-indigo-400 shrink-0">
            {builder.display_name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white">{builder.display_name}</h3>
            <p className="text-xs text-[#888] mb-2">@{builder.username}</p>
            <p className="text-xs text-[#ccc] leading-relaxed max-w-xl whitespace-pre-wrap">
              {builder.bio || 'Creator in the Talos ecosystem.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-5 pt-4 border-t border-[#1a1a1a] text-xs text-[#888]">
          <div>⭐ <strong className="text-white">{builder.rating_avg ? builder.rating_avg.toFixed(1) : 'New'}</strong> Builder Rating</div>
          <div>📦 <strong className="text-white">{builder.plugin_count}</strong> Plugins</div>
          <div>📥 <strong className="text-white">{builder.install_count.toLocaleString()}</strong> Installs</div>
        </div>
      </div>

      {/* Published Plugins Catalog */}
      <div className="p-5">
        <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-4">
          Published Plugins ({plugins.length})
        </h4>
        {plugins.length === 0 ? (
          <p className="text-xs text-[#666] text-center py-8">No published plugins found for this builder.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {plugins.map((p) => (
              <PluginCard
                key={p.id}
                plugin={p}
                onSelect={onSelectPlugin}
                isPluginConnected={isPluginConnected}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
