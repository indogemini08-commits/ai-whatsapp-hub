/**
 * Format alamat JID WhatsApp agar ramah pengguna:
 * - @s.whatsapp.net -> tampilkan sebagai +62xxx
 * - @lid            -> tampilkan "ID internal WhatsApp" (JANGAN angkanya)
 * - @g.us           -> "Grup"
 *
 * @param {string} jid
 * @returns {string}
 */
export function formatJid(jid) {
  if (!jid || typeof jid !== 'string') return '';

  const clean = jid.trim();

  // 1. WhatsApp Linked ID (@lid)
  if (clean.endsWith('@lid')) {
    return 'ID internal WhatsApp';
  }

  // 2. WhatsApp Group (@g.us)
  if (clean.endsWith('@g.us')) {
    return 'Grup';
  }

  // 3. WhatsApp User (@s.whatsapp.net)
  if (clean.endsWith('@s.whatsapp.net')) {
    const rawNumber = clean.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (rawNumber.startsWith('62')) {
      return `+${rawNumber}`;
    }
    return `+${rawNumber}`;
  }

  // Nomor digit polos tanpa @
  if (/^\d+$/.test(clean)) {
    if (clean.startsWith('62')) {
      return `+${clean}`;
    }
    if (clean.startsWith('0')) {
      return `+62${clean.slice(1)}`;
    }
    return `+${clean}`;
  }

  return clean;
}

/**
 * Mengambil nama tampilan chat yang aman.
 * Jika nama ada dan bukan berupa JID mentah, gunakan nama tersebut.
 * Jika tidak, fallback ke formatJid.
 *
 * @param {Object} chat - Objek chat { id, name, ... }
 * @returns {string}
 */
export function getChatDisplayName(chat) {
  if (!chat) return '';
  const id = chat.id || '';
  const name = chat.name ? chat.name.trim() : '';

  // Validasi apakah nama merupakan JID mentah
  if (name && name !== id && !name.includes('@s.whatsapp.net') && !name.includes('@lid') && !name.includes('@g.us')) {
    return name;
  }

  return formatJid(id);
}
