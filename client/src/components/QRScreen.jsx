import React, { useEffect, useState } from 'react';
import { QrCode, RefreshCw, Smartphone, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';
import { getQr, getStatus } from '../api';

export default function QRScreen({ qrDataUrl, status, onRefresh }) {
  const [localQr, setLocalQr] = useState(qrDataUrl);
  const [loading, setLoading] = useState(!qrDataUrl);

  // Sync state dari props
  useEffect(() => {
    if (qrDataUrl) {
      setLocalQr(qrDataUrl);
      setLoading(false);
    }
  }, [qrDataUrl]);

  // Polling tiap 3 detik sebagai jaring pengaman bila socket delay
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await getQr();
        if (res?.qr) {
          setLocalQr(res.qr);
          setLoading(false);
        }
      } catch (err) {
        console.error('Polling QR gagal:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, []);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900/90 border border-slate-800 p-8 sm:p-10 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center">
        
        {/* Brand & Status Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>WhatsApp Channel • {status === 'qr' ? 'Menunggu Pemindaian' : 'Menghubungkan...'}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Hubungkan WhatsApp
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-md">
          Pindai kode QR di bawah ini menggunakan aplikasi WhatsApp di ponsel Anda untuk menyinkronkan chat.
        </p>

        {/* QR Code Container */}
        <div className="relative mt-8 p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center min-w-[280px] min-h-[280px] sm:min-w-[320px] sm:min-h-[320px]">
          {localQr ? (
            <img
              src={localQr}
              alt="Scan WhatsApp QR Code"
              className="w-64 h-64 sm:w-72 sm:h-72 object-contain rounded-xl select-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-8">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-3" />
              <p className="text-sm font-medium text-slate-600">Menyiapkan QR Code...</p>
            </div>
          )}

          {/* Watermark Logo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
            <QrCode className="w-48 h-48 text-slate-900" />
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 w-full max-w-md bg-slate-800/40 border border-slate-800 rounded-2xl p-4 text-left">
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
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors font-medium py-1 px-2 rounded-lg hover:bg-slate-800/50"
          >
            <RefreshCw className="w-3 h-3" />
            Muat ulang manual
          </button>
        </div>

      </div>
    </div>
  );
}
