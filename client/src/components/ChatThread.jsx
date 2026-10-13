import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Clock,
  CheckCheck,
  User,
  UserCheck,
  Users,
  MessageSquare,
  Sparkles,
  Loader2,
  AlertCircle,
  Trash2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  History,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { getChatDisplayName, formatJid } from '../utils/jid';
import {
  getAiReply,
  pauseChatAi,
  extendChatAiPause,
  resumeChatAi,
  dismissHandover
} from '../api';
import HandoverModal from './HandoverModal';
import HandoverLogsModal from './HandoverLogsModal';

function formatMessageTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function calculateRemainingTime(pauseUntil) {
  if (!pauseUntil || Number(pauseUntil) <= 0) return 'Mode Manual';
  const diffMs = Number(pauseUntil) - Date.now();
  if (diffMs <= 0) return 'Durasi Habis';

  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) {
    return `${hours}j ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}d`;
  }
  return `${secs}d`;
}

export default function ChatThread({
  activeChat,
  messages = [],
  onSendMessage,
  onDeleteChat,
  onChatUpdated
}) {
  const [inputText, setInputText] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [remainingText, setRemainingText] = useState('');
  const [isResuming, setIsResuming] = useState(false);

  // Modal Handover & Logs
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [handoverModalMode, setHandoverModalMode] = useState('pause'); // 'pause' | 'extend'
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Ambil pesan MASUK terakhir di thread yang sedang dibuka
  const lastIncomingMessage = [...messages].reverse().find((m) => !m.fromMe && m.text);

  // Auto-scroll ke bawah setiap kali ada pesan baru atau ganti chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fokuskan input saat ganti chat dan bersihkan error AI
  useEffect(() => {
    inputRef.current?.focus();
    setAiError('');
    setIsDrafting(false);
  }, [activeChat?.id]);

  // Countdown timer interval untuk sisa jeda AI
  useEffect(() => {
    if (!activeChat?.aiPaused) {
      setRemainingText('');
      return;
    }

    const updateTimer = () => {
      setRemainingText(calculateRemainingTime(activeChat.pauseUntil));
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeChat?.aiPaused, activeChat?.pauseUntil]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    onSendMessage(trimmed);
    setInputText('');
    setAiError('');
  };

  const handleGenerateAiDraft = async () => {
    if (!lastIncomingMessage || isDrafting) return;
    setIsDrafting(true);
    setAiError('');

    try {
      const reply = await getAiReply(lastIncomingMessage.text, null, null, messages);
      setInputText(reply);
      inputRef.current?.focus();
    } catch (err) {
      console.error('Gagal menyusun draf AI:', err);
      const errMsg = err.response?.data?.error || err.message || 'Gagal menghasilkan balasan AI';
      setAiError(errMsg);
    } finally {
      setIsDrafting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Buka Modal Handover
  const handleOpenHandoverModal = (mode = 'pause') => {
    setHandoverModalMode(mode);
    setIsHandoverModalOpen(true);
  };

  // Submit Jeda / Perpanjang dari Modal Handover
  const handleHandoverSubmit = async ({ mode, chatId, durationMinutes, handlerRole, handlerName, notes }) => {
    try {
      let res;
      if (mode === 'extend') {
        res = await extendChatAiPause(chatId, {
          durationMinutes,
          handlerRole,
          handlerName,
          notes
        });
      } else {
        res = await pauseChatAi(chatId, {
          durationMinutes,
          handlerRole,
          handlerName,
          notes
        });
      }

      if (res?.chat && onChatUpdated) {
        onChatUpdated(res.chat);
      }
    } catch (err) {
      console.error('Gagal memproses status jeda:', err);
      throw err;
    }
  };

  // Aktifkan Kembali AI Langsung
  const handleResumeAi = async () => {
    if (!activeChat) return;
    setIsResuming(true);
    try {
      const res = await resumeChatAi(activeChat.id, {
        notes: 'Diaktifkan kembali oleh petugas dari dashboard'
      });
      if (res?.chat && onChatUpdated) {
        onChatUpdated(res.chat);
      }
    } catch (err) {
      console.error('Gagal mengaktifkan kembali AI:', err);
      alert(`Gagal mengaktifkan kembali AI: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsResuming(false);
    }
  };

  // Abaikan Rekomendasi Handover
  const handleDismissHandover = async () => {
    if (!activeChat) return;
    try {
      const res = await dismissHandover(activeChat.id);
      if (res?.chat && onChatUpdated) {
        onChatUpdated(res.chat);
      }
    } catch (err) {
      console.error('Gagal mengabaikan rekomendasi handover:', err);
      alert(`Gagal mengabaikan pengalihan: ${err.message}`);
    }
  };

  if (!activeChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-500">
        <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4 shadow-xl">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-300">Pilih Percakapan</h3>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          Pilih kontak dari daftar di sebelah kiri untuk melihat riwayat pesan dan mulai mengirim balasan.
        </p>
      </div>
    );
  }

  const isGroup = activeChat.id?.endsWith('@g.us');
  const displayName = getChatDisplayName(activeChat);
  const formattedJid = formatJid(activeChat.id);
  const isPaused = Boolean(activeChat.aiPaused);
  const needsHandover = Boolean(activeChat.needsHandover);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden relative">
      
      {/* Header Thread Utama */}
      <div className="flex-shrink-0 bg-slate-900/90 border-b border-slate-800 px-4 sm:px-6 py-2.5 backdrop-blur-md z-10 flex flex-wrap items-center justify-between gap-3">
        
        {/* Sisi Kiri: Profil Kontak & Status Badge */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-semibold text-sm shadow-sm flex-shrink-0 ${
              isGroup
                ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400'
                : 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400'
            }`}
          >
            {isGroup ? <Users className="w-5 h-5" /> : displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white truncate max-w-[180px] sm:max-w-xs">
                {displayName}
              </h2>

              {/* Status Badge AI / Human */}
              {isPaused ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex-shrink-0">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    Ditangani CS / Ustadz{activeChat.handlerName && activeChat.handlerName !== 'CS / Ustadz' ? `: ${activeChat.handlerName}` : ''}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>AI Aktif</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate">
              <span>{formattedJid}</span>
              {isPaused && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-300 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Sisa: {remainingText}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sisi Kanan: Kontrol Aksi Handover & Pengaturan */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tombol Kontrol Jeda AI */}
          {isPaused ? (
            <>
              {/* Tombol Perpanjang */}
              <button
                type="button"
                onClick={() => handleOpenHandoverModal('extend')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl transition-all cursor-pointer shadow-sm"
                title="Perpanjang durasi jeda AI"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Perpanjang</span>
              </button>

              {/* Tombol Aktifkan Kembali AI */}
              <button
                type="button"
                onClick={handleResumeAi}
                disabled={isResuming}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-200 bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50"
                title="Selesaikan penanganan manusia dan aktifkan kembali AI"
              >
                {isResuming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Aktifkan Kembali AI</span>
              </button>
            </>
          ) : (
            /* Tombol Jeda AI / Ambil Alih Manual */
            <button
              type="button"
              onClick={() => handleOpenHandoverModal('pause')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-indigo-500/20 hover:border-indigo-500/40 border border-slate-700 rounded-xl transition-all cursor-pointer shadow-sm"
              title="Alihkan percakapan ke CS / Ustadz dan jeda balasan otomatis AI"
            >
              <PauseCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span>Jeda AI / Ambil Alih</span>
            </button>
          )}

          {/* Tombol Riwayat Audit Handover */}
          <button
            type="button"
            onClick={() => setIsLogsModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 rounded-xl transition-colors cursor-pointer"
            title="Lihat riwayat audit penanganan & jeda"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Riwayat</span>
          </button>

          {/* Tombol Hapus Chat */}
          {onDeleteChat && (
            <button
              type="button"
              onClick={() => onDeleteChat(activeChat)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer"
              title="Hapus percakapan ini"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* BANNER STATUS KETIKA PERCAKAPAN SEDANG DITANGANI CS / USTADZ */}
      {isPaused && (
        <div className="bg-indigo-950/40 border-b border-indigo-500/25 px-4 sm:px-6 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-indigo-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              <strong>Percakapan Ditangani CS / Ustadz:</strong> AI dijeda untuk nomor ini. Anda dapat membalas secara langsung tanpa tumpang tindih.
            </span>
            <span className="font-mono text-amber-300 font-medium">({remainingText})</span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => handleOpenHandoverModal('extend')}
              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-medium text-xs flex items-center gap-1 border border-amber-500/30 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Perpanjang
            </button>
            <button
              type="button"
              onClick={handleResumeAi}
              disabled={isResuming}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 font-medium text-xs flex items-center gap-1 border border-emerald-500/40 transition-colors cursor-pointer"
            >
              <PlayCircle className="w-3 h-3" /> Aktifkan AI
            </button>
          </div>
        </div>
      )}

      {/* BANNER REKOMENDASI PENGALIHAN MANUAL (JIKA MODE OTOMATIS NONAKTIF) */}
      {needsHandover && !isPaused && (
        <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/30 to-slate-900 border-b border-amber-500/30 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 flex-shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <span className="font-semibold text-amber-300">Rekomendasi Pengalihan:</span>{' '}
              <span>{activeChat.handoverReason || 'AI mengarahkan pelanggan kepada CS / Ustadz.'}</span>
              <p className="text-[11px] text-amber-400/80 mt-0.5">
                Klik tombol di sebelah kanan untuk mengambil alih percakapan dan menjeda AI.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => handleOpenHandoverModal('pause')}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-indigo-900/30 cursor-pointer transition-all"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Ambil Alih Percakapan</span>
            </button>
            <button
              type="button"
              onClick={handleDismissHandover}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer transition-colors"
              title="Abaikan rekomendasi dan tetap biarkan AI aktif"
            >
              Abaikan
            </button>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/30 via-slate-950 to-slate-950">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
            <p className="bg-slate-900/60 border border-slate-800 px-3.5 py-1.5 rounded-full text-slate-400">
              Belum ada riwayat pesan di percakapan ini.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isFromMe = Boolean(msg.fromMe);
            const isPending = Boolean(msg.pending);
            const timeStr = formatMessageTime(msg.timestamp);

            return (
              <div
                key={msg.id || index}
                className={`flex w-full ${isFromMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] md:max-w-[60%] rounded-2xl px-4 py-2.5 shadow-md flex flex-col transition-all ${
                    isFromMe
                      ? 'bg-emerald-600 text-white rounded-br-xs shadow-emerald-950/20'
                      : 'bg-slate-800/90 text-slate-100 rounded-bl-xs border border-slate-700/60 shadow-black/20'
                  }`}
                >
                  {/* Sender name for group chats if incoming */}
                  {!isFromMe && isGroup && msg.sender && (
                    <span className="text-[11px] font-semibold text-emerald-400 mb-0.5">
                      {formatJid(msg.sender)}
                    </span>
                  )}

                  {/* Message content */}
                  <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {msg.text}
                  </p>

                  {/* Metadata: Time and Status Icon */}
                  <div
                    className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] select-none ${
                      isFromMe ? 'text-emerald-100/80' : 'text-slate-400'
                    }`}
                  >
                    <span>{timeStr}</span>

                    {/* Status indicator on outgoing messages */}
                    {isFromMe && (
                      <span className="flex items-center">
                        {isPending ? (
                          <Clock
                            className="w-3 h-3 text-emerald-200 animate-spin"
                            style={{ animationDuration: '3s' }}
                            title="Sedang mengirim..."
                          />
                        ) : (
                          <CheckCheck
                            className="w-3.5 h-3.5 text-emerald-200"
                            title="Terkirim"
                          />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <div className="flex-shrink-0 p-3 sm:p-4 bg-slate-900 border-t border-slate-800">
        <div className="max-w-5xl mx-auto flex flex-col gap-2">
          
          {/* Banner Informasi Mode Penanganan Aktif saat Input */}
          {isPaused && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>
                  Mode CS / Ustadz Aktif: Pesan yang Anda ketik dikirim langsung sebagai balasan manusia tanpa gangguan AI.
                </span>
              </div>
              <span className="font-mono text-amber-300">{remainingText}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            
            {/* Tombol Draf AI di sebelah kiri kolom input chat */}
            <button
              type="button"
              onClick={handleGenerateAiDraft}
              disabled={!lastIncomingMessage || isDrafting}
              title={
                !lastIncomingMessage
                  ? 'Belum ada pesan masuk di thread ini untuk dijawab'
                  : isDrafting
                  ? 'Sedang menyusun balasan AI...'
                  : 'Buat draf balasan AI dari pesan masuk terakhir'
              }
              className="p-2.5 sm:px-3 sm:py-2.5 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 disabled:bg-slate-800/40 border border-purple-500/30 disabled:border-slate-800 text-purple-300 disabled:text-slate-600 font-medium text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-sm flex-shrink-0"
            >
              {isDrafting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span className="hidden md:inline text-xs text-purple-300">Menyusun...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="hidden md:inline text-xs">Draf AI</span>
                </>
              )}
            </button>

            {/* Kolom Input Teks */}
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isPaused
                  ? `Kirim balasan manual sebagai CS / Ustadz ke ${displayName}...`
                  : `Ketik pesan untuk ${displayName}...`
              }
              className="flex-1 bg-slate-800/80 border border-slate-700/60 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />

            {/* Tombol Kirim */}
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-xs sm:text-sm shadow-lg shadow-emerald-600/20 disabled:shadow-none transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Kirim</span>
            </button>
          </form>

          {/* Pesan Error di Bawah Input jika AI gagal */}
          {aiError && (
            <div className="flex items-center justify-between gap-2 px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs animate-fade-in">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{aiError}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiError('')}
                className="text-rose-400 hover:text-rose-200 text-xs px-1 font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Jeda / Perpanjang Handover */}
      <HandoverModal
        isOpen={isHandoverModalOpen}
        mode={handoverModalMode}
        chat={activeChat}
        onClose={() => setIsHandoverModalOpen(false)}
        onSubmit={handleHandoverSubmit}
      />

      {/* Modal Riwayat Audit Handover */}
      <HandoverLogsModal
        isOpen={isLogsModalOpen}
        chat={activeChat}
        onClose={() => setIsLogsModalOpen(false)}
      />

    </div>
  );
}
