import React, { useEffect, useState } from 'react';
import {
  QrCode,
  RefreshCw,
  Smartphone,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Server,
  ExternalLink,
  Settings,
  Check,
  X
} from 'lucide-react';
import { getQr, getStatus, getApiBaseUrl, setApiBaseUrl } from '../api';

export default function QRScreen({ qrDataUrl, status, onRefresh }) {
  const [localQr, setLocalQr] = useState(qrDataUrl);
  const [loading, setLoading] = useState(!qrDataUrl);
  const [connectionError, setConnectionError] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  // Modal Setting Backend URL
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState(getApiBaseUrl());

  const currentApiUrl = getApiBaseUrl();
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isLocalhostBackend = currentApiUrl.includes('localhost') || currentApiUrl.includes('127.0.0.1');
  const isMixedContentRisk = isHttpsPage && isLocalhostBackend;

  // Sync state dari props
  useEffect(() => {
    if (qrDataUrl) {
      setLocalQr(qrDataUrl);
      setLoading(false);
      setConnectionError(false);
    }
  }, [qrDataUrl]);

  // Polling tiap 3 detik sebagai jaring pengaman bila socket delay
  useEffect(() => {
    let isMounted = true;

    const checkServerAndQr = async () => {
      try {
        const res = await getQr();
        if (!isMounted) return;

        if (res?.qr) {
          setLocalQr(res.qr);
          setLoading(false);
        }
        setConnectionError(false);
      } catch (err) {
        if (!isMounted) return;
        console.warn('Gagal menghubungi backend:', err.message);
        setFailedCount((prev) => {
          const next = prev + 1;
          if (next >= 2) {
            setConnectionError(true);
          }
          return next;
        });
      }
    };

    // Jalankan segera dan set interval
    checkServerAndQr();
    const pollInterval = setInterval(checkServerAndQr, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []);

  const handleSaveUrl = (e) => {
    e.preventDefault();
    if (!inputUrl) return;
    setApiBaseUrl(inputUrl);
    setIsUrlModalOpen(false);
    window.location.reload();
  };

  const handleResetUrl = () => {
    setApiBaseUrl('');
    setIsUrlModalOpen(false);
    window.location.reload();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-10 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center relative">
        
        {/* Tombol Konfigurasi Server URL */}
        <button
          onClick={() => {
            setInputUrl(getApiBaseUrl());
            setIsUrlModalOpen(true);
          }}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5 text-xs"
          title="Atur URL Backend Server"
        >
          <Server className="w-4 h-4 text-slate-400" />
          <span className="hidden sm:inline">Server API</span>
        </button>

        {/* Brand & Status Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-4 sm:mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>WhatsApp Channel • {status === 'qr' ? 'Menunggu Pemindaian' : 'Menghubungkan...'}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Hubungkan WhatsApp
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md">
          Pindai kode QR di bawah ini menggunakan aplikasi WhatsApp di ponsel Anda untuk menyinkronkan chat.
        </p>

        {/* PERINGATAN KETIKA BACKEND TIDAK BISA DIHUBUNGI / MIXED CONTENT VERCEL */}
        {(connectionError || isMixedContentRisk) && (
          <div className="w-full mt-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-left text-xs space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Backend Belum Terhubung ke Vercel</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {isMixedContentRisk ? (
                <>
                  Halaman di Vercel (<strong>HTTPS</strong>) tidak dapat terhubung langsung ke <code>{currentApiUrl}</code> (<strong>HTTP lokal</strong>) karena aturan keamanan browser (*Mixed Content*).
                </>
              ) : (
                <>
                  Tidak dapat menerima respon dari server backend di <code>{currentApiUrl}</code>.
                </>
              )}
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-2">
              <a
                href="http://localhost:3000"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di Localhost (Port 3000)</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setInputUrl(getApiBaseUrl());
                  setIsUrlModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors text-xs border border-slate-700 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Ubah URL Backend</span>
              </button>
            </div>
          </div>
        )}

        {/* QR Code Container */}
        <div className="relative mt-6 p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center min-w-[260px] min-h-[260px] sm:min-w-[320px] sm:min-h-[320px]">
          {localQr ? (
            <img
              src={localQr}
              alt="Scan WhatsApp QR Code"
              className="w-60 h-60 sm:w-72 sm:h-72 object-contain rounded-xl select-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-8">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-3" />
              <p className="text-sm font-medium text-slate-600">
                {connectionError ? 'Menunggu sambungan backend...' : 'Menyiapkan QR Code...'}
              </p>
              {connectionError && (
                <span className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
                  Pastikan server Node.js aktif dan dapat diakses.
                </span>
              )}
            </div>
          )}

          {/* Watermark Logo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
            <QrCode className="w-48 h-48 text-slate-900" />
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 sm:mt-8 w-full max-w-md bg-slate-800/40 border border-slate-800 rounded-2xl p-4 text-left">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            Langkah-langkah di Ponsel:
          </h4>
          <ol className="space-y-2 text-xs sm:text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="font-semibold text-emerald-400">1.</span>
              <span>Buka WhatsApp di ponsel Anda.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-emerald-400">2.</span>
              <span>
                Ketuk <strong>Menu (⋮)</strong> di Android atau <strong>Pengaturan</strong> di iPhone.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-emerald-400">3.</span>
              <span>
                Pilih <strong>Perangkat Tertaut (Linked Devices)</strong> lalu ketuk <strong>Tautkan Perangkat</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-emerald-400">4.</span>
              <span>Arahkan kamera ponsel Anda ke kode QR di atas.</span>
            </li>
          </ol>
        </div>

        {/* Footer info */}
        <div className="mt-6 flex items-center justify-between w-full max-w-md text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            Sesi aman & multi-file state
          </span>
          <button
            onClick={() => {
              setConnectionError(false);
              setFailedCount(0);
              if (onRefresh) onRefresh();
            }}
            className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors font-medium py-1 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Muat ulang manual
          </button>
        </div>

      </div>

      {/* Modal Pengaturan URL Server Backend */}
      {isUrlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-semibold text-white">Konfigurasi Server API</h3>
              </div>
              <button
                onClick={() => setIsUrlModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Jika Anda mengakses melalui Vercel, masukkan URL backend online Anda (contoh dari Railway, Render, VPS, atau Ngrok HTTPS).
            </p>

            <form onSubmit={handleSaveUrl} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                  URL Backend API
                </label>
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://api-whatsapp.yourdomain.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetUrl}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                >
                  Reset ke Default
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUrlModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-colors"
                  >
                    Simpan & Muat Ulang
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
