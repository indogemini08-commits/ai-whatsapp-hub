const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'whatsapp.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT,
    lastMessage TEXT,
    timestamp INTEGER,
    unreadCount INTEGER DEFAULT 0,
    aiPaused INTEGER DEFAULT 0,
    handlerRole TEXT DEFAULT 'ai',
    handlerName TEXT DEFAULT '',
    pausedAt INTEGER DEFAULT NULL,
    pauseUntil INTEGER DEFAULT NULL,
    needsHandover INTEGER DEFAULT 0,
    handoverReason TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chatId TEXT NOT NULL,
    sender TEXT,
    fromMe INTEGER NOT NULL,
    text TEXT,
    timestamp INTEGER,
    status TEXT,
    FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS handover_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId TEXT NOT NULL,
    action TEXT NOT NULL,
    handlerRole TEXT,
    handlerName TEXT,
    durationMinutes INTEGER,
    pausedAt INTEGER,
    pauseUntil INTEGER,
    notes TEXT,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chatId_timestamp ON messages (chatId, timestamp);
  CREATE INDEX IF NOT EXISTS idx_handover_logs_chatId ON handover_logs (chatId, timestamp);
`);

// Pastikan kolom-kolom baru tersedia jika tabel chats sudah ada sebelumnya (migrasi schema)
const chatColumns = db.prepare("PRAGMA table_info(chats)").all();
const hasColumn = (name) => chatColumns.some(col => col.name === name);

if (!hasColumn('aiPaused')) {
  db.exec("ALTER TABLE chats ADD COLUMN aiPaused INTEGER DEFAULT 0");
}
if (!hasColumn('handlerRole')) {
  db.exec("ALTER TABLE chats ADD COLUMN handlerRole TEXT DEFAULT 'ai'");
}
if (!hasColumn('handlerName')) {
  db.exec("ALTER TABLE chats ADD COLUMN handlerName TEXT DEFAULT ''");
}
if (!hasColumn('pausedAt')) {
  db.exec("ALTER TABLE chats ADD COLUMN pausedAt INTEGER DEFAULT NULL");
}
if (!hasColumn('pauseUntil')) {
  db.exec("ALTER TABLE chats ADD COLUMN pauseUntil INTEGER DEFAULT NULL");
}
if (!hasColumn('needsHandover')) {
  db.exec("ALTER TABLE chats ADD COLUMN needsHandover INTEGER DEFAULT 0");
}
if (!hasColumn('handoverReason')) {
  db.exec("ALTER TABLE chats ADD COLUMN handoverReason TEXT DEFAULT ''");
}

/**
 * Cek dan kedaluwarsa status jeda secara otomatis jika durasi habis.
 */
function checkAndExpireChatPause(chat) {
  if (!chat) return null;
  if (chat.aiPaused && chat.pauseUntil && Number(chat.pauseUntil) > 0) {
    const now = Date.now();
    if (now >= Number(chat.pauseUntil)) {
      try {
        db.prepare(`
          UPDATE chats
          SET aiPaused = 0, handlerRole = 'ai', pausedAt = NULL, pauseUntil = NULL, needsHandover = 0
          WHERE id = ?
        `).run(chat.id);

        db.prepare(`
          INSERT INTO handover_logs (chatId, action, handlerRole, handlerName, durationMinutes, pausedAt, pauseUntil, notes, timestamp)
          VALUES (?, 'auto_expired', 'ai', 'Sistem Otomatis', 0, ?, ?, 'Durasi jeda telah habis, AI otomatis kembali aktif', ?)
        `).run(chat.id, chat.pausedAt, chat.pauseUntil, now);
      } catch (err) {
        console.error('[DB] Gagal update auto_expired chat pause:', err.message);
      }

      chat.aiPaused = 0;
      chat.handlerRole = 'ai';
      chat.pausedAt = null;
      chat.pauseUntil = null;
      chat.needsHandover = 0;
    }
  }
  return chat;
}

/**
 * Upsert chat details.
 * If name is undefined or null, existing name will be preserved.
 */
function upsertChat({
  id,
  name = null,
  lastMessage = null,
  timestamp = null,
  unreadCount = null,
  aiPaused = null,
  handlerRole = null,
  handlerName = null,
  pausedAt = null,
  pauseUntil = null,
  needsHandover = null,
  handoverReason = null
}) {
  if (!id) return null;

  const stmt = db.prepare(`
    INSERT INTO chats (id, name, lastMessage, timestamp, unreadCount, aiPaused, handlerRole, handlerName, pausedAt, pauseUntil, needsHandover, handoverReason)
    VALUES (
      @id,
      COALESCE(@name, @id),
      COALESCE(@lastMessage, ''),
      COALESCE(@timestamp, 0),
      COALESCE(@unreadCount, 0),
      COALESCE(@aiPaused, 0),
      COALESCE(@handlerRole, 'ai'),
      COALESCE(@handlerName, ''),
      @pausedAt,
      @pauseUntil,
      COALESCE(@needsHandover, 0),
      COALESCE(@handoverReason, '')
    )
    ON CONFLICT(id) DO UPDATE SET
      name = CASE WHEN @name IS NOT NULL AND @name != '' THEN @name ELSE chats.name END,
      lastMessage = CASE WHEN @lastMessage IS NOT NULL THEN @lastMessage ELSE chats.lastMessage END,
      timestamp = CASE WHEN @timestamp IS NOT NULL THEN @timestamp ELSE chats.timestamp END,
      unreadCount = CASE WHEN @unreadCount IS NOT NULL THEN @unreadCount ELSE chats.unreadCount END,
      aiPaused = CASE WHEN @aiPaused IS NOT NULL THEN @aiPaused ELSE chats.aiPaused END,
      handlerRole = CASE WHEN @handlerRole IS NOT NULL THEN @handlerRole ELSE chats.handlerRole END,
      handlerName = CASE WHEN @handlerName IS NOT NULL THEN @handlerName ELSE chats.handlerName END,
      pausedAt = CASE WHEN @pausedAt IS NOT NULL THEN @pausedAt ELSE chats.pausedAt END,
      pauseUntil = CASE WHEN @pauseUntil IS NOT NULL THEN @pauseUntil ELSE chats.pauseUntil END,
      needsHandover = CASE WHEN @needsHandover IS NOT NULL THEN @needsHandover ELSE chats.needsHandover END,
      handoverReason = CASE WHEN @handoverReason IS NOT NULL THEN @handoverReason ELSE chats.handoverReason END
  `);

  stmt.run({
    id,
    name,
    lastMessage,
    timestamp: timestamp != null ? Number(timestamp) : null,
    unreadCount: unreadCount != null ? Number(unreadCount) : null,
    aiPaused: aiPaused != null ? (aiPaused ? 1 : 0) : null,
    handlerRole: handlerRole != null ? String(handlerRole) : null,
    handlerName: handlerName != null ? String(handlerName) : null,
    pausedAt: pausedAt != null ? Number(pausedAt) : null,
    pauseUntil: pauseUntil != null ? Number(pauseUntil) : null,
    needsHandover: needsHandover != null ? (needsHandover ? 1 : 0) : null,
    handoverReason: handoverReason != null ? String(handoverReason) : null
  });

  return getChatById(id);
}

/**
 * Retrieve a single chat by id.
 */
function getChatById(chatId) {
  if (!chatId) return null;
  const row = db.prepare(`
    SELECT id, name, lastMessage, timestamp, unreadCount,
           aiPaused, handlerRole, handlerName, pausedAt, pauseUntil,
           needsHandover, handoverReason
    FROM chats
    WHERE id = ?
  `).get(chatId);

  if (!row) return null;

  const chat = {
    id: row.id,
    name: row.name || row.id,
    lastMessage: row.lastMessage || '',
    timestamp: Number(row.timestamp) || 0,
    unreadCount: Number(row.unreadCount) || 0,
    aiPaused: Boolean(row.aiPaused),
    handlerRole: row.handlerRole || 'ai',
    handlerName: row.handlerName || '',
    pausedAt: row.pausedAt != null ? Number(row.pausedAt) : null,
    pauseUntil: row.pauseUntil != null ? Number(row.pauseUntil) : null,
    needsHandover: Boolean(row.needsHandover),
    handoverReason: row.handoverReason || ''
  };

  return checkAndExpireChatPause(chat);
}

/**
 * Retrieve all chats ordered by latest timestamp.
 */
function getChats() {
  const rows = db.prepare(`
    SELECT id, name, lastMessage, timestamp, unreadCount,
           aiPaused, handlerRole, handlerName, pausedAt, pauseUntil,
           needsHandover, handoverReason
    FROM chats
    ORDER BY timestamp DESC
  `).all();

  return rows.map(r => {
    const chat = {
      id: r.id,
      name: r.name || r.id,
      lastMessage: r.lastMessage || '',
      timestamp: Number(r.timestamp) || 0,
      unreadCount: Number(r.unreadCount) || 0,
      aiPaused: Boolean(r.aiPaused),
      handlerRole: r.handlerRole || 'ai',
      handlerName: r.handlerName || '',
      pausedAt: r.pausedAt != null ? Number(r.pausedAt) : null,
      pauseUntil: r.pauseUntil != null ? Number(r.pauseUntil) : null,
      needsHandover: Boolean(r.needsHandover),
      handoverReason: r.handoverReason || ''
    };
    return checkAndExpireChatPause(chat);
  });
}

/**
 * Save or update message in database.
 * Foreign key constraints require chat to exist first.
 */
function saveMessage({ id, chatId, sender, fromMe, text, timestamp, status }) {
  if (!id || !chatId) return null;

  const stmt = db.prepare(`
    INSERT INTO messages (id, chatId, sender, fromMe, text, timestamp, status)
    VALUES (@id, @chatId, @sender, @fromMe, @text, @timestamp, @status)
    ON CONFLICT(id) DO UPDATE SET
      chatId = excluded.chatId,
      sender = excluded.sender,
      fromMe = excluded.fromMe,
      text = excluded.text,
      timestamp = excluded.timestamp,
      status = excluded.status
  `);

  const numericTimestamp = Number(timestamp) || Date.now();
  const numericFromMe = fromMe ? 1 : 0;
  const safeStatus = status || 'sent';

  stmt.run({
    id,
    chatId,
    sender: sender || '',
    fromMe: numericFromMe,
    text: text || '',
    timestamp: numericTimestamp,
    status: safeStatus
  });

  return {
    id,
    chatId,
    sender: sender || '',
    fromMe: Boolean(numericFromMe),
    text: text || '',
    timestamp: numericTimestamp,
    status: safeStatus
  };
}

/**
 * Retrieve all messages for a specific chat.
 */
function getMessages(chatId) {
  if (!chatId) return [];
  const rows = db.prepare('SELECT id, chatId, sender, fromMe, text, timestamp, status FROM messages WHERE chatId = ? ORDER BY timestamp ASC').all(chatId);
  return rows.map(r => ({
    id: r.id,
    chatId: r.chatId,
    sender: r.sender,
    fromMe: Boolean(r.fromMe),
    text: r.text,
    timestamp: Number(r.timestamp) || 0,
    status: r.status
  }));
}

/**
 * Ambil nilai pengaturan berdasarkan key.
 */
function getSetting(key, defaultValue = null) {
  if (!key) return defaultValue;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

/**
 * Simpan atau perbarui nilai pengaturan.
 */
function setSetting(key, value) {
  if (!key) return null;
  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(key, value != null ? String(value) : '');
  return value;
}

/**
 * Hapus chat dan semua riwayat pesannya berdasarkan chatId.
 */
function deleteChat(chatId) {
  if (!chatId) return false;
  const deleteMessages = db.prepare('DELETE FROM messages WHERE chatId = ?');
  const deleteChatStmt = db.prepare('DELETE FROM chats WHERE id = ?');
  const transaction = db.transaction(() => {
    deleteMessages.run(chatId);
    deleteChatStmt.run(chatId);
  });
  transaction();
  return true;
}

/**
 * Hapus seluruh chat dan semua riwayat pesan dari database.
 */
function clearAllChats() {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM chats').run();
  });
  transaction();
  return true;
}

/**
 * Jeda auto-reply AI untuk satu nomor percakapan.
 */
function pauseChatAi(chatId, { durationMinutes = null, handlerRole = 'cs', handlerName = '', notes = '' }) {
  if (!chatId) return null;
  const now = Date.now();
  const numDuration = durationMinutes != null ? Number(durationMinutes) : null;
  const pauseUntil = (numDuration && numDuration > 0) ? (now + (numDuration * 60 * 1000)) : null;

  // Pastikan chat sudah tercatat di tabel chats terlebih dahulu
  let chat = getChatById(chatId);
  if (!chat) {
    chat = upsertChat({ id: chatId });
  }

  const stmt = db.prepare(`
    UPDATE chats
    SET aiPaused = 1,
        handlerRole = ?,
        handlerName = ?,
        pausedAt = ?,
        pauseUntil = ?,
        needsHandover = 0,
        handoverReason = ''
    WHERE id = ?
  `);

  stmt.run(handlerRole || 'cs', handlerName || '', now, pauseUntil, chatId);

  // Log audit
  try {
    db.prepare(`
      INSERT INTO handover_logs (chatId, action, handlerRole, handlerName, durationMinutes, pausedAt, pauseUntil, notes, timestamp)
      VALUES (?, 'pause', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      chatId,
      handlerRole || 'cs',
      handlerName || '',
      numDuration && numDuration > 0 ? numDuration : null,
      now,
      pauseUntil,
      notes || `AI dijeda untuk penanganan oleh ${handlerRole === 'ustadz' ? 'Ustadz' : 'CS'}${handlerName ? ` (${handlerName})` : ''}`,
      now
    );
  } catch (err) {
    console.error('[DB] Gagal mencatat handover_log pause:', err.message);
  }

  return getChatById(chatId);
}

