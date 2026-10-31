'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  Loader2,
  Trash2,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  Share2,
  Globe,
  Terminal,
  Shield,
  Clock,
  Sparkles,
  Layers,
  Cpu,
  ChevronRight,
  AlertTriangle,
  Copy,
  Check,
  Package,
  FileCode,
  CheckCircle,
  GitBranch,
} from 'lucide-react';
import { Plugin, PluginVersion, Review } from '../types';
import { RatingHistogram } from './RatingHistogram';
import { ReviewThread } from './ReviewThread';
import { StarRating } from './StarRating';

interface PluginDetailViewProps {
  plugin: Plugin;
  onBack: () => void;
  onInstall: (plugin: Plugin, version?: string) => Promise<void>;
  onUninstall: (plugin: Plugin) => Promise<void>;
  installingId: string | null;
  onOpenConnect: (plugin: Plugin) => void;
  isPluginConnected: (plugin: Plugin) => boolean;
  onSelectPublisher: (handle: string) => void;
  onShare: (plugin: Plugin) => void;
  onNewVersion?: (plugin: Plugin) => void;
  onDeletePlugin?: (plugin: Plugin) => Promise<void>;
  // Reviews props
  reviews: Review[];
  isLoadingReviews: boolean;
  hasMoreReviews: boolean;
  onLoadMoreReviews: () => void;
  onSubmitReview: (body: string, stars: number) => Promise<{ success: boolean; error?: string }>;
  onVoteHelpful: (reviewId: string) => void;
  onReportReview: (reviewId: string, reason: string) => void;
}

type TabType = 'overview' | 'reviews' | 'changelog' | 'versions';

const TYPE_BADGE_STYLE: Record<string, { label: string; color: string; border: string; bg: string }> = {
  agent: {
    label: 'A2A Agent',
    color: 'text-indigo-400',
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-500/10',
  },
  skill: {
    label: 'Skill',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
  },
  mcp: {
    label: 'Remote MCP',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
  },
};

