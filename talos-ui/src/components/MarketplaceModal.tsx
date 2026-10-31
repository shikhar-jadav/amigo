'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Search, Upload, Bot, Globe,
  Download, Trash2, CheckCircle2, Loader2,
  Package, LayoutGrid,
  TestTube2, Shield, Zap, ArrowLeft,
  KeyRound, Lock, Check, ExternalLink, HelpCircle,
  Terminal, AlertTriangle, Copy,
  Flame, Sparkles, Users, Award,
  ArrowUpDown, SlidersHorizontal, ChevronDown, Star, Clock
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  Plugin,
  Builder,
  Review,
  PluginType,
  MarketplaceTab,
  DiscoverySortMode
} from './marketplace/types';
import { StarRating } from './marketplace/components/StarRating';
import { RatingHistogram } from './marketplace/components/RatingHistogram';
import { PluginCard } from './marketplace/components/PluginCard';
import { ReviewThread } from './marketplace/components/ReviewThread';
import { SharePopover } from './marketplace/components/SharePopover';
import { BuilderProfileView } from './marketplace/components/BuilderProfileView';
import { PluginDetailView } from './marketplace/components/PluginDetailView';
import { PublishWizardModal } from './marketplace/components/PublishWizardModal';
import { ConnectorTypeChooserModal, SelectedConnectorType } from './marketplace/components/ConnectorTypeChooserModal';
import { McpPublishModal } from './marketplace/components/McpPublishModal';
import { SkillPublishModal } from './marketplace/components/SkillPublishModal';
import { AgentPublishModal } from './marketplace/components/AgentPublishModal';

type SidebarTab = MarketplaceTab;
type PublishStep = 'select' | 'skill' | 'mcp' | 'success';

export function isPluginConnected(plugin: Plugin): boolean {
  if (!plugin.is_installed) return false;
  // If MCP server
  if (plugin.plugin_type === 'mcp') {
    // If server does not require authentication and has no required auth schema, it's connected immediately
    const requiresAuth = plugin.capabilities_snapshot?.requires_auth || (plugin.configuration_schema && plugin.configuration_schema.some((f: any) => f.required));
    if (!requiresAuth) {
      return true;
    }
    const meta = plugin.configuration_metadata;
    if (meta?.MCP_AUTH_TOKEN?.configured || meta?.auth_method === 'oauth2' || meta?.connected_at) {
      return true;
    }
    return false;
  }
  // If has schema
  if (plugin.configuration_schema && plugin.configuration_schema.length > 0) {
    const meta = plugin.configuration_metadata || {};
    const requiredFields = plugin.configuration_schema.filter((f: any) => f.required);
    if (requiredFields.length > 0) {
      return requiredFields.every((f: any) => meta[f.name]?.configured);
    }
  }
  return false;
}

interface MarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSkillInstalled?: () => void;
  initialTab?: SidebarTab;
  initialPluginId?: string | null;
  onTabChange?: (tab: SidebarTab) => void;
  onPluginSelect?: (pluginId: string | null) => void;
}

const TYPE_LABELS: Record<PluginType, string> = {
  skill: 'Skill',
  mcp: 'Remote MCP',
  agent: 'Sub-Agent',
};

const TYPE_COLORS: Record<PluginType, string> = {
  skill: 'text-violet-400 bg-violet-950/40 border-violet-800/40',
  mcp: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
  agent: 'text-blue-400 bg-blue-950/40 border-blue-800/40',
};

const TYPE_ICONS: Record<PluginType, React.ReactNode> = {
  skill: <Zap size={10} />,
  mcp: <Globe size={10} />,
  agent: <Bot size={10} />,
};

