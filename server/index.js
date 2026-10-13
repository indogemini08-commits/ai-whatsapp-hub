require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./db');
const whatsapp = require('./whatsapp');
const ai = require('./ai');

const PORT = parseInt(process.env.PORT, 10) || 3001;

const app = express();
const server = http.createServer(app);

// Inisialisasi Socket.IO dengan CORS
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000'
}));
app.use(express.json());

// Socket.IO event handler
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client terhubung:', socket.id);
  const currentStatus = whatsapp.getStatus();
  const currentQr = whatsapp.getQr();

  // Kirimkan status awal ke client yang baru terkoneksi
  socket.emit('status', {
    status: currentStatus.status,
    qr: currentQr.qr,
    user: currentStatus.user
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client terputus:', socket.id);
  });
});

// --- API ENDPOINTS (KONTRAK RESMI) ---

// GET /api/status -> { status, user }
app.get('/api/status', (req, res) => {
  const { status, user } = whatsapp.getStatus();
  res.json({ status, user });
});

// GET /api/qr -> { status, qr }
app.get('/api/qr', (req, res) => {
  const { status, qr } = whatsapp.getQr();
  res.json({ status, qr });
});

// GET /api/chats -> { success, chats }
app.get('/api/chats', (req, res) => {
  try {
    const chats = db.getChats();
    res.json({ success: true, chats });
  } catch (err) {
    console.error('[API] Error get /api/chats:', err);
    res.status(500).json({ success: false, error: 'Gagal mengambil data chat' });
  }
});

// GET /api/messages?chatId=xxx -> { success, chatId, messages }
app.get('/api/messages', (req, res) => {
  const chatId = req.query.chatId;
  if (!chatId) {
    return res.status(400).json({ success: false, error: 'Parameter chatId wajib disertakan' });
  }
  try {
    const messages = db.getMessages(chatId);
    res.json({ success: true, chatId, messages });
  } catch (err) {
    console.error('[API] Error get /api/messages:', err);
    res.status(500).json({ success: false, error: 'Gagal mengambil data pesan' });
  }
});

// DELETE /api/chats/:chatId -> Hapus satu chat dan riwayat pesannya
app.delete('/api/chats/:chatId', (req, res) => {
  const chatId = decodeURIComponent(req.params.chatId);
  if (!chatId) {
    return res.status(400).json({ success: false, error: 'Parameter chatId wajib disertakan' });
  }
  try {
    db.deleteChat(chatId);
    io.emit('chat_deleted', { chatId });
    res.json({ success: true, chatId });
  } catch (err) {
    console.error('[API] Error delete /api/chats/:chatId:', err);
    res.status(500).json({ success: false, error: 'Gagal menghapus pesan chat' });
  }
});

// DELETE /api/chats -> Hapus satu chat (via query param ?chatId=) atau hapus SEMUA chat jika tanpa query
app.delete('/api/chats', (req, res) => {
  const chatId = req.query.chatId;
  try {
    if (chatId) {
      db.deleteChat(chatId);
      io.emit('chat_deleted', { chatId });
      return res.json({ success: true, chatId });
    }
    db.clearAllChats();
    io.emit('chats_cleared');
    res.json({ success: true, message: 'Semua riwayat chat berhasil dibersihkan' });
  } catch (err) {
    console.error('[API] Error delete /api/chats:', err);
    res.status(500).json({ success: false, error: 'Gagal membersihkan daftar chat' });
  }
});

// --- FITUR HUMAN HANDOVER & JEDA AI AUTO-REPLY PER NOMOR ---

// GET /api/chats/:chatId/ai-status -> status jeda AI untuk nomor ini
app.get('/api/chats/:chatId/ai-status', (req, res) => {
  try {
    const rawChatId = decodeURIComponent(req.params.chatId);
    const chatId = whatsapp.formatToJid(rawChatId) || rawChatId;
    const status = db.getChatAiStatus(chatId);
    res.json({ success: true, ...status });
  } catch (err) {
    console.error('[API] Error get /api/chats/:chatId/ai-status:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil status jeda AI' });
  }
});

// POST /api/chats/:chatId/pause-ai -> jeda AI untuk nomor ini
app.post('/api/chats/:chatId/pause-ai', (req, res) => {
  try {
    const rawChatId = decodeURIComponent(req.params.chatId);
    const chatId = whatsapp.formatToJid(rawChatId) || rawChatId;
    const { durationMinutes, handlerRole, handlerName, notes } = req.body;

    const updatedChat = db.pauseChatAi(chatId, {
      durationMinutes,
      handlerRole: handlerRole || 'cs',
      handlerName: handlerName || '',
      notes: notes || ''
    });

    const status = db.getChatAiStatus(chatId);

    // Broadcast update ke semua client melalui Socket.IO
    io.emit('chat_ai_status_changed', {
      chatId,
      chat: updatedChat,
      ...status
    });
    io.emit('chat_updated', { chat: updatedChat });

    res.json({ success: true, chat: updatedChat, status });
  } catch (err) {
    console.error('[API] Error post /api/chats/:chatId/pause-ai:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal mengaktifkan jeda AI' });
  }
});