export const PluginDetailView: React.FC<PluginDetailViewProps> = ({
  plugin,
  onBack,
  onInstall,
  onUninstall,
  installingId,
  onOpenConnect,
  isPluginConnected,
  onSelectPublisher,
  onShare,
  onNewVersion,
  onDeletePlugin,
  reviews,
  isLoadingReviews,
  hasMoreReviews,
  onLoadMoreReviews,
  onSubmitReview,
  onVoteHelpful,
  onReportReview,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [versions, setVersions] = useState<PluginVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (onDeletePlugin) {
        await onDeletePlugin(plugin);
      } else {
        const res = await fetch(`/api/marketplace/plugins/${plugin.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to delete plugin');
        }
        onBack();
      }
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete plugin');
      setIsDeleting(false);
    }
  };

  // Fetch versions list
  useEffect(() => {
    let active = true;
    const fetchVersions = async () => {
      setIsLoadingVersions(true);
      try {
        const res = await fetch(`/api/marketplace/plugins/${plugin.id}/versions`);
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.versions)) {
            setVersions(data.versions);
          }
        }
      } catch (err) {
        console.error('Failed to fetch versions', err);
      } finally {
        if (active) setIsLoadingVersions(false);
      }
    };

    fetchVersions();
    return () => {
      active = false;
    };
  }, [plugin.id]);

  const handleCopy = (text: string, type: 'sha' | 'logs') => {
    navigator.clipboard.writeText(text);
    if (type === 'sha') {
      setCopiedSha(text);
      setTimeout(() => setCopiedSha(null), 2000);
    } else {
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    }
  };

  const typeConfig = TYPE_BADGE_STYLE[plugin.plugin_type] || {
    label: plugin.plugin_type.toUpperCase(),
    color: 'text-gray-400',
    border: 'border-gray-500/30',
    bg: 'bg-gray-500/10',
  };

  const isInstalling = installingId === plugin.id;
  const isInstalled = plugin.is_installed;
  const hasUpdate =
    isInstalled &&
    Boolean(plugin.installed_version) &&
    plugin.installed_version !== plugin.latest_version;

  const publisherHandle = plugin.publisher_handle || plugin.builder_username || 'community';
  const publisherName = plugin.publisher_name || plugin.builder_display_name || publisherHandle;

  // Render tags
  const tags = plugin.tags && plugin.tags.length > 0
    ? plugin.tags
    : [
        plugin.plugin_type === 'mcp' ? 'Model Context Protocol' : 'Workflow Skills',
        'Automation',
        'Talos Native',
      ];

  // Requirements & capabilities helper
  const caps = plugin.capabilities_snapshot || {};
  const toolsCount = caps.tools?.length || 0;
  const requiresAuth =
    caps.requires_auth ||
    (plugin.configuration_schema && plugin.configuration_schema.some((f: any) => f.required));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 pr-16 py-4 border-b border-[#1c1c1c] bg-[#0c0c0c]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-medium text-[#888] hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Marketplace</span>
        </button>

        <div className="flex items-center gap-2">
          {plugin.is_owner && onNewVersion && (
            <button
              onClick={() => onNewVersion(plugin)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              <span>+ New Version</span>
            </button>
          )}

          {plugin.is_owner && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/20 hover:bg-red-950/40 border border-red-800/40 text-xs font-medium text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              title="Delete this item from the Marketplace"
            >
              <Trash2 size={13} />
              <span>Delete from Marketplace</span>
            </button>
          )}

          {/* Share Button in Top Bar */}
          <button
            onClick={() => onShare(plugin)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1f1f1f] border border-[#242424] text-xs text-[#bbb] hover:text-white transition-colors cursor-pointer"
          >
            <Share2 size={13} />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Header / Hero Card ── */}
        <div className="p-7 border-b border-[#1c1c1c] bg-gradient-to-b from-[#111] to-[#0a0a0a]">
          <div className="flex items-start justify-between gap-6">
            {/* Left: Icon + Info */}
            <div className="flex items-start gap-5 min-w-0">
              <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-[#1e1e1e] to-[#121212] border border-[#2d2d2d] flex items-center justify-center shrink-0 shadow-lg text-white font-bold text-2xl">
                {plugin.name.charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-semibold text-white tracking-tight">{plugin.name}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${typeConfig.bg} ${typeConfig.border} ${typeConfig.color}`}
                  >
                    <span>{typeConfig.label}</span>
                    <span className="opacity-60">·</span>
                    <span>v{plugin.latest_version}</span>
                  </span>
                </div>

                <p className="text-sm text-[#999] leading-relaxed max-w-2xl">
                  {plugin.short_desc || plugin.description}
                </p>

                {/* Compact Publisher Byline */}
                <div className="flex items-center gap-2 text-xs text-[#777] pt-0.5">
                  <span>by</span>
                  <button
                    onClick={() => onSelectPublisher(publisherHandle)}
                    className="inline-flex items-center gap-1.5 font-medium text-[#ccc] hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="w-4 h-4 rounded-full bg-[#2a2a2a] border border-[#3a3a3a] text-[10px] flex items-center justify-center text-white font-bold">
                      {publisherName.charAt(0).toUpperCase()}
                    </span>
                    <span>{publisherName}</span>
                    <span className="text-[#666]">@{publisherHandle}</span>
                    {(plugin.publisher_verified || plugin.builder_verified) && (
                      <span className="text-blue-400 text-[10px] font-semibold">✓</span>
                    )}
                  </button>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-3 text-xs text-[#777] pt-1">
                  <span className="flex items-center gap-1 font-medium text-amber-400">
                    ★ {plugin.rating_avg ? plugin.rating_avg.toFixed(1) : 'New'}
                  </span>
                  <span>·</span>
                  <span>↓ {plugin.downloads_count.toLocaleString()} {plugin.downloads_count === 1 ? 'install' : 'installs'}</span>
                  <span>·</span>
                  <span>Published {plugin.created_at ? new Date(plugin.created_at).toLocaleDateString() : 'recently'}</span>
                </div>

                {/* Links */}
                <div className="flex items-center gap-2 pt-2">
                  {plugin.github_url && (
                    <a
                      href={plugin.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#161616] border border-[#262626] text-xs text-[#aaa] hover:text-white transition-colors"
                    >
                      <GitBranch size={12} />
                      <span>GitHub</span>
                      <ExternalLink size={10} className="opacity-50" />
                    </a>
                  )}
                  {plugin.website_url && (
                    <a
                      href={plugin.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#161616] border border-[#262626] text-xs text-[#aaa] hover:text-white transition-colors"
                    >
                      <Globe size={12} />
                      <span>Website</span>
                      <ExternalLink size={10} className="opacity-50" />
                    </a>
                  )}
                  <button
                    onClick={() => onShare(plugin)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#161616] border border-[#262626] text-xs text-[#aaa] hover:text-white transition-colors cursor-pointer"
                  >
                    <Share2 size={12} />
                    <span>Share</span>
                  </button>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-1.5 flex-wrap pt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-[#141414] border border-[#222] text-[11px] text-[#888]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Primary Action Button */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              {isInstalling ? (
                <button
                  disabled
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#222] border border-[#333] text-xs font-semibold text-white opacity-80 cursor-not-allowed"
                >
                  <Loader2 size={14} className="animate-spin text-white" />
                  <span>Installing...</span>
                </button>
              ) : hasUpdate ? (
                <button
                  onClick={() => onInstall(plugin, plugin.latest_version)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-md shadow-blue-900/30 cursor-pointer"
                >
                  <Download size={14} />
                  <span>Update to v{plugin.latest_version}</span>
                </button>
              ) : isInstalled ? (
                <div className="flex items-center gap-2">
                  {/* MCP Auth connection if needed */}
                  {plugin.plugin_type === 'mcp' && requiresAuth && (
                    isPluginConnected(plugin) ? (
                      <button
                        onClick={() => onOpenConnect(plugin)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                        title="Connected. Click to change configuration."
                      >
                        <CheckCircle2 size={13} className="text-emerald-400" />
                        <span>Connected</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenConnect(plugin)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 transition-colors cursor-pointer"
                      >
                        <KeyRound size={13} />
                        <span>Connect / Auth</span>
                      </button>
                    )
                  )}

                  {/* Installed Badge */}
                  <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#171717] border border-[#2b2b2b] text-xs font-medium text-[#ccc]">
                    <CheckCircle size={13} className="text-emerald-400" />
                    <span>Installed {plugin.installed_version ? `(v${plugin.installed_version})` : ''}</span>
                  </div>

                  {/* Uninstall Button */}
                  <button
                    onClick={() => onUninstall(plugin)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/30 border border-red-800/30 text-xs text-red-400 hover:bg-red-900/50 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Uninstall</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onInstall(plugin)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#e4e4e4] transition-colors shadow-lg cursor-pointer"
                >
                  <Download size={14} />
                  <span>Install</span>
                </button>
              )}

              {plugin.install_status === 'error' && (
                <span className="flex items-center gap-1 text-[11px] text-red-400">
                  <AlertTriangle size={12} /> Installation error
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabs Navigation ── */}
        <div className="flex items-center px-7 border-b border-[#1c1c1c] bg-[#0c0c0c] sticky top-0 z-10">
          {(['overview', 'reviews', 'changelog', 'versions'] as TabType[]).map((tab) => {
            const countLabel =
              tab === 'reviews'
                ? ` (${plugin.rating_count || 0})`
                : tab === 'versions'
                ? ` (${versions.length || 1})`
                : '';

            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 cursor-pointer capitalize ${
                  isActive
                    ? 'text-white border-white'
                    : 'text-[#666] border-transparent hover:text-[#aaa]'
                }`}
              >
                {tab}
                {countLabel}
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ── */}
        <div className="p-7">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
              {/* Left Column (2 spans): Details */}
              <div className="lg:col-span-2 space-y-7">
                {/* WHAT IT DOES */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777]">
                    What it does
                  </h3>
                  <div className="p-5 rounded-2xl bg-[#111] border border-[#202020] text-sm text-[#ccc] leading-relaxed space-y-3">
                    <p>{plugin.long_desc_md || plugin.description}</p>
                    
                  </div>
                </div>

                {/* CAPABILITIES */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777]">
                    Capabilities
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-[#111] border border-[#202020] space-y-1">
                      <div className="flex items-center gap-2 text-white text-xs font-semibold">
                        <Sparkles size={14} className="text-indigo-400" />
                        <span>Autonomous Task Execution</span>
                      </div>
                      <p className="text-[11px] text-[#777]">
                        Plans, acts, and inspects progress without continuous human intervention.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#111] border border-[#202020] space-y-1">
                      <div className="flex items-center gap-2 text-white text-xs font-semibold">
                        <Layers size={14} className="text-purple-400" />
                        <span>Multi-Agent Delegation</span>
                      </div>
                      <p className="text-[11px] text-[#777]">
                        Communicates with peer subagents and returns structured artifacts.
                      </p>
                    </div>

                    {toolsCount > 0 && (
                      <div className="p-4 rounded-xl bg-[#111] border border-[#202020] space-y-1">
                        <div className="flex items-center gap-2 text-white text-xs font-semibold">
                          <Cpu size={14} className="text-emerald-400" />
                          <span>{toolsCount} Native Tools</span>
                        </div>
                        <p className="text-[11px] text-[#777]">
                          Includes registered functions ready for LLM function calling.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* PERMISSIONS */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777]">
                    Permissions & Security
                  </h3>
                  <div className="p-4 rounded-2xl bg-[#111] border border-[#202020] space-y-3">
                    <div className="flex items-start gap-3">
                      <Shield size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-medium text-white">Safe Permissions</div>
                        <p className="text-[11px] text-[#777]">
                          Network access to declared provider APIs and LLM inference endpoints.
                        </p>
                      </div>
                    </div>

                    
                  </div>
                </div>

                {/* Configuration Schema if required */}
                {plugin.configuration_schema && plugin.configuration_schema.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777]">
                      Required Configuration
                    </h3>
                    <div className="p-4 rounded-2xl bg-[#111] border border-[#202020] space-y-2">
                      {plugin.configuration_schema.map((field: any) => (
                        <div
                          key={field.name}
                          className="flex items-center justify-between text-xs py-1 border-b border-[#1c1c1c] last:border-0"
                        >
                          <span className="font-mono text-[#ccc]">{field.name}</span>
                          <span className="text-[10px] text-[#777]">
                            {field.required ? (
                              <span className="text-amber-400">Required</span>
                            ) : (
                              'Optional'
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Installation Logs if present */}
                {plugin.is_installed && plugin.install_logs && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777]">
                        Installation & Runtime Logs
                      </h3>
                      <button
                        onClick={() => handleCopy(plugin.install_logs || '', 'logs')}
                        className="flex items-center gap-1 text-[11px] text-[#888] hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedLogs ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>{copiedLogs ? 'Copied' : 'Copy Logs'}</span>
                      </button>
                    </div>
                    <div className="rounded-xl bg-[#0a0a0a] border border-[#222] p-3 max-h-48 overflow-y-auto">
                      <pre className="text-[11px] font-mono text-[#888] whitespace-pre-wrap">
                        {plugin.install_logs}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Install Summary Card */}
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-[#111] border border-[#202020] space-y-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#666]">
                    Install Package
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white">{plugin.name}</h4>
                    <p className="text-xs text-[#888] mt-0.5">Version {plugin.latest_version}</p>
                  </div>

                  {isInstalled ? (
                    <div className="space-y-2">
                      <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center text-xs font-semibold text-emerald-400">
                        ✓ Installed on this system
                      </div>
                      <button
                        onClick={() => onUninstall(plugin)}
                        className="w-full py-2 rounded-xl bg-red-950/20 hover:bg-red-950/40 border border-red-800/30 text-center text-xs font-medium text-red-400 transition-colors cursor-pointer"
                      >
                        Uninstall
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onInstall(plugin)}
                      disabled={isInstalling}
                      className="w-full py-2.5 rounded-xl bg-white text-black hover:bg-[#e6e6e6] text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {isInstalling ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-black" />
                          <span>Installing...</span>
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          <span>Install Plugin</span>
                        </>
                      )}
                    </button>
                  )}

                  <div className="pt-2 border-t border-[#1a1a1a] space-y-2 text-xs text-[#888]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      <span>Talos 2.0+ compatible</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      <span>Sandboxed execution</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#1a1a1a] text-[11px] text-[#666] space-y-1">
                    <div>Publisher: @{publisherHandle}</div>
                    <div>License: MIT / Talos Marketplace</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-7 max-w-4xl">
              {/* Summary or Clean Zero-State */}
              {(!plugin.rating_count || plugin.rating_count === 0) ? (
                <div className="p-8 rounded-2xl bg-[#111] border border-[#202020] text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#181818] border border-[#252525] flex items-center justify-center mx-auto text-amber-400 text-lg">
                    ★
                  </div>
                  <h4 className="text-sm font-semibold text-white">No ratings yet</h4>
                  <p className="text-xs text-[#777] max-w-md mx-auto">
                    Be the first to review {plugin.name}. Install the plugin and test it out to leave feedback.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-[#111] border border-[#202020] flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-[#666]">Community Rating</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-bold text-white">
                          {plugin.rating_avg ? plugin.rating_avg.toFixed(1) : 'New'}
                        </span>
                        <span className="text-xs text-[#777]">
                          ({plugin.rating_count || 0} reviews)
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-[#777] mt-3">
                      📥 {plugin.downloads_count.toLocaleString()} verified installs
                    </div>
                  </div>

                  <RatingHistogram
                    hist={plugin.rating_hist}
                    totalRatings={plugin.rating_count}
                  />
                </div>
              )}

              {/* Review Thread / Composer */}
              <div>
                <ReviewThread
                  pluginId={plugin.id}
                  isInstalled={plugin.is_installed}
                  isOwner={plugin.is_owner}
                  reviews={reviews}
                  isLoading={isLoadingReviews}
                  hasMore={hasMoreReviews}
                  onLoadMore={onLoadMoreReviews}
                  onSubmitReview={onSubmitReview}
                  onVoteHelpful={onVoteHelpful}
                  onReportReview={onReportReview}
                />
              </div>
            </div>
          )}

          {/* TAB 3: CHANGELOG */}
          {activeTab === 'changelog' && (
            <div className="space-y-6 max-w-3xl">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777]">
                Release Timeline
              </h3>

              {isLoadingVersions ? (
                <div className="flex items-center justify-center py-12 text-[#666]">
                  <Loader2 size={18} className="animate-spin mr-2" />
                  <span>Loading changelog...</span>
                </div>
              ) : versions.length > 0 ? (
                <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#202020]">
                  {versions.map((ver, idx) => (
                    <div key={ver.id || ver.version} className="relative pl-8 space-y-2">
                      {/* Node Bullet */}
                      <div
                        className={`absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 -translate-x-1/2 ${
                          idx === 0
                            ? 'bg-blue-500 border-blue-400'
                            : 'bg-[#181818] border-[#333]'
                        }`}
                      />

                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">v{ver.version}</span>
                          {idx === 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400">
                              Latest
                            </span>
                          )}
                          {plugin.installed_version === ver.version && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              Installed
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[#666]">
                          {new Date(ver.created_at || ver.published_at || '').toLocaleDateString(
                            undefined,
                            {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </span>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111] border border-[#202020] text-xs text-[#aaa] leading-relaxed whitespace-pre-wrap">
                        {ver.changelog || 'Standard maintenance and performance updates.'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-[#111] border border-[#202020] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">v{plugin.latest_version}</span>
                    <span className="text-xs text-[#666]">Initial Release</span>
                  </div>
                  <p className="text-xs text-[#888]">
                    Initial release published to the Talos Marketplace.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VERSIONS */}
          {activeTab === 'versions' && (
            <div className="space-y-6 max-w-4xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777]">
                    All Versions
                  </h3>
                  <p className="text-xs text-[#666] mt-0.5">
                    Select a release to inspect integrity or pin a specific version.
                  </p>
                </div>
              </div>

              {isLoadingVersions ? (
                <div className="flex items-center justify-center py-12 text-[#666]">
                  <Loader2 size={18} className="animate-spin mr-2" />
                  <span>Loading versions...</span>
                </div>
              ) : versions.length > 0 ? (
                <div className="space-y-3">
                  {versions.map((ver, idx) => {
                    const isVerInstalled = plugin.installed_version === ver.version;
                    return (
                      <div
                        key={ver.id || ver.version}
                        className="p-4 rounded-xl bg-[#111] border border-[#202020] flex items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-semibold text-white">
                              v{ver.version}
                            </span>
                            {idx === 0 && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400">
                                Latest
                              </span>
                            )}
                            {isVerInstalled && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                Current Installed
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-[#666]">
                            <span>
                              Released{' '}
                              {new Date(ver.created_at || ver.published_at || '').toLocaleDateString()}
                            </span>
                            {ver.artifact_sha256 && (
                              <div className="flex items-center gap-1 font-mono text-[11px] text-[#777]">
                                <span>SHA: {ver.artifact_sha256.substring(0, 8)}...</span>
                                <button
                                  onClick={() => handleCopy(ver.artifact_sha256!, 'sha')}
                                  className="text-[#555] hover:text-white transition-colors cursor-pointer"
                                  title="Copy SHA-256"
                                >
                                  {copiedSha === ver.artifact_sha256 ? (
                                    <Check size={11} className="text-emerald-400" />
                                  ) : (
                                    <Copy size={11} />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action for this version */}
                        <div>
                          {isVerInstalled ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-400">
                              <CheckCircle2 size={12} />
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={() => onInstall(plugin, ver.version)}
                              disabled={isInstalling}
                              className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-xs font-medium text-[#ccc] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Install v{ver.version}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#111] border border-[#202020] flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-sm font-mono font-semibold text-white">
                      v{plugin.latest_version}
                    </span>
                    <p className="text-xs text-[#666]">Single release recorded</p>
                  </div>
                  {plugin.is_installed ? (
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-400">
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => onInstall(plugin, plugin.latest_version)}
                      className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-xs font-medium text-[#ccc] hover:text-white transition-colors cursor-pointer"
                    >
                      Install
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#282828] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-900/50">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Delete from Marketplace</h3>
                <p className="text-xs text-[#888]">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-[#bbb] leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-white">&ldquo;{plugin.name}&rdquo;</strong>? 
              This will remove the listing, all published versions, and associated files from the Talos Marketplace.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-400">
                {deleteError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-[#202020] hover:bg-[#282828] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm shadow-red-900/50"
              >
                {isDeleting && <Loader2 size={12} className="animate-spin" />}
                <span>{isDeleting ? 'Deleting...' : 'Permanently Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
