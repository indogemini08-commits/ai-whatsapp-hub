/**
 * Menggabungkan pesan masuk dari socket "message" ke dalam daftar pesan sebelumnya.
 *
 * Aturan:
 * - Kalau id sudah ada, kembalikan apa adanya (dedup id)
 * - Kalau message.fromMe dan ada placeholder dengan flag pending yang teksnya sama,
 *   GANTI placeholder itu di tempat (jangan menambah baris baru)
 * - Selain itu, append
 *
 * @param {Array} prevMsgs - Daftar pesan saat ini
 * @param {Object} message - Objek pesan dari socket
 * @returns {Array} Daftar pesan baru
 */
export function mergeIncomingMessage(prevMsgs = [], message) {
  if (!message || !message.id) return prevMsgs;

  // 1. Kalau id sudah ada, kembalikan apa adanya
  const idExists = prevMsgs.some((m) => m.id === message.id);
  if (idExists) {
    return prevMsgs;
  }

  // 2. Kalau message.fromMe dan ada placeholder pending dengan teks yang sama
  if (message.fromMe) {
    const pendingIndex = prevMsgs.findIndex((m) => m.pending && m.text === message.text);
    if (pendingIndex !== -1) {
      const nextMsgs = [...prevMsgs];
      nextMsgs[pendingIndex] = {
        ...message,
        pending: false
      };
      return nextMsgs;
    }
  }

  // 3. Selain itu, append
  return [...prevMsgs, { ...message, pending: false }];
}

/**
 * Menyelesaikan (settle) pesan terkirim setelah respons HTTP POST /api/send-message diterima.
 *
 * Aturan:
 * - Kalau id asli sudah ada (socket mendahului), cukup BUANG placeholder-nya.
 * - Selain itu, ganti placeholder dengan pesan asli.
 *
 * @param {Array} prevMsgs - Daftar pesan saat ini
 * @param {string} tempId - ID sementara (placeholder)
 * @param {Object} saved - Pesan asli yang tersimpan dari server
 * @returns {Array} Daftar pesan baru
 */
export function settleSentMessage(prevMsgs = [], tempId, saved) {
  if (!saved || !saved.id) {
    return prevMsgs.filter((m) => m.id !== tempId);
  }

  // 1. Kalau id asli sudah ada (broadcast socket sudah mendahului), buang placeholder
  const idAlreadyPresent = prevMsgs.some((m) => m.id === saved.id);
  if (idAlreadyPresent) {
    return prevMsgs.filter((m) => m.id !== tempId);
  }

  // 2. Selain itu, ganti placeholder dengan pesan asli
  const tempIndex = prevMsgs.findIndex((m) => m.id === tempId);
  if (tempIndex !== -1) {
    const nextMsgs = [...prevMsgs];
    nextMsgs[tempIndex] = {
      ...saved,
      pending: false
    };
    return nextMsgs;
  }

  // Jika tempId tidak ditemukan tapi id belum ada, append
  return [...prevMsgs, { ...saved, pending: false }];
}
