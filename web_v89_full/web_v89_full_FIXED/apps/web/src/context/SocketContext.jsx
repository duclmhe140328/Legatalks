import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, api, errorMessage } from '../services/api';
import { useAuth } from './AuthContext';
import {
  playMessageSound,
  requestNotificationPermission,
  showDeviceNotification,
  startRingtone,
  stopRingtone,
  unlockNotificationAudio
} from '../services/deviceNotifications';

const SocketContext = createContext(null);
const TERMINAL_CALL_STATUSES = new Set(['ended', 'missed', 'declined', 'busy']);
const CALL_STATUS_LABELS = {
  declined: 'Người nhận đã từ chối cuộc gọi',
  missed: 'Cuộc gọi không được trả lời',
  busy: 'Người nhận đang bận',
  ended: 'Cuộc gọi đã kết thúc'
};

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callNotice, setCallNotice] = useState('');
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const activeConversationId = useRef(null);
  const activeCallRef = useRef(null);
  const incomingCallRef = useRef(null);
  const socketRef = useRef(null);
  const closeTimer = useRef(null);
  const terminalCallIds = useRef(new Set());

  const commitActiveCall = useCallback((nextCall) => {
    activeCallRef.current = nextCall;
    setActiveCall(nextCall);
  }, []);

  const commitIncomingCall = useCallback((nextCall) => {
    incomingCallRef.current = nextCall;
    setIncomingCall(nextCall);
  }, []);

  const finishCall = useCallback((message, callSessionId, status = 'ended') => {
    const id = String(callSessionId || '');
    const activeMatches = !id || String(activeCallRef.current?.callSessionId || '') === id;
    const incomingMatches = !id || String(incomingCallRef.current?.callSessionId || '') === id;

    // Chỉ đóng cuộc gọi đang khớp, tránh một sự kiện cũ đóng cuộc gọi mới.
    if (!activeMatches && !incomingMatches) return false;

    if (id) terminalCallIds.current.add(id);
    stopRingtone();
    window.clearTimeout(closeTimer.current);
    if (activeMatches) commitActiveCall(null);
    if (incomingMatches) commitIncomingCall(null);
    setCallNotice(message || CALL_STATUS_LABELS[status] || 'Cuộc gọi đã kết thúc');
    window.dispatchEvent(new CustomEvent('call:finished', {
      detail: { message, callSessionId, status }
    }));
    closeTimer.current = window.setTimeout(() => setCallNotice(''), 2200);
    return true;
  }, [commitActiveCall, commitIncomingCall]);

  useEffect(() => {
    const unlock = () => void unlockNotificationAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const client = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000
    });
    socketRef.current = client;
    setSocket(client);

    const applyPresenceSnapshot = (payload) => {
      const ids = Array.isArray(payload) ? payload : payload?.userIds;
      if (!Array.isArray(ids)) return;
      setOnlineUsers(new Set(ids.map(String)));
    };

    const syncPresence = () => {
      if (!client.connected) return;
      client.emit('presence:get', (result) => {
        if (result?.ok) applyPresenceSnapshot(result);
      });
    };

    const onConnect = () => syncPresence();
    const onPresence = ({ userId, online }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        online ? next.add(String(userId)) : next.delete(String(userId));
        return next;
      });
    };

    const onMessage = (message) => {
      const senderId = message.sender?._id || message.sender;
      if (String(senderId) === String(user._id)) return;
      const conversationId = String(message.conversation);
      const isCurrent = String(activeConversationId.current || '') === conversationId && !document.hidden;
      if (!isCurrent) {
        setUnreadByConversation((current) => ({
          ...current,
          [conversationId]: (current[conversationId] || 0) + 1
        }));
        playMessageSound();
        showDeviceNotification(message.sender?.displayName || 'Tin nhắn mới', {
          body: message.text || (message.kind === 'image' ? 'Đã gửi một ảnh' : `Đã gửi ${message.kind || 'nội dung mới'}`),
          icon: message.sender?.avatar,
          tag: `message-${conversationId}`,
          path: `/chats?conversation=${conversationId}`,
          data: { conversationId }
        });
      }
    };

    const onIncomingCall = (payload) => {
      const id = String(payload.callSessionId || '');
      if (terminalCallIds.current.has(id)) return;
      if (activeCallRef.current) {
        client.emit('call:decline', { callSessionId: payload.callSessionId });
        return;
      }
      commitIncomingCall(payload);
      setCallNotice('');
      startRingtone();
      showDeviceNotification(payload.mode === 'video' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến', {
        body: `${payload.from?.displayName || 'Có người'} đang gọi cho bạn`,
        icon: payload.from?.avatar,
        tag: `call-${payload.callSessionId}`,
        path: '/chats',
        data: { callSessionId: payload.callSessionId }
      });
    };

    const onAccepted = ({ callSessionId, displayName }) => {
      if (String(activeCallRef.current?.callSessionId || '') === String(callSessionId || '')) {
        window.clearTimeout(closeTimer.current);
        setCallNotice(`${displayName || 'Người nhận'} đã nghe máy`);
      }
    };

    const onDeclined = ({ callSessionId, status = 'declined' }) => {
      finishCall(CALL_STATUS_LABELS[status] || 'Người nhận đã từ chối cuộc gọi', callSessionId, status);
    };

    const onBusy = ({ callSessionId }) => {
      finishCall(CALL_STATUS_LABELS.busy, callSessionId, 'busy');
    };

    const onEnded = ({ callSessionId, status = 'ended' }) => {
      finishCall(CALL_STATUS_LABELS[status] || 'Cuộc gọi đã kết thúc', callSessionId, status);
    };

    const onAnsweredElsewhere = ({ callSessionId }) => {
      if (String(incomingCallRef.current?.callSessionId || '') === String(callSessionId || '')) {
        stopRingtone();
        commitIncomingCall(null);
      }
    };

    const onGroupJoined = ({ conversationId }) => {
      if (conversationId) client.emit('conversation:join', { conversationId });
    };

    const onVisibility = () => {
      if (!document.hidden) syncPresence();
    };

    client.on('connect', onConnect);
    client.on('presence:snapshot', applyPresenceSnapshot);
    client.on('presence:update', onPresence);
    client.on('message:new', onMessage);
    client.on('call:incoming', onIncomingCall);
    client.on('call:accepted', onAccepted);
    client.on('call:declined', onDeclined);
    client.on('call:busy', onBusy);
    client.on('call:ended', onEnded);
    client.on('call:terminal', onEnded);
    client.on('call:answered-elsewhere', onAnsweredElsewhere);
    client.on('group:joined', onGroupJoined);
    window.addEventListener('focus', syncPresence);
    document.addEventListener('visibilitychange', onVisibility);
    const presenceTimer = window.setInterval(syncPresence, 15000);

    return () => {
      stopRingtone();
      window.clearTimeout(closeTimer.current);
      window.clearInterval(presenceTimer);
      window.removeEventListener('focus', syncPresence);
      document.removeEventListener('visibilitychange', onVisibility);
      client.off('connect', onConnect);
      client.off('presence:snapshot', applyPresenceSnapshot);
      client.off('presence:update', onPresence);
      client.off('message:new', onMessage);
      client.off('call:incoming', onIncomingCall);
      client.off('call:accepted', onAccepted);
      client.off('call:declined', onDeclined);
      client.off('call:busy', onBusy);
      client.off('call:ended', onEnded);
      client.off('call:terminal', onEnded);
      client.off('call:answered-elsewhere', onAnsweredElsewhere);
      client.off('group:joined', onGroupJoined);
      client.disconnect();
      socketRef.current = null;
      setSocket(null);
      setOnlineUsers(new Set());
    };
  }, [user?._id, commitIncomingCall, finishCall]);

  // Lớp dự phòng: nếu event WebSocket bị lỡ đúng lúc nhận máy/kết thúc,
  // client vẫn hỏi trạng thái authoritative từ server và tự đóng trong ~1 giây.
  useEffect(() => {
    const callSessionId = activeCall?.callSessionId;
    if (!callSessionId) return undefined;
    let cancelled = false;

    const syncCallState = async () => {
      try {
        const { data } = await api.get(`/calls/${callSessionId}`);
        if (cancelled) return;
        if (TERMINAL_CALL_STATUSES.has(data.status)) {
          finishCall(CALL_STATUS_LABELS[data.status] || 'Cuộc gọi đã kết thúc', callSessionId, data.status);
        }
      } catch (error) {
        if (cancelled) return;
        if (error.response?.status === 404 || error.response?.status === 410) {
          finishCall('Cuộc gọi đã kết thúc', callSessionId, 'ended');
        }
      }
    };

    void syncCallState();
    const timer = window.setInterval(syncCallState, 1000);
    const onFocus = () => void syncCallState();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [activeCall?.callSessionId, finishCall]);

  const startCall = useCallback(async (conversation, mode = 'voice') => {
    if (!conversation || activeCallRef.current) throw new Error('Bạn đang ở trong một cuộc gọi khác.');
    window.clearTimeout(closeTimer.current);
    try {
      const session = (await api.post('/calls', { conversationId: conversation._id, mode })).data;
      const call = { conversation, mode, callSessionId: session._id, direction: 'outgoing' };
      terminalCallIds.current.delete(String(session._id));
      setCallNotice('Đang đổ chuông…');
      commitActiveCall(call);
      socketRef.current?.emit('call:invite', { callSessionId: session._id }, (result) => {
        if (!result?.ok) {
          finishCall(result?.message || 'Không thể bắt đầu cuộc gọi', session._id, 'ended');
        }
      });
      return call;
    } catch (error) {
      throw new Error(errorMessage(error));
    }
  }, [commitActiveCall, finishCall]);

  const answerCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call || !socketRef.current) return;
    window.clearTimeout(closeTimer.current);
    stopRingtone();
    terminalCallIds.current.delete(String(call.callSessionId));

    // Chuyển sang active ngay trước khi gửi accept để không bỏ lỡ call:ended
    // nếu người gọi tắt đúng trong khoảng callback đang chờ.
    const pendingActiveCall = {
      conversation: call.conversation,
      mode: call.mode,
      callSessionId: call.callSessionId,
      direction: 'incoming'
    };
    commitIncomingCall(null);
    commitActiveCall(pendingActiveCall);
    setCallNotice('Đang kết nối…');

    socketRef.current.emit('call:accept', { callSessionId: call.callSessionId }, (result) => {
      if (!result?.ok) {
        finishCall(result?.message || 'Không thể nghe máy', call.callSessionId, 'ended');
      }
    });
  }, [commitActiveCall, commitIncomingCall, finishCall]);

  const declineCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    stopRingtone();
    commitIncomingCall(null);
    setCallNotice('Đã từ chối cuộc gọi');

    // REST là nguồn chính; Socket là fallback nếu request REST gặp lỗi mạng.
    void api.post(`/calls/${call.callSessionId}/decline`).catch(() => {
      socketRef.current?.emit('call:decline', { callSessionId: call.callSessionId });
    }).finally(() => {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => setCallNotice(''), 1600);
    });
  }, [commitIncomingCall]);

  const closeActiveCall = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    commitActiveCall(null);
    setCallNotice('');
  }, [commitActiveCall]);

  const markConversationActive = useCallback((conversationId) => {
    activeConversationId.current = conversationId || null;
    if (conversationId) {
      setUnreadByConversation((current) => {
        if (!current[conversationId]) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
    }
  }, []);

  const enableDeviceNotifications = useCallback(async () => {
    await unlockNotificationAudio();
    return requestNotificationPermission();
  }, []);

  const unreadTotal = Object.values(unreadByConversation).reduce((sum, count) => sum + count, 0);
  const value = useMemo(() => ({
    socket,
    onlineUsers,
    incomingCall,
    activeCall,
    callNotice,
    startCall,
    answerCall,
    declineCall,
    closeActiveCall,
    markConversationActive,
    unreadByConversation,
    unreadTotal,
    enableDeviceNotifications
  }), [socket, onlineUsers, incomingCall, activeCall, callNotice, startCall, answerCall, declineCall, closeActiveCall, markConversationActive, unreadByConversation, unreadTotal, enableDeviceNotifications]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
