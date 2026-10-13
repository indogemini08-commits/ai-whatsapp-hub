import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  User,
  UserCheck,
  PauseCircle,
  AlertTriangle,
  RotateCcw,
  Check
} from 'lucide-react';

const DURATION_OPTIONS = [
  { label: '15 Menit', minutes: 15 },
  { label: '30 Menit', minutes: 30 },
  { label: '1 Jam', minutes: 60 },
  { label: '3 Jam', minutes: 180 },
  { label: '6 Jam', minutes: 360 },
  { label: '12 Jam', minutes: 720 },
  { label: '24 Jam', minutes: 1440 },
  { label: 'Manual (Tanpa Batas)', minutes: null }
];

export default function HandoverModal({
  isOpen,
  mode = 'pause', // 'pause' | 'extend'
  chat,
  onClose,
  onSubmit
}) {
  const [handlerName, setHandlerName] = useState('CS / Ustadz');
  const [durationMinutes, setDurationMinutes] = useState(60); // default 1 jam (bisa number, null, atau 'custom')
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && chat) {
      const savedName = localStorage.getItem('last_handler_name') || 'CS / Ustadz';

      if (mode === 'extend') {
        setHandlerName(chat.handlerName || savedName);
        setDurationMinutes(30); // Default perpanjangan 30 menit
        setIsCustomDuration(false);
        setNotes('');
      } else {
        setHandlerName(chat.handlerName || savedName);
        setDurationMinutes(60);
        setIsCustomDuration(false);
        setNotes(chat.needsHandover ? `Pengalihan dari AI: ${chat.handoverReason || ''}` : '');
      }
    }
  }, [isOpen, chat, mode]);

  if (!isOpen || !chat) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const cleanName = handlerName.trim() || 'CS / Ustadz';
      localStorage.setItem('last_handler_name', cleanName);

      let finalDuration = durationMinutes;
      if (isCustomDuration) {
        const parsed = parseInt(customMinutes, 10);
        finalDuration = isNaN(parsed) || parsed <= 0 ? 15 : parsed;
      }

      await onSubmit({
        mode,
        chatId: chat.id,
        durationMinutes: finalDuration,
        handlerRole: 'cs', // Peran tunggal (CS Asli mewakili Ustadz)
        handlerName: cleanName,
        notes: notes.trim()
      });

      onClose();
    } catch (err) {
      console.error('Error submit handover:', err);
      alert(`Gagal menyimpan status jeda: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExtend = mode === 'extend';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isExtend 
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            }`}>
              {isExtend ? <RotateCcw className="w-5 h-5" /> : <PauseCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {isExtend ? 'Perpanjang Jeda AI' : 'Jeda AI & Ambil Alih Percakapan'}
              </h3>
              <p className="text-xs text-slate-400">
                Nomor: <span className="text-slate-300 font-mono">{chat.name || chat.id}</span>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          
          {/* Info Banner */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p>
              Selama jeda aktif, AI <strong>tidak akan membalas otomatis</strong> nomor ini. Anda dapat berinteraksi langsung sebagai CS / Ustadz secara bebas.
            </p>
          </div>

          {/* Status Peran Tunggal: CS / Ustadz */}
          <div className="p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500 text-white flex-shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-indigo-300">
                Peran: CS Asli / Ustadz (Manusia)
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Percakapan sepenuhnya ditangani secara langsung oleh petugas asli.
              </div>
            </div>
          </div>

          {/* Nama Petugas */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Nama / Identitas Petugas
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Contoh: CS / Ustadz, CS Rina, Ustadz Dimas..."
                value={handlerName}
                onChange={(e) => setHandlerName(e.target.value)}
                className="w-full bg-slate-800/70 border border-slate-700/70 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Durasi Jeda */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {isExtend ? 'Pilihan Tambahan Waktu Jeda' : 'Durasi Jeda AI'}
              </label>
              <span className="text-[11px] text-indigo-300 flex items-center gap-1 font-medium bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                <Clock className="w-3.5 h-3.5" />
                {isCustomDuration
                  ? `${customMinutes || 0} Menit (Kustom)`
                  : durationMinutes
                    ? `${durationMinutes} Menit`
                    : 'Manual (Tanpa Batas)'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = !isCustomDuration && durationMinutes === opt.minutes;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setIsCustomDuration(false);
                      setDurationMinutes(opt.minutes);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-semibold ring-1 ring-indigo-500/50'
                        : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              
              {/* Tombol Kustom Menit */}
              <button
                type="button"
                onClick={() => setIsCustomDuration(true)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer col-span-2 sm:col-span-4 ${
                  isCustomDuration
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 font-semibold ring-1 ring-indigo-500/50'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                ✏️ Input Durasi Menit Kustom (Bebas)
              </button>
            </div>

            {/* Input Editable Menit jika Kustom */}
            {isCustomDuration && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-900 border border-indigo-500/40 space-y-2 animate-in fade-in">
                <span className="text-xs text-slate-300 font-medium block">
                  Ketik Durasi Jeda Manual (Menit):
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10080"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    placeholder="Contoh: 10, 45, 90"
                    className="flex-1 bg-slate-800 border border-indigo-500/60 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                  <span className="text-xs font-semibold text-indigo-300 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
                    Menit
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400">Pilihan cepat:</span>
                  {[5, 10, 20, 45, 90, 150].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCustomMinutes(String(m))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        customMinutes === String(m)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {m} mnt
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-1.5 text-[11px] text-slate-400">
              {isCustomDuration
                ? `AI akan otomatis aktif kembali setelah ${customMinutes || 0} menit jika tidak diperpanjang.`
                : durationMinutes
                  ? `AI akan otomatis aktif kembali setelah ${durationMinutes} menit jika tidak diperpanjang.`
                  : 'AI akan tetap dijeda sampai Anda menekan tombol "Aktifkan Kembali AI".'}
            </p>
          </div>

          {/* Catatan Tindakan */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Catatan Penanganan (Opsional)
            </label>
            <textarea
              rows={2}
              placeholder="Contoh: Menjawab konsultasi langsung wali santri..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800/70 border border-slate-700/70 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
            />
          </div>

          {/* Tombol Aksi */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-xl transition-all cursor-pointer shadow-lg ${
                isExtend
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30'
              } disabled:opacity-50`}
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isExtend ? 'Simpan Perpanjangan' : 'Konfirmasi Jeda AI'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