export const MarketplaceModal: React.FC<MarketplaceModalProps> = ({
  isOpen,
  onClose,
  onSkillInstalled,
  initialTab,
  initialPluginId,
  onTabChange,
  onPluginSelect,
}) => {
  const { user } = useAuth();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(initialTab || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<DiscoverySortMode>('popular');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSortMenu(false);
      }
    };
    if (showSortMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSortMenu]);

  const SORT_OPTIONS: { id: DiscoverySortMode; label: string; icon: React.ReactNode }[] = [
    { id: 'popular', label: 'Most Popular', icon: <Sparkles size={13} className="text-amber-400" /> },
    { id: 'trending', label: 'Trending', icon: <Flame size={13} className="text-orange-500" /> },
    { id: 'top_rated', label: 'Top Rated', icon: <Star size={13} className="text-yellow-400 fill-yellow-400/20" /> },
    { id: 'recent', label: 'Recently Added', icon: <Clock size={13} className="text-sky-400" /> },
  ];
  const [filterCategory, setFilterCategory] = useState<'all' | 'installed' | 'uninstalled'>('all');
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pluginLoadError, setPluginLoadError] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const prefetchStartedRef = useRef(false);
  const hasLoadedPluginsRef = useRef(false);
  const loadingPluginsRef = useRef(false);

  const loadPlugins = useCallback(async () => {
    if (loadingPluginsRef.current) return;
    loadingPluginsRef.current = true;
    if (!hasLoadedPluginsRef.current) setIsLoading(true);
    try {
      const res = await fetch('/api/marketplace/plugins?sort=popular');
      const data = await res.json();
      if (data.loading) {
        setPluginLoadError(null);
        window.setTimeout(() => void loadPlugins(), 1_000);
        return;
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || `Marketplace request failed (${res.status})`);
      }

      const loaded: Plugin[] = data.plugins || [];
      setPlugins(loaded);
      setPluginLoadError(null);
      hasLoadedPluginsRef.current = true;
      setSelectedPlugin(prev => {
        if (!prev) return null;
        const fresh = loaded.find(p => p.id === prev.id);
        return fresh || prev;
      });
    } catch (error: unknown) {
      setPluginLoadError(error instanceof Error ? error.message : 'Unable to load marketplace plugins.');
    } finally {
      loadingPluginsRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTab) {
      setSidebarTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialPluginId && plugins.length > 0) {
      const match = plugins.find(p => p.id === initialPluginId || p.slug === initialPluginId);
      if (match) {
        setSelectedPlugin(match);
      }
    } else if (initialPluginId === null) {
      setSelectedPlugin(null);
    }
  }, [initialPluginId, plugins]);

  const handleSelectTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
    setSelectedPlugin(null);
    onTabChange?.(tab);
    onPluginSelect?.(null);
  };

  const handleSelectPlugin = (plugin: Plugin | null) => {
    setSelectedPlugin(plugin);
    onPluginSelect?.(plugin ? plugin.id : null);
  };
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const handleCopyLogs = (logs: string) => {
    navigator.clipboard.writeText(logs);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  // Connect / Config state
  const [configuringPlugin, setConfiguringPlugin] = useState<Plugin | null>(null);
  const [configInputs, setConfigInputs] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);

  // Publish state
  const [showConnectorChooser, setShowConnectorChooser] = useState(false);
  const [activePublishConnector, setActivePublishConnector] = useState<SelectedConnectorType | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [publishingPlugin, setPublishingPlugin] = useState<Plugin | null>(null);
  const [publishStep, setPublishStep] = useState<PublishStep>('select');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState<any>(null);

  // Skill publish
  const [skillFile, setSkillFile] = useState<File | null>(null);
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const skillFileRef = useRef<HTMLInputElement>(null);

  // MCP Claude-style Connector flow
  const [mcpName, setMcpName] = useState('');
  const [mcpSlug, setMcpSlug] = useState('');
  const [mcpDesc, setMcpDesc] = useState('');
  const [mcpEndpoint, setMcpEndpoint] = useState('');
  const [mcpStage, setMcpStage] = useState<'input' | 'checking' | 'options'>('input');
  const [mcpChecks, setMcpChecks] = useState<Array<{ title: string; status_code: number; state: string }>>([]);
  const [mcpTestResult, setMcpTestResult] = useState<{ ok: boolean; caps?: any; error?: string } | null>(null);
  const [mcpTesting, setMcpTesting] = useState(false);
  const [authOption, setAuthOption] = useState<'signin_now' | 'signin_needed' | 'no_signin'>('signin_now');
  const [oauthOption, setOauthOption] = useState<'published_identity' | 'register_auto' | 'custom_client'>('published_identity');
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');

  // Social & Builder State
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [reviewsCursor, setReviewsCursor] = useState(0);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [sharePlugin, setSharePlugin] = useState<Plugin | null>(null);
  const [selectedBuilderUsername, setSelectedBuilderUsername] = useState<string | null>(null);

  useEffect(() => {
    if (loadingPluginsRef.current) return;
    if (hasLoadedPluginsRef.current && !isOpen) return;
    if (prefetchStartedRef.current && !isOpen) return;

    prefetchStartedRef.current = true;
    const timer = window.setTimeout(() => void loadPlugins(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadPlugins]);

  useEffect(() => {
    if (selectedPlugin) {
      loadReviews(selectedPlugin.id, 0);
    } else {
      setReviews([]);
    }
  }, [selectedPlugin?.id]);

  const loadReviews = async (pluginId: string, offset: number) => {
    setIsLoadingReviews(true);
    try {
      const res = await fetch(`/api/marketplace/plugins/${pluginId}/reviews?offset=${offset}&limit=10`);
      if (res.ok) {
        const data: Review[] = await res.json();
        if (offset === 0) {
          setReviews(data);
        } else {
          setReviews(prev => [...prev, ...data]);
        }
        setHasMoreReviews(data.length === 10);
        setReviewsCursor(offset + data.length);
      }
    } finally {
      setIsLoadingReviews(false);
    }
  };

  const handleOptimisticReview = async (body: string, stars: number): Promise<{ success: boolean; error?: string }> => {
    if (!selectedPlugin) return { success: false, error: 'No plugin selected' };

    // Optimistic item
    const tempId = `temp_${Date.now()}`;
    const optimisticItem: Review = {
      id: tempId,
      plugin_id: selectedPlugin.id,
      user_id: user?.id || 'me',
      body,
      rating_stars: stars,
      helpful_count: 0,
      reviewer_name: user?.display_name || user?.email?.split('@')[0] || 'You',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setReviews(prev => [optimisticItem, ...prev]);

    try {
      const res = await fetch(`/api/marketplace/plugins/${selectedPlugin.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, stars }),
      });

      if (!res.ok) {
        // Rollback
        setReviews(prev => prev.filter(r => r.id !== tempId));
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.detail || 'Failed to submit review' };
      }

      const resData = await res.json();
      // Replace optimistic item with server item
      setReviews(prev => prev.map(r => r.id === tempId ? resData.review : r));
      // Re-fetch plugin list to update ratings average and counts
      loadPlugins();
      return { success: true };
    } catch (err: any) {
      setReviews(prev => prev.filter(r => r.id !== tempId));
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const handleVoteHelpful = async (reviewId: string) => {
    try {
      const res = await fetch(`/api/marketplace/reviews/${reviewId}/helpful`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful_count: data.helpful_count } : r));
      }
    } catch {}
  };

  const handleReportReview = async (reviewId: string, reason: string) => {
    try {
      await fetch(`/api/marketplace/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      alert('Report submitted. Thank you for keeping the marketplace safe.');
    } catch {}
  };

  const openConnectModal = (plugin: Plugin) => {
    setConfiguringPlugin(plugin);
    setConfigInputs({});
  };

  const handleInstall = async (plugin: Plugin, targetVersion?: string) => {
    setInstallingId(plugin.id);
    try {
      const url = targetVersion 
        ? `/api/marketplace/plugins/${plugin.id}/install?version=${encodeURIComponent(targetVersion)}`
        : `/api/marketplace/plugins/${plugin.id}/install`;
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        const updatedPlugin = { 
          ...plugin, 
          is_installed: true,
          installed_version: targetVersion || plugin.latest_version 
        };
        setPlugins(prev => prev.map(p => p.id === plugin.id ? updatedPlugin : p));
        if (selectedPlugin?.id === plugin.id) setSelectedPlugin(updatedPlugin);
        if (onSkillInstalled) onSkillInstalled();
        // Refresh plugin list to immediately populate installation logs and status
        await loadPlugins();
        // Prompt connection immediately if it requires configuration / auth
        const requiresAuth = plugin.plugin_type === 'mcp'
          ? (plugin.capabilities_snapshot?.requires_auth || (plugin.configuration_schema && plugin.configuration_schema.some((f: any) => f.required)))
          : (plugin.configuration_schema && plugin.configuration_schema.length > 0);

        if (requiresAuth) {
          openConnectModal(updatedPlugin);
        }
      }
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (plugin: Plugin) => {
    setInstallingId(plugin.id);
    try {
      await fetch(`/api/marketplace/plugins/${plugin.id}/uninstall`, { method: 'POST' });
      setPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, is_installed: false } : p));
      if (selectedPlugin?.id === plugin.id) setSelectedPlugin({ ...selectedPlugin, is_installed: false });
      if (onSkillInstalled) onSkillInstalled();
    } finally {
      setInstallingId(null);
    }
  };

  const handleDeletePlugin = async (plugin: Plugin) => {
    const res = await fetch(`/api/marketplace/plugins/${plugin.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.error || 'Failed to delete plugin');
    }
    setPlugins(prev => prev.filter(p => p.id !== plugin.id));
    setSelectedPlugin(null);
    await loadPlugins();
    if (onSkillInstalled) onSkillInstalled();
  };

  const handleSaveConfig = async () => {
    if (!configuringPlugin) return;
    setSavingConfig(true);
    try {
      const metadata: Record<string, any> = {};
      Object.keys(configInputs).forEach(k => {
        metadata[k] = { configured: !!configInputs[k] };
      });
      await fetch(`/api/marketplace/plugins/${configuringPlugin.id}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration_metadata: metadata })
      });
      for (const [key, value] of Object.entries(configInputs)) {
        if (value) {
          await fetch('/api/marketplace/plugins/secrets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plugin_id: configuringPlugin.id, key, value })
          });
        }
      }
      setConfiguringPlugin(null);
      setConfigInputs({});
    } finally {
      setSavingConfig(false);
    }
  };

  const formatError = (err: any): string => {
    if (!err) return 'An error occurred';
    if (typeof err === 'string') return err;
    if (Array.isArray(err)) {
      return err.map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && item.msg) {
          const field = Array.isArray(item.loc) ? item.loc.join('.') : '';
          return field ? `${field}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      }).join(', ');
    }
    if (typeof err === 'object') {
      if (err.msg) {
        const field = Array.isArray(err.loc) ? err.loc.join('.') : '';
        return field ? `${field}: ${err.msg}` : err.msg;
      }
      if (err.detail) return formatError(err.detail);
      if (err.message) return formatError(err.message);
      if (err.error) return formatError(err.error);
      return JSON.stringify(err);
    }
    return String(err);
  };

  const handleStartMCPCheck = async () => {
    if (!mcpEndpoint) return;
    setMcpTesting(true);
    setMcpStage('checking');
    setPublishError('');
    setMcpChecks([
      { title: 'Connecting to the server', status_code: 0, state: 'running' },
      { title: 'Looking up sign-in settings', status_code: 0, state: 'pending' },
      { title: 'Checking the sign-in provider', status_code: 0, state: 'pending' }
    ]);

    try {
      const res = await fetch('/api/marketplace/publish/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mcpName || 'mcp-server',
          slug: mcpSlug || 'mcp-server',
          description: mcpDesc || 'Remote MCP server integration',
          endpoint_url: mcpEndpoint,
          version: '1.0.0',
          _probe_only: true
        })
      });
      const data = await res.json();
      if (res.ok) {
        const caps = data.capabilities || {};
        setMcpTestResult({ ok: true, caps });
        if (caps.probe_checks && caps.probe_checks.length > 0) {
          setMcpChecks(caps.probe_checks);
        } else {
          setMcpChecks([
            { title: 'Connecting to the server', status_code: caps.requires_auth ? 401 : 200, state: 'done' },
            { title: 'Looking up sign-in settings', status_code: caps.oauth ? 200 : 404, state: 'done' },
            { title: 'Checking the sign-in provider', status_code: caps.oauth ? 200 : 404, state: 'done' }
          ]);
        }
        if (caps.server_name && !mcpName) {
          setMcpName(caps.server_name);
          if (!mcpSlug) {
            setMcpSlug(caps.server_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30));
          }
        }
        // Automatically detect and pre-select exact options based on server probe results
        if (caps.requires_auth) {
          setAuthOption('signin_now');
        } else {
          setAuthOption('no_signin');
        }

        const oauth = caps.oauth || {};
        if (oauth.client_id_metadata_document_supported) {
          setOauthOption('published_identity');
        } else if (oauth.supports_dcr) {
          setOauthOption('register_auto');
        } else if (caps.requires_auth) {
          // Server requires auth (e.g. GitHub OAuth) but doesn't support CIMD or DCR -> auto-select custom_client
          setOauthOption('custom_client');
        }

        // Advance to options view after brief delay so user sees live checkmarks
        setTimeout(() => {
          setMcpStage('options');
          setMcpTesting(false);
        }, 800);
      } else {
        setMcpTestResult({ ok: false, error: formatError(data.detail || data.error || 'Connection failed') });
        setMcpTesting(false);
      }
    } catch (e: any) {
      setMcpTestResult({ ok: false, error: formatError(e.message) });
      setMcpTesting(false);
    }
  };

  const handlePublishSkill = async () => {
    if (!skillFile) return;
    setIsPublishing(true);
    setPublishError('');
    try {
      const formData = new FormData();
      formData.append('file', skillFile);
      formData.append('name', skillName || skillFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('description', skillDesc || 'Skill package');
      const res = await fetch('/api/marketplace/publish-package', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(formatError(data.detail || data.error || 'Publish failed'));
      setPublishSuccess(data);
      setPublishStep('success');
      loadPlugins();
    } catch (e: any) {
      setPublishError(formatError(e.message));
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishMCP = async () => {
    if (!mcpEndpoint || !mcpName || !mcpSlug) {
      setPublishError('Please fill all required fields');
      return;
    }
    setIsPublishing(true);
    setPublishError('');
    try {
      const res = await fetch('/api/marketplace/publish/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mcpName, slug: mcpSlug, description: mcpDesc || `${mcpName} remote MCP server`,
          endpoint_url: mcpEndpoint, version: '1.0.0',
          auth_type: authOption === 'no_signin' ? 'none' : 'bearer'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatError(data.detail || data.error || 'Publish failed'));
      setPublishSuccess(data);
      setPublishStep('success');
      loadPlugins();
    } catch (e: any) {
      setPublishError(formatError(e.message));
    } finally {
      setIsPublishing(false);
    }
  };

  const startOAuthFlow = async (plugin: Plugin) => {
    setConnectingOAuth(true);
    try {
      const redirectUri = `${window.location.origin}/api/marketplace/oauth/callback`;
      const res = await fetch('/api/marketplace/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin_id: plugin.id,
          redirect_uri: redirectUri,
          client_mode: oauthOption === 'published_identity' ? 'cimd' : oauthOption === 'register_auto' ? 'dcr' : 'manual',
          manual_client_id: manualClientId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not start OAuth flow');

      const width = 600;
      const height = 750;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const authWindow = window.open(
        data.authorization_url,
        `Connect_${plugin.name}`,
        `width=${width},height=${height},left=${left},top=${top},status=yes,toolbar=no,menubar=no`
      );

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'MCP_OAUTH_SUCCESS') {
          window.removeEventListener('message', handleMessage);
          setConfiguringPlugin(null);
          loadPlugins();
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setConnectingOAuth(false);
    }
  };

  const resetPublish = () => {
    setShowPublish(false);
    setPublishStep('select');
    setPublishError('');
    setPublishSuccess(null);
    setSkillFile(null); setSkillName(''); setSkillDesc('');
    
    setMcpName(''); setMcpSlug(''); setMcpDesc('');
    setMcpEndpoint('');
    setMcpStage('input');
    setMcpChecks([]);
    setMcpTestResult(null);
  };

  if (!isOpen) return null;

  const sidebarItems = [
    { id: 'all' as SidebarTab, label: 'All', icon: <LayoutGrid size={14} /> },
    { id: 'skills' as SidebarTab, label: 'Skills', icon: <Zap size={14} /> },
    { id: 'mcp' as SidebarTab, label: 'Remote MCP', icon: <Globe size={14} /> },
    { id: 'agents' as SidebarTab, label: 'Sub-Agents', icon: <Bot size={14} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative flex h-[640px] w-full max-w-[960px] overflow-hidden rounded-3xl bg-[#0c0c0c] border border-[#1e1e1e] shadow-2xl">

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-[#666] hover:text-white hover:bg-[#1e1e1e] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Left Sidebar */}
        <div className="w-[190px] shrink-0 border-r border-[#1a1a1a] bg-[#080808] flex flex-col">
          <div className="p-4 border-b border-[#1a1a1a]">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Package size={15} className="text-white" />
              Marketplace
            </h3>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {sidebarItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedBuilderUsername(null);
                  handleSelectTab(item.id);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  sidebarTab === item.id
                    ? 'bg-[#1e1e1e] text-white'
                    : 'text-[#777] hover:text-white hover:bg-[#141414]'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-[#1a1a1a]">
            <button
              onClick={() => setShowConnectorChooser(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#e0e0e0] transition-colors cursor-pointer"
            >
              <Upload size={13} />
              Publish
            </button>
          </div>
        </div>

        {/* Main Content */}
        {showPublish ? (
          /* GUIDED PUBLISH WIZARD */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0d0d0d]">
            <PublishWizardModal
              isOpen={showPublish}
              existingPlugin={publishingPlugin}
              onClose={() => {
                setShowPublish(false);
                setPublishingPlugin(null);
              }}
              onPublished={() => {
                setShowPublish(false);
                setPublishingPlugin(null);
                loadPlugins();
              }}
            />
          </div>
        ) : selectedPlugin ? (
          /* PLUGIN DETAIL */
          <PluginDetailView
            plugin={selectedPlugin}
            onBack={() => handleSelectPlugin(null)}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onDeletePlugin={handleDeletePlugin}
            installingId={installingId}
            onOpenConnect={openConnectModal}
            isPluginConnected={isPluginConnected}
            onSelectPublisher={(handle) => setSelectedBuilderUsername(handle)}
            onShare={(p) => setSharePlugin(p)}
            reviews={reviews}
            isLoadingReviews={isLoadingReviews}
            hasMoreReviews={hasMoreReviews}
            onLoadMoreReviews={() => loadReviews(selectedPlugin.id, reviewsCursor)}
            onSubmitReview={(b, s) => handleOptimisticReview(b, s)}
            onVoteHelpful={handleVoteHelpful}
            onReportReview={handleReportReview}
          />
        ) : selectedBuilderUsername ? (
          /* IN-APP BUILDER PROFILE VIEW */
          <BuilderProfileView
            username={selectedBuilderUsername}
            onBack={() => setSelectedBuilderUsername(null)}
            onSelectPlugin={handleSelectPlugin}
            isPluginConnected={isPluginConnected}
          />
        ) : (
          /* BROWSE (PLUGINS OR BUILDERS) */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search, Filter, and Sort Bar */}
            <div className="p-4 pr-16 border-b border-[#1a1a1a] flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={`Search ${
                      sidebarTab === 'all' ? 'all plugins' :
                      sidebarTab === 'skills' ? 'skills' :
                      sidebarTab === 'agents' ? 'sub-agents' :
                      'MCP servers'
                    }...`}
                    className="w-full rounded-xl bg-[#111] border border-[#262626] pl-9 pr-4 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#3a3a3a]"
                  />
                </div>

                {/* Sort Dropdown */}
                <div className="relative shrink-0" ref={sortMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowSortMenu(prev => !prev)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      showSortMenu
                        ? 'bg-[#1c1c1c] border-[#3e3e3e] text-white shadow-lg ring-1 ring-white/10'
                        : 'bg-[#141414] border-[#262626] text-[#ccc] hover:text-white hover:bg-[#191919] hover:border-[#333]'
                    }`}
                  >
                    <ArrowUpDown size={12} className="text-[#777]" />
                    <span>{SORT_OPTIONS.find(o => o.id === sortMode)?.label || 'Most Popular'}</span>
                    <ChevronDown
                      size={12}
                      className={`text-[#777] transition-transform duration-200 ${
                        showSortMenu ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  </button>

                  {/* Dropdown Menu */}
                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                      {SORT_OPTIONS.map(opt => {
                        const isSelected = sortMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSortMode(opt.id);
                              setShowSortMenu(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#222] text-white font-medium'
                                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {opt.icon}
                              <span>{opt.label}</span>
                            </span>
                            {isSelected && <Check size={12} className="text-white shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Status Filters */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterCategory('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    filterCategory === 'all'
                      ? 'bg-white text-black'
                      : 'bg-[#141414] text-[#777] hover:text-white hover:bg-[#1e1e1e] border border-[#222]'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('installed')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterCategory === 'installed'
                      ? 'bg-white text-black'
                      : 'bg-[#141414] text-[#777] hover:text-white hover:bg-[#1e1e1e] border border-[#222]'
                  }`}
                >
                  <CheckCircle2 size={12} className={filterCategory === 'installed' ? 'text-emerald-600' : 'text-emerald-400'} />
                  Installed
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('uninstalled')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    filterCategory === 'uninstalled'
                      ? 'bg-white text-black'
                      : 'bg-[#141414] text-[#777] hover:text-white hover:bg-[#1e1e1e] border border-[#222]'
                  }`}
                >
                  Available
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-[#555]">
                  <Loader2 size={20} className="animate-spin mb-3" />
                  <p className="text-xs">Loading plugins...</p>
                </div>
              ) : (() => {
                const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
                const displayedPlugins = plugins.filter(plugin => {
                  if (sidebarTab === 'skills' && plugin.plugin_type !== 'skill') return false;
                  if (sidebarTab === 'mcp' && plugin.plugin_type !== 'mcp') return false;
                  if (sidebarTab === 'agents' && plugin.plugin_type !== 'agent') return false;
                  if (normalizedQuery && ![
                    plugin.name,
                    plugin.description,
                    plugin.slug,
                  ].some(value => value.toLocaleLowerCase().includes(normalizedQuery))) return false;
                  if (filterCategory === 'installed') return plugin.is_installed;
                  if (filterCategory === 'uninstalled') return !plugin.is_installed;
                  return true;
                }).sort((a, b) => {
                  if (sortMode === 'recent') {
                    return Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
                  }
                  if (sortMode === 'top_rated') {
                    return (b.rating_avg || 0) - (a.rating_avg || 0)
                      || (b.stars_count || 0) - (a.stars_count || 0)
                      || b.downloads_count - a.downloads_count;
                  }
                  if (sortMode === 'trending') {
                    return b.downloads_count - a.downloads_count
                      || (b.rating_avg || 0) - (a.rating_avg || 0)
                      || Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
                  }
                  return b.downloads_count - a.downloads_count;
                });

                if (displayedPlugins.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-center text-[#555]">
                      {pluginLoadError ? (
                        <AlertTriangle size={32} className="mb-3 opacity-70 text-amber-400" />
                      ) : (
                        <Package size={32} className="mb-3 opacity-50" />
                      )}
                      <p className="text-sm font-medium text-[#888]">
                        {pluginLoadError
                          ? 'Could not load plugins'
                          : filterCategory === 'installed'
                          ? 'No installed plugins found'
                          : filterCategory === 'uninstalled'
                          ? 'No available plugins found'
                          : 'No plugins found'}
                      </p>
                      <p className="text-xs mt-1">
                        {pluginLoadError
                          ? pluginLoadError
                          : searchQuery ? 'Try adjusting your search terms or filters.' : 'Be the first to publish one.'}
                      </p>
                      {pluginLoadError && (
                        <button
                          type="button"
                          onClick={() => void loadPlugins()}
                          className="mt-3 rounded-lg border border-[#333] px-3 py-1.5 text-xs text-white hover:bg-[#1a1a1a]"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 gap-3">
                    {displayedPlugins.map(plugin => (
                      <PluginCard
                        key={plugin.id}
                        plugin={plugin}
                        onSelect={handleSelectPlugin}
                        onOpenConnect={openConnectModal}
                        onSelectBuilder={(uname) => setSelectedBuilderUsername(uname)}
                        isPluginConnected={isPluginConnected}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Connect / Configuration Modal Overlay (Claude-style Connect Dialog) */}
        {configuringPlugin && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-md rounded-3xl bg-[#111111] border border-[#242424] p-6 shadow-2xl relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#777]">Connector Auth</span>
                <button onClick={() => { setConfiguringPlugin(null); setConfigInputs({}); }} className="text-[#666] hover:text-white cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              {/* If plugin supports OAuth discovery, present the 1-click Connect card (Image 4 & 5 style) */}
              {configuringPlugin.capabilities_snapshot?.oauth?.authorization_endpoint || configuringPlugin.plugin_type === 'mcp' ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center mb-4 shadow-lg">
                    {configuringPlugin.name.toLowerCase().includes('notion') ? (
                      <span className="text-3xl font-bold font-serif text-white">N</span>
                    ) : (
                      <Globe size={28} className="text-white" />
                    )}
                  </div>
                  {isPluginConnected(configuringPlugin) ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium mb-3">
                        <CheckCircle2 size={13} />
                        Connected to your account
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        Connected to {configuringPlugin.name}
                      </h3>
                      <p className="text-xs text-[#777] mt-1.5 max-w-xs leading-relaxed">
                        Talos is authenticated with your {configuringPlugin.name} account. The agent has active access to its remote tools.
                      </p>

                      <div className="flex items-center gap-3 mt-6">
                        <button
                          onClick={() => startOAuthFlow(configuringPlugin)}
                          disabled={connectingOAuth}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#222] border border-[#333] text-white text-xs font-semibold hover:bg-[#2c2c2c] disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {connectingOAuth ? <><Loader2 size={13} className="animate-spin" /> Reconnecting...</> : 'Reconnect'}
                        </button>
                        <button
                          onClick={() => { setConfiguringPlugin(null); }}
                          className="px-5 py-2.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#e0e0e0] transition-colors cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-base font-semibold text-white">
                        You're not connected to {configuringPlugin.name} yet.
                      </h3>
                      <p className="text-xs text-[#777] mt-1.5 max-w-xs leading-relaxed">
                        Click connect to authorize Talos to access your data and tools securely via OAuth.
                      </p>

                      <button
                        onClick={() => startOAuthFlow(configuringPlugin)}
                        disabled={connectingOAuth}
                        className="mt-6 flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-[#e0e0e0] disabled:opacity-50 transition-colors cursor-pointer shadow-md"
                      >
                        {connectingOAuth ? <><Loader2 size={14} className="animate-spin text-black" /> Launching...</> : 'Connect'}
                      </button>
                    </>
                  )}

                  {/* GitHub or Manual Token / Secret input */}
                  {configuringPlugin.name.toLowerCase().includes('github') || configuringPlugin.endpoint_url?.includes('github') ? (
                    <div className="w-full mt-5 text-left p-4 rounded-2xl bg-[#161616] border border-[#252525] space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs text-[#ccc] font-medium">GitHub Personal Access Token (PAT)</label>
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo,read:org,read:user"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                        >
                          Generate token <ExternalLink size={10} />
                        </a>
                      </div>
                      <p className="text-[11px] text-[#777] leading-relaxed">
                        GitHub Remote MCP accepts a Personal Access Token (classic or fine-grained) with <code className="text-white">repo</code>, <code className="text-white">read:org</code>, <code className="text-white">read:user</code> scopes.
                      </p>
                      <input
                        type="password"
                        value={configInputs['MCP_AUTH_TOKEN'] || ''}
                        onChange={e => setConfigInputs(prev => ({ ...prev, MCP_AUTH_TOKEN: e.target.value }))}
                        placeholder="ghp_..."
                        className="w-full rounded-xl bg-[#111] border border-[#262626] px-3 py-2 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
                      />
                      <button
                        onClick={handleSaveConfig}
                        disabled={savingConfig || !configInputs['MCP_AUTH_TOKEN']}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-[#e0e0e0] disabled:opacity-40 cursor-pointer transition-colors"
                      >
                        {savingConfig ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Save &amp; Connect GitHub
                      </button>
                    </div>
                  ) : (
                    <details className="w-full mt-6 text-left group">
                      <summary className="text-[11px] text-[#666] hover:text-[#999] cursor-pointer text-center list-none select-none">
                        Or configure API Key / Token manually
                      </summary>
                      <div className="mt-3 p-3.5 rounded-2xl bg-[#161616] border border-[#252525] space-y-3">
                        <div>
                          <label className="block text-[11px] text-[#888] mb-1 font-medium">Personal Access Token / Key</label>
                          <input
                            type="password"
                            value={configInputs['MCP_AUTH_TOKEN'] || ''}
                            onChange={e => setConfigInputs(prev => ({ ...prev, MCP_AUTH_TOKEN: e.target.value }))}
                            placeholder="Secret token"
                            className="w-full rounded-xl bg-[#111] border border-[#262626] px-3 py-1.5 text-xs text-white placeholder-[#555] focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={handleSaveConfig}
                          disabled={savingConfig}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#222] hover:bg-[#2c2c2c] text-xs font-semibold text-white cursor-pointer transition-colors"
                        >
                          {savingConfig ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Save Token
                        </button>
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                /* Fallback for regular plugins with custom environment schema */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-[#141414] border border-[#222] text-xs">
                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                      <Lock size={12} />
                      <span className="font-medium">Encrypted & Stored Locally</span>
                    </div>
                    <p className="text-[#777] leading-relaxed">
                      Provide your authentication credentials for this server.
                    </p>
                  </div>

                  {(configuringPlugin.configuration_schema || []).map((field: any) => (
                    <div key={field.name}>
                      <label className="block text-xs text-[#aaa] font-medium mb-1">
                        {field.name}
                        {field.required && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      <input
                        type={field.secret !== false ? 'password' : 'text'}
                        value={configInputs[field.name] || ''}
                        onChange={e => setConfigInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                        placeholder={field.description || `Enter ${field.name}`}
                        className="w-full rounded-xl bg-[#141414] border border-[#262626] px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
                      />
                    </div>
                  ))}

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={handleSaveConfig}
                      disabled={savingConfig}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#e0e0e0] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {savingConfig ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Save Settings
                    </button>
                    <button
                      onClick={() => { setConfiguringPlugin(null); setConfigInputs({}); }}
                      className="px-4 py-2.5 rounded-xl bg-[#1e1e1e] border border-[#333] text-xs text-white hover:bg-[#262626] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Social Share Popover */}
      {sharePlugin && (
        <SharePopover
          pluginName={sharePlugin.name}
          slug={sharePlugin.slug}
          category={sharePlugin.category || 'agents'}
          shortDesc={sharePlugin.short_desc || sharePlugin.description}
          isOpen={!!sharePlugin}
          onClose={() => setSharePlugin(null)}
        />
      )}

      {/* Modern Connector Chooser Hover Modal */}
      <ConnectorTypeChooserModal
        isOpen={showConnectorChooser}
        onClose={() => setShowConnectorChooser(false)}
        onSelectType={(type) => {
          setShowConnectorChooser(false);
          setActivePublishConnector(type);
        }}
      />

      {/* MCP Connector Flow (Matching Images 1, 2, 3 - Real live checks, detected auth, no versions) */}
      <McpPublishModal
        isOpen={activePublishConnector === 'mcp'}
        onClose={() => setActivePublishConnector(null)}
        onSuccess={() => {
          setActivePublishConnector(null);
          loadPlugins();
        }}
      />

      {/* Skill Upload Flow (Matching Image 4 - Real AST & command security scan, YAML metadata extraction) */}
      <SkillPublishModal
        isOpen={activePublishConnector === 'skill'}
        onBack={() => {
          setActivePublishConnector(null);
          setShowConnectorChooser(true);
        }}
        onClose={() => setActivePublishConnector(null)}
        onSuccess={() => {
          setActivePublishConnector(null);
          loadPlugins();
        }}
      />

      <AgentPublishModal
        isOpen={activePublishConnector === 'agent'}
        onBack={() => {
          setActivePublishConnector(null);
          setShowConnectorChooser(true);
        }}
        onClose={() => setActivePublishConnector(null)}
        onSuccess={() => {
          setActivePublishConnector(null);
          loadPlugins();
        }}
      />
    </div>
  );
};

export default MarketplaceModal;
