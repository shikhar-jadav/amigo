'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, Share2, Globe,
  Sparkles, ExternalLink, Calendar, Plus, Edit3,
  Award, TrendingUp, Package, Layers, Activity, Info,
  Check, Copy, ArrowUpRight, Loader2, Star, Download,
  ArrowLeft, Bot, Zap, CheckCircle2, KeyRound, Trash2, Shield,
  CheckSquare, Square
} from 'lucide-react';
import { Builder, Plugin, Review } from '../types';
import { useAuth } from '@/context/AuthContext';
import { EditCreatorProfileModal } from './EditCreatorProfileModal';
import { RatingHistogram } from './RatingHistogram';
import { ReviewThread } from './ReviewThread';

const GitHubIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const XSocialIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface CreatorProfileViewProps {
  onSelectPlugin?: (plugin: Plugin) => void;
  onRefreshMarketplace?: () => void;
}

export const CreatorProfileView: React.FC<CreatorProfileViewProps> = ({
  onSelectPlugin,
  onRefreshMarketplace,
}) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Builder | null>(null);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Active filter tab
  const [activeTab, setActiveTab] = useState<'plugins' | 'agents' | 'skills' | 'connectors' | 'activity' | 'about'>('plugins');

  // Modal / Editing states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editGithub, setEditGithub] = useState('');
  const [editTwitter, setEditTwitter] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  // New Plugin Draft Modal Form
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  const [draftCategory, setDraftCategory] = useState('agents');
  const [draftPluginType, setDraftPluginType] = useState<'agent' | 'skill' | 'mcp'>('agent');
  const [draftShortDesc, setDraftShortDesc] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  // Share popover
  const [copiedLink, setCopiedLink] = useState(false);

  // Selected Plugin for In-Account Detail View
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [reviewsCursor, setReviewsCursor] = useState(0);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Single Deletion state
  const [pluginToDelete, setPluginToDelete] = useState<Plugin | null>(null);
  const [isDeletingPlugin, setIsDeletingPlugin] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Multi / Batch Deletion state
  const [selectedPluginIds, setSelectedPluginIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);
  const [batchDeleteSuccess, setBatchDeleteSuccess] = useState<string | null>(null);

  const toggleSelectPluginId = (id: string) => {
    setSelectedPluginIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (items: Plugin[]) => {
    const itemIds = items.map(p => p.id);
    const allSelected = itemIds.length > 0 && itemIds.every(id => selectedPluginIds.includes(id));
    if (allSelected) {
      setSelectedPluginIds(prev => prev.filter(id => !itemIds.includes(id)));
    } else {
      setSelectedPluginIds(prev => Array.from(new Set([...prev, ...itemIds])));
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedPluginIds.length === 0) return;
    setIsBatchDeleting(true);
    setBatchDeleteError(null);
    setBatchDeleteSuccess(null);

    const idsToDelete = [...selectedPluginIds];
    let deletedCount = 0;
    const failedIds: string[] = [];

    // Try batch delete endpoint first
    try {
      const res = await fetch('/api/marketplace/plugins/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin_ids: idsToDelete }),
      });

      if (res.ok) {
        const data = await res.json();
        deletedCount = data.deleted_count || idsToDelete.length;
      } else {
        // Fallback: delete one by one
        for (const id of idsToDelete) {
          try {
            const delRes = await fetch(`/api/marketplace/plugins/${id}`, { method: 'DELETE' });
            if (delRes.ok) {
              deletedCount++;
            } else {
              failedIds.push(id);
            }
          } catch {
            failedIds.push(id);
          }
        }
      }
    } catch {
      // Fallback: delete one by one
      for (const id of idsToDelete) {
        try {
          const delRes = await fetch(`/api/marketplace/plugins/${id}`, { method: 'DELETE' });
          if (delRes.ok) {
            deletedCount++;
          } else {
            failedIds.push(id);
          }
        } catch {
          failedIds.push(id);
        }
      }
    }

    setIsBatchDeleting(false);

    if (deletedCount > 0) {
      const successfullyDeleted = idsToDelete.filter(id => !failedIds.includes(id));
      setPlugins(prev => prev.filter(p => !successfullyDeleted.includes(p.id)));
      setSelectedPluginIds(prev => prev.filter(id => failedIds.includes(id)));
      setShowBatchDeleteModal(false);
      setBatchDeleteSuccess(`Successfully deleted ${deletedCount} plugin(s) from Marketplace.`);
      setTimeout(() => setBatchDeleteSuccess(null), 4000);
      onRefreshMarketplace?.();
    } else {
      setBatchDeleteError('Failed to delete selected items. Please try again.');
    }
  };

  const handleConfirmDeletePlugin = async () => {
    if (!pluginToDelete) return;
    setIsDeletingPlugin(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/marketplace/plugins/${pluginToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Failed to delete plugin');
      }
      setPlugins(prev => prev.filter(p => p.id !== pluginToDelete.id));
      setSelectedPluginIds(prev => prev.filter(id => id !== pluginToDelete.id));
      if (selectedPlugin?.id === pluginToDelete.id) {
        setSelectedPlugin(null);
      }
      setPluginToDelete(null);
      onRefreshMarketplace?.();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete plugin');
    } finally {
      setIsDeletingPlugin(false);
    }
  };

  const loadReviews = async (pluginId: string, offset: number = 0) => {
    setIsLoadingReviews(true);
    try {
      const res = await fetch(`/api/marketplace/plugins/${pluginId}/reviews?offset=${offset}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setReviews(data.reviews || []);
        } else {
          setReviews(prev => [...prev, ...(data.reviews || [])]);
        }
        setHasMoreReviews(Boolean(data.has_more));
        setReviewsCursor(offset + (data.reviews?.length || 0));
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setIsLoadingReviews(false);
    }
  };

  useEffect(() => {
    if (selectedPlugin) {
      loadReviews(selectedPlugin.id, 0);
    } else {
      setReviews([]);
      setReviewsCursor(0);
      setHasMoreReviews(false);
    }
  }, [selectedPlugin?.id]);

  const handleInstallPlugin = async (plugin: Plugin) => {
    setInstallingId(plugin.id);
    try {
      const res = await fetch(`/api/marketplace/plugins/${plugin.id}/install`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = { ...plugin, is_installed: true, downloads_count: (plugin.downloads_count || 0) + 1 };
        setSelectedPlugin(updated);
        setPlugins(prev => prev.map(p => p.id === plugin.id ? updated : p));
        onRefreshMarketplace?.();
      }
    } catch (err) {
      console.error('Failed to install plugin:', err);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstallPlugin = async (plugin: Plugin) => {
    setInstallingId(plugin.id);
    try {
      const res = await fetch(`/api/marketplace/plugins/${plugin.id}/uninstall`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = { ...plugin, is_installed: false };
        setSelectedPlugin(updated);
        setPlugins(prev => prev.map(p => p.id === plugin.id ? updated : p));
        onRefreshMarketplace?.();
      }
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
    } finally {
      setInstallingId(null);
    }
  };

  const handleSubmitReview = async (body: string, stars: number) => {
    if (!selectedPlugin) return { success: false, error: 'No plugin selected' };
    try {
      const res = await fetch(`/api/marketplace/plugins/${selectedPlugin.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars, comment: body })
      });
      if (res.ok) {
        await loadReviews(selectedPlugin.id, 0);
        return { success: true };
      }
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data?.detail || 'Failed to submit review' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error submitting review' };
    }
  };

  const handleVoteHelpful = async (reviewId: string) => {
    try {
      await fetch(`/api/marketplace/reviews/${reviewId}/helpful`, { method: 'POST' });
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful_count: (r.helpful_count || 0) + 1 } : r));
    } catch (err) {
      console.error('Failed to vote review helpful:', err);
    }
  };

  const handleReportReview = async (reviewId: string, reason: string) => {
    try {
      await fetch(`/api/marketplace/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
    } catch (err) {
      console.error('Failed to report review:', err);
    }
  };

  const fetchProfileData = async () => {
    setIsLoading(true);
    try {
      const [profRes, plugRes, analRes] = await Promise.all([
        fetch('/api/marketplace/studio/profile'),
        fetch('/api/marketplace/studio/plugins'),
        fetch('/api/marketplace/studio/analytics'),
      ]);

      if (profRes.ok) {
        const profData = await profRes.json();
        setProfile(profData);
        setEditDisplayName(profData.display_name || user?.display_name || '');
        setEditBio(profData.bio || user?.bio || '');
        setEditWebsite(profData.website_url || '');
        setEditGithub(profData.social_links?.github || '');
        setEditTwitter(profData.social_links?.twitter || '');
      }
      if (plugRes.ok) {
        const plugData = await plugRes.json();
        setPlugins(Array.isArray(plugData) ? plugData : []);
      }
      if (analRes.ok) {
        const analData = await analRes.json();
        setAnalytics(analData);
      }
    } catch (err) {
      console.error('Failed to load creator profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [user]);

  // Dynamic calculations directly from real entities
  const totalInstalls = useMemo(() => {
    if (profile?.install_count && profile.install_count > 0) return profile.install_count;
    return plugins.reduce((acc, p) => acc + (p.downloads_count || 0), 0);
  }, [profile, plugins]);

  const totalRatings = useMemo(() => {
    if (profile?.rating_count && profile.rating_count > 0) return profile.rating_count;
    return plugins.reduce((acc, p) => acc + (p.rating_count || 0), 0);
  }, [profile, plugins]);

  const builderScore = useMemo(() => {
    if (profile?.rating_avg && profile.rating_avg > 0) return profile.rating_avg.toFixed(1);
    const rated = plugins.filter(p => p.rating_avg && p.rating_avg > 0);
    if (rated.length > 0) {
      const avg = rated.reduce((acc, p) => acc + (p.rating_avg || 0), 0) / rated.length;
      return avg.toFixed(1);
    }
    return null;
  }, [profile, plugins]);

  // Derived categories
    const skillPlugins = useMemo(() => plugins.filter(p => p.plugin_type === 'skill'), [plugins]);
  const connectorPlugins = useMemo(() => plugins.filter(p => p.plugin_type === 'mcp'), [plugins]);

  // Format relative time helper
  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1d ago';
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths}mo ago`;
  };

  // Real activity items derived from real plugins
  const activityItems = useMemo(() => {
    const list: Array<{ id: string; title: string; subtitle: string; time: string; type: string }> = [];
    plugins.forEach(p => {
      list.push({
        id: `pub-${p.id}`,
        title: `Published "${p.name}"`,
        subtitle: `${p.plugin_type.toUpperCase()} · v${p.latest_version || '1.0.0'}`,
        time: formatTimeAgo(p.created_at),
        type: 'publish'
      });
      if (p.downloads_count && p.downloads_count >= 100) {
        list.push({
          id: `inst-${p.id}`,
          title: `"${p.name}" reached ${p.downloads_count.toLocaleString()} installs`,
          subtitle: 'Community milestone reached',
          time: formatTimeAgo(p.created_at),
          type: 'milestone'
        });
      }
    });
    return list;
  }, [plugins]);

  const handleShare = () => {
    const handle = profile?.username || user?.username || 'builder';
    const profileUrl = typeof window !== 'undefined' ? `${window.location.origin}/builders/${handle}` : `https://talos.ai/builders/${handle}`;
    navigator.clipboard.writeText(profileUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSaveError(null);
    try {
      const social_links: Record<string, string> = {};
      if (editGithub.trim()) social_links.github = editGithub.trim();
      if (editTwitter.trim()) social_links.twitter = editTwitter.trim();

      const res = await fetch('/api/marketplace/studio/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: editDisplayName.trim(),
          bio: editBio.trim(),
          website_url: editWebsite.trim(),
          social_links,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail || data?.error || `Profile update failed (${res.status})`);
      }
      if (!data) throw new Error('Profile update returned an empty response');

      setProfile(data);
      setEditDisplayName(data.display_name || '');
      setEditBio(data.bio || '');
      setEditWebsite(data.website_url || '');
      setEditGithub(data.social_links?.github || '');
      setEditTwitter(data.social_links?.twitter || '');
      setIsEditingProfile(false);
      onRefreshMarketplace?.();
    } catch (err) {
      console.error('Error updating profile:', err);
      setProfileSaveError(err instanceof Error ? err.message : 'Unable to save profile changes');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingDraft(true);
    setDraftError(null);
    try {
      const res = await fetch('/api/marketplace/studio/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName.trim(),
          slug: draftSlug.trim(),
          category: draftCategory,
          plugin_type: draftPluginType,
          short_desc: draftShortDesc.trim(),
        }),
      });
      if (res.ok) {
        setShowDraftModal(false);
        setDraftName('');
        setDraftSlug('');
        setDraftShortDesc('');
        await fetchProfileData();
        if (onRefreshMarketplace) onRefreshMarketplace();
      } else {
        const data = await res.json();
        setDraftError(data.detail || 'Failed to create plugin draft');
      }
    } catch (err: any) {
      setDraftError(err.message || 'Error creating plugin draft');
    } finally {
      setIsCreatingDraft(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#777]">
        <Loader2 size={24} className="animate-spin mb-2 text-indigo-400" />
        <p className="text-xs">Loading creator profile...</p>
      </div>
    );
  }

  const displayName = profile?.display_name || user?.display_name || user?.username || 'Talos Creator';
  const username = profile?.username || user?.username || (user?.email ? user.email.split('@')[0] : 'builder');
  const bio = profile?.bio || user?.bio;
  const initial = displayName.charAt(0).toUpperCase();
  const website = profile?.website_url;
  const githubHandle = profile?.social_links?.github;
  const twitterHandle = profile?.social_links?.twitter;
  const structuredLinks: any[] = Array.isArray(profile?.social_links?.structured_links)
    ? profile.social_links.structured_links
    : [];
  const customLinks: any[] = Array.isArray(profile?.social_links?.custom_links)
    ? profile.social_links.custom_links
    : [];
  const expertise = Array.isArray(profile?.social_links?.specialties) && profile.social_links.specialties.length > 0
    ? profile.social_links.specialties
    : ['AI Agents', 'Automation', 'Developer Tools'];
  const headline = profile?.social_links?.headline || 'AI Engineer · Building agents, skills & developer tools for Talos';
  const coverUrl = profile?.social_links?.cover_url;
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Oct 2026';

  // If a plugin is selected, render its dedicated detailed view page right here in Accounts
  if (selectedPlugin) {
    const TYPE_COLORS: Record<string, string> = {
      skill: 'text-violet-400 bg-violet-950/40 border-violet-800/40',
      agent: 'text-blue-400 bg-blue-950/40 border-blue-800/40',
      mcp: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
    };

    return (
      <div className="flex flex-col w-full pb-8 select-none space-y-6">
        {/* Top Header Navigation */}
        <div className="flex items-center justify-between pb-4 border-b border-[#202020]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedPlugin(null)}
              className="p-1.5 rounded-xl bg-[#181818] hover:bg-[#222] text-[#888] hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
            >
              <ArrowLeft size={14} /> Back to Profile
            </button>
            <div className="h-4 w-px bg-[#262626]" />
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${TYPE_COLORS[selectedPlugin.plugin_type] || 'text-indigo-400 bg-indigo-950/40 border-indigo-800/40'}`}>
              {selectedPlugin.plugin_type === 'skill' && <Zap size={10} />}
                            {selectedPlugin.plugin_type === 'mcp' && <Globe size={10} />}
              <span className="capitalize">{selectedPlugin.plugin_type}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedPlugin.is_installed ? (
              <button
                onClick={() => handleUninstallPlugin(selectedPlugin)}
                disabled={installingId === selectedPlugin.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-400 hover:bg-red-900/50 transition-colors cursor-pointer disabled:opacity-50 font-medium"
              >
                {installingId === selectedPlugin.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Uninstall
              </button>
            ) : (
              <button
                onClick={() => handleInstallPlugin(selectedPlugin)}
                disabled={installingId === selectedPlugin.id}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-[#eaeaea] transition-colors cursor-pointer disabled:opacity-50"
              >
                {installingId === selectedPlugin.id ? <Loader2 size={12} className="animate-spin text-black" /> : <Download size={12} />}
                Install
              </button>
            )}

            <button
              onClick={() => setPluginToDelete(selectedPlugin)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/20 border border-red-800/40 text-xs text-red-400 hover:bg-red-900/40 transition-colors cursor-pointer font-medium"
              title="Delete from Marketplace"
            >
              <Trash2 size={12} />
              Delete Listing
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className="p-5 rounded-2xl bg-[#141414] border border-[#242424] space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>{selectedPlugin.name}</span>
                <span className="text-xs font-mono text-[#777] font-normal">v{selectedPlugin.latest_version || '1.0.0'}</span>
              </h2>
              <p className="text-xs text-[#777] mt-0.5">
                Authored by @{selectedPlugin.builder_username || selectedPlugin.publisher_handle || username}
              </p>
            </div>
            {selectedPlugin.is_installed && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/40 border border-emerald-800/40 text-emerald-400">
                <CheckCircle2 size={12} /> Installed & Ready
              </span>
            )}
          </div>

          <p className="text-xs text-[#bbb] leading-relaxed pt-1 whitespace-pre-wrap">
            {selectedPlugin.long_desc_md || selectedPlugin.short_desc || selectedPlugin.description || 'No detailed description provided.'}
          </p>

          <div className="flex items-center gap-5 pt-3 border-t border-[#1f1f1f] text-xs text-[#777]">
            <span className="flex items-center gap-1.5">
              <Download size={12} className="text-[#999]" />
              <strong className="text-[#ccc] font-medium">{(selectedPlugin.downloads_count || 0).toLocaleString()}</strong> installs
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Star size={12} className="text-amber-400 fill-amber-400" />
              <strong className="text-[#ccc] font-medium">{selectedPlugin.rating_avg ? selectedPlugin.rating_avg.toFixed(1) : 'New'}</strong> rating ({selectedPlugin.rating_count || 0})
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Calendar size={12} />
              Published {formatTimeAgo(selectedPlugin.created_at)}
            </span>
          </div>
        </div>

        {/* Rating Summary & Histogram */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#141414] border border-[#242424] flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-medium text-[#777] uppercase tracking-wider">Community Rating</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-white">
                  {selectedPlugin.rating_avg ? selectedPlugin.rating_avg.toFixed(1) : '—'}
                </span>
                <span className="text-xs text-[#777]">
                  / 5.0 ({selectedPlugin.rating_count || 0} reviews)
                </span>
              </div>
            </div>
            <div className="text-[11px] text-[#666] pt-3 border-t border-[#1f1f1f]">
              📥 {(selectedPlugin.downloads_count || 0).toLocaleString()} verified installs across Talos users
            </div>
          </div>

          <RatingHistogram
            hist={selectedPlugin.rating_hist}
            totalRatings={selectedPlugin.rating_count}
          />
        </div>

        {/* Protocol / Configuration details if MCP or custom schema */}
        {selectedPlugin.plugin_type === 'mcp' && selectedPlugin.capabilities_snapshot && (
          <div className="p-4 rounded-2xl bg-[#141414] border border-[#242424] space-y-2">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Protocol Capabilities</h4>
            <p className="text-[11px] text-[#777]">
              MCP Protocol: <span className="font-mono text-indigo-300">{selectedPlugin.capabilities_snapshot.protocol_version || 'v1.0'}</span>
            </p>
            {selectedPlugin.capabilities_snapshot.tools?.length > 0 && (
              <p className="text-[11px] text-emerald-400">
                ✓ {selectedPlugin.capabilities_snapshot.tools.length} remote tool handlers available
              </p>
            )}
          </div>
        )}

        {/* Community Reviews Thread */}
        <div className="pt-2">
          <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-3">
            Reviews & Feedback
          </h4>
          <ReviewThread
            pluginId={selectedPlugin.id}
            isInstalled={selectedPlugin.is_installed}
            isOwner={selectedPlugin.is_owner || selectedPlugin.builder_username === username}
            reviews={reviews}
            isLoading={isLoadingReviews}
            hasMore={hasMoreReviews}
            onLoadMore={() => loadReviews(selectedPlugin.id, reviewsCursor)}
            onSubmitReview={(b, s) => handleSubmitReview(b, s)}
            onVoteHelpful={handleVoteHelpful}
            onReportReview={handleReportReview}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-8 select-none">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. PROFILE COVER BANNER                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div
        className="relative w-full h-32 rounded-2xl overflow-hidden bg-gradient-to-r from-[#141624] via-[#1e1430] to-[#0d1627] border border-[#262626] bg-cover bg-center"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
      >
        {/* Subtle geometric grid / Talos pattern */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute right-4 bottom-3 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditingProfile(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 text-xs font-medium text-white shadow-lg hover:border-white/40 transition-all cursor-pointer active:scale-95"
          >
            <Edit3 size={13} className="text-indigo-400" />
            <span>Edit Profile</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. CREATOR IDENTITY HEADER                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="relative px-2 pt-0 pb-4">
        {/* Avatar - overlaps cover */}
        <div className="flex items-end justify-between -mt-10 mb-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-[#13141f] border-4 border-[#121212] flex items-center justify-center text-2xl font-bold text-indigo-400 shadow-xl overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span>{initial}</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1e1e1e] border border-[#2e2e2e] text-xs text-white hover:bg-[#282828] transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check size={12} className="text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Share2 size={12} /> Share <ArrowUpRight size={11} className="text-[#888]" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Identity Details */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">{displayName}</h2>
            <span className="text-xs text-[#777]">@{username}</span>
            {profile?.is_verified && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-sky-400 bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 rounded-full">
                <ShieldCheck size={12} /> Verified Builder
              </span>
            )}
          </div>

          <p className="text-xs font-medium text-[#ccc]">
            {headline}
          </p>

          {bio && (
            <p className="text-xs text-[#999] leading-relaxed max-w-2xl whitespace-pre-line pt-0.5">
              {bio}
            </p>
          )}

          {/* Expertise Chips */}
          {expertise.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {expertise.map(s => (
                <span
                  key={s}
                  className="px-2.5 py-0.5 rounded-xl text-[10px] font-medium bg-[#161622] text-indigo-300 border border-indigo-500/25"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Structured & Legacy Links */}
          <div className="flex items-center gap-3.5 pt-2 text-xs text-[#888] flex-wrap">
            {structuredLinks.length > 0 ? (
              structuredLinks.map((sl: any) => (
                <a
                  key={sl.id || sl.url}
                  href={sl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[#aaa] hover:text-white transition-colors"
                >
                  {sl.provider === 'github' && <GitHubIcon size={12} />}
                  {sl.provider === 'x' && <XSocialIcon size={12} />}
                  {sl.provider === 'website' && <Globe size={12} />}
                  {(sl.provider === 'custom' || sl.provider === 'linkedin' || sl.provider === 'youtube' || sl.provider === 'discord') && <ExternalLink size={11} />}
                  <span>{sl.label || sl.provider}</span>
                </a>
              ))
            ) : (
              <>
                {website && (
                  <a
                    href={website.startsWith('http') ? website : `https://${website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <Globe size={12} /> {website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {githubHandle && (
                  <a
                    href={`https://github.com/${githubHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <GitHubIcon size={12} /> {githubHandle}
                  </a>
                )}
                {twitterHandle && (
                  <a
                    href={`https://x.com/${twitterHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <XSocialIcon size={12} /> @{twitterHandle}
                  </a>
                )}
                {customLinks.map((cl: any) => (
                  <a
                    key={cl.id || cl.url}
                    href={cl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <ExternalLink size={11} /> {cl.label}
                  </a>
                ))}
              </>
            )}
            <span className="flex items-center gap-1 text-[#666]">
              <Calendar size={12} /> Joined {memberSince}
            </span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EDIT CREATOR PROFILE MODAL WITH LIVE PREVIEW                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <EditCreatorProfileModal
        isOpen={isEditingProfile}
        onClose={() => setIsEditingProfile(false)}
        profile={profile}
        plugins={plugins}
        onProfileUpdated={(updatedProfile, updatedPlugins) => {
          setProfile(updatedProfile);
          if (updatedPlugins) setPlugins(updatedPlugins);
          onRefreshMarketplace?.();
        }}
      />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. METRIC STATS STRIP                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5 my-3">
        <div className="p-3 rounded-2xl bg-[#161616] border border-[#222222] text-center">
          <p className="text-xl font-bold text-white tracking-tight">{plugins.length}</p>
          <p className="text-[11px] text-[#888] mt-0.5">Plugins</p>
        </div>
        <div className="p-3 rounded-2xl bg-[#161616] border border-[#222222] text-center">
          <p className="text-xl font-bold text-white tracking-tight">{totalInstalls.toLocaleString()}</p>
          <p className="text-[11px] text-[#888] mt-0.5">Installs</p>
        </div>
        <div className="p-3 rounded-2xl bg-[#161616] border border-[#222222] text-center">
          <p className="text-xl font-bold text-white tracking-tight">{totalRatings}</p>
          <p className="text-[11px] text-[#888] mt-0.5">Ratings</p>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. NAVIGATION TABS                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[#222] pb-2 my-2 overflow-x-auto scrollbar-hide text-xs">
        <button
          onClick={() => setActiveTab('plugins')}
          className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'plugins'
              ? 'bg-[#222] text-white'
              : 'text-[#888] hover:text-white hover:bg-[#181818]'
          }`}
        >
          Plugins ({plugins.length})
        </button>
                <button
          onClick={() => setActiveTab('skills')}
          className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'skills'
              ? 'bg-[#222] text-white'
              : 'text-[#888] hover:text-white hover:bg-[#181818]'
          }`}
        >
          Skills ({skillPlugins.length})
        </button>
        <button
          onClick={() => setActiveTab('connectors')}
          className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'connectors'
              ? 'bg-[#222] text-white'
              : 'text-[#888] hover:text-white hover:bg-[#181818]'
          }`}
        >
          Connectors ({connectorPlugins.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'activity'
              ? 'bg-[#222] text-white'
              : 'text-[#888] hover:text-white hover:bg-[#181818]'
          }`}
        >
          Activity ({activityItems.length})
        </button>
        <button
          onClick={() => setActiveTab('about')}
          className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'about'
              ? 'bg-[#222] text-white'
              : 'text-[#888] hover:text-white hover:bg-[#181818]'
          }`}
        >
          About
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. TAB CONTENT                                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* TAB 1: PLUGINS / CREATED WORK */}
      {(activeTab === 'plugins' || activeTab === 'agents' || activeTab === 'skills' || activeTab === 'connectors') && (
        <div className="space-y-4 pt-2">
          <div>
            {(() => {
              const currentList = activeTab === 'plugins'
                ? plugins
                : (activeTab === 'skills' ? skillPlugins : connectorPlugins);

              const allSelected = currentList.length > 0 && currentList.every(p => selectedPluginIds.includes(p.id));

              return (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold tracking-wider text-[#888] uppercase">
                        {activeTab === 'plugins' ? 'Created Plugins' : `${activeTab.toUpperCase()} Portfolio`}
                      </h3>
                      <span className="text-[11px] text-[#666]">
                        ({currentList.length})
                      </span>
                    </div>

                    {currentList.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectAll(currentList)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#2c2c2c] text-[11px] text-[#ccc] hover:text-white transition-colors cursor-pointer"
                        >
                          {allSelected ? (
                            <>
                              <CheckSquare size={13} className="text-red-400" />
                              <span>Deselect All</span>
                            </>
                          ) : (
                            <>
                              <Square size={13} />
                              <span>Select All ({currentList.length})</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Batch Action Toolbar when items are selected */}
                  {selectedPluginIds.length > 0 && (
                    <div className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-red-950/40 via-[#181818] to-red-950/30 border border-red-500/40 flex items-center justify-between gap-3 text-xs shadow-lg animate-in fade-in duration-150">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold shrink-0">
                          {selectedPluginIds.length} selected
                        </span>
                        <span className="text-[#ccc] text-[11px] truncate">
                          Selected for Marketplace deletion
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedPluginIds([])}
                          className="px-2.5 py-1.5 rounded-xl bg-[#222] hover:bg-[#2a2a2a] text-[#888] hover:text-white text-[11px] transition-colors cursor-pointer"
                        >
                          Clear Selection
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBatchDeleteModal(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] transition-colors cursor-pointer shadow-sm shadow-red-950"
                        >
                          <Trash2 size={12} />
                          <span>Delete Selected ({selectedPluginIds.length})</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Batch Delete Success Banner */}
                  {batchDeleteSuccess && (
                    <div className="mb-4 p-3 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-400 flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 size={14} />
                      <span>{batchDeleteSuccess}</span>
                    </div>
                  )}

                  {currentList.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-[#141414] border border-[#222] text-[#777]">
                      <Package size={28} className="mx-auto mb-2 text-[#444]" />
                      <p className="text-xs">No {activeTab} published yet.</p>
                      <button
                        onClick={() => setShowDraftModal(true)}
                        className="mt-3 px-3 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#eaeaea] transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Plus size={12} /> Create First {activeTab === 'plugins' ? 'Plugin' : activeTab.slice(0, -1)}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {currentList.map((p) => {
                        const isSelected = selectedPluginIds.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedPlugin(p);
                              onSelectPlugin?.(p);
                            }}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group relative ${
                              isSelected
                                ? 'bg-red-950/20 border-red-500/60 ring-1 ring-red-500/40'
                                : 'bg-[#151515] hover:bg-[#1a1a1a] border-[#242424] hover:border-[#383838]'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelectPluginId(p.id);
                                    }}
                                    className={`p-0.5 rounded transition-colors cursor-pointer shrink-0 ${
                                      isSelected
                                        ? 'text-red-400 hover:text-red-300'
                                        : 'text-[#555] hover:text-white hover:bg-[#202020]'
                                    }`}
                                    title={isSelected ? 'Deselect item' : 'Select item for batch delete'}
                                  >
                                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                  </button>
                                  <h4 className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-1.5 truncate">
                                    <span className="text-indigo-400">◇</span> {p.name}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/50 text-indigo-400 border border-indigo-800/40">
                                    v{p.latest_version || '1.0.0'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPluginToDelete(p);
                                    }}
                                    className="p-1 rounded-md text-[#555] hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                                    title="Delete from Marketplace"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              <p className="text-[11px] text-[#999] line-clamp-2 leading-relaxed mb-3 pl-6">
                                {p.short_desc || p.description || 'AI capabilities designed for the Talos runtime.'}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-[#202020] flex items-center justify-between text-[10px] text-[#777]">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-[#202020] text-[#aaa] capitalize">
                                  {p.plugin_type || p.category || 'Plugin'}
                                </span>
                                <span className="flex items-center gap-1 text-[#aaa]">
                                  <Star size={10} className="text-amber-400 fill-amber-400" />
                                  {p.rating_avg ? p.rating_avg.toFixed(1) : 'New'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1">
                                  <Download size={10} /> {p.downloads_count || 0}
                                </span>
                                <span>{formatTimeAgo(p.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVITY FULL LOG */}
      {activeTab === 'activity' && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-semibold tracking-wider text-[#888] uppercase">
            Full Activity Stream
          </h3>
          {activityItems.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#141414] border border-[#222] text-[#777] text-xs">
              No activity logs recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-[#222] rounded-2xl bg-[#141414] border border-[#222] overflow-hidden">
              {activityItems.map((item) => (
                <div key={item.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0" />
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="text-[11px] text-[#777]">{item.subtitle}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-[#666]">{item.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ABOUT */}
      {activeTab === 'about' && (
        <div className="space-y-4 pt-2">
          <div className="p-4 rounded-2xl bg-[#151515] border border-[#222] space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">About the Creator</h4>
            <p className="text-xs text-[#bbb] leading-relaxed whitespace-pre-line">
              {bio || "I'm building open and customizable AI systems with Talos. Interested in AI agents, developer automation, local-first software, and making powerful AI tools accessible to everyone."}
            </p>
            <div className="pt-3 border-t border-[#222] text-xs text-[#777] flex items-center gap-6">
              <span>Member since {memberSince}</span>
              <span>{plugins.length} published plugins</span>
              <span>{totalInstalls.toLocaleString()} total downloads</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/20 to-purple-950/20 border border-indigo-900/30 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white">Talos Creator Card</p>
              <p className="text-[11px] text-[#888] mt-0.5">
                {plugins.length} plugins · {totalInstalls} installs · {totalRatings} ratings
              </p>
            </div>
            <button
              onClick={handleShare}
              className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#eaeaea] transition-colors cursor-pointer"
            >
              Share Profile ↗
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE PLUGIN DRAFT                                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141414] border border-[#2c2c2c] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#222]">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Package size={15} className="text-indigo-400" />
                Create New Plugin
              </h4>
              <button
                onClick={() => setShowDraftModal(false)}
                className="text-xs text-[#888] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDraft} className="space-y-3">
              <div>
                <label className="text-[11px] text-[#888] block mb-1">Plugin Name</label>
                <input
                  required
                  value={draftName}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                    if (!draftSlug) {
                      setDraftSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                    }
                  }}
                  placeholder="e.g. Browser Research Agent"
                  className="w-full px-3 py-2 rounded-xl bg-[#0f0f0f] border border-[#2e2e2e] text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#888] block mb-1">Slug</label>
                  <input
                    required
                    value={draftSlug}
                    onChange={(e) => setDraftSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="browser-research-agent"
                    className="w-full px-3 py-2 rounded-xl bg-[#0f0f0f] border border-[#2e2e2e] text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#888] block mb-1">Type</label>
                  <select
                    value={draftPluginType}
                    onChange={(e: any) => {
                      setDraftPluginType(e.target.value);
                      setDraftCategory(e.target.value === 'agent' ? 'agents' : (e.target.value === 'skill' ? 'skills' : 'mcp'));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#0f0f0f] border border-[#2e2e2e] text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="agent">Agent</option>
                    <option value="skill">Skill</option>
                    <option value="mcp">MCP Server</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[#888] block mb-1">Short Description</label>
                <textarea
                  required
                  rows={2}
                  maxLength={250}
                  value={draftShortDesc}
                  onChange={(e) => setDraftShortDesc(e.target.value)}
                  placeholder="Research the web, summarize sources, and return structured results."
                  className="w-full px-3 py-2 rounded-xl bg-[#0f0f0f] border border-[#2e2e2e] text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {draftError && (
                <p className="text-xs text-red-400">{draftError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-[#888] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingDraft}
                  className="px-4 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#eaeaea] transition-colors cursor-pointer"
                >
                  {isCreatingDraft ? 'Creating...' : 'Create Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#141414] border border-red-900/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800/60">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Delete {selectedPluginIds.length} item(s) from Marketplace?
                </h3>
                <p className="text-xs text-[#888]">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-[#bbb] leading-relaxed">
              Are you sure you want to permanently delete these <strong>{selectedPluginIds.length}</strong> listing(s) from the Talos Cloud registry? All published versions, reviews, ratings, and packages will be removed.
            </p>

            {/* Selected items chip preview */}
            <div className="p-3 rounded-xl bg-[#181818] border border-[#262626] max-h-36 overflow-y-auto space-y-1.5">
              <span className="text-[10px] uppercase font-semibold text-[#666] block mb-1">
                Selected for Deletion:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {plugins
                  .filter(p => selectedPluginIds.includes(p.id))
                  .map(p => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-950/40 border border-red-800/40 text-[11px] text-red-300"
                    >
                      <span className="truncate max-w-[180px]">{p.name}</span>
                      <span className="text-[9px] font-mono text-red-400/70">({p.plugin_type})</span>
                    </span>
                  ))}
              </div>
            </div>

            {batchDeleteError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-400">
                {batchDeleteError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowBatchDeleteModal(false);
                  setBatchDeleteError(null);
                }}
                disabled={isBatchDeleting}
                className="px-4 py-2 rounded-xl bg-[#202020] hover:bg-[#282828] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={isBatchDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm shadow-red-900/50"
              >
                {isBatchDeleting && <Loader2 size={12} className="animate-spin" />}
                <span>{isBatchDeleting ? 'Deleting...' : `Yes, Delete (${selectedPluginIds.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Delete Plugin Confirmation Modal */}
      {pluginToDelete && (
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
              Are you sure you want to delete <strong className="text-white">&ldquo;{pluginToDelete.name}&rdquo;</strong> from the Marketplace? 
              This will unpublish the listing and remove all published versions.
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
                  setPluginToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeletingPlugin}
                className="px-4 py-2 rounded-xl bg-[#202020] hover:bg-[#282828] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePlugin}
                disabled={isDeletingPlugin}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm shadow-red-900/50"
              >
                {isDeletingPlugin && <Loader2 size={12} className="animate-spin" />}
                <span>{isDeletingPlugin ? 'Deleting...' : 'Permanently Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
