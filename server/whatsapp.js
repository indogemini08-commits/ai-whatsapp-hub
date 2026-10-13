const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const AUTH_DIR = path.join(__dirname, 'auth_session');

// State management
let sock = null;
let connectionStatus = 'closed'; // 'connecting' | 'qr' | 'connected' | 'closed'
let qrCodeDataUrl = null;
let currentUser = null;
let isConnecting = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let io = null;

/**
 * Bersihkan seluruh isi folder auth_session
 */
function cleanAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    return;
  }
  const files = fs.readdirSync(AUTH_DIR);
  for (const file of files) {
    const filePath = path.join(AUTH_DIR, file);
    try {
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`[WhatsApp] Gagal menghapus file auth '${file}':`, err.message);
    }
  }
}

/**
 * Aturan 5: Cek creds.json saat startup.
 * Jika kosong atau corrupt, hapus seluruh auth_session.
 */
function validateCredsOnStartup() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    return;
  }
  const credsPath = path.join(AUTH_DIR, 'creds.json');
  if (fs.existsSync(credsPath)) {
    let isCorrupt = false;
    try {
      const content = fs.readFileSync(credsPath, 'utf8').trim();
      if (!content) {
        isCorrupt = true;
      } else {
        JSON.parse(content);
      }
    } catch (err) {
      isCorrupt = true;
    }

    if (isCorrupt) {
      console.warn('[WhatsApp] creds.json kosong / corrupt saat startup. Membersihkan auth_session...');
      cleanAuthDir();
    }
  }
}

/**
 * Format nomor tujuan ke format JID WhatsApp.
 * Jika sudah ada '@', kembalikan apa adanya (misal @lid atau @s.whatsapp.net).
 */
function formatToJid(to) {
  if (!to || typeof to !== 'string') return '';
  const trimmed = to.trim();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  let clean = trimmed.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  }
  return `${clean}@s.whatsapp.net`;
}

/**
 * Hitung delay backoff eksponensial (3s s/d 30s)
 */
