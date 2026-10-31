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
} from 'lucide-react';

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
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  onSelect,
  onNewChat,
  onDeleteThread,
  onRenameThread,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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

  const filteredThreads = searchQuery
    ? threads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : threads;

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
          <div className="w-8 h-8 rounded-full bg-[#333333] text-white flex items-center justify-center text-xs font-semibold">
            SJ
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
          <span className="font-medium text-[15px] tracking-tight text-[#f2f2f2]">
            Talos
          </span>

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
          className="flex items-center gap-2.5 w-full px-3 py-2 mt-1 mb-2 rounded-xl text-[13px] font-medium text-white hover:bg-[#191919] transition-colors cursor-pointer"
        >
          <SquarePen size={15} className="text-[#cccccc]" />
          <span>New chat</span>
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
        <div className="flex-1 overflow-y-auto space-y-0.5 px-1 pr-1.5">
          {filteredThreads.length === 0 ? (
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

      {/* Bottom User Profile Section */}
      <div className="pt-2 px-1 border-t border-[#161616]">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#141414] transition-colors cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-[#2a2a2a] text-[#ededed] flex items-center justify-center text-xs font-semibold shrink-0">
            SJ
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium text-[#e5e5e5] truncate">
              Shikhar Joshi
            </span>
            <span className="text-[11px] text-[#6b6b6b] truncate">
              Free plan
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
