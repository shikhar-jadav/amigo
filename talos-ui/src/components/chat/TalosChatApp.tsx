'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, ThreadItem } from '@/components/Sidebar';
import { ChatInterface } from '@/components/ChatInterface';
import { MessageData } from '@/components/ChatMessage';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';

interface TalosChatAppProps {
  initialThreadId?: string | null;
}

type ThreadListItem = {
  thread_id: string;
  title?: string;
  updated_at?: string | number;
  created_at?: string | number;
};

type CachedThreadList = {
  threads: ThreadItem[];
  fetchedAt: number;
};

const threadListCache = new Map<string, CachedThreadList>();
const THREAD_LIST_CACHE_TTL = 30_000;

function mergeThreadItems(existing: ThreadItem[], incoming: ThreadListItem[]): ThreadItem[] {
  const existingIds = new Set(existing.map((thread) => thread.id.replace(/^thread-/, '')));
  const added = new Map<string, ThreadItem>();
  for (const thread of incoming) {
    const id = thread.thread_id.replace(/^thread-/, '');
    if (!id || existingIds.has(id) || added.has(id)) continue;
    added.set(id, {
      id,
      title: thread.title || 'New conversation',
      timestamp: new Date(
        thread.updated_at || thread.created_at || (id.length >= 10 ? parseInt(id) : Date.now())
      ),
    });
  }
  return [
    ...Array.from(added.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    ...existing,
  ];
}

export const TalosChatApp: React.FC<TalosChatAppProps> = ({ initialThreadId = null }) => {
  const router = useRouter();
  const { user } = useAuth();
  const { syncState } = useSync();

  const threadCacheKey = user?.id || 'local';
  const [threads, setThreads] = useState<ThreadItem[]>(
    () => threadListCache.get(threadCacheKey)?.threads || []
  );
  const updateThreads = useCallback((update: (current: ThreadItem[]) => ThreadItem[]) => {
    setThreads((current) => {
      const next = update(current);
      threadListCache.set(threadCacheKey, { threads: next, fetchedAt: Date.now() });
      return next;
    });
  }, [threadCacheKey]);
  const deletedThreadIdsRef = useRef(new Set<string>());
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [threadMessages, setThreadMessages] = useState<Record<string, MessageData[]>>({});
  // Use pure numeric timestamp ID for thread URLs (e.g. /c/1791988921000)
  const [draftSessionId, setDraftSessionId] = useState<string>(() => `${Date.now()}`);

  const initialThreadIdRef = useRef<string | null>(initialThreadId);
  useEffect(() => {
    initialThreadIdRef.current = initialThreadId;
  }, [initialThreadId]);

  // URL hash state: e.g. #settings, #settings/Usage, #marketplace, #marketplace/agents, #plugin/<id>, #subagent/<id>
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>('general');
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [marketplaceTab, setMarketplaceTab] = useState<string>('all');
  const [marketplacePluginId, setMarketplacePluginId] = useState<string | null>(null);
  const [inspectingSubAgentId, setInspectingSubAgentId] = useState<string | null>(null);

  // Sync activeThreadId if route prop changes
  useEffect(() => {
    setActiveThreadId(initialThreadId);
  }, [initialThreadId]);

  // Reset chat and cached thread state whenever user identity changes (login, logout, account switch)
  const previousUserIdRef = useRef<string | undefined>(user?.id);
  useEffect(() => {
    if (previousUserIdRef.current !== user?.id) {
      previousUserIdRef.current = user?.id;
      setActiveThreadId(null);
      setThreadMessages({});
      setDraftSessionId(`${Date.now()}`);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('talos_active_thread_id_v6');
      }
    }
  }, [user?.id]);

  // Parse and handle hash change (#settings, #settings/Usage, #marketplace, #marketplace/agents, #plugin/:id, #subagent/:id)
  const parseHash = useCallback((hashStr: string) => {
    const raw = hashStr.startsWith('#') ? hashStr.slice(1) : hashStr;
    if (!raw) {
      setIsSettingsOpen(false);
      setIsMarketplaceOpen(false);
      setMarketplacePluginId(null);
      setInspectingSubAgentId(null);
      return;
    }

    if (raw.startsWith('settings')) {
      setIsSettingsOpen(true);
      setIsMarketplaceOpen(false);
      setMarketplacePluginId(null);
      setInspectingSubAgentId(null);
      const parts = raw.split('/');
      if (parts.length > 1 && parts[1]) {
        setSettingsTab(parts[1].toLowerCase());
      } else {
        setSettingsTab('general');
      }
    } else if (raw.startsWith('marketplace')) {
      setIsMarketplaceOpen(true);
      setIsSettingsOpen(false);
      setInspectingSubAgentId(null);
      const parts = raw.split('/');
      if (parts.length > 2 && parts[1] === 'plugin') {
        // e.g. #marketplace/plugin/<plugin_id>
        setMarketplacePluginId(decodeURIComponent(parts.slice(2).join('/')));
      } else if (parts.length > 1 && parts[1]) {
        // e.g. #marketplace/skills, #marketplace/agents, #marketplace/mcp
        setMarketplaceTab(parts[1].toLowerCase());
        setMarketplacePluginId(null);
      } else {
        setMarketplaceTab('all');
        setMarketplacePluginId(null);
      }
    } else if (raw.startsWith('plugin/')) {
      // Direct plugin shortcut #plugin/<id>
      const pId = raw.replace('plugin/', '');
      setIsMarketplaceOpen(true);
      setIsSettingsOpen(false);
      setMarketplacePluginId(decodeURIComponent(pId));
      setInspectingSubAgentId(null);
    } else if (raw.startsWith('subagent/')) {
      const subId = raw.replace('subagent/', '');
      setInspectingSubAgentId(subId);
      setIsSettingsOpen(false);
      setIsMarketplaceOpen(false);
      setMarketplacePluginId(null);
    } else {
      setIsSettingsOpen(false);
      setIsMarketplaceOpen(false);
      setMarketplacePluginId(null);
      setInspectingSubAgentId(null);
    }
  }, []);

  // Listen to window hash changes (popstate & hashchange)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHash = () => {
      parseHash(window.location.hash);
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('popstate', handleHash);

    return () => {
      window.removeEventListener('hashchange', handleHash);
      window.removeEventListener('popstate', handleHash);
    };
  }, [parseHash]);

  // Update hash without full reload or scroll jump
  const updateHash = (newHash: string) => {
    if (typeof window === 'undefined') return;
    const currentBase = window.location.pathname + window.location.search;
    if (newHash) {
      window.history.pushState(null, '', `${currentBase}#${newHash}`);
    } else {
      window.history.pushState(null, '', currentBase);
    }
    parseHash(newHash);
  };

  // 1. Initialize active thread from URL prop if provided
  useEffect(() => {
    if (initialThreadIdRef.current) {
      setActiveThreadId(initialThreadIdRef.current);
    }
    setIsLoaded(true);
  }, []);

  // Load local threads immediately; a sleeping cloud service must not block the sidebar.
  useEffect(() => {
    let isCurrent = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const fetchThreads = async (source: 'local' | 'cloud') => {
      const response = await fetch(`/api/threads?source=${source}`, { credentials: 'include' });
      const data: {
        threads?: ThreadListItem[];
        deleted_thread_ids?: string[];
        error?: string;
      } = await response.json();
      if (!response.ok) {
        const error = new Error(
          data.error || `Could not load ${source} threads (HTTP ${response.status})`
        );
        Object.assign(error, { status: response.status });
        throw error;
      }
      return {
        threads: Array.isArray(data.threads) ? data.threads : [],
        deletedThreadIds: Array.isArray(data.deleted_thread_ids) ? data.deleted_thread_ids : [],
      };
    };

    const loadThreads = async () => {
      const cached = threadListCache.get(threadCacheKey);
      if (cached) {
        setThreads(cached.threads);
        if (Date.now() - cached.fetchedAt < THREAD_LIST_CACHE_TTL) return;
      }

      try {
        const localResult = await fetchThreads('local');
        if (isCurrent) {
          const visibleThreads = localResult.threads.filter(
            (thread) => !deletedThreadIdsRef.current.has(thread.thread_id.replace(/^thread-/, ''))
          );
          updateThreads((current) => mergeThreadItems(current, visibleThreads));
        }

      } catch (err) {
        console.warn('Failed to fetch local threads:', err);
      }

      let retryDelay = 2000;
      while (isCurrent) {
        try {
          const cloudResult = await fetchThreads('cloud');
          if (isCurrent) {
            for (const id of cloudResult.deletedThreadIds) {
              deletedThreadIdsRef.current.add(id.replace(/^thread-/, ''));
            }
            const visibleThreads = cloudResult.threads.filter(
              (thread) => !deletedThreadIdsRef.current.has(thread.thread_id.replace(/^thread-/, ''))
            );
            updateThreads((current) => mergeThreadItems(
              current.filter((thread) => !deletedThreadIdsRef.current.has(thread.id)),
              visibleThreads
            ));
            const cachedThreads = threadListCache.get(threadCacheKey);
            if (cachedThreads) cachedThreads.fetchedAt = Date.now();
          }
          return;
        } catch (err) {
          const status = typeof err === 'object' && err !== null && 'status' in err
            ? Number(err.status)
            : 0;
          if (status && status < 500 && status !== 408 && status !== 429) {
            console.warn('Cloud thread refresh was rejected:', err);
            return;
          }
          console.warn('Cloud thread refresh failed; retrying:', err);
          await new Promise<void>((resolve) => {
            retryTimer = setTimeout(resolve, retryDelay);
          });
          retryDelay = Math.min(retryDelay * 2, 30000);
        }
      }
    };

    void loadThreads();
    return () => {
      isCurrent = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [threadCacheKey, updateThreads]);


  // 5. Automatically fetch messages from backend if selecting a thread with empty local memory
  useEffect(() => {
    if (!activeThreadId) return;

    fetch(`/api/threads/${encodeURIComponent(activeThreadId)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          const loaded: MessageData[] = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
            parts: m.parts || [],
            toolsExecuted: m.toolsExecuted || [],
          }));
          setThreadMessages((prev) => ({
            ...prev,
            [activeThreadId]: loaded
          }));
        }
      })
      .catch((err) => console.warn('Failed to fetch thread messages from cloud/backend:', err));
  }, [activeThreadId]);

  // Called when the first prompt is submitted in an empty chat
  const handleFirstMessageSent = (
    threadId: string,
    firstPrompt: string,
    initialUserMsg: MessageData,
    initialAssistantMsg: MessageData
  ) => {
    const title =
      firstPrompt.trim().length > 32
        ? `${firstPrompt.trim().substring(0, 32)}...`
        : firstPrompt.trim() || 'New conversation';

    const cleanThreadId = threadId.startsWith('thread-') ? threadId.replace('thread-', '') : threadId;

    const newThread: ThreadItem = {
      id: cleanThreadId,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      timestamp: new Date(),
    };

    setThreadMessages((prev) => ({
      ...prev,
      [cleanThreadId]: [initialUserMsg, initialAssistantMsg],
    }));

    updateThreads((prev) => [newThread, ...prev.filter((t) => t.id !== cleanThreadId && t.id !== threadId)]);
    setActiveThreadId(cleanThreadId);

    // Immediately index thread in cloud database so all browsers see it
    fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ thread_id: cleanThreadId, title: newThread.title })
    }).catch((err) => console.warn('Failed to index thread in cloud:', err));

    // Update URL to /c/:cleanThreadId preserving existing hash if any without forcing route unmount
    const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/c/${encodeURIComponent(cleanThreadId)}${currentHash}`);
    }
  };

  const handleUpdateMessages = (threadId: string, msgs: MessageData[]) => {
    setThreadMessages((prev) => {
      if (prev[threadId] === msgs) return prev;
      return {
        ...prev,
        [threadId]: msgs,
      };
    });
  };

  const handleDeleteThread = async (id: string) => {
    deletedThreadIdsRef.current.add(id.replace(/^thread-/, ''));
    updateThreads((current) => current.filter((t) => t.id !== id));

    setThreadMessages((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    if (activeThreadId === id) {
      setActiveThreadId(null);
      if (typeof window !== 'undefined') {
        router.push('/');
      }
    }

    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        console.error(`Failed to delete thread ${id}: HTTP ${response.status}`);
      }
    } catch (err) {
      console.error('Failed to purge backend thread memory and workspace:', err);
    }
  };

  const handleRenameThread = (id: string, newTitle: string) => {
    updateThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t)));
  };

  const onSelectThread = (id: string) => {
    const cleanId = id.startsWith('thread-') ? id.replace('thread-', '') : id;
    setActiveThreadId(cleanId);
    const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
    router.push(`/c/${encodeURIComponent(cleanId)}${currentHash}`);
  };

  const onNewChatClick = () => {
    const newDraftId = `${Date.now()}`;
    setDraftSessionId(newDraftId);
    setActiveThreadId(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('talos_active_thread_id_v6');
    }
    updateHash('');
    router.push('/');
  };

  // Open settings with optional section hash e.g. #settings or #settings/Usage
  const handleOpenSettings = (tab?: string) => {
    if (tab) {
      const formatted = tab.charAt(0).toUpperCase() + tab.slice(1);
      updateHash(`settings/${formatted}`);
    } else {
      updateHash('settings');
    }
  };

  const handleCloseSettings = () => {
    updateHash('');
  };

  const handleSettingsTabChange = (tab: string) => {
    const formatted = tab.charAt(0).toUpperCase() + tab.slice(1);
    updateHash(`settings/${formatted}`);
  };

  // Open marketplace with optional section or plugin deep link
  const handleOpenMarketplace = (tab?: string, pluginId?: string | null) => {
    if (pluginId) {
      updateHash(`marketplace/plugin/${encodeURIComponent(pluginId)}`);
    } else if (tab && tab !== 'all') {
      const formatted = tab.toLowerCase();
      updateHash(`marketplace/${formatted}`);
    } else {
      updateHash('marketplace');
    }
  };

  const handleCloseMarketplace = () => {
    updateHash('');
  };

  const handleMarketplaceTabChange = (tab: string) => {
    if (tab && tab !== 'all') {
      updateHash(`marketplace/${tab.toLowerCase()}`);
    } else {
      updateHash('marketplace');
    }
  };

  const handleMarketplacePluginSelect = (pluginId: string | null) => {
    if (pluginId) {
      updateHash(`marketplace/plugin/${encodeURIComponent(pluginId)}`);
    } else {
      if (marketplaceTab && marketplaceTab !== 'all') {
        updateHash(`marketplace/${marketplaceTab.toLowerCase()}`);
      } else {
        updateHash('marketplace');
      }
    }
  };

  const handleInspectSubAgentChange = (subagentId: string | null) => {
    if (subagentId) {
      updateHash(`subagent/${subagentId}`);
    } else {
      updateHash('');
    }
  };

  const effectiveSessionId = activeThreadId || draftSessionId;
  const currentMessages = activeThreadId ? threadMessages[activeThreadId] || [] : [];

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-[#000000]">
      {/* ── Restore overlay: blocks UI on a fresh machine while downloading data ── */}
      {syncState === 'restoring' && (
        <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center px-8 max-w-sm">
            <div className="w-12 h-12 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            <h2 className="text-white text-lg font-semibold">Restoring your data</h2>
            <p className="text-[#888888] text-sm leading-relaxed">
              Downloading your conversations, memories, and workspace files from cloud backup.
              This only happens once on a new device.
            </p>
          </div>
        </div>
      )}

      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelect={onSelectThread}
        onNewChat={onNewChatClick}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
        onOpenSettings={handleOpenSettings}
        isSettingsOpen={isSettingsOpen}
        settingsTab={settingsTab}
        onCloseSettings={handleCloseSettings}
        onSettingsTabChange={handleSettingsTabChange}
        onOpenMarketplace={handleOpenMarketplace}
        isMarketplaceOpen={isMarketplaceOpen}
        marketplaceTab={marketplaceTab}
        marketplacePluginId={marketplacePluginId}
        onCloseMarketplace={handleCloseMarketplace}
        onMarketplaceTabChange={handleMarketplaceTabChange}
        onMarketplacePluginSelect={handleMarketplacePluginSelect}
      />

      <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden bg-[#000000]">
        {isLoaded && (
          <ChatInterface
            key={effectiveSessionId}
            currentSessionId={effectiveSessionId}
            initialMessages={currentMessages}
            onFirstMessageSent={handleFirstMessageSent}
            onUpdateMessages={handleUpdateMessages}
            inspectingSubAgentId={inspectingSubAgentId}
            onInspectSubAgentChange={handleInspectSubAgentChange}
          />
        )}
      </div>
    </main>
  );
};

export default TalosChatApp;
