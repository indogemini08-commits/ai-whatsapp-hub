# AI WhatsApp Backend Server

Backend Node.js (Express + Socket.IO) untuk integrasi WhatsApp menggunakan `@whiskeysockets/baileys` dan SQLite (`better-sqlite3`).

---

## 📁 Struktur Folder

```text
server/
├── auth_session/      # Multi-file auth state Baileys (kredensial sesi WhatsApp)
├── data/              # Database file SQLite (whatsapp.db)
├── .env               # Konfigurasi environment (PORT=3001)
├── db.js              # Manajemen database SQLite (tabel chats & messages)
├── index.js           # Entry point Express HTTP & Socket.IO server
├── nodemon.json       # Konfigurasi auto-reload file yang dipantau
├── package.json       # Dependensi dan script
├── README.md          # Dokumentasi teknis & panduan API
└── whatsapp.js        # Seluruh logika koneksi Baileys & event handler
```

---

## 🚀 Cara Menjalankan

### 1. Mode Development (Nodemon)
```bash
npm run dev
```

### 2. Mode Produksi
```bash
npm start
```

> **Catatan Penting (Operasional):**  
> Sesuai konfigurasi di `nodemon.json`, nodemon hanya memantau file `.js` (`index.js`, `whatsapp.js`, `db.js`, `ai.js`).  
> Perubahan atau penambahan variabel pada file `.env` (seperti `GEMINI_API_KEY`, `GCP_SERVICE_ACCOUNT`, dan `PORT`) **TIDAK** memicu restart otomatis nodemon.  
> Restart server secara manual setelah mengubah `.env` agar variabel baru terbaca.

---

## 🤖 Integrasi AI (Gemini)

Backend mendukung 2 opsi autentikasi:

### Opsi 1: Google AI Studio API Key (Paling Simpel & Gratis - Rekomendasi)
Cukup ambil API key dari [Google AI Studio](https://aistudio.google.com/app/apikey), lalu masukkan ke `.env`:
```env
PORT=3001
GEMINI_API_KEY=AIzaSy...
```

### Opsi 2: GCP Vertex AI Service Account
Jika menggunakan akun Google Cloud Platform, masukkan service account JSON sebagai 1 baris utuh:
```env
PORT=3001
GCP_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id",...}
```

### Endpoints AI:
1. **`POST /api/ai-reply`**
   - Body: `{ "message": "Pesan masuk pelanggan", "systemPrompt": "Opsional" }`
   - Response: `{ "reply": "Jawaban dari Gemini..." }`
   - Prioritas System Prompt:
     1. `systemPrompt` dari body request (jika diisi).
     2. `systemPrompt` tersimpan di database SQLite (tabel `settings`).
     3. Default: `"You are a helpful assistant."`
2. **`GET /api/settings/system-prompt`**
   - Response: `{ "systemPrompt": "..." }`
3. **`POST /api/settings/system-prompt`**
   - Body: `{ "systemPrompt": "..." }`
   - Response: `{ "success": true }`

---

## 📡 API Contract (JSON Envelope)

Backend berjalan di `http://localhost:3001`. Semua respons API menggunakan format envelope:

### 1. Cek Status WhatsApp
- **Endpoint:** `GET /api/status`
- **Response:**
  ```json
  {
    "status": "connecting" | "qr" | "connected" | "closed",
    "user": { "id": "628xxx:0@s.whatsapp.net", "name": "Akun Anda" } | null
  }
  ```

### 2. Ambil QR Code
- **Endpoint:** `GET /api/qr`
- **Response:**
  ```json
  {
    "status": "qr",
    "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..." // Data URL base64 PNG atau null jika tidak ada
  }
  ```

### 3. Daftar Chat
- **Endpoint:** `GET /api/chats`
- **Response:**
  ```json
  {
    "success": true,
    "chats": [
      {
        "id": "628123456789@s.whatsapp.net",
        "name": "Budi Santoso",
        "lastMessage": "Halo, apa kabar?",
        "timestamp": 1718000000000,
        "unreadCount": 0
      }
    ]
  }
  ```

### 4. Ambil Riwayat Pesan Chat
- **Endpoint:** `GET /api/messages?chatId=xxx`
- **Response:**
  ```json
  {
    "success": true,
    "chatId": "628123456789@s.whatsapp.net",
    "messages": [
      {
        "id": "3EB0ABC12345",
        "chatId": "628123456789@s.whatsapp.net",
        "sender": "628123456789@s.whatsapp.net",
        "fromMe": false,
        "text": "Halo, apa kabar?",
        "timestamp": 1718000000000,
        "status": "received"
      }
    ]
  }
  ```

### 5. Kirim Pesan Teks
- **Endpoint:** `POST /api/send-message`
- **Request Body:**
  ```json
  {
    "to": "08123456789", // atau JID langsung "628123456789@s.whatsapp.net" / "@lid"
    "message": "Halo dari AI WhatsApp!"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "jid": "628123456789@s.whatsapp.net",
    "message": {
      "id": "3EB0XYZ9876",
      "chatId": "628123456789@s.whatsapp.net",
      "sender": "628xxx:0@s.whatsapp.net",
      "fromMe": true,
      "text": "Halo dari AI WhatsApp!",
      "timestamp": 1718000005000,
      "status": "sent"
    }
  }
  ```

### 6. Reset Sesi WhatsApp
- **Endpoint:** `POST /api/reset-session`
- **Response:**
  ```json
  {
    "success": true,
    "status": "connecting"
  }
  ```

---

## ⚡ Socket.IO Events

Koneksi Socket.IO diizinkan dari origin CORS `http://localhost:3000`.

- **Event `status`**  
  Payload: `{ status, qr, user }`  
  Dipicu setiap kali status koneksi, QR code, atau akun berubah.

- **Event `message`**  
  Payload: `{ message, chat }`  
  Dipicu saat ada pesan masuk atau pesan keluar berhasil diproses dan disimpan di database.

---

## 📱 Cara Scan QR Code (Sebelum Frontend Siap)

Karena frontend belum ada, Anda bisa melihat dan men-scan QR code dengan cara:

### Opsi A: Buka di Browser
1. Jalankan server: `npm run dev`
2. Buka URL: `http://localhost:3001/api/qr` di browser.
3. Anda akan mendapatkan JSON dengan field `"qr"` yang berisi string Data URL (`data:image/png;base64,...`).
4. Copy seluruh nilai string `"qr"` tersebut (mulai dari `data:image/png;base64,...`), lalu paste langsung ke address bar browser baru dan tekan Enter. Gambar QR code PNG akan tampil di layar dan siap di-scan menggunakan WhatsApp pada ponsel Anda (Menu: **Perangkat Tertaut > Tautkan Perangkat**).

### Opsi B: Menggunakan Tag HTML Sederhana
Anda juga bisa membuka file HTML sederhana atau console browser untuk menampilkan gambar dari data URL tersebut:
```html
<img src="<paste_data_url_disini>" width="300" />
```
Begitu QR code berhasil di-scan, status akan otomatis berpindah ke `connected` dan sesi tersimpan di folder `server/auth_session/`.
