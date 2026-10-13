import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  getStatus,
  getQr,
  getChats,
  getMessages,
  sendMessage,
  deleteChat,
  clearAllChats,
  resetSession,
  getAutoReply,
  API_BASE_URL
} from './api';
import { mergeIncomingMessage, settleSentMessage } from './utils/messages';
import { getChatDisplayName } from './utils/jid';
import Header from './components/Header';
import ChatList from './components/ChatList';
import ChatThread from './components/ChatThread';
import QRScreen from './components/QRScreen';
import ConfirmModal from './components/ConfirmModal';
import NewChatModal from './components/NewChatModal';
import AiSettingsModal from './components/AiSettingsModal';

export default function App() {
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'qr' | 'connected' | 'closed'
  const [qr, setQr] = useState(null);
  const [user, setUser] = useState(null);

  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [autoReply, setAutoReply] = useState(false);

  // State untuk menghapus chat / bersihkan daftar pesan
  const [chatToDelete, setChatToDelete] = useState(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  // Ref untuk chat aktif agar event socket selalu tahu chat mana yang sedang terbuka
  const selectedChatRef = useRef(null);
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // 1. Inisialisasi status awal & socket
  useEffect(() => {
    let socketInstance = null;

    const initConnection = async () => {
      try {
        const [statusRes, autoReplyRes] = await Promise.all([
          getStatus(),
          getAutoReply().catch(() => false)
        ]);

        setStatus(statusRes.status);
        setUser(statusRes.user);
        setAutoReply(Boolean(autoReplyRes));

        if (statusRes.status !== 'connected') {
          const qrRes = await getQr();
          setQr(qrRes.qr);
        } else {
          loadChats();
        }
      } catch (err) {
        console.error('Gagal mengambil status awal:', err);
      }
    };

    initConnection();

    // Setup Socket.IO
    socketInstance = io(API_BASE_URL, {
      transports: ['websocket', 'polling']
    });

    socketInstance.on('status', ({ status: newStatus, qr: newQr, user: newUser }) => {
      setStatus(newStatus);
      setQr(newQr);
      setUser(newUser);

      if (newStatus === 'connected') {
        loadChats();
      }
    });

    socketInstance.on('message', ({ message, chat }) => {
      // 1. Update daftar chat di sidebar
      setChats((prevChats) => {
        const chatExistsIndex = prevChats.findIndex((c) => c.id === message.chatId);
        const updatedChatObj = chat || {
          id: message.chatId,
          lastMessage: message.text,
          timestamp: message.timestamp,
          unreadCount: 0
        };

        if (chatExistsIndex !== -1) {
          const updated = [...prevChats];
          const isCurrentActive = selectedChatRef.current?.id === message.chatId;

          updated[chatExistsIndex] = {
            ...updated[chatExistsIndex],
            lastMessage: message.text,
            timestamp: message.timestamp,
            unreadCount: isCurrentActive || message.fromMe
              ? 0
              : (updated[chatExistsIndex].unreadCount || 0) + 1
          };

          // Pindahkan chat yang baru menerima pesan ke posisi teratas
          const [moved] = updated.splice(chatExistsIndex, 1);
          return [moved, ...updated];
        } else {
          // Chat baru
          return [updatedChatObj, ...prevChats];
        }
      });

      // 2. Jika pesan ditujukan untuk thread yang sedang terbuka, merge ke daftar messages
      if (selectedChatRef.current?.id === message.chatId) {
        setMessages((prevMsgs) => mergeIncomingMessage(prevMsgs, message));
      }
    });

    // 3. Tangani event saat chat dihapus dari client / server
    socketInstance.on('chat_deleted', ({ chatId }) => {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (selectedChatRef.current?.id === chatId) {
        setSelectedChat(null);
        setMessages([]);
      }
    });

    // 4. Tangani event saat semua chat dibersihkan
    socketInstance.on('chats_cleared', () => {
      setChats([]);
      setSelectedChat(null);
      setMessages([]);
    });

    // 5. Tangani event perubahan status jeda AI / Handover
    socketInstance.on('chat_ai_status_changed', (payload) => {
      const { chatId, chat } = payload;
      setChats((prevChats) =>
        prevChats.map((c) => {
          if (c.id === chatId) {
            return chat ? { ...c, ...chat } : {
              ...c,
              aiPaused: payload.isPaused,
              handlerRole: payload.handlerRole,
              handlerName: payload.handlerName,
              pausedAt: payload.pausedAt,
              pauseUntil: payload.pauseUntil,
              needsHandover: payload.needsHandover,
              handoverReason: payload.handoverReason
            };
          }
          return c;
        })
      );

      setSelectedChat((current) => {
        if (current?.id === chatId) {
          return chat ? { ...current, ...chat } : {
            ...current,
            aiPaused: payload.isPaused,
            handlerRole: payload.handlerRole,
            handlerName: payload.handlerName,
            pausedAt: payload.pausedAt,
            pauseUntil: payload.pauseUntil,
            needsHandover: payload.needsHandover,
            handoverReason: payload.handoverReason
          };
        }
        return current;
      });
    });

    // 6. Tangani event saat chat diperbarui (misal handover flag diset/cleared)
    socketInstance.on('chat_updated', ({ chat }) => {
      if (!chat) return;
      setChats((prevChats) =>
        prevChats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))
      );
      setSelectedChat((current) => (current?.id === chat.id ? { ...current, ...chat } : current));
    });

    // 7. Tangani event rekomendasi handover dari AI
    socketInstance.on('chat_handover_recommended', ({ chatId, chat }) => {
      if (chat) {
        setChats((prevChats) =>
          prevChats.map((c) => (c.id === chatId ? { ...c, ...chat } : c))
        );
        setSelectedChat((current) => (current?.id === chatId ? { ...current, ...chat } : current));
      }
    });

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);

  // 2. Muat daftar chat
  const loadChats = async () => {
    try {
      const chatList = await getChats();
      setChats(chatList);
    } catch (err) {
      console.error('Gagal mengambil daftar chat:', err);
    }
  };

  // 3. Muat riwayat pesan saat memilih chat
  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    try {
      const msgList = await getMessages(chat.id);
      setMessages(msgList);

      // Reset unread count di UI
      setChats((prevChats) =>
        prevChats.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Gagal mengambil pesan untuk chat:', chat.id, err);
    }
  };

  // 4. Kirim pesan dengan Optimistic Update
  const handleSendMessage = async (text) => {
    if (!selectedChat) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tempMsg = {
      id: tempId,
      chatId: selectedChat.id,
      sender: user?.id || 'me',
      fromMe: true,
      text,
      timestamp: Date.now(),
      pending: true
    };

    // Optimistic update 1: Tambahkan placeholder langsung ke thread pesan
    setMessages((prev) => [...prev, tempMsg]);

    // Optimistic update 2: Perbarui lastMessage di sidebar dan bawa ke urutan teratas
    setChats((prevChats) => {
      const idx = prevChats.findIndex((c) => c.id === selectedChat.id);
      if (idx !== -1) {
        const copy = [...prevChats];
        copy[idx] = {
          ...copy[idx],
          lastMessage: text,
          timestamp: Date.now()
        };
        const [target] = copy.splice(idx, 1);
        return [target, ...copy];
      }
      return prevChats;
    });

    try {
      const res = await sendMessage(selectedChat.id, text);
      if (res.success && res.message) {
        // Settle pesan yang terkirim
        setMessages((prev) => settleSentMessage(prev, tempId, res.message));
      }
    } catch (err) {
      console.error('Gagal mengirim pesan:', err);
      // Hapus placeholder jika pengiriman gagal
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert(`Gagal mengirim pesan: ${err.response?.data?.error || err.message}`);
    }
  };

  // 5. Logout / Reset sesi WhatsApp
  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await resetSession();
      setSelectedChat(null);
      setMessages([]);
      setChats([]);
      setStatus('connecting');
      setUser(null);
      setIsLogoutModalOpen(false);
    } catch (err) {
      console.error('Gagal mereset sesi:', err);
      alert('Gagal mereset sesi. Silakan coba lagi.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // 6. Hapus satu percakapan
  const handleRequestDeleteChat = (chat) => {
    setChatToDelete(chat);
  };

  const handleConfirmDeleteChat = async () => {
    if (!chatToDelete) return;
    setIsDeletingChat(true);
    try {
      await deleteChat(chatToDelete.id);
      setChats((prev) => prev.filter((c) => c.id !== chatToDelete.id));
      if (selectedChat?.id === chatToDelete.id) {
        setSelectedChat(null);
        setMessages([]);
      }
      setChatToDelete(null);
    } catch (err) {
      console.error('Gagal menghapus percakapan:', err);
      alert(`Gagal menghapus percakapan: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsDeletingChat(false);
    }
  };

  // 7. Hapus SEMUA percakapan & bersihkan pesan masuk
  const handleConfirmClearAllChats = async () => {
    setIsDeletingChat(true);
    try {
      await clearAllChats();
      setChats([]);
      setSelectedChat(null);
      setMessages([]);
      setIsClearAllModalOpen(false);
    } catch (err) {
      console.error('Gagal membersihkan daftar chat:', err);
      alert(`Gagal membersihkan daftar chat: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsDeletingChat(false);
    }
  };

  // 8. Mulai chat baru dengan nomor baru
  const handleStartNewChat = async (phone, initialMessage) => {
    try {
      const res = await sendMessage(phone, initialMessage);
      if (res.success && res.jid) {
        await loadChats();
        const newChat = {
          id: res.jid,
          name: phone,
          lastMessage: initialMessage,
          timestamp: Date.now(),
          unreadCount: 0
        };
        handleSelectChat(newChat);
      }
    } catch (err) {
      console.error('Gagal memulai chat baru:', err);
      alert(`Gagal mengirim pesan: ${err.response?.data?.error || err.message}`);
    }
  };

  // Render Layar QR jika belum terhubung
  if (status !== 'connected') {
    return (
      <QRScreen
        status={status}
        qrDataUrl={qr}
        onRefresh={async () => {
          const res = await getQr();
          setQr(res.qr);
        }}
      />
    );
  }

  // Render Dashboard Inbox
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Header Utama */}
      <Header
        user={user}
        autoReply={autoReply}
        onLogoutClick={() => setIsLogoutModalOpen(true)}
        onOpenAiSettings={() => setIsAiModalOpen(true)}
      />

      {/* Konten Omnichannel (Sidebar + Thread) */}
      <div className="flex flex-1 overflow-hidden relative">
        <ChatList
          chats={chats}
          selectedChatId={selectedChat?.id}
          onSelectChat={handleSelectChat}
          onNewChatClick={() => setIsNewChatModalOpen(true)}
          onDeleteChat={handleRequestDeleteChat}
          onClearAllChats={() => setIsClearAllModalOpen(true)}
        />

        <ChatThread
          activeChat={selectedChat}
          messages={messages}
          onSendMessage={handleSendMessage}
          onDeleteChat={handleRequestDeleteChat}
          onChatUpdated={(updatedChat) => {
            setSelectedChat(updatedChat);
            setChats((prevChats) =>
              prevChats.map((c) => (c.id === updatedChat.id ? { ...c, ...updatedChat } : c))
            );
          }}
        />
      </div>

      {/* Modal Konfirmasi Logout */}
      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Keluar dari WhatsApp?"
        message="Sesi login WhatsApp akan direset. Anda perlu memindai kode QR kembali untuk menyambungkan ulang."
        confirmText="Ya, Logout"
        cancelText="Batal"
        isLoading={isLoggingOut}
        onConfirm={handleConfirmLogout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />

      {/* Modal Konfirmasi Hapus Satu Chat */}
      <ConfirmModal
        isOpen={Boolean(chatToDelete)}
        title="Hapus Percakapan?"
        message={`Apakah Anda yakin ingin menghapus chat dengan "${chatToDelete ? getChatDisplayName(chatToDelete) : ''}"? Seluruh riwayat pesan di percakapan ini akan dihapus dari daftar.`}
        confirmText="Ya, Hapus Chat"
        cancelText="Batal"
        isLoading={isDeletingChat}
        onConfirm={handleConfirmDeleteChat}
        onCancel={() => !isDeletingChat && setChatToDelete(null)}
      />

      {/* Modal Konfirmasi Bersihkan Semua Chat */}
      <ConfirmModal
        isOpen={isClearAllModalOpen}
        title="Bersihkan Semua Pesan Masuk?"
        message="Apakah Anda yakin ingin menghapus semua daftar chat? Seluruh percakapan dan riwayat pesan lokal akan dihapus secara permanen."
        confirmText="Ya, Hapus Semua"
        cancelText="Batal"
        isLoading={isDeletingChat}
        onConfirm={handleConfirmClearAllChats}
        onCancel={() => !isDeletingChat && setIsClearAllModalOpen(false)}
      />

      {/* Modal Chat Baru */}
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onStartChat={handleStartNewChat}
      />

      {/* Modal Pengaturan AI */}
      <AiSettingsModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onSettingsUpdated={({ autoReply: updatedAutoReply }) => {
          setAutoReply(Boolean(updatedAutoReply));
        }}
      />
    </div>
  );
}
