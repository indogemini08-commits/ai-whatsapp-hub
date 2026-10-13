const { GoogleAuth } = require('google-auth-library');
const db = require('./db');

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

/**
 * Mendapatkan system prompt dengan urutan prioritas:
 * 1. customPrompt (dari body request) jika ada dan tidak kosong
 * 2. systemPrompt yang tersimpan di database SQLite (tabel settings)
 * 3. Default: "You are a helpful assistant."
 */
function resolveSystemPrompt(customPrompt) {
  if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim()) {
    return customPrompt.trim();
  }
  const saved = db.getSetting('systemPrompt');
  if (saved && typeof saved === 'string' && saved.trim()) {
    return saved.trim();
  }
  return DEFAULT_SYSTEM_PROMPT;
}

/**
 * Mendapatkan model AI dengan urutan prioritas:
 * 1. customModel jika dikirim langsung
 * 2. aiModel yang tersimpan di database SQLite (tabel settings)
 * 3. process.env.GEMINI_MODEL jika diset
 * 4. Default: "gemini-1.5-flash"
 */
function resolveAiModel(customModel) {
  if (customModel && typeof customModel === 'string' && customModel.trim()) {
    return customModel.trim();
  }
  const saved = db.getSetting('aiModel');
  if (saved && typeof saved === 'string' && saved.trim()) {
    return saved.trim();
  }
  return process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
}

/**
 * Validasi dan parse kredensial GCP_SERVICE_ACCOUNT jika ada
 */
function getGcpCredentials() {
  const saEnv = process.env.GCP_SERVICE_ACCOUNT;
  if (!saEnv || !saEnv.trim()) return null;

  try {
    const credentials = JSON.parse(saEnv.trim());
    if (credentials.project_id && credentials.client_email && credentials.private_key) {
      return credentials;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Membangun array contents untuk Gemini API dengan dukungan:
 * 1. Multi-turn chat history (user & model bergantian)
 * 2. Analisis jeda waktu (sesi aktif <24 jam vs sesi baru >=24 jam)
 * 3. Catatan sistem konteks untuk memandu AI secara real-time
 */
function buildGeminiContents(message, chatHistory = []) {
  const cleanMessage = (message || '').trim();
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
    return [
      {
        role: 'user',
        parts: [{ text: cleanMessage }]
      }
    ];
  }

  // Ambil hingga 12 pesan terakhir yang memiliki teks valid
  const validMessages = chatHistory
    .filter(m => m && m.text && typeof m.text === 'string' && m.text.trim())
    .slice(-12);

  if (validMessages.length === 0) {
    return [
      {
        role: 'user',
        parts: [{ text: cleanMessage }]
      }
    ];
  }

  // Hitung selisih waktu antara pesan sekarang dan pesan sebelumnya (jika ada)
  const now = Date.now();
  let sessionContextNote = '';
  const previousMessages = validMessages.filter(m => m.text.trim() !== cleanMessage);
  const lastPrevMsg = previousMessages.length > 0 ? previousMessages[previousMessages.length - 1] : null;

  if (lastPrevMsg && lastPrevMsg.timestamp) {
    const elapsedMs = now - Number(lastPrevMsg.timestamp);
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    if (elapsedHours >= 24) {
      sessionContextNote = `[SISTEM: Sesi baru. Jeda sejak pesan terakhir sudah ${Math.round(elapsedHours)} jam (>= 24 jam). Silakan berikan salam pembuka dan sapaan wajar.]\n`;
    } else {
      const elapsedMinutes = Math.max(1, Math.round(elapsedMs / (1000 * 60)));
      sessionContextNote = `[SISTEM: Percakapan sedang berlangsung aktif (pesan terakhir ${elapsedMinutes} menit lalu, < 24 jam). Sesuai aturan: JANGAN mengulang salam pembuka/perkenalan. Langsung jawab inti pesan pengguna secara santun dan to-the-point.]\n`;
    }
  }

  const turns = [];

  for (const m of validMessages) {
    const role = m.fromMe ? 'model' : 'user';
    const text = m.text.trim();

    // Gabungkan jika pesan berurutan memiliki role yang sama agar API Gemini tidak error
    if (turns.length > 0 && turns[turns.length - 1].role === role) {
      turns[turns.length - 1].parts[0].text += `\n${text}`;
    } else {
      turns.push({
        role,
        parts: [{ text }]
      });
    }
  }

  // Gemini mengharuskan pesan pertama selalu bertipe 'user'
  while (turns.length > 0 && turns[0].role !== 'user') {
    turns.shift();
  }

  // Pastikan pesan terakhir adalah turn 'user' yang berisi cleanMessage
  if (turns.length === 0) {
    turns.push({
      role: 'user',
      parts: [{ text: `${sessionContextNote}${cleanMessage}` }]
    });
  } else {
    const lastTurn = turns[turns.length - 1];
    if (lastTurn.role === 'model') {
      turns.push({
        role: 'user',
        parts: [{ text: `${sessionContextNote}${cleanMessage}` }]
      });
    } else {
      // Jika lastTurn bertipe user, pastikan cleanMessage tidak tertinggal
      if (!lastTurn.parts[0].text.includes(cleanMessage)) {
        lastTurn.parts[0].text += `\n${cleanMessage}`;
      }
      if (sessionContextNote && !lastTurn.parts[0].text.includes('[SISTEM:')) {
        lastTurn.parts[0].text = `${sessionContextNote}${lastTurn.parts[0].text}`;
      }
    }
  }

  return turns;
}

/**
 * Panggil Gemini via Google AI Studio API Key (Paling mudah & gratis)
 * Menggunakan model yang dipilih user dengan fallback
 */
async function callGoogleAiStudio(apiKey, message, systemPrompt, modelOverride, chatHistory) {
  const primaryModel = resolveAiModel(modelOverride);
  // Urutan prioritas: model terpilih diutamakan, lalu fallback stabil aktif berkuota tinggi
  const candidateModels = [
    primaryModel,
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-2.5-flash'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let lastError = null;
  const contents = buildGeminiContents(message, chatHistory);

  for (const model of candidateModels) {
    const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const requestBody = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.25, // Presisi tinggi, patuh aturan instruksi & fakta pengetahuan
        topP: 0.85,
        maxOutputTokens: 2000
      }
    };

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim()
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(25000)
      });

      if (response.ok) {
        return await response.json();
      }

      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.error?.message) {
          errorDetail = errJson.error.message;
        }
      } catch (_) {}

      console.warn(`[AI] Model ${model} gagal (${errorDetail.slice(0, 100)}...), mencoba model cadangan...`);
      lastError = new Error(`Google AI Studio error (${model}): ${errorDetail}`);
    } catch (netErr) {
      console.warn(`[AI] Network error pada model ${model}:`, netErr.message);
      lastError = netErr;
    }
  }

  throw lastError || new Error('Semua model Gemini gagal merespons');
}

