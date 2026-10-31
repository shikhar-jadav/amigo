'use client';

import React from 'react';
import { Users, Award, Package, ArrowRight } from 'lucide-react';
import { Builder } from '../types';

interface BuilderDirectoryProps {
  builders: Builder[];
  isLoading: boolean;
  onSelectBuilder: (username: string) => void;
}

export const BuilderDirectory: React.FC<BuilderDirectoryProps> = ({
  builders,
  isLoading,
  onSelectBuilder,
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#666]">
        <p className="text-xs">Loading creators...</p>
      </div>
    );
  }

  if (builders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center text-[#666]">
        <Users size={32} className="mb-2 opacity-50" />
        <p className="text-xs">No public builders found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {builders.map((b) => (
        <div
          key={b.id}
          onClick={() => onSelectBuilder(b.username)}
          className="p-4 rounded-2xl bg-[#0f0f0f] border border-[#1e1e1e] hover:border-[#333] hover:bg-[#131313] transition-all cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#181828] border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-400 shrink-0">
                {b.display_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h5 className="text-sm font-semibold text-white truncate">{b.display_name}</h5>
                <p className="text-[11px] text-[#777] truncate">@{b.username}</p>
              </div>
            </div>

            <p className="text-xs text-[#888] line-clamp-2 leading-relaxed mb-3">
              {b.bio || 'Creator in the Talos marketplace ecosystem.'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#1a1a1a] text-[11px] text-[#777]">
            <div className="flex items-center gap-2">
              <span>⭐ {b.rating_avg ? b.rating_avg.toFixed(1) : 'New'}</span>
              <span>·</span>
              <span>{b.plugin_count} plugins</span>
              <span>·</span>
              <span>{b.install_count.toLocaleString()} installs</span>
            </div>
            <ArrowRight size={13} className="text-[#555]" />
          </div>
        </div>
      ))}
    </div>
  );
};
