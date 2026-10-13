import React, { useState } from 'react';
import {
  Search,
  MessageSquarePlus,
  Users,
  User,
  X,
  Trash2,
  Sparkles,
  PauseCircle,
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { getChatDisplayName, formatJid } from '../utils/jid';

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function ChatList({
  chats = [],
  selectedChatId,
  onSelectChat,
  onNewChatClick,
  onDeleteChat,
  onClearAllChats
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'active' | 'paused' | 'handover'

  // Hitung jumlah chat per kategori
  const activeCount = chats.filter((c) => !c.aiPaused && !c.needsHandover).length;
  const pausedCount = chats.filter((c) => c.aiPaused).length;
  const handoverCount = chats.filter((c) => c.needsHandover).length;

  const filteredChats = chats.filter((chat) => {
    // 1. Filter Kategori Status
    if (filterType === 'active') {
      if (chat.aiPaused || chat.needsHandover) return false;
    } else if (filterType === 'paused') {
      if (!chat.aiPaused) return false;
    } else if (filterType === 'handover') {
      if (!chat.needsHandover) return false;
    }

    // 2. Filter Pencarian Teks
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const name = (chat.name || '').toLowerCase();
    const id = (chat.id || '').toLowerCase();
    const lastMsg = (chat.lastMessage || '').toLowerCase();
    return name.includes(query) || id.includes(query) || lastMsg.includes(query);
  });

  return (
    <aside className="w-80 sm:w-96 flex-shrink-0 flex flex-col h-full bg-slate-900/60 border-r border-slate-800">
      
      {/* Top Bar / Search & Filter */}
      <div className="p-3 sm:p-4 border-b border-slate-800/80 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Pesan Masuk ({chats.length})
          </h2>
          <div className="flex items-center gap-1.5">
            {chats.length > 0 && onClearAllChats && (
              <button
                onClick={onClearAllChats}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                title="Hapus Semua Chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bersihkan</span>
              </button>
            )}
            <button
              onClick={onNewChatClick}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
              title="Mulai Chat Baru"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Chat Baru</span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari kontak atau pesan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/70 border border-slate-700/60 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-800/40 border border-slate-800 rounded-xl text-[11px]">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`py-1 rounded-lg font-medium transition-all cursor-pointer text-center ${
              filterType === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Semua ({chats.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('active')}
            className={`py-1 rounded-lg font-medium transition-all cursor-pointer text-center ${
              filterType === 'active'
                ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/50'
            }`}
          >
            AI ({activeCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('paused')}
            className={`py-1 rounded-lg font-medium transition-all cursor-pointer text-center ${
              filterType === 'paused'
                ? 'bg-indigo-600/30 text-indigo-300 font-semibold border border-indigo-500/40'
                : 'text-slate-400 hover:text-indigo-300 hover:bg-slate-800/50'
            }`}
          >
            CS / Ustadz ({pausedCount})
          </button>
        </div>
      </div>

      {/* Chat List Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs sm:text-sm">
            {searchQuery ? (
              <p>Tidak ada percakapan yang cocok dengan pencarian.</p>
            ) : filterType !== 'all' ? (
              <p>Tidak ada chat di kategori status ini.</p>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <User className="w-8 h-8 text-slate-600 mb-1" />
                <p className="font-medium text-slate-400">Belum ada chat tersimpan</p>
                <p className="text-xs text-slate-500 max-w-[200px]">
                  Klik tombol <strong>Chat Baru</strong> di atas untuk memulai percakapan.
                </p>
              </div>
            )}
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isSelected = chat.id === selectedChatId;
            const displayName = getChatDisplayName(chat);
            const isGroup = chat.id.endsWith('@g.us');
            const timeStr = formatTimestamp(chat.timestamp);
            const isPaused = Boolean(chat.aiPaused);
            const needsHandover = Boolean(chat.needsHandover);

            return (
              <div
                key={chat.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectChat(chat)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectChat(chat);
                  }
                }}
                className={`w-full text-left p-3.5 sm:p-4 flex items-start gap-3 transition-colors cursor-pointer relative group ${
                  isSelected
                    ? 'bg-slate-800/90 text-white'
                    : 'hover:bg-slate-800/40 text-slate-300'
                }`}
              >
                {/* Active indicator bar */}
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r" />
                )}

                {/* Avatar */}
                <div
                  className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-semibold text-sm shadow-sm transition-transform group-hover:scale-105 relative ${
                    isGroup
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400'
                      : isPaused
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300'
                      : 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {isGroup ? (
                    <Users className="w-5 h-5" />
                  ) : (
                    <span>{displayName.charAt(0).toUpperCase()}</span>
                  )}

                  {/* Dot status icon di avatar */}
                  {isPaused && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-slate-900 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    </span>
                  )}
                  {needsHandover && !isPaused && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                  )}
                </div>

                {/* Chat content info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <h3 className="font-medium text-xs sm:text-sm text-slate-100 truncate">
                      {displayName}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[11px] text-slate-400 font-normal">
                        {timeStr}
                      </span>
                      {onDeleteChat && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(chat);
                          }}
                          className="opacity-0 group-hover:opacity-100 sm:opacity-0 focus:opacity-100 p-1 -mr-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                          title="Hapus percakapan ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Status Tag Handover / AI */}
                  <div className="flex items-center gap-1.5 mb-1">
                    {isPaused ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        <UserCheck className="w-2.5 h-2.5" /> CS / Ustadz
                      </span>
                    ) : needsHandover ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                        <AlertTriangle className="w-2.5 h-2.5" /> Butuh Pengalihan
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Sparkles className="w-2.5 h-2.5" /> AI Aktif
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400 truncate flex-1">
                      {chat.lastMessage || <span className="italic text-slate-500">Belum ada pesan</span>}
                    </p>

                    {/* Unread badge */}
                    {chat.unreadCount > 0 && (
                      <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </aside>
  );
}
