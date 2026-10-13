# 🤖 AI WhatsApp Customer Service & Human Handover Hub

Platform Customer Service WhatsApp interaktif berbasis AI (Google Gemini) yang terintegrasi langsung dengan WhatsApp Multi-Device (via `@whiskeysockets/baileys`) dan basis data lokal SQLite.

Dilengkapi dengan sistem **Human Handover pintar (CS / Ustadz)** yang otomatis menjeda AI ketika percakapan dialihkan kepada petugas manusia agar balasan tidak tumpang tindih.

---

## ✨ Fitur Unggulan

- ⚡ **WhatsApp Web Multi-Device Realtime**: Koneksi Baileys yang stabil dengan QR Code otomatis dan reconnect cerdas.
- 🧠 **Google Gemini AI Auto-Reply**: Otomatis menjawab pesan masuk pelanggan berdasarkan konteks percakapan dan instruksi sistem (*System Prompt*).
- ⏱️ **Jeda Otomatis & Durasi Kustom Editable**:
  - Pilihan durasi preset: 15m, 30m, 45m, 1 Jam, 2 Jam, 3 Jam, dst.
  - **Input durasi manual kustom**: bebas mengetik durasi dalam hitungan menit (misal: 10 menit, 45 menit, 90 menit).
- 🤝 **Human Handover (CS / Ustadz)**:
  - Deteksi kata kunci rekomendasi pengalihan secara otomatis dari respons AI.
  - Penjeda otomatis balasan per nomor kontak pelanggan yang sedang ditangani.
  - Fitur perpanjang waktu jeda (*Extend*), tombol aktifkan kembali AI seketika (*Resume*), dan pencatatan audit log penanganan.
- 🎨 **Antarmuka Premium Modern**:
  - Modal Pengaturan AI berukuran luas (`max-w-4xl`) dengan layout 2-kolom responsif.
  - Filter percakapan: *Semua*, *AI*, dan *CS / Ustadz*.
  - Dilengkapi *ErrorBoundary* pelindung crash tampilan.

---

## 📁 Struktur Direktori

```
├── client/                 # Frontend React (Vite + Tailwind CSS v4)
│   ├── src/
│   │   ├── components/     # ChatThread, ChatList, AiSettingsModal, HandoverModal, ErrorBoundary
│   │   └── api.js          # REST Client Axios
│   ├── .env.example
│   └── vercel.json         # Konfigurasi deploy SPA di Vercel
├── server/                 # Backend Node.js (Express + Socket.io + SQLite)
│   ├── ai.js               # Integrasi Google Gemini SDK
│   ├── whatsapp.js         # Socket Baileys WhatsApp & Handover Engine
│   ├── db.js               # Database SQLite & migrasi tabel
│   ├── index.js            # Express API server
│   └── .env.example
├── vercel.json             # Konfigurasi Vercel root build
└── .gitignore              # Proteksi session WhatsApp, database SQLite, dan .env
```

---

## 🚀 Menjalankan di Localhost

### 1. Prasyarat
- Node.js versi 18 ke atas
- NPM / PNPM / Yarn

### 2. Setup Backend Server
```bash
cd server
npm install
cp .env.example .env
# Edit .env dan masukkan GEMINI_API_KEY Anda
npm run dev
```
Backend berjalan di: `http://localhost:3001`

### 3. Setup Frontend Client
```bash
cd ../client
npm install
cp .env.example .env.local
npm run dev
```
Frontend berjalan di: `http://localhost:3000`

---

## 🌐 Panduan Deployment di Vercel

### Frontend (Client) di Vercel
1. Hubungkan repository GitHub ini ke akun [Vercel](https://vercel.com).
2. Konfigurasi Project di Vercel:
   - **Framework Preset**: Vite
   - **Root Directory**: `client` *(atau biarkan `./` karena sudah ada root `vercel.json`)*
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Tambahkan **Environment Variable** di dashboard Vercel:
   - `VITE_API_BASE_URL`: URL backend produksi Anda (contoh: `https://api-whatsapp.yourdomain.com` atau URL Railway/Render).

> ⚠️ **Catatan Penting Backend WhatsApp**:
> Layanan backend WhatsApp (`server/`) membutuhkan proses *persistent/stateful* (WebSocket & soket Baileys yang menyala terus-menerus dan menyimpan sesi autentikasi). Backend sebaiknya di-deploy pada platform seperti **Railway**, **Render**, **Fly.io**, atau **VPS (Ubuntu + PM2/Docker)**, bukan serverless functions.