function getBackoffDelay() {
  const delay = Math.min(3000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  return delay;
}

/**
 * Jadwalkan reconnect dengan timer tunggal
 */
function scheduleReconnect(delayMs = 0) {
  if (reconnectTimer) {
    console.log('[WhatsApp] Reconnect timer sudah tertunda, tidak membuat timer kedua.');
    return;
  }

  const delay = Math.max(0, delayMs);
  console.log(`[WhatsApp] Menjadwalkan reconnect dalam ${delay}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWhatsApp();
  }, delay);
}

/**
 * Broadcast status perubahan ke Socket.IO
 */
function notifyStatus() {
  if (io) {
    io.emit('status', {
      status: connectionStatus,
      qr: qrCodeDataUrl,
      user: currentUser
    });
  }
}

/**
 * Ekstraksi konten teks atau label media dari pesan Baileys
 */
function extractMessageText(message) {
  if (!message) return null;

  let msg = message;
  while (
    msg?.ephemeralMessage?.message ||
    msg?.viewOnceMessage?.message ||
    msg?.viewOnceMessageV2?.message ||
    msg?.documentWithCaptionMessage?.message
  ) {
    msg =
      msg.ephemeralMessage?.message ||
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.documentWithCaptionMessage?.message;
  }

  // Lewati protocol / distribution / reaction
  if (
    msg.protocolMessage ||
    msg.senderKeyDistributionMessage ||
    msg.fastRatchetKeyDistributionMessage ||
    msg.reactionMessage ||
    msg.pollUpdateMessage
  ) {
    return null;
  }

  // Teks standar
  if (typeof msg.conversation === 'string' && msg.conversation.trim()) {
    return msg.conversation.trim();
  }
  if (typeof msg.extendedTextMessage?.text === 'string' && msg.extendedTextMessage.text.trim()) {
    return msg.extendedTextMessage.text.trim();
  }

  // Media
  if (msg.imageMessage) {
    return msg.imageMessage.caption && msg.imageMessage.caption.trim()
      ? msg.imageMessage.caption.trim()
      : '[Gambar]';
  }
  if (msg.videoMessage) {
    return msg.videoMessage.caption && msg.videoMessage.caption.trim()
      ? msg.videoMessage.caption.trim()
      : '[Video]';
  }
  if (msg.audioMessage) {
    return '[Audio]';
  }
  if (msg.documentMessage) {
    return msg.documentMessage.caption && msg.documentMessage.caption.trim()
      ? msg.documentMessage.caption.trim()
      : (msg.documentMessage.fileName || '[Dokumen]');
  }
  if (msg.stickerMessage) {
    return '[Stiker]';
  }

  // Kontak & Lokasi
  if (msg.locationMessage) {
    return '[Lokasi]';
  }
  if (msg.contactMessage) {
    return `[Kontak: ${msg.contactMessage.displayName || ''}]`;
  }
  if (msg.contactsArrayMessage) {
    return '[Daftar Kontak]';
  }

  return null;
}

/**
 * Deteksi apakah balasan AI menyarankan pengalihan percakapan ke CS / Ustadz
 */
function detectHandoverRecommendation(replyText) {
  if (!replyText || typeof replyText !== 'string') return null;
  const text = replyText.toLowerCase();

  const keywords = [
    'hubungkan langsung dengan ustadz',
    'hubungkan dengan ustadz',
    'hubungkan langsung ke ustadz',
    'hubungkan langsung dengan cs',
    'hubungkan dengan cs',
    'hubungkan ke customer service',
    'hubungkan dengan ustadz dimas',
    'alihkan ke ustadz',
    'arahkan ke ustadz',
    'alihkan ke cs',
    'arahkan ke cs',
    'tanya langsung kepada ustadz',
    'tanya kepada ustadz',
    'ustadz terkait',
    'penjelasan langsung dari ustadz',
    'customer service kami',
    'admin kami',
    'petugas kami',
    'pihak yang berwenang',
    'panitia psb',
    'bagian administrasi'
  ];

  for (const kw of keywords) {
    if (text.includes(kw)) {
      return {
        roleHint: 'cs',
        reason: 'AI mengarahkan pelanggan kepada CS / Ustadz'
      };
    }
  }

  if (/(hubungkan|alihkan|arahkan|sambungkan).*(ustadz|ustaz|cs|customer service|admin|petugas|panitia)/i.test(replyText)) {
    return {
      roleHint: 'cs',
      reason: 'AI mengarahkan pelanggan kepada CS / Ustadz'
    };
  }

  return null;
}

/**
 * Inisialisasi koneksi Baileys
 */
async function connectToWhatsApp() {
  if (isConnecting) {
    console.log('[WhatsApp] Proses connect sedang berjalan, melewati panggilan ganda.');
    return;
  }

  isConnecting = true;
  connectionStatus = 'connecting';
  notifyStatus();

  try {
    // Aturan 1: Matikan socket lama sebelum membuat yang baru
    if (sock) {
      console.log('[WhatsApp] Mematikan socket lama...');
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch (err) {
        console.error('[WhatsApp] Error saat menutup socket lama:', err);
      }
      sock = null;
    }

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Aturan 7: Jangan pakai printQRInTerminal
    const socket = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' })
    });

    sock = socket;
    const currentSocket = socket;

    // Listener credentials update
    socket.ev.on('creds.update', async () => {
      // Aturan 6: Periksa apakah socket masih aktif
      if (sock !== currentSocket) return;
      await saveCreds();
    });

    // Listener status koneksi
    socket.ev.on('connection.update', async (update) => {
      // Aturan 6: Periksa apakah socket masih aktif
      if (sock !== currentSocket) return;

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr);
          connectionStatus = 'qr';
          console.log('[WhatsApp] QR code baru siap di-scan.');
          notifyStatus();
        } catch (err) {
          console.error('[WhatsApp] Gagal membuat data URL QR code:', err);
        }
      }

      if (connection === 'connecting') {
        connectionStatus = 'connecting';
        notifyStatus();
      }

      if (connection === 'open') {
        console.log('[WhatsApp] Terhubung ke WhatsApp!');
        connectionStatus = 'connected';
        qrCodeDataUrl = null;
        reconnectAttempts = 0; // Aturan 3: Reset backoff ke 0 saat "open"
        currentUser = {
          id: socket.user?.id || '',
          name: socket.user?.name || socket.user?.notify || ''
        };
        notifyStatus();
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`[WhatsApp] Koneksi ditutup dengan status code: ${statusCode}`);

        connectionStatus = 'closed';
        qrCodeDataUrl = null;
        currentUser = null;
        notifyStatus();

        // Bersihkan socket saat ini
        if (sock === currentSocket) {
          try {
            socket.ev.removeAllListeners();
            socket.end(undefined);
          } catch (e) {}
          sock = null;
        }

        // Aturan 4: Tangani statusCode penutupan SATU PER SATU
        if (statusCode === DisconnectReason.restartRequired) { // 515
          console.log('[WhatsApp] 515 restartRequired: Normal setelah scan QR, reconnect segera...');
          scheduleReconnect(0);
        } else if (statusCode === DisconnectReason.connectionReplaced) { // 440
          console.warn('[WhatsApp] 440 connectionReplaced: Sesi diambil alih client lain. JANGAN reconnect.');
          // Tidak melakukan reconnect
        } else if (statusCode === DisconnectReason.loggedOut) { // 401
          console.warn('[WhatsApp] 401 loggedOut: Sesi logout. Membersihkan auth_session dan reconnect...');
          cleanAuthDir();
          scheduleReconnect(500);
        } else {
          // Lainnya: Reconnect dengan backoff
          const delay = getBackoffDelay();
          console.log(`[WhatsApp] Terputus (kode ${statusCode}). Reconnect dalam ${delay}ms...`);
          scheduleReconnect(delay);
        }
      }
    });

    // Listener pesan masuk / keluar
    socket.ev.on('messages.upsert', async ({ messages: newMessages }) => {
      // Aturan 6: Periksa apakah socket masih aktif
      if (sock !== currentSocket) return;
      if (!Array.isArray(newMessages)) return;

      for (const msg of newMessages) {
        try {
          const chatId = msg.key?.remoteJid;
          if (!chatId) continue;

          // Lewati newsletter, broadcast, status@broadcast
          if (
            chatId.endsWith('@newsletter') ||
            chatId.endsWith('@broadcast') ||
            chatId === 'status@broadcast'
          ) {
            continue;
          }

          // Ekstraksi teks displayable
          const text = extractMessageText(msg.message);
          if (!text) {
            continue; // Lewati pesan tanpa isi displayable
          }

          const fromMe = Boolean(msg.key?.fromMe);
          const sender = fromMe
            ? (socket.user?.id || 'me')
            : (msg.key?.participant || chatId);

          // Ambil nama kontak dari pushName HANYA untuk pesan masuk (!fromMe)
          const contactName = (!fromMe && msg.pushName) ? msg.pushName : null;

          let timestamp = Date.now();
          if (msg.messageTimestamp) {
            const ts = typeof msg.messageTimestamp === 'object' && msg.messageTimestamp.low != null
              ? msg.messageTimestamp.low
              : Number(msg.messageTimestamp);
            timestamp = ts > 10000000000 ? ts : ts * 1000;
          }

          // Panggil upsertChat SEBELUM saveMessage (Foreign Key constraint)
          const savedChat = db.upsertChat({
            id: chatId,
            name: contactName,
            lastMessage: text,
            timestamp: timestamp
          });

          const savedMsg = db.saveMessage({
            id: msg.key?.id || `${Date.now()}_${Math.random()}`,
            chatId: chatId,
            sender: sender,
            fromMe: fromMe,
            text: text,
            timestamp: timestamp,
            status: fromMe ? 'sent' : 'received'
          });

          // Broadcast ke Socket.IO
          if (io) {
            io.emit('message', {
              message: savedMsg,
              chat: savedChat || db.getChatById(chatId)
            });
          }

          // Fitur Balas Otomatis (Auto-Reply AI) jika aktif dan pesan masuk dari orang lain
          if (!fromMe) {
            const isAutoReplyActive = db.getSetting('autoReply') === 'true';

            // 1. Cek status jeda AI untuk nomor ini SEBELUM proses balasan
            const aiStatusBefore = db.getChatAiStatus(chatId);
            if (aiStatusBefore.isPaused) {
              const roleText = aiStatusBefore.handlerRole === 'ustadz' ? 'Ditangani Ustadz' : 'Ditangani CS';
              console.log(`[Auto-Reply] Dilewati untuk ${chatId}: AI sedang dijeda (${roleText}${aiStatusBefore.handlerName ? ` - ${aiStatusBefore.handlerName}` : ''})`);
            } else if (isAutoReplyActive) {
              (async () => {
                try {
                  console.log(`[Auto-Reply] Menyusun jawaban AI otomatis untuk ${chatId}...`);
                  try {
                    await socket.sendPresenceUpdate('composing', chatId);
                  } catch (_) {}

                  const ai = require('./ai');
                  const history = db.getMessages(chatId);
                  const aiReply = await ai.generateAiReply(text, null, null, history);

                  try {
                    await socket.sendPresenceUpdate('paused', chatId);
                  } catch (_) {}

                  // 2. SKENARIO E: Periksa status TERAKHIR tepat sebelum pesan AI dikirim!
                  // Mencegah balasan AI terkirim jika CS/Ustadz baru saja mengambil alih percakapan saat AI sedang berpikir
                  const aiStatusFinal = db.getChatAiStatus(chatId);
                  if (aiStatusFinal.isPaused) {
                    console.log(`[Auto-Reply] DIBATALKAN untuk ${chatId}: Percakapan telah diambil alih oleh CS / Ustadz (${aiStatusFinal.handlerName || 'Petugas'}) saat AI sedang menyusun balasan.`);
                    return;
                  }

                  if (aiReply) {
                    await sendMessage(chatId, aiReply);
                    console.log(`[Auto-Reply] Berhasil mengirim jawaban AI ke ${chatId}`);

                    // 3. Deteksi apakah AI merekomendasikan pengalihan ke CS / Ustadz
                    const handoverInfo = detectHandoverRecommendation(aiReply);
                    if (handoverInfo) {
                      console.log(`[Auto-Reply] AI merekomendasikan pengalihan untuk ${chatId}: ${handoverInfo.reason}`);

                      const autoHandoverEnabled = db.getSetting('autoHandoverEnabled', 'true') === 'true';
                      if (autoHandoverEnabled) {
                        const defaultDurationSetting = db.getSetting('handoverDuration', '60');
                        const durationMinutes = (defaultDurationSetting === 'manual' || defaultDurationSetting === 'null')
                          ? null
                          : (parseInt(defaultDurationSetting, 10) || 60);
                        const defaultHandlerName = db.getSetting('defaultHandlerName', 'CS / Ustadz');

                        console.log(`[Auto-Reply] Mengaktifkan jeda AI OTOMATIS untuk ${chatId} selama ${durationMinutes ? `${durationMinutes} menit` : 'manual'}...`);

                        const updatedChat = db.pauseChatAi(chatId, {
                          durationMinutes,
                          handlerRole: 'cs',
                          handlerName: defaultHandlerName,
                          notes: `Pengalihan otomatis oleh AI: ${handoverInfo.reason}`
                        });

                        const status = db.getChatAiStatus(chatId);

                        if (io) {
                          io.emit('chat_ai_status_changed', {
                            chatId,
                            chat: updatedChat,
                            ...status
                          });
                          io.emit('chat_updated', { chat: updatedChat });
                        }
                      } else {
                        // Jika mode otomatis dinonaktifkan, set flag rekomendasi saja
                        const updatedChat = db.setChatHandoverFlag(chatId, {
                          needsHandover: true,
                          handoverReason: handoverInfo.reason,
                          roleHint: 'cs'
                        });
                        if (io) {
                          io.emit('chat_handover_recommended', {
                            chatId,
                            chat: updatedChat,
                            roleHint: 'cs',
                            reason: handoverInfo.reason
                          });
                          io.emit('chat_updated', { chat: updatedChat });
                        }
                      }
                    }
                  }
                } catch (errReply) {
                  console.error(`[Auto-Reply] Gagal mengirim balasan otomatis ke ${chatId}:`, errReply.message);
                }
              })();
            }
          }
        } catch (msgErr) {
          console.error('[WhatsApp] Gagal memproses pesan:', msgErr);
        }
      }
    });
  } catch (err) {
    console.error('[WhatsApp] Kesalahan saat inisialisasi koneksi:', err);
    connectionStatus = 'closed';
    notifyStatus();
    scheduleReconnect(getBackoffDelay());
  } finally {
    isConnecting = false;
  }
}

/**
 * Kirim pesan teks ke WhatsApp
 */
async function sendMessage(to, message) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp belum terhubung');
  }

  const jid = formatToJid(to);
  if (!jid) {
    throw new Error('Nomor tujuan tidak valid');
  }

  const result = await sock.sendMessage(jid, { text: message });
  const msgId = result?.key?.id || `${Date.now()}_${Math.random()}`;
  const timestamp = Date.now();

  // Saat kirim pesan, JANGAN kirim field name ke upsertChat agar nama kontak tidak tertimpa
  const savedChat = db.upsertChat({
    id: jid,
    name: null,
    lastMessage: message,
    timestamp: timestamp
  });

  const savedMsg = db.saveMessage({
    id: msgId,
    chatId: jid,
    sender: sock.user?.id || 'me',
    fromMe: true,
    text: message,
    timestamp: timestamp,
    status: 'sent'
  });

  if (io) {
    io.emit('message', {
      message: savedMsg,
      chat: savedChat || db.getChatById(jid)
    });
  }

  return {
    jid,
    message: savedMsg
  };
}

/**
 * Reset sesi WhatsApp
 */
async function resetSession() {
  console.log('[WhatsApp] Mereset sesi...');
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    } catch (e) {
      console.error('[WhatsApp] Error saat menutup socket saat reset:', e);
    }
    sock = null;
  }

  cleanAuthDir();
  reconnectAttempts = 0;
  connectionStatus = 'connecting';
  qrCodeDataUrl = null;
  currentUser = null;
  notifyStatus();

  // Buat sesi baru segera
  scheduleReconnect(100);

  return {
    status: connectionStatus
  };
}

/**
 * Getter status
 */
function getStatus() {
  return {
    status: connectionStatus,
    user: currentUser
  };
}

/**
 * Getter QR
 */
function getQr() {
  return {
    status: connectionStatus,
    qr: qrCodeDataUrl
  };
}

let expiryTimer = null;

/**
 * Timer background untuk memeriksa dan mengaktifkan kembali chat yang jedanya telah kedaluwarsa
 */
function startHandoverExpiryTimer() {
  if (expiryTimer) return;
  expiryTimer = setInterval(() => {
    try {
      const expiredChats = db.checkAllExpiredPauses();
      if (expiredChats && expiredChats.length > 0 && io) {
        for (const chat of expiredChats) {
          console.log(`[Handover] Jeda AI untuk nomor ${chat.id} telah kedaluwarsa. AI otomatis aktif kembali.`);
          io.emit('chat_ai_status_changed', {
            chatId: chat.id,
            chat,
            isPaused: false,
            handlerRole: 'ai',
            handlerName: '',
            pausedAt: null,
            pauseUntil: null,
            remainingMs: null,
            needsHandover: false,
            handoverReason: ''
          });
          io.emit('chat_updated', { chat });
        }
      }
    } catch (err) {
      console.error('[Handover Timer] Error checking expired pauses:', err.message);
    }
  }, 10000);
}

/**
 * Getter Socket.IO instance
 */
function getIo() {
  return io;
}

/**
 * Inisialisasi awal modul WhatsApp
 */
function initWhatsApp(socketIo) {
  io = socketIo;
  validateCredsOnStartup();
  connectToWhatsApp();
  startHandoverExpiryTimer();
}

module.exports = {
  initWhatsApp,
  connectToWhatsApp,
  getStatus,
  getQr,
  sendMessage,
  resetSession,
  formatToJid,
  getIo
};
