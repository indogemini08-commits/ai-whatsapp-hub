import React, { useState, useEffect } from 'react';
import { X, History, Clock, User, CheckCircle2, RotateCcw, AlertTriangle, PlayCircle, PauseCircle, Loader2 } from 'lucide-react';
import { getHandoverLogs } from '../api';

function formatLogTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function HandoverLogsModal({
  isOpen,
  chat,
  onClose
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && chat) {
      loadLogs();
    }
  }, [isOpen, chat?.id]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getHandoverLogs(chat.id);
      setLogs(data);
    } catch (err) {
      console.error('Gagal mengambil audit log handover:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !chat) return null;

  const getActionBadge = (action, role) => {
    switch (action) {
      case 'pause':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <PauseCircle className="w-3 h-3" /> Jeda AI Diaktifkan
          </span>
        );
      case 'extend':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <RotateCcw className="w-3 h-3" /> Jeda Diperpanjang
          </span>
        );
      case 'resume':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <PlayCircle className="w-3 h-3" /> AI Diaktifkan Kembali
          </span>
        );
      case 'auto_expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <Clock className="w-3 h-3" /> Jeda Berakhir Otomatis
          </span>
        );
      case 'handover_requested':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <AlertTriangle className="w-3 h-3" /> Rekomendasi AI
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-700 text-slate-300">
            {action}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Riwayat Handover & Jeda AI
              </h3>
              <p className="text-xs text-slate-400">
                Kontak: <span className="text-slate-300 font-medium">{chat.name || chat.id}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 divide-y divide-slate-800/60">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Memuat riwayat log...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <History className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
              <p className="text-slate-400 font-medium">Belum ada riwayat handover</p>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Aktivitas jeda, perpanjangan, dan pengaktifan kembali akan dicatat di sini.
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const isUstadz = log.handlerRole === 'ustadz';
              return (
                <div key={log.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getActionBadge(log.action, log.handlerRole)}
                      {log.handlerName && (
                        <span className="text-xs text-slate-300 font-medium">
                          oleh {log.handlerName}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">
                      {formatLogTime(log.timestamp)}
                    </span>
                  </div>

                  {log.durationMinutes && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Durasi: {log.durationMinutes} menit</span>
                      {log.pauseUntil && (
                        <span className="text-slate-400">
                          (sampai {formatLogTime(log.pauseUntil)})
                        </span>
                      )}
                    </div>
                  )}

                  {log.notes && (
                    <div className="text-xs text-slate-300 bg-slate-800/40 border border-slate-700/40 rounded-lg p-2 mt-1">
                      {log.notes}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex justify-end bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
