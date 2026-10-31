'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Brain,
  Sliders,
  Shield,
  Trash2,
  Check,
  Moon,
  Sparkles,
  Bot,
  AlertTriangle,
  Package,
  Download,
  Star,
  ExternalLink,
  Puzzle,
  Globe,
  Zap,
  Settings2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Lock,
  CheckCircle2,
  Award
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CreatorProfileView } from './marketplace/components/CreatorProfileView';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

type TabType = 'general' | 'account' | 'usage' | 'memory' | 'model' | 'plugins' | 'admin';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab,
  onTabChange,
}) => {
  const { user, clearMemories, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>((initialTab as any) === 'builder' ? 'account' : (initialTab as TabType || 'general'));

  useEffect(() => {
    if (initialTab) {
      if ((initialTab as any) === 'builder') {
        setActiveTab('account');
      } else {
        setActiveTab(initialTab as TabType);
      }
    }
  }, [initialTab]);

  const switchTab = (tab: TabType | 'builder') => {
    if (tab === 'builder') {
      setActiveTab('account');
      onTabChange?.('account');
      return;
    }
    setActiveTab(tab);
    onTabChange?.(tab);
  };
  const [isClearing, setIsClearing] = useState(false);
  const [clearedSuccess, setClearedSuccess] = useState(false);

  // My Plugins state
  const [installedPlugins, setInstalledPlugins] = useState<any[]>([]);
  const [isLoadingPlugins, setIsLoadingPlugins] = useState(false);
  const [configuringPlugin, setConfiguringPlugin] = useState<any>(null);
  const [configInputs, setConfigInputs] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [togglingPlugin, setTogglingPlugin] = useState<string | null>(null);
  const [pluginsSubTab, setPluginsSubTab] = useState<'installed' | 'published'>('installed');

  // Settings states
  const [systemPromptCustom, setSystemPromptCustom] = useState(
    'Be articulate, concise, and prioritize accurate code and reasoning.'
  );
  const [streamSpeed, setStreamSpeed] = useState<'fast' | 'normal'>('fast');
  const [searchByDefault, setSearchByDefault] = useState(true);

  // Billing state for Usage Tab
  const [billingInfo, setBillingInfo] = useState<{
    plan_name: string;
    monthly_allowance: number;
    settled_credits: number;
    active_reserved_credits: number;
    spendable_credits: number;
    actual_cogs_usd: number;
    cogs_ceiling_usd: number;
    status: string;
    period_end: string | null;
  } | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);

  useEffect(() => {
    if (activeTab === 'usage' && user) {
      setIsLoadingBilling(true);
      fetch('/api/billing/balance')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.status === 'success') {
            setBillingInfo({
              plan_name: data.plan?.plan_name || 'pro_20',
              monthly_allowance: data.plan?.monthly_allowance || 5000,
              settled_credits: data.balance?.settled_credits ?? 5000,
              active_reserved_credits: data.balance?.active_reserved_credits ?? 0,
              spendable_credits: data.balance?.spendable_credits ?? 5000,
              actual_cogs_usd: data.plan?.actual_cogs_usd ?? 0.0,
              cogs_ceiling_usd: data.plan?.cogs_ceiling_usd ?? 5.0,
              status: data.plan?.status || 'active',
              period_end: data.plan?.period_end || null,
            });
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingBilling(false));
    }
  }, [activeTab, user]);

  // Fetch user's plugins when plugins tab is selected
  useEffect(() => {
    if (activeTab === 'plugins') {
      setIsLoadingPlugins(true);
      fetch('/api/marketplace/user/plugins')
        .then(res => res.ok ? res.json() : { installed: [] })
        .then(data => setInstalledPlugins(data.installed || []))
        .catch(() => setInstalledPlugins([]))
        .finally(() => setIsLoadingPlugins(false));
    }
  }, [activeTab, user]);

  const handleClearMemories = async () => {
    setIsClearing(true);
    try {
      const res = await clearMemories();
      if (res.success) {
        setClearedSuccess(true);
        setTimeout(() => setClearedSuccess(false), 3000);
      }
    } finally {
      setIsClearing(false);
    }
  };

  const handleTogglePlugin = async (pluginId: string, newActive: boolean) => {
    setTogglingPlugin(pluginId);
    try {
      await fetch(`/api/marketplace/plugins/${pluginId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActive })
      });
      setInstalledPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, is_active: newActive } : p));
    } finally {
      setTogglingPlugin(null);
    }
  };

  const handleUninstallPlugin = async (pluginId: string) => {
    if (!confirm('Uninstall this plugin? It will be removed from your system.')) return;
    await fetch(`/api/marketplace/plugins/${pluginId}/uninstall`, { method: 'POST' });
    setInstalledPlugins(prev => prev.filter(p => p.id !== pluginId));
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative flex h-[580px] w-full max-w-[760px] overflow-hidden rounded-3xl bg-[#121212] border border-[#242424] shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-[#777777] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Left Navigation Sidebar */}
        <div className="w-[210px] shrink-0 border-r border-[#1f1f1f] bg-[#0c0c0c] p-4 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="px-3 py-2 mb-3">
              <h3 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                <Sparkles size={16} className="text-white" />
                Settings
              </h3>
            </div>

            <button
              onClick={() => switchTab('general')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'general'
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#888888] hover:text-white hover:bg-[#161616]'
              }`}
            >
              <Sliders size={15} />
              <span>General</span>
            </button>

            <button
              onClick={() => switchTab('account')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'account'
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#888888] hover:text-white hover:bg-[#161616]'
              }`}
            >
              <User size={15} />
              <span>Account</span>
            </button>

            <button
              onClick={() => switchTab('usage')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'usage'
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#888888] hover:text-white hover:bg-[#161616]'
              }`}
            >
              <Zap size={15} />
              <span>Usage</span>
            </button>

            <button
              onClick={() => switchTab('plugins')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'plugins'
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#888888] hover:text-white hover:bg-[#161616]'
              }`}
            >
              <Puzzle size={15} />
              <span>My Plugins</span>
            </button>

            <button
              onClick={() => switchTab('memory')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'memory'
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#888888] hover:text-white hover:bg-[#161616]'
              }`}
            >
              <Brain size={15} />
              <span>Memory</span>
            </button>

            <button
              onClick={() => switchTab('model')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'model'
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#888888] hover:text-white hover:bg-[#161616]'
              }`}
            >
              <Bot size={15} />
              <span>Model & Agent</span>
            </button>

            {user?.is_admin && (
              <button
                onClick={() => switchTab('admin')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer mt-1 ${
                  activeTab === 'admin'
                    ? 'bg-amber-950/40 text-amber-300 border border-amber-800/40'
                    : 'text-amber-500/80 hover:text-amber-300 hover:bg-[#161616]'
                }`}
              >
                <Shield size={15} />
                <span>Admin Panel</span>
              </button>
            )}
          </div>

          <div className="px-3 py-2 text-[11px] text-[#555555]">
            Talos Agent v6.0.0
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto p-8 text-white font-sans">
          {/* 1. GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-base font-medium text-white">General Preferences</h4>
                <p className="text-xs text-[#888888] mt-1">
                  Customize the appearance and behavior of Talos.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between py-3 border-b border-[#1f1f1f]">
                  <div>
                    <p className="text-xs font-medium text-white">Theme</p>
                    <p className="text-[11px] text-[#777777]">Choose how Talos looks</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-xs text-[#dcdcdc]">
                    <Moon size={13} />
                    <span>Dark theme (active)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-[#1f1f1f]">
                  <div>
                    <p className="text-xs font-medium text-white">Streaming Speed</p>
                    <p className="text-[11px] text-[#777777]">Control response generation rate</p>
                  </div>
                  <select
                    value={streamSpeed}
                    onChange={(e) => setStreamSpeed(e.target.value as any)}
                    className="rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] px-3 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="fast">Ultra Fast (Stream deltas)</option>
                    <option value="normal">Standard</option>
                  </select>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-[#1f1f1f]">
                  <div>
                    <p className="text-xs font-medium text-white">Web Search Integration</p>
                    <p className="text-[11px] text-[#777777]">Enable live Tavily search when answering questions</p>
                  </div>
                  <button
                    onClick={() => setSearchByDefault(!searchByDefault)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                      searchByDefault ? 'bg-white' : 'bg-[#333333]'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition duration-200 ease-in-out my-auto ml-1 ${
                        searchByDefault ? 'translate-x-3.5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. ACCOUNT TAB */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              {user ? (
                <div className="space-y-4">
                  {/* Public Creator Profile */}
                  <CreatorProfileView />

                  {/* Compact Developer Account Footer */}
                  <div className="pt-4 border-t border-[#1f1f1f] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-[#777]">
                      <span>Signed in as <strong className="text-[#bbb]">{user.email}</strong></span>
                      <span>·</span>
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Session Active
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        onClose();
                        logout();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors cursor-pointer font-medium"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center rounded-2xl bg-[#171717] border border-[#222222]">
                  <p className="text-xs text-[#888888]">Not signed in.</p>
                </div>
              )}
            </div>
          )}

          {/* USAGE TAB */}
          {activeTab === 'usage' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-base font-medium text-white flex items-center justify-between">
                  <span>Talos Credits & Usage Metering</span>
                  {billingInfo && (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-full uppercase">
                      {billingInfo.plan_name === 'pro_20' ? 'Pro Plan ($20/mo)' : billingInfo.plan_name} · {billingInfo.status}
                    </span>
                  )}
                </h4>
                <p className="text-xs text-[#888888] mt-1">
                  1 credit = $0.001 USD base upstream value. Invocations are dynamically reserved and authoritatively settled.
                </p>
              </div>

              {/* 3 Key Financial Metrics Cards */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-2xl bg-[#161616] border border-[#252525]">
                  <p className="text-[11px] text-[#888888]">Spendable Balance</p>
                  <p className="text-xl font-bold text-amber-400 mt-1 font-mono">
                    {billingInfo ? Math.round(billingInfo.spendable_credits).toLocaleString() : '—'} <span className="text-xs font-normal text-[#888]">cr</span>
                  </p>
                  <span className="inline-block mt-2 text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-full font-mono">
                    Available for runs
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#161616] border border-[#252525]">
                  <p className="text-[11px] text-[#888888]">Active Reserved Holds</p>
                  <p className="text-xl font-bold text-blue-400 mt-1 font-mono">
                    {billingInfo ? billingInfo.active_reserved_credits.toFixed(1) : '0.0'} <span className="text-xs font-normal text-[#888]">cr</span>
                  </p>
                  <span className="inline-block mt-2 text-[10px] text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded-full">
                    In-flight agent locks
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#161616] border border-[#252525]">
                  <p className="text-[11px] text-[#888888]">Provider COGS Ceiling</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1 font-mono">
                    ${billingInfo ? billingInfo.actual_cogs_usd.toFixed(3) : '0.000'} <span className="text-xs font-normal text-[#888]">/ ${billingInfo ? billingInfo.cogs_ceiling_usd.toFixed(2) : '0.00'}</span>
                  </p>
                  <span className="inline-block mt-2 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    Independent vendor cap
                  </span>
                </div>
              </div>

              {/* Allowance Progress Bar */}
              <div className="space-y-4 pt-1">
                <div className="p-4 rounded-2xl bg-[#171717] border border-[#262626] space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium text-white">
                    <span className="flex items-center gap-2">
                      <Zap size={14} className="text-amber-400" />
                      Monthly Credit Allowance
                    </span>
                    <span className="text-neutral-400 font-mono text-[11px]">
                      {billingInfo ? Math.round(billingInfo.settled_credits ?? billingInfo.spendable_credits) : 0} / {billingInfo ? Math.round(billingInfo.monthly_allowance) : 0} cr
                    </span>
                  </div>
                  <div className="w-full bg-[#242424] h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-300" 
                      style={{
                        width: `${billingInfo && billingInfo.monthly_allowance > 0 ? Math.min(100, Math.max(0, ((billingInfo.spendable_credits / billingInfo.monthly_allowance) * 100))) : 0}%`
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#777777]">
                    <span className="capitalize">{billingInfo ? `${billingInfo.plan_name === 'pro_20' ? 'Pro Plan' : billingInfo.plan_name}: ${Math.round(billingInfo.monthly_allowance).toLocaleString()} monthly credits ($${billingInfo.cogs_ceiling_usd.toFixed(2)} upstream limit)` : 'No active subscription'}</span>
                    <span>{billingInfo && billingInfo.monthly_allowance > 0 ? `${Math.round((billingInfo.spendable_credits / billingInfo.monthly_allowance) * 100)}% remaining` : '0%'}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#171717] border border-[#262626] space-y-2">
                  <h5 className="text-xs font-medium text-white flex items-center gap-2">
                    <Sliders size={14} className="text-neutral-400" />
                    Hard-Stop & Continuous Execution Rule
                  </h5>
                  <p className="text-[11px] text-[#888888] leading-relaxed">
                    Before each LLM generation or paid tool execution, Talos pre-reserves the bounded step cost. If spendable balance is exhausted, agent runs pause safely without disrupting your running workspace servers or background dev processes.
                  </p>
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Dynamic reservation and relay settlement active
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. MY PLUGINS TAB */}
          {activeTab === 'plugins' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#202020]">
                <div>
                  <h4 className="text-base font-medium text-white">My Plugins & Marketplace</h4>
                  <p className="text-xs text-[#888] mt-0.5">
                    Manage locally installed plugins or your published listings on the Marketplace.
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#141414] border border-[#242424]">
                  <button
                    type="button"
                    onClick={() => setPluginsSubTab('installed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      pluginsSubTab === 'installed'
                        ? 'bg-[#252525] text-white font-semibold shadow-sm'
                        : 'text-[#888] hover:text-white'
                    }`}
                  >
                    Installed ({installedPlugins.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPluginsSubTab('published')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      pluginsSubTab === 'published'
                        ? 'bg-violet-600 text-white font-semibold shadow-sm shadow-violet-950'
                        : 'text-[#888] hover:text-white'
                    }`}
                  >
                    Published on Marketplace
                  </button>
                </div>
              </div>

              {pluginsSubTab === 'published' ? (
                <CreatorProfileView />
              ) : (
                <>

              {/* Config Modal Overlay */}
              {configuringPlugin && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                  <div className="w-full max-w-md rounded-2xl bg-[#0f0f0f] border border-[#262626] p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <h5 className="text-sm font-semibold text-white">Configure {configuringPlugin.name}</h5>
                      <button onClick={() => { setConfiguringPlugin(null); setConfigInputs({}); }} className="text-[#666] hover:text-white cursor-pointer">
                        <X size={16} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-[#141414] border border-[#222] text-xs">
                        <div className="flex items-center gap-2 text-emerald-400 mb-1">
                          <Lock size={11} />
                          <span className="font-medium">Managed by Talos Cloud Relay</span>
                        </div>
                        <p className="text-[#666]">BASE_URL and API_KEY are securely provided at runtime.</p>
                      </div>

                      {(configuringPlugin.configuration_schema || []).map((field: any) => (
                        <div key={field.name}>
                          <label className="block text-xs text-[#888] mb-1">
                            {field.name}
                            {field.required && <span className="text-red-400 ml-1">*</span>}
                          </label>
                          <input
                            type={field.secret ? 'password' : 'text'}
                            value={configInputs[field.name] || ''}
                            onChange={e => setConfigInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                            placeholder={field.secret ? '••••••••••••' : `Enter ${field.name}`}
                            className="w-full rounded-xl bg-[#141414] border border-[#262626] px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
                          />
                        </div>
                      ))}

                      {(!configuringPlugin.configuration_schema || configuringPlugin.configuration_schema.length === 0) && (
                        <p className="text-xs text-[#666] text-center py-2">No user configuration required for this plugin.</p>
                      )}
                    </div>

                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-[#e0e0e0] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {savingConfig ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Save Settings
                      </button>
                      <button
                        onClick={() => { setConfiguringPlugin(null); setConfigInputs({}); }}
                        className="px-4 py-2 rounded-xl bg-[#1e1e1e] border border-[#333] text-xs text-white hover:bg-[#262626] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isLoadingPlugins ? (
                <div className="flex items-center justify-center py-12 text-[#555]">
                  <Loader2 size={18} className="animate-spin mr-2" />
                  <span className="text-xs">Loading plugins...</span>
                </div>
              ) : installedPlugins.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-center rounded-2xl bg-[#0f0f0f] border border-[#1e1e1e]">
                  <Puzzle size={28} className="text-[#555] mb-3" />
                  <p className="text-sm font-medium text-[#888]">No plugins installed</p>
                  <p className="text-xs text-[#555] mt-1">Browse the Plugin Marketplace to install Skills, Sub-Agents, or MCP servers.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {installedPlugins.map(plugin => {
                    const typeColor = plugin.plugin_type === 'agent' ? 'text-blue-400 bg-blue-950/40 border-blue-800/40' :
                      plugin.plugin_type === 'mcp' ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' :
                      'text-violet-400 bg-violet-950/40 border-violet-800/40';
                    const typeLabel = plugin.plugin_type === 'agent' ? 'Sub-Agent' : plugin.plugin_type === 'mcp' ? 'Remote MCP' : 'Skill';
                    return (
                      <div key={plugin.id} className="p-4 rounded-2xl bg-[#0f0f0f] border border-[#1e1e1e]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-medium text-white truncate">{plugin.name}</h5>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${typeColor}`}>
                                {typeLabel}
                              </span>
                              {plugin.plugin_type === 'mcp' && (() => {
                                const requiresAuth = plugin.capabilities_snapshot?.requires_auth || (plugin.configuration_schema && plugin.configuration_schema.some((f: any) => f.required));
                                if (!requiresAuth) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
                                      <CheckCircle2 size={10} /> Connected
                                    </span>
                                  );
                                }
                                const isConnected = plugin.configuration_metadata?.MCP_AUTH_TOKEN?.configured || plugin.configuration_metadata?.auth_method === 'oauth2' || plugin.configuration_metadata?.connected_at;
                                return isConnected ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
                                    <CheckCircle2 size={10} /> Connected
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                    Auth Required
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-[11px] text-[#666] mt-0.5">by {plugin.publisher_name} · v{plugin.latest_version}</p>
                            <p className="text-xs text-[#888] mt-1.5 line-clamp-2">{plugin.description}</p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleTogglePlugin(plugin.id, !plugin.is_active)}
                              disabled={togglingPlugin === plugin.id}
                              title={plugin.is_active ? 'Disable plugin' : 'Enable plugin'}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              {togglingPlugin === plugin.id ? (
                                <Loader2 size={16} className="animate-spin text-[#666]" />
                              ) : plugin.is_active ? (
                                <ToggleRight size={22} className="text-emerald-400" />
                              ) : (
                                <ToggleLeft size={22} className="text-[#555]" />
                              )}
                            </button>

                            {(
                              (plugin.configuration_schema && plugin.configuration_schema.length > 0) ||
                              (plugin.plugin_type === 'mcp' && (plugin.capabilities_snapshot?.requires_auth || (plugin.configuration_schema && plugin.configuration_schema.some((f: any) => f.required))))
                            ) && (
                              <button
                                onClick={() => { setConfiguringPlugin(plugin); setConfigInputs({}); }}
                                className="p-1.5 rounded-lg text-[#666] hover:text-white hover:bg-[#1e1e1e] transition-colors cursor-pointer"
                                title="Configure"
                              >
                                <Settings2 size={14} />
                              </button>
                            )}

                            <button
                              onClick={() => handleUninstallPlugin(plugin.id)}
                              className="p-1.5 rounded-lg text-[#666] hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                              title="Uninstall"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {!plugin.is_active && (
                          <p className="text-[11px] text-amber-500/70 mt-2 border-t border-[#1a1a1a] pt-2">
                            Disabled — agent cannot access this plugin.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

          {/* 4. MEMORY & DATA TAB */}
          {activeTab === 'memory' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-base font-medium text-white">Memory & Data Controls</h4>
                <p className="text-xs text-[#888888] mt-1">
                  Talos stores facts and preferences in its persistent knowledge store to personalize future conversations.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="p-4 rounded-2xl bg-[#171717] border border-[#262626] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-white">
                    <Brain size={16} className="text-[#a3a3a3]" />
                    <span>How Talos Memory Works</span>
                  </div>
                  <p className="text-[11px] text-[#888888] leading-relaxed">
                    • <strong>Thread Checkpoints (PostgreSQL):</strong> Stored inside PostgreSQL 18. Automatically cleaned up when you delete individual chat threads in the sidebar.
                  </p>
                  <p className="text-[11px] text-[#888888] leading-relaxed">
                    • <strong>Cross-Session Memory:</strong> Explicit facts you ask Talos to remember (e.g. project preferences, tech stack, conventions) stay intact across threads until you clear them below.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181818] border border-[#262626]">
                  <div>
                    <p className="text-xs font-medium text-white">Clear Learned Memories</p>
                    <p className="text-[11px] text-[#777777] mt-0.5">
                      Permanently wipes all long-term facts learned about you. Chat threads are preserved.
                    </p>
                  </div>
                  <button
                    onClick={handleClearMemories}
                    disabled={isClearing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isClearing ? (
                      <span>Clearing...</span>
                    ) : clearedSuccess ? (
                      <>
                        <Check size={13} className="text-emerald-400" />
                        <span className="text-emerald-400">Cleared!</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={13} />
                        <span>Clear All</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. MODEL & AGENT TAB */}
          {activeTab === 'model' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-base font-medium text-white">Model & Agent Runtime</h4>
                <p className="text-xs text-[#888888] mt-1">
                  Configure the underlying LLM provider, reasoning instructions, and tools.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="py-3 border-b border-[#1f1f1f]">
                  <p className="text-xs font-medium text-white mb-1.5">Custom Agent Instructions</p>
                  <textarea
                    rows={3}
                    value={systemPromptCustom}
                    onChange={(e) => setSystemPromptCustom(e.target.value)}
                    placeholder="Provide specific instructions on how Talos should behave..."
                    className="w-full rounded-xl bg-[#1a1a1a] border border-[#282828] p-3 text-xs text-white placeholder-[#555555] focus:outline-none focus:border-[#444444] transition-colors resize-none"
                  />
                  <p className="text-[10px] text-[#666666] mt-1">
                    These instructions will guide the agent's tone and coding preferences across runs.
                  </p>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-[#1f1f1f]">
                  <div>
                    <p className="text-xs font-medium text-white">Active Model</p>
                    <p className="text-[11px] text-[#777777]">Routed via Talos Gated Relay</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#202020] text-xs font-mono text-[#dcdcdc] border border-[#2c2c2c]">
                    codestral-2508
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-[#1f1f1f]">
                  <div>
                    <p className="text-xs font-medium text-white">Architecture</p>
                    <p className="text-[11px] text-[#777777]">LangGraph ReAct Multi-Tool Agent</p>
                  </div>
                  <span className="text-[11px] text-emerald-400">Healthy</span>
                </div>
              </div>
            </div>
          )}


          {/* 6. ADMIN CONTROL PANEL TAB */}
          {activeTab === 'admin' && (
            <AdminControlPanel />
          )}

        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ADMIN CONTROL PANEL COMPONENT
// ---------------------------------------------------------------------------
const AdminControlPanel: React.FC = () => {
  const [adminSubTab, setAdminSubTab] = useState<'users' | 'pricing' | 'providers' | 'neon'>('neon');

  // Neon Database Inspection state
  const [neonData, setNeonData] = useState<any>(null);
  const [isLoadingNeon, setIsLoadingNeon] = useState(false);
  const [neonSearch, setNeonSearch] = useState('');

  // Users state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isLoadingUserDetail, setIsLoadingUserDetail] = useState(false);
  // Pricing state
  const [pricingList, setPricingList] = useState<any[]>([]);
  const [editingPricing, setEditingPricing] = useState<any>(null);
  const [inRateInput, setInRateInput] = useState('0.30');
  const [outRateInput, setOutRateInput] = useState('0.90');
  const [cachedRateInput, setCachedRateInput] = useState('0.03');
  const [toolCallRateInput, setToolCallRateInput] = useState('0.00');
  const [multiplierInput, setMultiplierInput] = useState('1.0');
  const [isSavingPricing, setIsSavingPricing] = useState(false);

  // Providers state
  const [providersList, setProvidersList] = useState<any[]>([]);
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [editProvName, setEditProvName] = useState('');
  const [editProvUrl, setEditProvUrl] = useState('');
  const [editProvKey, setEditProvKey] = useState('');
  const [editProvModels, setEditProvModels] = useState('');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [editProvError, setEditProvError] = useState<string | null>(null);

  const [newProvName, setNewProvName] = useState('');
  const [newProvId, setNewProvId] = useState('');
  const [newProvUrl, setNewProvUrl] = useState('');
  const [newProvKey, setNewProvKey] = useState('');
  const [newProvModels, setNewProvModels] = useState('');
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [provError, setProvError] = useState<string | null>(null);

  const loadUsers = () => {
    fetch(`/api/admin/users?query=${encodeURIComponent(searchQuery)}`)
      .then(res => res.ok ? res.json() : { users: [] })
      .then(data => setUsersList(data.users || []))
      .catch(() => setUsersList([]));
  };

  const loadPricing = () => {
    fetch('/api/admin/pricing')
      .then(res => res.ok ? res.json() : { pricing: [] })
      .then(data => setPricingList(data.pricing || []))
      .catch(() => setPricingList([]));
  };

  const loadProviders = () => {
    fetch('/api/admin/providers')
      .then(res => res.ok ? res.json() : { providers: [] })
      .then(data => setProvidersList(data.providers || []))
      .catch(() => setProvidersList([]));
  };

  const loadNeon = () => {
    setIsLoadingNeon(true);
    fetch('/api/admin/neon-status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.status === 'success') {
          setNeonData(data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingNeon(false));
  };

  useEffect(() => {
    if (adminSubTab === 'neon') {
      loadNeon();
    } else if (adminSubTab === 'users') {
      loadUsers();
    } else if (adminSubTab === 'pricing') {
      loadPricing();
    } else if (adminSubTab === 'providers') {
      loadProviders();
    }
  }, [adminSubTab, searchQuery]);

  const handleSelectUser = async (uId: string) => {
    setIsLoadingUserDetail(true);
    try {
      const res = await fetch(`/api/admin/users/${uId}/detail`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUser(data);
      }
    } finally {
      setIsLoadingUserDetail(false);
    }
  };

  const handleOpenEditPricing = (item: any) => {
    setEditingPricing(item);
    // Token input and output rates are stored per 1,000,000 tokens in DB
    // Convert to per-token: input_rate / 1,000,000
    const inRatePerTok = item.input_rate_usd ? (parseFloat(item.input_rate_usd) / 1000000).toFixed(8) : '0';
    const outRatePerTok = item.output_rate_usd ? (parseFloat(item.output_rate_usd) / 1000000).toFixed(8) : '0';
    setInRateInput(inRatePerTok);
    setOutRateInput(outRatePerTok);
    setToolCallRateInput(String(item.tool_call_rate_usd ?? '0'));
  };

  const handleSavePricing = async () => {
    if (!editingPricing) return;
    setIsSavingPricing(true);
    try {
      // If tool (Tavily), save tool_call_rate_usd directly
      // If model, convert input/output price per token back to per 1M: price * 1,000,000
      const isTool = editingPricing.provider_type === 'system_tool' || editingPricing.resource_id.includes('tavily');
      const inPerTok = parseFloat(inRateInput) || 0;
      const outPerTok = parseFloat(outRateInput) || 0;
      const toolRate = parseFloat(toolCallRateInput) || 0;

      const res = await fetch(`/api/admin/pricing/${encodeURIComponent(editingPricing.resource_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_rate_usd: isTool ? 0 : inPerTok * 1000000,
          output_rate_usd: isTool ? 0 : outPerTok * 1000000,
          cached_rate_usd: isTool ? 0 : (inPerTok * 1000000 * 0.1),
          tool_call_rate_usd: isTool ? toolRate : 0,
          credit_multiplier: 1.0,
        })
      });
      if (res.ok) {
        setEditingPricing(null);
        loadPricing();
      }
    } finally {
      setIsSavingPricing(false);
    }
  };

  const handleOpenEditProvider = (prov: any) => {
    setEditingProvider(prov);
    setEditProvName(prov.name || '');
    setEditProvUrl(prov.base_url || '');
    setEditProvKey('');
    setEditProvModels(Array.isArray(prov.models) ? prov.models.join(', ') : '');
    setEditProvError(null);
  };

  const handleSaveEditProvider = async () => {
    if (!editingProvider) return;
    setIsUpdatingProvider(true);
    setEditProvError(null);
    try {
      const modelsArr = editProvModels.split(',').map(m => m.trim()).filter(Boolean);
      const payload: any = {
        name: editProvName.trim(),
        base_url: editProvUrl.trim(),
        models: modelsArr
      };
      if (editProvKey.trim()) {
        payload.api_key = editProvKey.trim();
      }

      const res = await fetch(`/api/admin/providers/${editingProvider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setEditingProvider(null);
        loadProviders();
        loadPricing();
      } else {
        const err = await res.json().catch(() => ({}));
        setEditProvError(err.detail || 'Failed to update provider.');
      }
    } catch (e: any) {
      setEditProvError(e.message || 'Network error.');
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null);

  const handleDeleteProvider = async (providerId: string, providerName: string) => {
    if (!window.confirm(`Are you sure you want to delete the provider "${providerName}" (${providerId})? This will also remove any pricing models registered for its models.`)) {
      return;
    }
    setDeletingProviderId(providerId);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (editingProvider?.id === providerId) {
          setEditingProvider(null);
        }
        loadProviders();
        loadPricing();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to delete provider.');
      }
    } catch (e: any) {
      alert(e.message || 'Network error.');
    } finally {
      setDeletingProviderId(null);
    }
  };


  const handleAddProvider = async () => {
    setProvError(null);
    if (!newProvName || !newProvId || !newProvUrl || !newProvKey) {
      setProvError('All fields (Name, ID, Base URL, API Key) are required.');
      return;
    }
    setIsSavingProvider(true);
    try {
      const modelsArr = newProvModels.split(',').map(m => m.trim()).filter(Boolean);
      const res = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newProvId.toLowerCase().trim(),
          name: newProvName.trim(),
          base_url: newProvUrl.trim(),
          api_key: newProvKey.trim(),
          models: modelsArr
        })
      });
      if (res.ok) {
        setShowAddProviderModal(false);
        setNewProvName('');
        setNewProvId('');
        setNewProvUrl('');
        setNewProvKey('');
        setNewProvModels('');
        loadProviders();
        loadPricing();
      } else {
        const err = await res.json().catch(() => ({}));
        setProvError(err.detail || 'Failed to add provider.');
      }
    } catch (e: any) {
      setProvError(e.message || 'Network error.');
    } finally {
      setIsSavingProvider(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-base font-semibold text-white flex items-center gap-2">
          <Shield size={16} className="text-amber-400" />
          <span>Talos Admin Control Panel</span>
        </h4>
        <p className="text-xs text-[#888888] mt-1">
          Authoritative oversight: user directory & balance dossier, dynamic model pricing registry, and OpenAI-compatible providers.
        </p>
      </div>

      {/* Sub-Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-[#222222] pb-2">
        <button
          onClick={() => setAdminSubTab('neon')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            adminSubTab === 'neon' ? 'bg-[#222222] text-white border border-emerald-500/30' : 'text-[#888888] hover:text-white'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>⚡ Neon Cloud Postgres</span>
        </button>
        <button
          onClick={() => setAdminSubTab('users')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            adminSubTab === 'users' ? 'bg-[#222222] text-white' : 'text-[#888888] hover:text-white'
          }`}
        >
          👥 Users Directory
        </button>
        <button
          onClick={() => setAdminSubTab('pricing')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            adminSubTab === 'pricing' ? 'bg-[#222222] text-white' : 'text-[#888888] hover:text-white'
          }`}
        >
          💰 Pricing Models
        </button>
        <button
          onClick={() => setAdminSubTab('providers')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            adminSubTab === 'providers' ? 'bg-[#222222] text-white' : 'text-[#888888] hover:text-white'
          }`}
        >
          🔌 LLM Providers
        </button>
      </div>

      {/* 0. NEON LIVE DATABASE SUB-TAB */}
      {adminSubTab === 'neon' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Neon Cloud Database Engine</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-mono">
                  Connected & Verified
                </span>
              </h5>
              <p className="text-xs text-[#777] mt-0.5">
                Real-time connection metrics, storage footprint, and live table counts directly from Neon.
              </p>
            </div>
            <button
              onClick={loadNeon}
              disabled={isLoadingNeon}
              className="px-3 py-1.5 rounded-xl bg-[#1e1e1e] hover:bg-[#282828] text-white text-xs font-medium flex items-center gap-1.5 border border-[#333] cursor-pointer"
            >
              <span className={isLoadingNeon ? 'animate-spin' : ''}>🔄</span>
              <span>Refresh Stats</span>
            </button>
          </div>

          {isLoadingNeon && !neonData ? (
            <div className="py-12 text-center text-xs text-[#777]">
              Querying live Neon cloud PostgreSQL metrics...
            </div>
          ) : neonData ? (
            <div className="space-y-4">
              {/* Highlights cards */}
              <div className="grid grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[#161616] border border-[#242424]">
                  <span className="text-[#777] block text-[10px] uppercase tracking-wider">Neon Database Size</span>
                  <p className="text-emerald-400 font-bold text-sm mt-1 font-mono">
                    {neonData.neon?.database_size || 'Unknown'}
                  </p>
                  <span className="text-[10px] text-[#555] font-mono block mt-0.5">{neonData.neon?.database}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#161616] border border-[#242424]">
                  <span className="text-[#777] block text-[10px] uppercase tracking-wider">Public Tables</span>
                  <p className="text-cyan-400 font-bold text-sm mt-1 font-mono">
                    {neonData.summary?.total_tables || 0} Tables
                  </p>
                  <span className="text-[10px] text-[#555] block mt-0.5">All Schemas Initialized</span>
                </div>
                <div className="p-3 rounded-xl bg-[#161616] border border-[#242424]">
                  <span className="text-[#777] block text-[10px] uppercase tracking-wider">Registered Users</span>
                  <p className="text-amber-400 font-bold text-sm mt-1 font-mono">
                    {neonData.summary?.total_users || 0} User
                  </p>
                  <span className="text-[10px] text-emerald-400 block mt-0.5">Admin Authoritative</span>
                </div>
                <div className="p-3 rounded-xl bg-[#161616] border border-[#242424]">
                  <span className="text-[#777] block text-[10px] uppercase tracking-wider">Active Installs</span>
                  <p className="text-purple-400 font-bold text-sm mt-1 font-mono">
                    {neonData.summary?.active_installs || 0} Installed
                  </p>
                  <span className="text-[10px] text-[#555] block mt-0.5">Plugins / MCP / Agents</span>
                </div>
              </div>

              {/* Connection Details banner */}
              <div className="p-3.5 rounded-2xl bg-[#111] border border-[#222] space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-2">
                  <span className="text-[#777]">Endpoint Host:</span>
                  <span className="font-mono text-white text-[11px] truncate max-w-[420px]" title={neonData.neon?.host}>
                    {neonData.neon?.host}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-2">
                  <span className="text-[#777]">Cloud Region:</span>
                  <span className="text-white font-medium">{neonData.neon?.cloud_provider}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-2">
                  <span className="text-[#777]">Postgres Role & SSL:</span>
                  <span className="font-mono text-emerald-400 text-[11px]">
                    {neonData.neon?.user} (sslmode={neonData.neon?.ssl})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#777]">Engine Version:</span>
                  <span className="text-[#aaa] text-[10px] font-mono truncate max-w-[420px]" title={neonData.neon?.server_version}>
                    {neonData.neon?.server_version}
                  </span>
                </div>
              </div>

              {/* Tigris Object Storage Telemetry Banner */}
              <div className="p-3.5 rounded-2xl bg-[#111] border border-[#222] space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="font-semibold text-white">Tigris Global Object Storage</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-mono">
                    Bucket: {neonData.tigris?.bucket}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2 rounded-xl bg-[#161616] border border-[#202020]">
                    <span className="text-[#777] block text-[10px] uppercase">Storage Region</span>
                    <span className="text-white font-medium text-xs mt-0.5 block">{neonData.tigris?.region}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#161616] border border-[#202020]">
                    <span className="text-[#777] block text-[10px] uppercase">Stored Artifacts</span>
                    <span className="text-cyan-400 font-bold text-xs mt-0.5 block font-mono">{neonData.tigris?.total_objects || 0} Files</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#161616] border border-[#202020]">
                    <span className="text-[#777] block text-[10px] uppercase">Total Size</span>
                    <span className="text-emerald-400 font-bold text-xs mt-0.5 block font-mono">
                      {((neonData.tigris?.total_bytes || 0) / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              </div>

              {/* Published Marketplace Items Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>Published Marketplace Packages</span>
                    <span className="text-[10px] text-[#777]">({neonData.published_items?.length || 0} registered in Neon)</span>
                  </span>
                </div>

                <div className="rounded-xl border border-[#222] overflow-hidden max-h-[160px] overflow-y-auto">
                  <table className="w-full text-left text-xs text-[#ccc]">
                    <thead className="bg-[#141414] text-[#777] border-b border-[#222] sticky top-0">
                      <tr>
                        <th className="p-2 font-medium">Name & Slug</th>
                        <th className="p-2 font-medium">Type</th>
                        <th className="p-2 font-medium">Version</th>
                        <th className="p-2 font-medium">Storage Location</th>
                        <th className="p-2 font-medium text-right">Downloads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1b1b1b]">
                      {(!neonData.published_items || neonData.published_items.length === 0) ? (
                        <tr>
                          <td colSpan={5} className="p-3 text-center text-[#666] text-xs">
                            No packages published in marketplace yet. When you publish an agent or skill, it uploads to Tigris and indexes in Neon.
                          </td>
                        </tr>
                      ) : (
                        neonData.published_items.map((item: any) => (
                          <tr key={item.id} className="hover:bg-[#151515]">
                            <td className="p-2 font-medium text-white">
                              {item.name}
                              <span className="block text-[10px] text-[#666] font-mono">{item.slug}</span>
                            </td>
                            <td className="p-2">
                              <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-[#202020] text-[#aaa]">
                                {item.plugin_type}
                              </span>
                            </td>
                            <td className="p-2 font-mono text-[11px] text-[#888]">{item.latest_version}</td>
                            <td className="p-2 font-mono text-[10px] text-cyan-400 truncate max-w-[200px]" title={item.zip_path}>
                              {item.zip_path?.startsWith("tigris://") ? "☁️ Tigris S3" : "📁 Local Disk"}
                            </td>
                            <td className="p-2 font-mono text-[11px] text-right text-white">{item.downloads_count || 0}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table Inspector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Live Neon Tables ({neonData.tables?.length || 0})</span>
                  <input
                    type="text"
                    value={neonSearch}
                    onChange={(e) => setNeonSearch(e.target.value)}
                    placeholder="Filter tables..."
                    className="bg-[#141414] border border-[#242424] rounded-lg px-2.5 py-1 text-[11px] text-white placeholder-[#555] focus:outline-none"
                  />
                </div>

                <div className="rounded-xl border border-[#222] overflow-hidden max-h-[160px] overflow-y-auto">
                  <table className="w-full text-left text-xs text-[#ccc]">
                    <thead className="bg-[#141414] text-[#777] border-b border-[#222] sticky top-0">
                      <tr>
                        <th className="p-2 font-medium">Table Name</th>
                        <th className="p-2 font-medium">Live Rows</th>
                        <th className="p-2 font-medium text-right">Disk Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1b1b1b]">
                      {(neonData.tables || [])
                        .filter((t: any) => !neonSearch || t.name.toLowerCase().includes(neonSearch.toLowerCase()))
                        .map((t: any) => (
                          <tr key={t.name} className="hover:bg-[#151515]">
                            <td className="p-2 font-mono text-white text-[11px]">{t.name}</td>
                            <td className="p-2 font-mono text-[11px] text-[#aaa]">{t.rows}</td>
                            <td className="p-2 font-mono text-[11px] text-emerald-400 text-right">{t.size_pretty}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-red-400">
              Failed to load Neon status.
            </div>
          )}
        </div>
      )}

      {/* 1. USERS SUB-TAB */}
      {adminSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by email or user ID..."
              className="flex-1 bg-[#141414] border border-[#242424] rounded-xl px-3 py-2 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
            />
          </div>

          <div className="rounded-xl border border-[#222] overflow-hidden">
            <table className="w-full text-left text-xs text-[#ccc]">
              <thead className="bg-[#141414] text-[#888] border-b border-[#222]">
                <tr>
                  <th className="p-2.5 font-medium">User / Email</th>
                  <th className="p-2.5 font-medium">Plan / Status</th>
                  <th className="p-2.5 font-medium">Spendable Balance</th>
                  <th className="p-2.5 font-medium">Plugins</th>
                  <th className="p-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e1e]">
                {usersList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-[#666]">No users found</td>
                  </tr>
                ) : (
                  usersList.map((u) => (
                    <tr key={u.id} className="hover:bg-[#151515]">
                      <td className="p-2.5">
                        <span className="text-white font-medium block">{u.email}</span>
                        <span className="text-[10px] text-[#666] font-mono">{u.id}</span>
                      </td>
                      <td className="p-2.5">
                        <span className="capitalize text-amber-400 font-mono text-[11px] block">{u.plan_name}</span>
                        <span className="text-[10px] text-[#777]">{u.subscription_status}</span>
                      </td>
                      <td className="p-2.5 font-mono text-white">
                        <span>{Math.round(u.settled_balance - (u.active_reserved || 0)).toLocaleString()} credits</span>
                        <span className="block text-[10px] text-[#666] font-sans">
                          ${((u.settled_balance - (u.active_reserved || 0)) * 0.001).toFixed(2)} USD
                        </span>
                      </td>
                      <td className="p-2.5 text-[#aaa]">
                        {u.installed_plugins_count || 0} installed
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleSelectUser(u.id)}
                          className="px-2.5 py-1 bg-[#222] hover:bg-[#333] text-white rounded text-[11px] cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* User Detailed Dossier Modal */}
          {selectedUser && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-[#111] border border-[#282828] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-[#222] pb-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h5 className="text-base font-semibold text-white">
                        {selectedUser.user?.display_name || selectedUser.user?.email.split('@')[0]}
                      </h5>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-800/40 text-amber-400">
                        {selectedUser.subscription?.plan_name || 'free'}
                      </span>
                    </div>
                    <p className="text-xs text-[#888] font-mono">{selectedUser.user?.email}</p>
                    <p className="text-[11px] text-[#666]">
                      Member since: {new Date(selectedUser.user?.created_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="text-[#888] hover:text-white p-1 cursor-pointer">
                    <X size={18} />
                  </button>
                </div>

                {/* Identity & Financial Highlights */}
                <div className="grid grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[#161616] border border-[#222]">
                    <span className="text-[#777] block text-[10px] uppercase tracking-wider">User ID</span>
                    <p className="text-white font-mono text-[11px] mt-1 truncate" title={selectedUser.user?.id}>
                      {selectedUser.user?.id}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161616] border border-[#222]">
                    <span className="text-[#777] block text-[10px] uppercase tracking-wider">Spendable Balance</span>
                    <p className="text-amber-400 font-bold text-sm mt-0.5 font-mono">
                      {Math.round((selectedUser.wallet?.settled_balance || 0) - (selectedUser.wallet?.active_reserved || 0)).toLocaleString()} <span className="text-[10px] text-[#777] font-normal">cr</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161616] border border-[#222]">
                    <span className="text-[#777] block text-[10px] uppercase tracking-wider">Active Holds</span>
                    <p className="text-blue-400 font-bold text-sm mt-0.5 font-mono">
                      {Math.round(selectedUser.wallet?.active_reserved || 0).toLocaleString()} <span className="text-[10px] text-[#777] font-normal">cr</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161616] border border-[#222]">
                    <span className="text-[#777] block text-[10px] uppercase tracking-wider">Period COGS</span>
                    <p className="text-emerald-400 font-bold text-sm mt-0.5 font-mono">
                      ${parseFloat(selectedUser.subscription?.period_actual_cogs_usd || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* 1. INSTALLED PLUGINS (Exact List) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h6 className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Puzzle size={13} className="text-cyan-400" />
                      <span>Installed Plugins ({selectedUser.installed_plugins?.length || 0})</span>
                    </h6>
                  </div>
                  {(!selectedUser.installed_plugins || selectedUser.installed_plugins.length === 0) ? (
                    <div className="p-3 rounded-xl bg-[#151515] border border-[#202020] text-center text-xs text-[#666]">
                      No plugins currently installed on this account.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#222] overflow-hidden">
                      <table className="w-full text-left text-xs text-[#ccc]">
                        <thead className="bg-[#151515] text-[#777] border-b border-[#222]">
                          <tr>
                            <th className="p-2 font-medium">Plugin Name</th>
                            <th className="p-2 font-medium">Type</th>
                            <th className="p-2 font-medium">Version</th>
                            <th className="p-2 font-medium">Status</th>
                            <th className="p-2 font-medium text-right">Installed On</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e1e1e]">
                          {selectedUser.installed_plugins.map((p: any) => (
                            <tr key={p.id} className="hover:bg-[#161616]">
                              <td className="p-2 font-medium text-white">
                                {p.name}
                                <span className="block text-[10px] text-[#666] font-mono">{p.slug}</span>
                              </td>
                              <td className="p-2">
                                <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-[#202020] text-[#aaa]">
                                  {p.plugin_type}
                                </span>
                              </td>
                              <td className="p-2 font-mono text-[11px] text-[#888]">{p.latest_version || '1.0.0'}</td>
                              <td className="p-2">
                                <span className={`inline-flex items-center gap-1 text-[11px] ${p.is_active ? 'text-emerald-400' : 'text-neutral-500'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                                  {p.is_active ? 'Active' : 'Disabled'}
                                </span>
                              </td>
                              <td className="p-2 text-right text-[11px] text-[#777]">
                                {new Date(p.installed_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 2. PUBLISHED CREATIONS (Skills, MCPs, Sub-Agents) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h6 className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-400" />
                      <span>Published by this User ({selectedUser.published_plugins?.length || 0})</span>
                    </h6>
                  </div>
                  {(!selectedUser.published_plugins || selectedUser.published_plugins.length === 0) ? (
                    <div className="p-3 rounded-xl bg-[#151515] border border-[#202020] text-center text-xs text-[#666]">
                      This user has not published any plugins to the marketplace yet.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#222] overflow-hidden">
                      <table className="w-full text-left text-xs text-[#ccc]">
                        <thead className="bg-[#151515] text-[#777] border-b border-[#222]">
                          <tr>
                            <th className="p-2 font-medium">Published Item</th>
                            <th className="p-2 font-medium">Type</th>
                            <th className="p-2 font-medium">Downloads</th>
                            <th className="p-2 font-medium">Rating/Stars</th>
                            <th className="p-2 font-medium text-right">Published At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e1e1e]">
                          {selectedUser.published_plugins.map((pub: any) => (
                            <tr key={pub.id} className="hover:bg-[#161616]">
                              <td className="p-2 font-medium text-white">
                                {pub.name}
                                <span className="block text-[10px] text-[#666] font-mono">{pub.slug}</span>
                              </td>
                              <td className="p-2">
                                <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-[#202020] text-[#aaa]">
                                  {pub.plugin_type}
                                </span>
                              </td>
                              <td className="p-2 font-mono text-[11px] text-[#aaa]">{pub.downloads_count || 0}</td>
                              <td className="p-2 font-mono text-[11px] text-amber-400">★ {pub.stars_count || 0}</td>
                              <td className="p-2 text-right text-[11px] text-[#777]">
                                {pub.published_at ? new Date(pub.published_at).toLocaleDateString() : 'Draft'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. SUBSCRIPTION & GRANT HISTORY */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h6 className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Zap size={13} className="text-amber-400" />
                      <span>Subscription & Allowance History</span>
                    </h6>
                  </div>
                  {(!selectedUser.subscription_history || selectedUser.subscription_history.length === 0) ? (
                    <div className="p-3 rounded-xl bg-[#151515] border border-[#202020] text-center text-xs text-[#666]">
                      No subscription allowance grants or renewals recorded yet.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#222] overflow-hidden">
                      <table className="w-full text-left text-xs text-[#bbb]">
                        <thead className="bg-[#151515] text-[#777] border-b border-[#222]">
                          <tr>
                            <th className="p-2 font-medium">Event Type</th>
                            <th className="p-2 font-medium">Credits Delta</th>
                            <th className="p-2 font-medium">Details / Reason</th>
                            <th className="p-2 font-medium text-right">Date & Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e1e1e]">
                          {selectedUser.subscription_history.map((sh: any) => (
                            <tr key={sh.id} className="hover:bg-[#161616]">
                              <td className="p-2 font-mono text-[11px] capitalize text-white">
                                {sh.transaction_type.replace(/_/g, ' ')}
                              </td>
                              <td className={`p-2 font-mono font-medium ${sh.credits_delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {sh.credits_delta >= 0 ? `+${sh.credits_delta}` : sh.credits_delta} cr
                              </td>
                              <td className="p-2 text-[11px] text-[#888]">
                                {sh.meta?.reason || sh.meta?.plan || 'Monthly subscription grant'}
                              </td>
                              <td className="p-2 text-right text-[11px] text-[#777]">
                                {new Date(sh.created_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>



                {/* 5. RECENT THREADS */}
                <div className="text-xs space-y-2">
                  <span className="text-[#888] font-medium">Recent Chat Threads ({selectedUser.threads?.length || 0}):</span>
                  {(!selectedUser.threads || selectedUser.threads.length === 0) ? (
                    <p className="text-[11px] text-[#666]">No recent threads.</p>
                  ) : (
                    <div className="space-y-1">
                      {selectedUser.threads.slice(0, 4).map((t: any) => (
                        <div key={t.thread_id} className="p-2.5 rounded-lg bg-[#151515] border border-[#202020] text-[11px] text-[#bbb] flex items-center justify-between">
                          <span className="truncate flex-1">{t.title || 'Untitled Thread'}</span>
                          <span className="text-[#666] text-[10px] ml-2 shrink-0">{new Date(t.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. PRICING SUB-TAB */}
      {adminSubTab === 'pricing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#888]">
              All models registered in your providers model lists appear here automatically. Set input and output price per token.
            </p>
          </div>

          <div className="rounded-xl border border-[#222] overflow-hidden">
            <table className="w-full text-left text-xs text-[#ccc]">
              <thead className="bg-[#141414] text-[#888] border-b border-[#222]">
                <tr>
                  <th className="p-2.5 font-medium">Model / Tool Name</th>
                  <th className="p-2.5 font-medium">Provider</th>
                  <th className="p-2.5 font-medium">Input Price (per token)</th>
                  <th className="p-2.5 font-medium">Output Price (per token)</th>
                  <th className="p-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e1e]">
                {pricingList.map((pr) => {
                  const isTool = pr.provider_type === 'system_tool' || pr.resource_id.includes('tavily');
                  const inPerTok = parseFloat(pr.input_rate_usd || 0) / 1000000;
                  const outPerTok = parseFloat(pr.output_rate_usd || 0) / 1000000;

                  return (
                    <tr key={pr.id} className="hover:bg-[#151515]">
                      <td className="p-2.5">
                        <span className="font-mono text-white text-[11px] block">{pr.resource_id}</span>
                        <span className="text-[10px] text-[#777] font-mono">{pr.pricing_version}</span>
                      </td>
                      <td className="p-2.5 text-[#888]">
                        {pr.provider_name || (isTool ? 'Tavily Search' : 'OpenAI-Compatible')}
                      </td>
                      <td className="p-2.5 font-mono text-white">
                        {isTool ? (
                          <span className="text-cyan-400 font-semibold">${parseFloat(pr.tool_call_rate_usd || 0).toFixed(4)} / search</span>
                        ) : (
                          `$${inPerTok.toFixed(8)}`
                        )}
                      </td>
                      <td className="p-2.5 font-mono text-white">
                        {isTool ? (
                          <span className="text-[#666]">—</span>
                        ) : (
                          `$${outPerTok.toFixed(8)}`
                        )}
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleOpenEditPricing(pr)}
                          className="px-3 py-1 bg-[#222] hover:bg-[#333] text-white rounded-lg text-[11px] font-medium cursor-pointer"
                        >
                          Edit Price
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Edit Pricing Modal */}
          {editingPricing && (
            <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-[#111] border border-[#282828] p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#222] pb-3">
                  <div>
                    <h5 className="text-sm font-semibold text-white">
                      Edit Price: {editingPricing.resource_id}
                    </h5>
                    <p className="text-[11px] text-[#777]">
                      {editingPricing.provider_type === 'system_tool' || editingPricing.resource_id.includes('tavily')
                        ? 'Set Tavily search price per invocation'
                        : 'Set input price and output price per token'}
                    </p>
                  </div>
                  <button onClick={() => setEditingPricing(null)} className="text-[#888] hover:text-white cursor-pointer">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs">
                  {(editingPricing.provider_type === 'system_tool' || editingPricing.resource_id.includes('tavily')) ? (
                    <div>
                      <label className="block text-[#aaa] font-medium mb-1">Tavily Search Unit Price ($ per search)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={toolCallRateInput}
                        onChange={(e) => setToolCallRateInput(e.target.value)}
                        placeholder="e.g. 0.0075"
                        className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                      />
                      <p className="text-[10px] text-[#666] mt-1">
                        Basic search default is $0.0075, Advanced search default is $0.015.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[#aaa] font-medium mb-1">Input Price ($ per token)</label>
                        <input
                          type="number"
                          step="0.00000001"
                          value={inRateInput}
                          onChange={(e) => setInRateInput(e.target.value)}
                          placeholder="e.g. 0.00000030"
                          className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                        />
                        <p className="text-[10px] text-[#666] mt-1">
                          Calculated at ${(parseFloat(inRateInput || '0') * 1000000).toFixed(2)} per 1M input tokens.
                        </p>
                      </div>

                      <div>
                        <label className="block text-[#aaa] font-medium mb-1">Output Price ($ per token)</label>
                        <input
                          type="number"
                          step="0.00000001"
                          value={outRateInput}
                          onChange={(e) => setOutRateInput(e.target.value)}
                          placeholder="e.g. 0.00000090"
                          className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                        />
                        <p className="text-[10px] text-[#666] mt-1">
                          Calculated at ${(parseFloat(outRateInput || '0') * 1000000).toFixed(2)} per 1M output tokens.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#222]">
                  <button
                    onClick={handleSavePricing}
                    disabled={isSavingPricing}
                    className="flex-1 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-[#e5e5e5] disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingPricing ? 'Saving...' : 'Save Price'}
                  </button>
                  <button
                    onClick={() => setEditingPricing(null)}
                    className="px-4 py-2 rounded-xl bg-[#222] text-white text-xs hover:bg-[#333] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. PROVIDERS SUB-TAB */}
      {adminSubTab === 'providers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#888]">
              Configured upstream OpenAI-compatible providers. Models automatically synchronize into the Pricing Registry.
            </p>
            <button
              onClick={() => { setShowAddProviderModal(true); setProvError(null); }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ Add Provider</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {providersList.map((pv) => (
              <div key={pv.id} className="p-4 rounded-xl bg-[#141414] border border-[#222] flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h6 className="text-xs font-semibold text-white">{pv.name}</h6>
                    <span className="text-[10px] font-mono text-[#777] bg-[#1c1c1c] px-2 py-0.5 rounded border border-[#282828]">{pv.id}</span>
                  </div>
                  <p className="text-[11px] text-[#888] font-mono">{pv.base_url}</p>
                  <div className="flex items-center gap-2 text-[11px] text-[#aaa] pt-1">
                    <span className="text-[#666]">Models:</span>
                    <div className="flex flex-wrap gap-1">
                      {(pv.models || []).map((m: string) => (
                        <span key={m} className="px-2 py-0.5 rounded bg-[#1e1e1e] text-[10px] font-mono text-[#ccc] border border-[#2a2a2a]">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-0.5 rounded-full font-medium">
                      Active
                    </span>
                    <button
                      onClick={() => handleOpenEditProvider(pv)}
                      className="px-2.5 py-1 bg-[#222] hover:bg-[#333] text-white rounded-lg text-[11px] font-medium cursor-pointer"
                    >
                      Edit Provider
                    </button>
                    <button
                      onClick={() => handleDeleteProvider(pv.id, pv.name)}
                      disabled={deletingProviderId === pv.id}
                      title="Delete Provider"
                      className="p-1 text-[#666] hover:text-red-400 hover:bg-red-950/30 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <span className="text-[10px] font-mono text-[#555]">
                    Key: {pv.api_key_masked || 'Encrypted'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Edit Provider Modal */}
          {editingProvider && (
            <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-[#111] border border-[#282828] p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#222] pb-3">
                  <div>
                    <h5 className="text-sm font-semibold text-white">Edit Provider: {editingProvider.name}</h5>
                    <p className="text-[11px] text-[#777]">Modify base URL, API key, and registered model list</p>
                  </div>
                  <button onClick={() => setEditingProvider(null)} className="text-[#888] hover:text-white cursor-pointer">
                    <X size={16} />
                  </button>
                </div>

                {editProvError && (
                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-400">
                    {editProvError}
                  </div>
                )}

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[#888] mb-1">Provider ID</label>
                    <input
                      type="text"
                      disabled
                      value={editingProvider.id}
                      className="w-full bg-[#181818] border border-[#242424] rounded-xl px-3 py-2 text-[#777] font-mono cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">Display Name</label>
                    <input
                      type="text"
                      value={editProvName}
                      onChange={(e) => setEditProvName(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">OpenAI-Compatible Base URL</label>
                    <input
                      type="url"
                      value={editProvUrl}
                      onChange={(e) => setEditProvUrl(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">New API Key (Leave empty to keep existing)</label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••••••••••"
                      value={editProvKey}
                      onChange={(e) => setEditProvKey(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">Models (Comma-separated list)</label>
                    <input
                      type="text"
                      value={editProvModels}
                      onChange={(e) => setEditProvModels(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                    />
                    <p className="text-[10px] text-[#666] mt-1">
                      Any new models added will be registered in the Pricing Models tab with initial rates.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#222]">
                  <button
                    onClick={() => handleDeleteProvider(editingProvider.id, editingProvider.name)}
                    disabled={deletingProviderId === editingProvider.id}
                    className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                  <button
                    onClick={handleSaveEditProvider}
                    disabled={isUpdatingProvider}
                    className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdatingProvider ? 'Saving...' : 'Save Provider Changes'}
                  </button>
                  <button
                    onClick={() => setEditingProvider(null)}
                    className="px-4 py-2 rounded-xl bg-[#222] text-white text-xs hover:bg-[#333] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Provider Modal */}
          {showAddProviderModal && (
            <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-[#111] border border-[#282828] p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#222] pb-3">
                  <div>
                    <h5 className="text-sm font-semibold text-white">Add OpenAI-Compatible Provider</h5>
                    <p className="text-[11px] text-[#777]">API key encrypted via AES-256. Base URL validated against SSRF.</p>
                  </div>
                  <button onClick={() => setShowAddProviderModal(false)} className="text-[#888] hover:text-white cursor-pointer">
                    <X size={16} />
                  </button>
                </div>

                {provError && (
                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-400">
                    {provError}
                  </div>
                )}

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[#888] mb-1">Provider ID (e.g. groq, together, deepseek)</label>
                    <input
                      type="text"
                      placeholder="e.g. groq"
                      value={newProvId}
                      onChange={(e) => setNewProvId(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">Display Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Groq Cloud"
                      value={newProvName}
                      onChange={(e) => setNewProvName(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">OpenAI-Compatible Base URL</label>
                    <input
                      type="url"
                      placeholder="https://api.groq.com/openai/v1"
                      value={newProvUrl}
                      onChange={(e) => setNewProvUrl(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">API Key</label>
                    <input
                      type="password"
                      placeholder="gsk_..."
                      value={newProvKey}
                      onChange={(e) => setNewProvKey(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] mb-1">Models (Comma-separated list)</label>
                    <input
                      type="text"
                      placeholder="llama-3.3-70b-versatile, mixtral-8x7b-32768"
                      value={newProvModels}
                      onChange={(e) => setNewProvModels(e.target.value)}
                      className="w-full bg-[#161616] border border-[#282828] rounded-xl px-3 py-2 text-white font-mono"
                    />
                    <p className="text-[10px] text-[#666] mt-1">
                      Models listed will automatically be registered in the Pricing Models tab with initial rates.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#222]">
                  <button
                    onClick={handleAddProvider}
                    disabled={isSavingProvider}
                    className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingProvider ? 'Encrypting & Adding...' : 'Add Provider'}
                  </button>
                  <button
                    onClick={() => setShowAddProviderModal(false)}
                    className="px-4 py-2 rounded-xl bg-[#222] text-white text-xs hover:bg-[#333] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsModal;