// POST /api/chats/:chatId/extend-pause -> perpanjang durasi jeda AI
app.post('/api/chats/:chatId/extend-pause', (req, res) => {
  try {
    const rawChatId = decodeURIComponent(req.params.chatId);
    const chatId = whatsapp.formatToJid(rawChatId) || rawChatId;
    const { addMinutes, durationMinutes, handlerRole, handlerName, notes } = req.body;

    const updatedChat = db.extendChatAiPause(chatId, {
      addMinutes,
      durationMinutes,
      handlerRole,
      handlerName,
      notes
    });

    const status = db.getChatAiStatus(chatId);

    io.emit('chat_ai_status_changed', {
      chatId,
      chat: updatedChat,
      ...status
    });
    io.emit('chat_updated', { chat: updatedChat });

    res.json({ success: true, chat: updatedChat, status });
  } catch (err) {
    console.error('[API] Error post /api/chats/:chatId/extend-pause:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal memperpanjang jeda AI' });
  }
});

// POST /api/chats/:chatId/resume-ai -> aktifkan kembali AI untuk nomor ini
app.post('/api/chats/:chatId/resume-ai', (req, res) => {
  try {
    const rawChatId = decodeURIComponent(req.params.chatId);
    const chatId = whatsapp.formatToJid(rawChatId) || rawChatId;
    const { notes, handlerName } = req.body;

    const updatedChat = db.resumeChatAi(chatId, { notes, handlerName });
    const status = db.getChatAiStatus(chatId);

    io.emit('chat_ai_status_changed', {
      chatId,
      chat: updatedChat,
      ...status
    });
    io.emit('chat_updated', { chat: updatedChat });

    res.json({ success: true, chat: updatedChat, status });
  } catch (err) {
    console.error('[API] Error post /api/chats/:chatId/resume-ai:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal mengaktifkan kembali AI' });
  }
});

// POST /api/chats/:chatId/dismiss-handover -> abaikan rekomendasi pengalihan AI
app.post('/api/chats/:chatId/dismiss-handover', (req, res) => {
  try {
    const rawChatId = decodeURIComponent(req.params.chatId);
    const chatId = whatsapp.formatToJid(rawChatId) || rawChatId;

    const updatedChat = db.setChatHandoverFlag(chatId, {
      needsHandover: false,
      handoverReason: ''
    });

    io.emit('chat_updated', { chat: updatedChat });

    res.json({ success: true, chat: updatedChat });
  } catch (err) {
    console.error('[API] Error post /api/chats/:chatId/dismiss-handover:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal mengabaikan rekomendasi pengalihan' });
  }
});

// GET /api/chats/:chatId/handover-logs -> ambil riwayat audit jeda & pengalihan
app.get('/api/chats/:chatId/handover-logs', (req, res) => {
  try {
    const rawChatId = decodeURIComponent(req.params.chatId);
    const chatId = whatsapp.formatToJid(rawChatId) || rawChatId;
    const logs = db.getHandoverLogs(chatId);
    res.json({ success: true, logs });
  } catch (err) {
    console.error('[API] Error get /api/chats/:chatId/handover-logs:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil riwayat audit handover' });
  }
});

// POST /api/send-message -> { success, jid, message }
// body: { to, message }
app.post('/api/send-message', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: 'Body harus menyertakan "to" dan "message"'
    });
  }

  try {
    const result = await whatsapp.sendMessage(to, message);
    res.json({
      success: true,
      jid: result.jid,
      message: result.message
    });
  } catch (err) {
    console.error('[API] Error post /api/send-message:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Gagal mengirim pesan'
    });
  }
});

// POST /api/reset-session -> { success, status }
app.post('/api/reset-session', async (req, res) => {
  try {
    const result = await whatsapp.resetSession();
    res.json({
      success: true,
      status: result.status
    });
  } catch (err) {
    console.error('[API] Error post /api/reset-session:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Gagal mereset sesi'
    });
  }
});

// POST /api/ai-reply -> { reply }
// body: { message, systemPrompt }
app.post('/api/ai-reply', async (req, res) => {
  const { message, systemPrompt, model, chatHistory } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Field "message" wajib diisi' });
  }

  try {
    const reply = await ai.generateAiReply(message, systemPrompt, model, chatHistory);
    res.json({ reply });
  } catch (err) {
    console.error('[API] Error post /api/ai-reply:', err.message);
    // JANGAN pernah print, log, atau mengembalikan isi GCP_SERVICE_ACCOUNT ke client
    res.status(500).json({ error: err.message || 'Gagal memproses balasan AI' });
  }
});

