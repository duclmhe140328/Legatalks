import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, PhoneOff, RefreshCcw } from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';
import './jitsi-call.css';

const scriptPromises = new Map();
const JITSI_SCRIPT_SELECTOR = 'script[src*="/external_api.js"]';

function cleanServerUrl(value) {
  const raw = String(value || 'https://42.96.12.227').trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function domainFromUrl(value) {
  return new URL(cleanServerUrl(value)).host;
}

function removeStaleJitsiApi(base) {
  const scripts = [...document.querySelectorAll(JITSI_SCRIPT_SELECTOR)];
  const tagged = scripts.find((node) => node.dataset.legatalkJitsiBase === base);
  if (window.JitsiMeetExternalAPI && tagged) return false;

  for (const node of scripts) node.remove();
  try { delete window.JitsiMeetExternalAPI; } catch { window.JitsiMeetExternalAPI = undefined; }
  scriptPromises.clear();
  return true;
}

function loadExternalApi(serverUrl) {
  const base = cleanServerUrl(serverUrl);
  removeStaleJitsiApi(base);

  const existing = [...document.querySelectorAll(JITSI_SCRIPT_SELECTOR)]
    .find((node) => node.dataset.legatalkJitsiBase === base);
  if (window.JitsiMeetExternalAPI && existing) return Promise.resolve();
  if (scriptPromises.has(base)) return scriptPromises.get(base);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // Cache-bust external_api.js. Normal browser profiles can keep an old Jitsi
    // bridge while an incognito window downloads the current compatible file.
    script.src = `${base}/external_api.js?legatalk-call-v4=${Date.now()}`;
    script.dataset.legatalkJitsiBase = base;
    script.async = true;
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) resolve();
      else reject(new Error('Jitsi external API loaded but was not initialized.'));
    };
    script.onerror = () => reject(new Error(`Cannot load ${base}/external_api.js`));
    document.body.appendChild(script);
  }).catch((error) => {
    scriptPromises.delete(base);
    throw error;
  });

  scriptPromises.set(base, promise);
  return promise;
}

async function verifyMediaPermission(isAudio) {
  if (!navigator.mediaDevices?.getUserMedia) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isAudio ? false : { facingMode: 'user' },
    });
  } catch (error) {
    const name = String(error?.name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new Error('Trình duyệt đang chặn Micro/Camera. Bấm biểu tượng ổ khóa cạnh địa chỉ, cho phép Micro và Camera rồi thử lại.');
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new Error('Không tìm thấy Micro/Camera khả dụng trên thiết bị này.');
    }
    throw error;
  } finally {
    stream?.getTracks?.().forEach((track) => track.stop());
  }
}

function peerFromConversation(conversation) {
  return conversation?.members?.find((entry) => entry?.user)?.user || conversation || {};
}