/**
 * Perpanjang durasi jeda AI untuk nomor percakapan.
 */
function extendChatAiPause(chatId, { addMinutes = null, durationMinutes = null, handlerRole = null, handlerName = null, notes = '' }) {
  if (!chatId) return null;
  const chat = getChatById(chatId);
  if (!chat) return null;

  const now = Date.now();
  let newPauseUntil = null;

  if (addMinutes && Number(addMinutes) > 0) {
    const base = (chat.pauseUntil && Number(chat.pauseUntil) > now) ? Number(chat.pauseUntil) : now;
    newPauseUntil = base + (Number(addMinutes) * 60 * 1000);
  } else if (durationMinutes != null) {
    const num = Number(durationMinutes);
    newPauseUntil = num > 0 ? (now + (num * 60 * 1000)) : null;
  } else {
    // Default tambah 30 menit
    const base = (chat.pauseUntil && Number(chat.pauseUntil) > now) ? Number(chat.pauseUntil) : now;
    newPauseUntil = base + (30 * 60 * 1000);
  }

  const finalRole = handlerRole || chat.handlerRole || 'cs';
  const finalName = handlerName != null ? handlerName : (chat.handlerName || '');

  const stmt = db.prepare(`
    UPDATE chats
    SET aiPaused = 1,
        handlerRole = ?,
        handlerName = ?,
        pauseUntil = ?
    WHERE id = ?
  `);
  stmt.run(finalRole, finalName, newPauseUntil, chatId);

  // Log audit
  try {
    db.prepare(`
      INSERT INTO handover_logs (chatId, action, handlerRole, handlerName, durationMinutes, pausedAt, pauseUntil, notes, timestamp)
      VALUES (?, 'extend', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      chatId,
      finalRole,
      finalName,
      addMinutes || durationMinutes || null,
      chat.pausedAt || now,
      newPauseUntil,
      notes || `Jeda diperpanjang oleh ${finalRole === 'ustadz' ? 'Ustadz' : 'CS'}${finalName ? ` (${finalName})` : ''}`,
      now
    );
  } catch (err) {
    console.error('[DB] Gagal mencatat handover_log extend:', err.message);
  }

  return getChatById(chatId);
}

/**
 * Aktifkan kembali AI (batalkan jeda).
 */
function resumeChatAi(chatId, { notes = '', handlerName = '' } = {}) {
  if (!chatId) return null;
  const chat = getChatById(chatId);
  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE chats
    SET aiPaused = 0,
        handlerRole = 'ai',
        pausedAt = NULL,
        pauseUntil = NULL,
        needsHandover = 0,
        handoverReason = ''
    WHERE id = ?
  `);
  stmt.run(chatId);

  // Log audit
  try {
    db.prepare(`
      INSERT INTO handover_logs (chatId, action, handlerRole, handlerName, durationMinutes, pausedAt, pauseUntil, notes, timestamp)
      VALUES (?, 'resume', 'ai', ?, 0, NULL, NULL, ?, ?)
    `).run(
      chatId,
      handlerName || (chat ? chat.handlerName : '') || 'Petugas',
      notes || 'AI diaktifkan kembali secara manual oleh petugas',
      now
    );
  } catch (err) {
    console.error('[DB] Gagal mencatat handover_log resume:', err.message);
  }

  return getChatById(chatId);
}

/**
 * Tandai atau bersihkan status rekomendasi pengalihan (Handover Requested).
 */
function setChatHandoverFlag(chatId, { needsHandover, handoverReason = '', roleHint = '' }) {
  if (!chatId) return null;
  const now = Date.now();
  const flag = needsHandover ? 1 : 0;

  let chat = getChatById(chatId);
  if (!chat) {
    chat = upsertChat({ id: chatId });
  }

  const stmt = db.prepare(`
    UPDATE chats
    SET needsHandover = ?,
        handoverReason = ?
    WHERE id = ?
  `);
  stmt.run(flag, handoverReason || '', chatId);

  if (flag === 1) {
    try {
      db.prepare(`
        INSERT INTO handover_logs (chatId, action, handlerRole, handlerName, durationMinutes, pausedAt, pauseUntil, notes, timestamp)
        VALUES (?, 'handover_requested', ?, '', NULL, NULL, NULL, ?, ?)
      `).run(chatId, roleHint || 'cs', handoverReason || 'AI merekomendasikan pengalihan ke CS/Ustadz', now);
    } catch (err) {
      console.error('[DB] Gagal mencatat handover_log handover_requested:', err.message);
    }
  }

  return getChatById(chatId);
}

/**
 * Ambil daftar log audit handover untuk chat tertentu.
 */
function getHandoverLogs(chatId) {
  if (!chatId) return [];
  const rows = db.prepare(`
    SELECT id, chatId, action, handlerRole, handlerName, durationMinutes, pausedAt, pauseUntil, notes, timestamp
    FROM handover_logs
    WHERE chatId = ?
    ORDER BY timestamp DESC
    LIMIT 100
  `).all(chatId);

  return rows.map(r => ({
    id: r.id,
    chatId: r.chatId,
    action: r.action,
    handlerRole: r.handlerRole,
    handlerName: r.handlerName,
    durationMinutes: r.durationMinutes != null ? Number(r.durationMinutes) : null,
    pausedAt: r.pausedAt != null ? Number(r.pausedAt) : null,
    pauseUntil: r.pauseUntil != null ? Number(r.pauseUntil) : null,
    notes: r.notes,
    timestamp: Number(r.timestamp) || 0
  }));
}

/**
 * Cek status terkini AI untuk satu chat tertentu.
 */
function getChatAiStatus(chatId) {
  if (!chatId) return { isPaused: false, status: 'unknown' };
  const chat = getChatById(chatId);
  if (!chat) {
    return {
      chatId,
      isPaused: false,
      handlerRole: 'ai',
      handlerName: '',
      pausedAt: null,
      pauseUntil: null,
      remainingMs: null,
      needsHandover: false,
      handoverReason: ''
    };
  }

  const isPaused = Boolean(chat.aiPaused);
  const remainingMs = (isPaused && chat.pauseUntil) ? Math.max(0, chat.pauseUntil - Date.now()) : null;

  return {
    chatId: chat.id,
    isPaused,
    handlerRole: chat.handlerRole || 'ai',
    handlerName: chat.handlerName || '',
    pausedAt: chat.pausedAt,
    pauseUntil: chat.pauseUntil,
    remainingMs,
    needsHandover: Boolean(chat.needsHandover),
    handoverReason: chat.handoverReason || ''
  };
}

/**
 * Periksa semua chat yang jedanya sudah kedaluwarsa secara berkala.
 * Mengembalikan array chat yang baru saja kedaluwarsa.
 */
function checkAllExpiredPauses() {
  const now = Date.now();
  const expiredRows = db.prepare(`
    SELECT id, name, lastMessage, timestamp, unreadCount,
           aiPaused, handlerRole, handlerName, pausedAt, pauseUntil,
           needsHandover, handoverReason
    FROM chats
    WHERE aiPaused = 1 AND pauseUntil IS NOT NULL AND pauseUntil > 0 AND ? >= pauseUntil
  `).all(now);

  if (expiredRows.length === 0) return [];

  const expiredChats = [];
  const updateStmt = db.prepare(`
    UPDATE chats
    SET aiPaused = 0, handlerRole = 'ai', pausedAt = NULL, pauseUntil = NULL, needsHandover = 0
    WHERE id = ?
  `);
  const logStmt = db.prepare(`
    INSERT INTO handover_logs (chatId, action, handlerRole, handlerName, durationMinutes, pausedAt, pauseUntil, notes, timestamp)
    VALUES (?, 'auto_expired', 'ai', 'Sistem Otomatis', 0, ?, ?, 'Durasi jeda telah habis, AI otomatis kembali aktif', ?)
  `);

  for (const row of expiredRows) {
    try {
      updateStmt.run(row.id);
      logStmt.run(row.id, row.pausedAt, row.pauseUntil, now);

      expiredChats.push({
        ...row,
        aiPaused: false,
        handlerRole: 'ai',
        handlerName: row.handlerName || '',
        pausedAt: null,
        pauseUntil: null,
        needsHandover: false
      });
    } catch (err) {
      console.error(`[DB] Error expiring pause for chat ${row.id}:`, err.message);
    }
  }

  return expiredChats;
}

module.exports = {
  db,
  upsertChat,
  getChatById,
  getChats,
  deleteChat,
  clearAllChats,
  saveMessage,
  getMessages,
  getSetting,
  setSetting,
  pauseChatAi,
  extendChatAiPause,
  resumeChatAi,
  setChatHandoverFlag,
  getHandoverLogs,
  getChatAiStatus,
  checkAllExpiredPauses
};