// GET /api/settings/ai-model -> { aiModel }
app.get('/api/settings/ai-model', (req, res) => {
  try {
    const aiModel = db.getSetting('aiModel', 'gemini-1.5-flash');
    res.json({ aiModel });
  } catch (err) {
    console.error('[API] Error get /api/settings/ai-model:', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan model AI' });
  }
});

// POST /api/settings/ai-model -> { success, aiModel }
// body: { aiModel }
app.post('/api/settings/ai-model', (req, res) => {
  const { aiModel } = req.body;
  try {
    const cleanModel = (aiModel && typeof aiModel === 'string' && aiModel.trim()) ? aiModel.trim() : 'gemini-1.5-flash';
    db.setSetting('aiModel', cleanModel);
    res.json({ success: true, aiModel: cleanModel });
  } catch (err) {
    console.error('[API] Error post /api/settings/ai-model:', err);
    res.status(500).json({ success: false, error: 'Gagal menyimpan pengaturan model AI' });
  }
});

// GET /api/settings/system-prompt -> { systemPrompt }
app.get('/api/settings/system-prompt', (req, res) => {
  try {
    const systemPrompt = db.getSetting('systemPrompt', '');
    res.json({ systemPrompt: systemPrompt || '' });
  } catch (err) {
    console.error('[API] Error get /api/settings/system-prompt:', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan system prompt' });
  }
});

// POST /api/settings/system-prompt -> { success }
// body: { systemPrompt }
app.post('/api/settings/system-prompt', (req, res) => {
  const { systemPrompt } = req.body;
  try {
    db.setSetting('systemPrompt', systemPrompt != null ? String(systemPrompt) : '');
    res.json({ success: true });
  } catch (err) {
    console.error('[API] Error post /api/settings/system-prompt:', err);
    res.status(500).json({ success: false, error: 'Gagal menyimpan pengaturan system prompt' });
  }
});

// GET /api/settings/auto-reply -> { autoReply }
app.get('/api/settings/auto-reply', (req, res) => {
  try {
    const isAutoReply = db.getSetting('autoReply', 'false') === 'true';
    res.json({ autoReply: isAutoReply });
  } catch (err) {
    console.error('[API] Error get /api/settings/auto-reply:', err);
    res.status(500).json({ error: 'Gagal mengambil status auto-reply' });
  }
});

// POST /api/settings/auto-reply -> { success, autoReply }
// body: { autoReply }
app.post('/api/settings/auto-reply', (req, res) => {
  const { autoReply } = req.body;
  try {
    const val = Boolean(autoReply);
    db.setSetting('autoReply', val ? 'true' : 'false');
    res.json({ success: true, autoReply: val });
  } catch (err) {
    console.error('[API] Error post /api/settings/auto-reply:', err);
    res.status(500).json({ success: false, error: 'Gagal menyimpan status auto-reply' });
  }
});

// GET /api/settings/handover -> { autoHandoverEnabled, handoverDuration, defaultHandlerName }
app.get('/api/settings/handover', (req, res) => {
  try {
    const autoHandoverEnabled = db.getSetting('autoHandoverEnabled', 'true') === 'true';
    const handoverDuration = db.getSetting('handoverDuration', '60');
    const defaultHandlerName = db.getSetting('defaultHandlerName', 'CS / Ustadz');
    res.json({ autoHandoverEnabled, handoverDuration, defaultHandlerName });
  } catch (err) {
    console.error('[API] Error get /api/settings/handover:', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan pengalihan handover' });
  }
});

// POST /api/settings/handover -> simpan konfigurasi pengalihan otomatis
app.post('/api/settings/handover', (req, res) => {
  const { autoHandoverEnabled, handoverDuration, defaultHandlerName } = req.body;
  try {
    if (autoHandoverEnabled !== undefined) {
      db.setSetting('autoHandoverEnabled', autoHandoverEnabled ? 'true' : 'false');
    }
    if (handoverDuration !== undefined) {
      db.setSetting('handoverDuration', String(handoverDuration));
    }
    if (defaultHandlerName !== undefined) {
      db.setSetting('defaultHandlerName', String(defaultHandlerName).trim() || 'CS / Ustadz');
    }
    res.json({
      success: true,
      autoHandoverEnabled: db.getSetting('autoHandoverEnabled', 'true') === 'true',
      handoverDuration: db.getSetting('handoverDuration', '60'),
      defaultHandlerName: db.getSetting('defaultHandlerName', 'CS / Ustadz')
    });
  } catch (err) {
    console.error('[API] Error post /api/settings/handover:', err);
    res.status(500).json({ success: false, error: 'Gagal menyimpan pengaturan pengalihan handover' });
  }
});

// Error handling port bentrok (EADDRINUSE) sebelum listen crash
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[FATAL ERROR] Port ${PORT} sudah digunakan oleh proses lain!`);
    console.error(`Silakan matikan proses yang sedang menggunakan port ${PORT} terlebih dahulu.\n`);
    process.exit(1);
  } else {
    console.error('[FATAL ERROR] Terjadi kesalahan pada server HTTP:', err);
    process.exit(1);
  }
});

// Jalankan HTTP server dan inisialisasi WhatsApp
server.listen(PORT, () => {
  console.log(`[Server] Backend Express & Socket.IO berjalan di port ${PORT}`);
  whatsapp.initWhatsApp(io);
});
