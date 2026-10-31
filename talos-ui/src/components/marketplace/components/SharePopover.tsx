'use client';

import React, { useState } from 'react';
import { Share2, Copy, Check, ExternalLink, X } from 'lucide-react';

interface SharePopoverProps {
  pluginName: string;
  category?: string;
  slug: string;
  shortDesc?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const SharePopover: React.FC<SharePopoverProps> = ({
  pluginName,
  category = 'agents',
  slug,
  shortDesc = '',
  isOpen,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const baseUrl = process.env.NEXT_PUBLIC_TALOS_CLOUD_URL || 'http://localhost:8000';
  const targetUrl = `${baseUrl}/plugins/${category}/${slug}`;
  const shareText = `Check out ${pluginName} for Talos — ${shortDesc}`;

  const logShareEvent = (utmSource: string) => {
    fetch('/api/marketplace/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'share_click',
        plugin_id: slug,
        utm_source: utmSource
      })
    }).catch(() => {});
  };

  const handleCopyLink = () => {
    logShareEvent('copy');
    navigator.clipboard.writeText(`${targetUrl}?utm_source=copy`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareX = () => {
    logShareEvent('x');
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(`${targetUrl}?utm_source=x`)}`;
    window.open(u, '_blank');
  };

  const handleShareReddit = () => {
    logShareEvent('reddit');
    const u = `https://reddit.com/submit?url=${encodeURIComponent(`${targetUrl}?utm_source=reddit`)}&title=${encodeURIComponent(shareText)}`;
    window.open(u, '_blank');
  };

  const handleShareLinkedIn = () => {
    logShareEvent('linkedin');
    const u = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${targetUrl}?utm_source=linkedin`)}`;
    window.open(u, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div className="relative w-full max-w-sm rounded-2xl bg-[#121212] border border-[#262626] p-5 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[#666] hover:text-white transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        <h4 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <Share2 size={16} className="text-indigo-400" />
          Share Plugin
        </h4>
        <p className="text-xs text-[#888] mb-4">
          Share {pluginName} with rich preview cards on social channels.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={handleShareX}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-xs font-medium text-white hover:bg-[#222] transition-colors cursor-pointer"
          >
            <span>Share to 𝕏</span>
          </button>
          <button
            onClick={handleShareReddit}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-xs font-medium text-white hover:bg-[#222] transition-colors cursor-pointer"
          >
            <span>Reddit</span>
          </button>
          <button
            onClick={handleShareLinkedIn}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-xs font-medium text-white hover:bg-[#222] transition-colors cursor-pointer"
          >
            <span>LinkedIn</span>
          </button>
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>
        </div>

        <div className="pt-3 border-t border-[#222] flex items-center justify-between text-[11px] text-[#666]">
          <span>Direct public link:</span>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-indigo-400 hover:underline"
          >
            Open page <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
};
