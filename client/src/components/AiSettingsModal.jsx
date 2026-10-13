import React, { useState, useEffect } from 'react';
import { Bot, X, Check, Save, Sparkles, Loader2, Zap, Cpu, ChevronDown, UserCheck, Clock, SlidersHorizontal, Edit3 } from 'lucide-react';
import {
  getSystemPrompt,
  saveSystemPrompt,
  getAutoReply,
  saveAutoReply,
  getAiModel,
  saveAiModel,
  getHandoverSettings,
  saveHandoverSettings
} from '../api';

const PRESET_DURATIONS = ['15', '30', '45', '60', '120', '180', '360', '720', '1440', 'manual'];

export default function AiSettingsModal({ isOpen, onClose, onSettingsUpdated }) {
  const [prompt, setPrompt] = useState('');
  const [autoReply, setAutoReply] = useState(false);
  const [model, setModel] = useState('gemini-flash-lite-latest');
  const [customModel, setCustomModel] = useState('');
  
  // Konfigurasi Pengalihan Otomatis ke CS / Ustadz
  const [autoHandoverEnabled, setAutoHandoverEnabled] = useState(true);
  const [handoverDuration, setHandoverDuration] = useState('60'); // preset value or 'custom'
  const [customDurationMinutes, setCustomDurationMinutes] = useState('45');
  const [defaultHandlerName, setDefaultHandlerName] = useState('CS / Ustadz');

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState('');

  // Saat modal dibuka, ambil nilai tersimpan dari database
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError('');
      setIsSaved(false);

      Promise.all([
        getSystemPrompt(),
        getAutoReply(),
        getAiModel(),
        getHandoverSettings().catch(() => null)
      ])
        .then(([savedPrompt, savedAutoReply, savedModel, savedHandover]) => {
          setPrompt(savedPrompt || '');
          setAutoReply(Boolean(savedAutoReply));
          
          if (savedHandover) {
            setAutoHandoverEnabled(savedHandover.autoHandoverEnabled !== false);
            const rawDuration = String(savedHandover.handoverDuration ?? '60');
            
            if (PRESET_DURATIONS.includes(rawDuration)) {
              setHandoverDuration(rawDuration);
              setCustomDurationMinutes('45');
            } else {
              // Jika nilai dari database adalah durasi kustom
              setHandoverDuration('custom');
              setCustomDurationMinutes(rawDuration || '45');
            }
            
            setDefaultHandlerName(savedHandover.defaultHandlerName || 'CS / Ustadz');
          }

          const knownModels = [
            'gemini-flash-lite-latest',
            'gemini-3.5-flash-lite',
            'gemini-3.1-flash-lite',
            'gemini-3-flash-preview',
            'gemini-flash-latest',
            'gemini-3.8-flash'
          ];
          if (savedModel && !knownModels.includes(savedModel)) {
            setModel('custom');
            setCustomModel(savedModel);
          } else {
            setModel(savedModel || 'gemini-flash-lite-latest');
          }
        })
        .catch((err) => {
          console.error('Gagal mengambil pengaturan AI:', err);
          setError('Gagal memuat pengaturan tersimpan.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setIsSaved(false);

    try {
      const finalModel = model === 'custom' ? (customModel.trim() || 'gemini-flash-lite-latest') : model;
      
      // Hitung durasi akhir jika opsi kustom dipilih
      let finalHandoverDuration = handoverDuration;
      if (handoverDuration === 'custom') {
        const parsed = parseInt(customDurationMinutes, 10);
        finalHandoverDuration = String(isNaN(parsed) || parsed <= 0 ? 15 : parsed);
      }

      await Promise.all([
        saveSystemPrompt(prompt),
        saveAutoReply(autoReply),
        saveAiModel(finalModel),
        saveHandoverSettings({
          autoHandoverEnabled,
          handoverDuration: finalHandoverDuration,
          defaultHandlerName: defaultHandlerName.trim() || 'CS / Ustadz'
        })
      ]);

      setIsSaved(true);
      if (onSettingsUpdated) {
        onSettingsUpdated({ autoReply, prompt, model: finalModel });
      }

      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (err) {
      console.error('Gagal menyimpan pengaturan AI:', err);
      setError('Gagal menyimpan pengaturan.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-900/95 border border-slate-800 p-6 sm:p-8 shadow-2xl text-slate-100 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Tombol Tutup */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Tutup modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-800/80">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600/30 via-indigo-500/20 to-emerald-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shadow-inner flex-shrink-0">
            <Bot className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-xl font-bold text-white tracking-tight">Pengaturan AI (Gemini)</h3>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-semibold uppercase tracking-wider">
                Google AI
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Kelola mode balasan otomatis, model AI, durasi jeda otomatis, dan gaya bicara asisten virtual
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          
          {/* Grid 2 Kolom untuk Bagian Konfigurasi Utama */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Kolom Kiri: Auto Reply & Model Selection */}
            <div className="flex flex-col gap-4">
              {/* Toggle Auto-Reply Switch */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 hover:border-slate-600/70 transition-all flex flex-col justify-between h-full">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                        <Zap className={`w-4 h-4 ${autoReply ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
                        Balas Otomatis (Auto-Reply)
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase transition-all ${
                        autoReply
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {autoReply ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Saat aktif, setiap pesan masuk dari pelanggan akan langsung dijawab otomatis oleh Gemini.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoReply}
                    onClick={() => {
                      setAutoReply(!autoReply);
                      setIsSaved(false);
                    }}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoReply ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        autoReply ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Model Selection */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 hover:border-slate-600/70 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    Model AI (Gemini)
                  </label>
                  <span className="text-[11px] text-purple-400 font-medium">Mesin Pemroses</span>
                </div>

                <div className="relative">
                  <select
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setIsSaved(false);
                    }}
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 appearance-none cursor-pointer pr-10"
                  >
                    <option value="gemini-flash-lite-latest">Gemini Flash Lite (⚡ Super Cepat & Kuota Tinggi - Rekomendasi)</option>
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (🚀 Cerdas, Ringan & Responsif)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (✨ Responsif & Akurat)</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (🔥 Generasi Baru)</option>
                    <option value="gemini-flash-latest">Gemini Flash Latest (Standar)</option>
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash (Terkini)</option>
                    <option value="custom">Kustom Model Lainnya...</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>

                {model === 'custom' && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => {
                        setCustomModel(e.target.value);
                        setIsSaved(false);
                      }}
                      placeholder="Ketik ID model Google (contoh: gemini-3.1-flash-lite)"
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}

                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Menentukan kecerdasan, kecepatan kuota, dan pemrosesan balasan pesan pelanggan.
                </p>
              </div>
            </div>

            {/* Kolom Kanan: Pengalihan Otomatis ke CS / Ustadz & Durasi Jeda Editable */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 hover:border-slate-600/70 transition-all flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-400" />
                    Pengalihan Otomatis ke CS / Ustadz
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoHandoverEnabled}
                    onClick={() => {
                      setAutoHandoverEnabled(!autoHandoverEnabled);
                      setIsSaved(false);
                    }}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoHandoverEnabled ? 'bg-indigo-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        autoHandoverEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Ketika jawaban AI merekomendasikan pelanggan untuk menghubungi CS / Ustadz, sistem secara <strong>otomatis menjeda AI</strong> untuk nomor tersebut agar tidak tumpang tindih.
                </p>
              </div>

              {autoHandoverEnabled && (
                <div className="flex flex-col gap-3 pt-3 border-t border-slate-700/60">
                  {/* Durasi Jeda Otomatis (Editable & Custom) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        Durasi Jeda Otomatis:
                      </label>
                      <span className="text-[11px] font-medium text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                        {handoverDuration === 'custom' 
                          ? `${customDurationMinutes || 0} Menit (Kustom)`
                          : handoverDuration === 'manual' 
                            ? 'Manual (Sampai Selesai)' 
                            : `${handoverDuration} Menit`}
                      </span>
                    </div>

                    <div className="relative">
                      <select
                        value={handoverDuration}
                        onChange={(e) => {
                          setHandoverDuration(e.target.value);
                          setIsSaved(false);
                        }}
                        className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none pr-10"
                      >
                        <option value="15">15 Menit</option>
                        <option value="30">30 Menit</option>
                        <option value="45">45 Menit</option>
                        <option value="60">1 Jam (60 Menit - Default)</option>
                        <option value="120">2 Jam (120 Menit)</option>
                        <option value="180">3 Jam (180 Menit)</option>
                        <option value="360">6 Jam</option>
                        <option value="720">12 Jam</option>
                        <option value="1440">24 Jam</option>
                        <option value="manual">Manual (Tanpa Batas Waktu / Sampai CS aktifkan kembali)</option>
                        <option value="custom">✏️ Input Manual (Kustom Menit Bebas)...</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Input Durasi Manual / Editable */}
                    {handoverDuration === 'custom' && (
                      <div className="mt-2.5 p-3 rounded-xl bg-slate-900/90 border border-indigo-500/40 space-y-2 animate-fade-in">
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          <span className="text-xs text-slate-300 font-medium">Ketik Durasi Manual (Menit):</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="10080"
                            value={customDurationMinutes}
                            onChange={(e) => {
                              setCustomDurationMinutes(e.target.value);
                              setIsSaved(false);
                            }}
                            placeholder="Contoh: 10, 45, 90"
                            className="flex-1 bg-slate-800 border border-indigo-500/60 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                          />
                          <span className="text-xs font-semibold text-indigo-300 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
                            Menit
                          </span>
                        </div>
                        {/* Tombol Shortcut Preset Cepat */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[10px] text-slate-400">Pilihan cepat:</span>
                          {[5, 10, 20, 45, 90, 150].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setCustomDurationMinutes(String(m));
                                setIsSaved(false);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                                customDurationMinutes === String(m)
                                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                              }`}
                            >
                              {m} mnt
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Nama / Label Petugas */}
                  <div>
                    <label className="text-xs font-medium text-slate-200 block mb-1.5">
                      Nama / Label Petugas (CS Asli / Ustadz)
                    </label>
                    <input
                      type="text"
                      value={defaultHandlerName}
                      onChange={(e) => {
                        setDefaultHandlerName(e.target.value);
                        setIsSaved(false);
                      }}
                      placeholder="Contoh: CS / Ustadz"
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* System Prompt Section (Full Width) */}
          <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                System Prompt (Instruksi & Pengetahuan AI)
              </label>
              <span className="text-[11px] text-slate-400">Gaya Bahasa & Perilaku Asisten</span>
            </div>

            {isLoading ? (
              <div className="h-44 w-full rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-center text-slate-500 text-xs">
                <Loader2 className="w-5 h-5 animate-spin mr-2 text-emerald-500" />
                Memuat prompt tersimpan...
              </div>
            ) : (
              <textarea
                rows={7}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setIsSaved(false);
                }}
                placeholder="Contoh: Anda adalah asisten virtual resmi dari Imam Muzani Boarding School. Jawab setiap pertanyaan pelanggan dengan ramah, santun, dan solutif..."
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-mono leading-relaxed transition-all resize-y min-h-[140px]"
              />
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
              <p className="text-[11px] text-slate-400">
                Kosongkan jika ingin memakai default sistem: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">"You are a helpful assistant."</code>
              </p>
            </div>

            {/* Quick Presets */}
            <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Preset Cepat:</span>
              <button
                type="button"
                onClick={() => {
                  setPrompt('Anda adalah customer support resmi yang ramah, sopan, dan cepat tanggap. Gunakan bahasa Indonesia santun, jelas, dan solutif. Jika pertanyaan memerlukan penanganan personal atau informasi khusus, arahkan pelanggan untuk menunggu balasan dari CS / Ustadz kami.');
                  setIsSaved(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer border border-slate-700"
              >
                CS Ramah & Sopan
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrompt('Anda adalah asisten profesional. Berikan jawaban yang to-the-point, ringkas, padat, dan jelas dalam bahasa Indonesia formal.');
                  setIsSaved(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer border border-slate-700"
              >
                Formal & Ringkas
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrompt('You are a polite and helpful customer service assistant replying to WhatsApp inquiries promptly.');
                  setIsSaved(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer border border-slate-700"
              >
                English Assistant
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3.5 py-2.5 rounded-xl">
              {error}
            </p>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/90 mt-1">
            {/* Indikator Tersimpan */}
            <div>
              {isSaved && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-full animate-fade-in font-medium">
                  <Check className="w-4 h-4" />
                  <span>Pengaturan Berhasil Disimpan</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs sm:text-sm font-medium rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={isSaving || isLoading}
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-lg shadow-purple-600/25 transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Simpan Pengaturan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}