/**
 * Panggil Gemini via Vertex AI GCP (Service Account)
 */
async function callVertexAi(credentials, message, systemPrompt, modelOverride, chatHistory) {
  const projectId = credentials.project_id;
  const model = resolveAiModel(modelOverride);

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

  if (!accessToken) {
    throw new Error('Gagal mendapatkan access token dari Google Cloud');
  }

  const endpointUrl = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${model}:generateContent`;
  const contents = buildGeminiContents(message, chatHistory);

  const requestBody = {
    contents: contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.25,
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 2000
    }
  };

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch (_) {}
    throw new Error(`Vertex AI error: ${errorDetail}`);
  }

  return response.json();
}

/**
 * Generate balasan AI
 * Mendukung 2 mode autentikasi:
 * 1. GEMINI_API_KEY (Google AI Studio - 1 baris string biasa)
 * 2. GCP_SERVICE_ACCOUNT (Vertex AI - JSON Service Account)
 */
async function generateAiReply(message, systemPrompt, modelOverride, chatHistory) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Pesan (message) wajib diisi');
  }

  const effectiveSystemPrompt = resolveSystemPrompt(systemPrompt);
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const gcpCredentials = getGcpCredentials();

  let data = null;

  if (geminiApiKey && geminiApiKey.trim()) {
    // Mode 1: Google AI Studio (Cukup 1 baris API Key)
    data = await callGoogleAiStudio(geminiApiKey, message, effectiveSystemPrompt, modelOverride, chatHistory);
  } else if (gcpCredentials) {
    // Mode 2: Vertex AI GCP
    data = await callVertexAi(gcpCredentials, message, effectiveSystemPrompt, modelOverride, chatHistory);
  } else {
    throw new Error(
      'Kredensial AI belum dikonfigurasi di file .env. Silakan tambahkan GEMINI_API_KEY=AIzaSy... (Google AI Studio) atau GCP_SERVICE_ACCOUNT={...} (Vertex AI).'
    );
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('Tidak ada respon yang dihasilkan dari model AI');
  }

  // Filter parts: buang thought === true, pastikan part.text bertipe string
  const parts = candidate.content?.parts || [];
  const validTexts = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text);

  const reply = validTexts.join('').trim();

  if (!reply && candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Response terpotong karena mencapai batas token tanpa menghasilkan teks');
  }

  if (!reply) {
    throw new Error('Model AI mengembalikan respon kosong');
  }

  return reply;
}

module.exports = {
  generateAiReply,
  resolveSystemPrompt,
  resolveAiModel
};