export default function CallModal({
  conversation,
  conversationId,
  mode = 'video',
  callSessionId,
  direction = 'outgoing',
  externalStatus,
  onClose,
}) {
  const { socket } = useSocket();
  const parentRef = useRef(null);
  const apiRef = useRef(null);
  const endingRef = useRef(false);
  const joinedRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState(direction === 'outgoing' ? 'Đang gọi...' : 'Đang kết nối...');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const isAudio = mode === 'audio' || mode === 'voice';
  const peer = useMemo(() => peerFromConversation(conversation), [conversation]);
  const title = conversation?.name || peer?.displayName || 'Cuộc gọi Legatalk';
  const resolvedConversationId = conversationId || conversation?._id;

  useEffect(() => {
    if (!socket || !callSessionId || !resolvedConversationId) return undefined;

    const joinSocketCall = () => {
      socket.emit('call:join', {
        conversationId: resolvedConversationId,
        callSessionId,
        mode: isAudio ? 'voice' : 'video',
      });
    };

    joinSocketCall();
    socket.on('connect', joinSocketCall);
    return () => socket.off('connect', joinSocketCall);
  }, [socket, resolvedConversationId, callSessionId, isAudio]);

  const finish = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setStatus('Đang kết thúc cuộc gọi...');

    try { apiRef.current?.executeCommand?.('hangup'); } catch { /* ignore */ }
    try { apiRef.current?.dispose?.(); } catch { /* ignore */ }
    apiRef.current = null;

    if (callSessionId) {
      try { socket?.emit('call:leave', { callSessionId }); } catch { /* ignore */ }
      try { await api.post(`/calls/${callSessionId}/end`, {}); } catch { /* already ended */ }
    }

    onClose?.();
  };

  const keepCallOpenAfterJitsiClose = (reason) => {
    if (!mountedRef.current || endingRef.current) return;
    joinedRef.current = false;
    setJoining(false);
    setStatus('Legatalk đã ngắt kết nối');
    setError(reason || 'Legatalk vừa đóng kết nối. Cuộc gọi chưa bị kết thúc; hãy bấm Kết nối lại.');
    try { apiRef.current?.dispose?.(); } catch { /* ignore */ }
    apiRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;
    endingRef.current = false;
    joinedRef.current = false;
    let cancelled = false;

    async function boot() {
      setError('');
      setJoining(true);
      setStatus(direction === 'outgoing' ? 'Đang mở cuộc gọi...' : 'Đang vào cuộc gọi...');

      if (!callSessionId) {
        setError('Thiếu mã cuộc gọi.');
        setJoining(false);
        return;
      }

      try {
        await verifyMediaPermission(isAudio);
        const { data } = await api.post('/jitsi/token', {
          purpose: 'call',
          callSessionId,
        });
        if (cancelled || !parentRef.current) return;

        const serverUrl = cleanServerUrl(
          data?.serverUrl || data?.serverURL || data?.jitsiServerUrl || data?.jitsiServerURL,
        );
        const roomName = String(data?.room || data?.roomName || '').trim();
        const jwt = String(data?.token || data?.jwt || '').trim();
        if (!roomName || !jwt) throw new Error('Backend không trả đủ room/JWT .');

        await loadExternalApi(serverUrl);
        if (cancelled || !parentRef.current || !window.JitsiMeetExternalAPI) return;

        try { apiRef.current?.dispose?.(); } catch { /* ignore */ }
        apiRef.current = null;
        parentRef.current.innerHTML = '';

        const instance = new window.JitsiMeetExternalAPI(domainFromUrl(serverUrl), {
          roomName,
          jwt,
          parentNode: parentRef.current,
          width: '100%',
          height: '100%',
          lang: 'vi',
          userInfo: {
            displayName: data?.user?.displayName,
          },
          configOverwrite: {
            subject: isAudio ? 'Cuộc gọi thoại Legatalk' : 'Cuộc gọi video Legatalk',
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            'deeplinking.disabled': true,
            disableInviteFunctions: true,
            startWithAudioMuted: false,
            startWithVideoMuted: isAudio,
            startAudioOnly: isAudio,
            defaultLanguage: 'vi',
            notifications: [],
            // Chỉ dùng nút Kết thúc của Legatalk. Không để Jitsi đóng iframe
            // trước rồi làm toàn bộ modal biến mất ngoài ý muốn.
            toolbarButtons: isAudio
              ? ['microphone', 'fullscreen']
              : ['microphone', 'camera', 'desktop', 'tileview', 'fullscreen'],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          },
        });

        apiRef.current = instance;
        instance.addListener('videoConferenceJoined', () => {
          joinedRef.current = true;
          if (!mountedRef.current) return;
          setJoining(false);
          setError('');
          setStatus(direction === 'outgoing' ? 'Đang chờ người bên kia...' : 'Đã vào cuộc gọi');
        });
        instance.addListener('participantJoined', () => mountedRef.current && setStatus('Đang gọi'));
        instance.addListener('participantLeft', () => mountedRef.current && setStatus('Người bên kia đã rời cuộc gọi'));
        instance.addListener('cameraError', (details) => {
          if (!mountedRef.current) return;
          setError(`Camera lỗi: ${details?.message || 'hãy kiểm tra quyền Camera.'}`);
        });
        instance.addListener('micError', (details) => {
          if (!mountedRef.current) return;
          setError(`Micro lỗi: ${details?.message || 'hãy kiểm tra quyền Micro.'}`);
        });
        instance.addListener('videoConferenceLeft', () => {
          keepCallOpenAfterJitsiClose(
            joinedRef.current
              ? 'Kết nối Legatalk vừa bị đóng. Cuộc gọi vẫn đang giữ; bấm Kết nối lại hoặc Kết thúc.'
              : 'Legatalk đóng trước khi vào phòng. Hãy kiểm tra quyền Micro/Camera rồi bấm Kết nối lại.',
          );
        });
        instance.addListener('readyToClose', () => {
          keepCallOpenAfterJitsiClose('Legatalk yêu cầu đóng khung gọi. Cuộc gọi chưa bị kết thúc; hãy bấm Kết nối lại.');
        });
      } catch (err) {
        if (!cancelled) {
          setJoining(false);
          setStatus('Không thể vào');
          setError(err?.response?.data?.message || err?.message || 'Không mở được.');
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      try { apiRef.current?.dispose?.(); } catch { /* ignore */ }
      apiRef.current = null;
      joinedRef.current = false;
    };
  }, [callSessionId, direction, isAudio, retryKey]);

  useEffect(() => {
    if (externalStatus) setStatus(externalStatus);
  }, [externalStatus]);

  const retry = () => {
    endingRef.current = false;
    setError('');
    setJoining(true);
    setRetryKey((value) => value + 1);
  };

  const fullscreen = () => {
    const node = parentRef.current?.closest('.jitsi-call-card');
    node?.requestFullscreen?.();
  };

  return (
    <div className="jitsi-call-overlay" role="dialog" aria-modal="true">
      <section className={`jitsi-call-card ${isAudio ? 'audio-mode' : 'video-mode'}`}>
        <header className="jitsi-call-head">
          <div className="jitsi-call-person">
            <Avatar user={peer} size={42} />
            <span><b>{title}</b><small>{status}</small></span>
          </div>
          <button type="button" onClick={fullscreen} title="Toàn màn hình"><Maximize2 size={19} /></button>
        </header>

        <div className="jitsi-call-stage">
          {joining && <div className="jitsi-call-loading"><span className="jitsi-call-spinner" /><b>Đang kết nối</b></div>}
          {error && (
            <div className="jitsi-call-error">
              <Avatar user={peer} size={84} />
              <b>{error}</b>
              <button type="button" onClick={retry}><RefreshCcw size={17} /> Kết nối lại</button>
            </div>
          )}
          <div ref={parentRef} className="jitsi-call-frame" />
        </div>

        <footer className="jitsi-call-footer">
          <span>{isAudio ? 'Gọi thoại 1-1' : 'Gọi video 1-1'}</span>
          <button type="button" className="jitsi-call-hangup" onClick={() => void finish()}>
            <PhoneOff size={20} /> Kết thúc
          </button>
        </footer>
      </section>
    </div>
  );
}
