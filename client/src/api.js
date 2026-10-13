import axios from 'axios';

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('whatsapp_api_url');
    if (saved) return saved;
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
};

export const setApiBaseUrl = (url) => {
  if (typeof window !== 'undefined') {
    if (url) {
      localStorage.setItem('whatsapp_api_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('whatsapp_api_url');
    }
  }
};

export const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  headers: {
    'Content-Type': 'application/json'
  }
});

// Gunakan baseURL dinamis pada setiap request
api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  return config;
});

export const getStatus = async () => {
  const res = await api.get('/api/status');
  return res.data; // { status, user }
};

export const getQr = async () => {
  const res = await api.get('/api/qr');
  return res.data; // { status, qr }
};

export const getChats = async () => {
  const res = await api.get('/api/chats');
  // res.data.chats adalah array chat
  return res.data.chats || [];
};

export const getMessages = async (chatId) => {
  const res = await api.get('/api/messages', {
    params: { chatId }
  });
  return res.data.messages || [];
};

export const sendMessage = async (to, message) => {
  const res = await api.post('/api/send-message', { to, message });
  return res.data; // { success, jid, message }
};

export const deleteChat = async (chatId) => {
  const res = await api.delete(`/api/chats/${encodeURIComponent(chatId)}`);
  return res.data; // { success, chatId }
};

export const clearAllChats = async () => {
  const res = await api.delete('/api/chats');
  return res.data; // { success, message }
};

export const resetSession = async () => {
  const res = await api.post('/api/reset-session');
  return res.data; // { success, status }
};

export const getAiReply = async (message, systemPrompt, model, chatHistory) => {
  const res = await api.post('/api/ai-reply', { message, systemPrompt, model, chatHistory });
  return res.data.reply;
};

export const getAiModel = async () => {
  const res = await api.get('/api/settings/ai-model');
  return res.data.aiModel || 'gemini-1.5-flash';
};

export const saveAiModel = async (aiModel) => {
  const res = await api.post('/api/settings/ai-model', { aiModel });
  return res.data; // { success, aiModel }
};

export const getSystemPrompt = async () => {
  const res = await api.get('/api/settings/system-prompt');
  return res.data.systemPrompt || '';
};

export const saveSystemPrompt = async (systemPrompt) => {
  const res = await api.post('/api/settings/system-prompt', { systemPrompt });
  return res.data; // { success }
};

export const getAutoReply = async () => {
  const res = await api.get('/api/settings/auto-reply');
  return Boolean(res.data.autoReply);
};

export const saveAutoReply = async (autoReply) => {
  const res = await api.post('/api/settings/auto-reply', { autoReply });
  return res.data; // { success, autoReply }
};

// --- HANDOVER & JEDA AI PER NOMOR KONTAK ---

export const getChatAiStatus = async (chatId) => {
  const res = await api.get(`/api/chats/${encodeURIComponent(chatId)}/ai-status`);
  return res.data; // { success, isPaused, handlerRole, handlerName, pausedAt, pauseUntil, remainingMs, needsHandover, handoverReason }
};

export const pauseChatAi = async (chatId, { durationMinutes, handlerRole, handlerName, notes }) => {
  const res = await api.post(`/api/chats/${encodeURIComponent(chatId)}/pause-ai`, {
    durationMinutes,
    handlerRole,
    handlerName,
    notes
  });
  return res.data; // { success, chat, status }
};

export const extendChatAiPause = async (chatId, { addMinutes, durationMinutes, handlerRole, handlerName, notes }) => {
  const res = await api.post(`/api/chats/${encodeURIComponent(chatId)}/extend-pause`, {
    addMinutes,
    durationMinutes,
    handlerRole,
    handlerName,
    notes
  });
  return res.data; // { success, chat, status }
};

export const resumeChatAi = async (chatId, { notes, handlerName } = {}) => {
  const res = await api.post(`/api/chats/${encodeURIComponent(chatId)}/resume-ai`, {
    notes,
    handlerName
  });
  return res.data; // { success, chat, status }
};

export const dismissHandover = async (chatId, { notes } = {}) => {
  const res = await api.post(`/api/chats/${encodeURIComponent(chatId)}/dismiss-handover`, {
    notes
  });
  return res.data; // { success, chat }
};

export const getHandoverLogs = async (chatId) => {
  const res = await api.get(`/api/chats/${encodeURIComponent(chatId)}/handover-logs`);
  return res.data.logs || [];
};

export const getHandoverSettings = async () => {
  const res = await api.get('/api/settings/handover');
  return res.data; // { autoHandoverEnabled, handoverDuration, defaultHandlerName }
};

export const saveHandoverSettings = async (settings) => {
  const res = await api.post('/api/settings/handover', settings);
  return res.data;
};

export default api;

