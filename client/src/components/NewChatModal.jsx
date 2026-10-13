import React, { useState } from 'react';
import { MessageSquarePlus, X, Send } from 'lucide-react';

export default function NewChatModal({ isOpen, onClose, onStartChat }) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    const cleanMsg = message.trim();
    if (!cleanPhone || !cleanMsg) return;

    onStartChat(cleanPhone, cleanMsg);
    setPhone('');
    setMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <MessageSquarePlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Mulai Chat Baru</h3>
            <p className="text-xs text-slate-400">Kirim pesan ke nomor WhatsApp baru</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Nomor WhatsApp Tujuan
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: 08123456789 atau 628123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Pesan Pertama
            </label>
            <textarea
              required
              rows={3}
              placeholder="Tulis pesan Anda..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!phone.trim() || !message.trim()}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Kirim Pesan</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
