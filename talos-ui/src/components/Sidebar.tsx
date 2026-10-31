'use client';

import React, { useState } from 'react';
import {
  SquarePen,
  Search,
  PanelLeftClose,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  LogIn,
  LogOut,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import { SyncIndicator } from '@/components/SyncIndicator';
import { SettingsModal } from '@/components/SettingsModal';
import { MarketplaceModal } from '@/components/MarketplaceModal';
import { Store, Award, User, Zap } from 'lucide-react';
import { useProactive } from '@/context/ProactiveContext';

export interface ThreadItem {
  id: string;
  title: string;
  timestamp: Date;
}

interface SidebarProps {
  threads: ThreadItem[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDeleteThread: (id: string) => void;
  onRenameThread: (id: string, newTitle: string) => void;
  onOpenSettings?: (tab?: string) => void;
  isSettingsOpen?: boolean;
  settingsTab?: string;
  onCloseSettings?: () => void;
  onSettingsTabChange?: (tab: string) => void;
  onOpenMarketplace?: (tab?: string, pluginId?: string | null) => void;
  isMarketplaceOpen?: boolean;
  marketplaceTab?: string;
  marketplacePluginId?: string | null;
  onCloseMarketplace?: () => void;
  onMarketplaceTabChange?: (tab: string) => void;
  onMarketplacePluginSelect?: (pluginId: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  onSelect,
  onNewChat,
  onDeleteThread,
  onRenameThread,
  onOpenSettings,
  isSettingsOpen,
  settingsTab,
  onCloseSettings,
  onSettingsTabChange,
  onOpenMarketplace,
  isMarketplaceOpen,
  marketplaceTab,
  marketplacePluginId,
  onCloseMarketplace,
  onMarketplaceTabChange,
  onMarketplacePluginSelect,
}) => {
  const { user, logout } = useAuth();
  const { activeTaskCount, openDrawer: openAutomationsDrawer } = useProactive();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [internalShowSettingsModal, setInternalShowSettingsModal] = useState(false);
  const [internalShowMarketplaceModal, setInternalShowMarketplaceModal] = useState(false);

  const effectiveSettingsOpen = isSettingsOpen !== undefined ? isSettingsOpen : internalShowSettingsModal;
  const effectiveMarketplaceOpen = isMarketplaceOpen !== undefined ? isMarketplaceOpen : internalShowMarketplaceModal;

  const handleOpenSettingsModal = (tab?: string) => {
    if (onOpenSettings) {
      onOpenSettings(tab);
    } else {
      setInternalShowSettingsModal(true);
    }
  };
  const handleCloseSettingsModal = () => {
    if (onCloseSettings) {
      onCloseSettings();
    } else {
      setInternalShowSettingsModal(false);
    }
  };

  const handleOpenMarketplaceModal = (tab?: string, pluginId?: string | null) => {
    if (onOpenMarketplace) {
      onOpenMarketplace(tab, pluginId);
    } else {
      setInternalShowMarketplaceModal(true);
    }
  };
  const handleCloseMarketplaceModal = () => {
    if (onCloseMarketplace) {
      onCloseMarketplace();
    } else {
      setInternalShowMarketplaceModal(false);
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [mounted, setMounted] = useState(false);
  const [billingData, setBillingData] = useState<{
    plan_name?: string;
    settled_credits?: number;
    spendable_credits?: number;
    monthly_allowance?: number;
  } | null>(null);

  React.useEffect(() => {
    setMounted(true);
    fetch('/api/billing/balance')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.balance) {
          setBillingData({
            plan_name: data.plan?.plan_name || 'pro_20',
            settled_credits: data.balance.settled_credits,
            spendable_credits: data.balance.spendable_credits,
            monthly_allowance: data.plan?.monthly_allowance || 5000,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  const startEdit = (t: ThreadItem) => {
    setEditingId(t.id);
    setEditValue(t.title);
  };

  const commitEdit = (id: string) => {
    if (editValue.trim()) {
      onRenameThread(id, editValue.trim());
    }
    setEditingId(null);
  };

  const filteredThreads = React.useMemo(() => {
    const list = searchQuery
      ? threads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : threads;

    const seen = new Set<string>();
    return list.filter((t) => {
      if (!t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [threads, searchQuery]);

  // ── COLLAPSED SIDEBAR ────────────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <aside
        className="flex h-full w-[54px] shrink-0 flex-col items-center justify-between py-3 select-none transition-all duration-300 ease-in-out border-r border-[#1a1a1a]"
        style={{ background: "#000000" }}
      >
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Logo icon that expands sidebar */}
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
            title="Expand sidebar"
          >
            <Sparkles size={20} className="text-white" />
          </button>

          {/* New chat icon */}
          <button
            onClick={onNewChat}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#999999] hover:text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
            title="New chat"
          >
            <SquarePen size={18} />
          </button>

          {/* Skills Marketplace icon */}
          <button
            onClick={() => handleOpenMarketplaceModal()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-[#1f1f1f] transition-colors cursor-pointer"
            title="Skills Marketplace"
          >
            <Store size={18} />
          </button>

          {/* Search icon */}
          <button
            onClick={() => {
              setIsCollapsed(false);
              setShowSearch(true);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#999999] hover:text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
            title="Search chats"
          >
            <Search size={18} />
          </button>
        </div>

        {/* User avatar circle */}
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-[#262626] border border-[#3a3a3a] text-white flex items-center justify-center text-xs font-semibold">
            {user ? (user.display_name || user.email || 'U').charAt(0).toUpperCase() : <User size={14} className="text-[#888]" />}
          </div>
        </div>
      </aside>
    );
  }

  // ── EXPANDED SIDEBAR ──────────────────────────────────────────────────────────
  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col justify-between py-3 px-2 select-none transition-all duration-300 ease-in-out border-r border-[#161616]"
      style={{ background: "#000000" }}
    >
      {/* Top Section */}
      <div className="flex flex-col min-h-0 flex-1">
        {/* Header bar: Talos title + Search + Collapse Button */}
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[15px] tracking-tight text-[#f2f2f2]">
              Talos
            </span>
            <SyncIndicator />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#888888] hover:text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer"
              title="Search"
            >
              <Search size={16} />
            </button>
            <button
              onClick={() => setIsCollapsed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#888888] hover:text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer"
              title="Close sidebar"
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
        </div>

        {/* New chat button */}
        <button
          onClick={onNewChat}
          className="flex items-center gap-2.5 w-full px-3 py-2 mt-1 mb-1 rounded-xl text-[13px] font-medium text-white hover:bg-[#191919] transition-colors cursor-pointer"
        >
          <SquarePen size={15} className="text-[#cccccc]" />
          <span>New chat</span>
        </button>

        {/* Skills Marketplace button */}
        <button
          onClick={() => handleOpenMarketplaceModal()}
          className="flex items-center justify-between w-full px-3 py-2 mb-1 rounded-xl text-[13px] font-medium text-[#cccccc] hover:text-white hover:bg-[#191919] transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <Store size={15} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>Skills Marketplace</span>
          </div>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Hub
          </span>
        </button>

        {/* Proactive Automations & Watchers button */}
        <button
          onClick={openAutomationsDrawer}
          className="flex items-center justify-between w-full px-3 py-2 mb-2 rounded-xl text-[13px] font-medium text-[#cccccc] hover:text-white hover:bg-[#191919] transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <Zap size={15} className="text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Automations</span>
          </div>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {activeTaskCount > 0 ? `${activeTaskCount} Active` : 'Control'}
          </span>
        </button>

        {/* Search input field if toggled */}
        {showSearch && (
          <div className="relative mb-2 px-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-[#141414] border border-[#262626] rounded-xl px-3 py-1.5 text-xs text-white placeholder-[#666666] focus:outline-none focus:border-[#404040]"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2 text-[#777777] hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Recents Label (matches uploaded screenshot) */}
        <div className="px-3 pt-3 pb-1.5 text-[12px] font-normal text-[#8c8c8c]">
          Recents
        </div>

        {/* Recents Thread List */}
        <div className="flex-1 overflow-y-auto space-y-0.5 px-1 pr-1.5" suppressHydrationWarning>
          {!mounted || filteredThreads.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[#555555] italic">
              No recent conversations
            </div>
          ) : (
            filteredThreads.map((t) => {
              const isActive = t.id === activeThreadId;
              const isEditing = t.id === editingId;

              return (
                <div
                  key={t.id}
                  onClick={() => !isEditing && onSelect(t.id)}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#1e1e1e] text-white font-normal'
                      : 'text-[#d6d6d6] hover:bg-[#141414] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && commitEdit(t.id)}
                        className="w-full bg-[#0d0d0d] px-1.5 py-0.5 rounded border border-[#333333] text-xs text-white focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="truncate">{t.title}</span>
                    )}
                  </div>

                  {/* Action icons on hover */}
                  <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1.5">
                    {isEditing ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          commitEdit(t.id);
                        }}
                        className="p-1 hover:text-emerald-400 text-[#aaaaaa]"
                      >
                        <Check size={12} />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(t);
                          }}
                          className="p-1 hover:text-white text-[#777777]"
                          title="Rename"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteThread(t.id);
                          }}
                          className="p-1 hover:text-red-400 text-[#777777]"
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom User Profile Section with Popover */}
      <div className="relative pt-2 px-1 border-t border-[#161616]">
        {showProfileMenu && user && (
          <div className="absolute bottom-14 left-2 right-2 rounded-2xl bg-[#141414] border border-[#2a2a2a] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-2 border-b border-[#222222] mb-1">
              <p className="text-xs font-medium text-white truncate">{user.display_name || 'Talos User'}</p>
              <p className="text-[11px] text-[#777777] truncate">{user.email}</p>
            </div>
            
            <button
              onClick={() => {
                setShowProfileMenu(false);
                handleOpenSettingsModal();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#cccccc] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer text-left"
            >
              <Settings size={14} className="text-[#888888]" />
              <span>Settings</span>
            </button>

            <button
              onClick={() => {
                setShowProfileMenu(false);
                logout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-[#202020] transition-colors cursor-pointer text-left"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        {mounted && user && billingData && (
          <div 
            onClick={() => handleOpenSettingsModal('usage')}
            className="mb-2 p-2.5 rounded-xl bg-[#141414] border border-[#222222] hover:border-[#333333] transition-colors cursor-pointer"
            title="Click to view Billing & Usage"
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-[#cccccc] mb-1.5">
              <span className="flex items-center gap-1.5 text-white">
                <Sparkles size={12} className="text-amber-400" />
                <span className="capitalize">{billingData.plan_name === 'pro_20' ? 'Pro Plan' : billingData.plan_name || 'Pro Plan'}</span>
              </span>
              <span className="text-[10px] text-[#888888]">
                {Math.round(billingData.spendable_credits ?? 0)} / {billingData.monthly_allowance ?? 0} cr
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#222222] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-300"
                style={{ 
                  width: `${Math.min(100, Math.max(0, ((billingData.spendable_credits ?? 5000) / (billingData.monthly_allowance ?? 5000)) * 100))}%` 
                }}
              />
            </div>
          </div>
        )}

        {mounted && user ? (
          <div
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#141414] transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-[#262626] text-white flex items-center justify-center text-xs font-semibold shrink-0 border border-[#3a3a3a]">
              {(user.display_name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium text-[#e5e5e5] truncate">
                {user.display_name || user.email.split('@')[0]}
              </span>
              <span className="text-[11px] text-[#6b6b6b] truncate">
                {user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileMenu(false);
                handleOpenSettingsModal();
              }}
              className="p-1 text-[#666666] hover:text-white transition-colors shrink-0 mr-1"
              title="Open Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        ) : (
          <div
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#141414] hover:bg-[#1e1e1e] border border-[#222222] transition-colors cursor-pointer group"
          >
            <LogIn size={15} className="text-[#888888] group-hover:text-white transition-colors" />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium text-white">Sign In</span>
              <span className="text-[10px] text-[#777777]">Sync chats & memories</span>
            </div>
          </div>
        )}
      </div>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={effectiveSettingsOpen}
        onClose={handleCloseSettingsModal}
        initialTab={settingsTab as any}
        onTabChange={(tab) => onSettingsTabChange?.(tab)}
      />

      {/* Skills Marketplace Modal */}
      <MarketplaceModal
        isOpen={effectiveMarketplaceOpen}
        onClose={handleCloseMarketplaceModal}
        initialTab={marketplaceTab as any}
        initialPluginId={marketplacePluginId}
        onTabChange={(tab) => onMarketplaceTabChange?.(tab)}
        onPluginSelect={(pluginId) => onMarketplacePluginSelect?.(pluginId)}
      />
    </aside>
  );
};
