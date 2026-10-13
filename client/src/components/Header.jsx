import React from 'react';
import { MessageSquare, LogOut, CheckCircle2, User, Settings, Zap } from 'lucide-react';
import { formatJid } from '../utils/jid';

export default function Header({ user, onLogoutClick, onOpenAiSettings, autoReply }) {
  const userName = user?.name || (user?.id ? formatJid(user.id) : 'Akun Terhubung');

  return (
    <header className="h-16 flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between z-10">
      {/* Brand & Channel Info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Omnichannel Hub
            </h1>
            {/* Green Badge WhatsApp */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              WhatsApp
            </span>

            {/* Auto-Reply Status Badge */}
            {autoReply && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300 animate-fade-in">
                <Zap className="w-3 h-3 fill-amber-300" />
                Auto-Reply ON
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            Terhubung via Baileys v7 • Realtime SQLite
          </p>
        </div>
      </div>

      {/* Right: User info, AI Settings & Logout */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {user && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-200">
            <div className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 flex items-center justify-center font-bold text-[10px]">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium max-w-[150px] truncate">{userName}</span>
          </div>
        )}

        <button
          onClick={onOpenAiSettings}
          title="Pengaturan AI (System Prompt & Auto-Reply)"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-purple-500/10 hover:text-purple-300 border border-slate-700/60 hover:border-purple-500/30 transition-all cursor-pointer shadow-sm"
        >
          <Settings className="w-4 h-4 text-purple-400" />
          <span className="hidden sm:inline">Pengaturan AI</span>
        </button>

        <button
          onClick={onLogoutClick}
          title="Keluar / Reset Sesi"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-rose-500/10 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 transition-all cursor-pointer shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
