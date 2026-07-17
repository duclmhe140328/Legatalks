import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, PhoneOff, RefreshCcw } from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';
import './jitsi-call.css';

const scriptPromises = new Map();

function cleanServerUrl(value) {
  const raw = String(value || 'https://42.96.12.227').trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function domainFromUrl(value) {
  return new URL(cleanServerUrl(value)).host;
}

function loadExternalApi(serverUrl) {
  const base = cleanServerUrl(serverUrl);
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptPromises.has(base)) return scriptPromises.get(base);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}/external_api.js`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Cannot load ${base}/external_api.js`));
    document.body.appendChild(script);
  });

  scriptPromises.set(base, promise);
  return promise;
}

function peerFromConversation(conversation) {
  return conversation?.members?.find((entry) => entry?.user)?.user || conversation || {};
}

export default function CallModal({
  conversation,
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
  const mountedRef = useRef(true);
  const [status, setStatus] = useState(direction === 'outgoing' ? 'Dang goi...' : 'Dang ket noi...');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(true);

  const isAudio = mode === 'audio' || mode === 'voice';
  const peer = useMemo(() => peerFromConversation(conversation), [conversation]);
  const title = conversation?.name || peer?.displayName || 'Cuoc goi Nexora';

  const finish = async ({ notifyBackend = true } = {}) => {
    if (endingRef.current) return;
    endingRef.current = true;
    setStatus('Dang ket thuc cuoc goi...');

    try { apiRef.current?.executeCommand?.('hangup'); } catch { /* ignore */ }
    try { apiRef.current?.dispose?.(); } catch { /* ignore */ }
    apiRef.current = null;

    if (notifyBackend && callSessionId) {
      try { socket?.emit('call:leave', { callSessionId }); } catch { /* ignore */ }
      try { await api.post(`/calls/${callSessionId}/end`, {}); } catch { /* already ended */ }
    }

    onClose?.();
  };

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function boot() {
      if (!callSessionId) {
        setError('Thieu ma cuoc goi.');
        setJoining(false);
        return;
      }

      try {
        const { data } = await api.post('/jitsi/token', {
          purpose: 'call',
          callSessionId,
        });
        if (cancelled || !parentRef.current) return;

        const serverUrl = cleanServerUrl(data.serverUrl);
        await loadExternalApi(serverUrl);
        if (cancelled || !parentRef.current || !window.JitsiMeetExternalAPI) return;

        parentRef.current.innerHTML = '';
        const instance = new window.JitsiMeetExternalAPI(domainFromUrl(serverUrl), {
          roomName: data.room,
          jwt: data.token,
          parentNode: parentRef.current,
          width: '100%',
          height: '100%',
          lang: 'vi',
          userInfo: {
            displayName: data.user?.displayName,
          },
          configOverwrite: {
            subject: isAudio ? 'Cuoc goi thoai Nexora' : 'Cuoc goi video Nexora',
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            'deeplinking.disabled': true,
            disableInviteFunctions: true,
            startWithAudioMuted: false,
            startWithVideoMuted: isAudio,
            startAudioOnly: isAudio,
            defaultLanguage: 'vi',
            notifications: [],
            toolbarButtons: isAudio
              ? ['microphone', 'speakerstats', 'fullscreen', 'hangup']
              : ['microphone', 'camera', 'desktop', 'tileview', 'fullscreen', 'hangup'],
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
          if (!mountedRef.current) return;
          setJoining(false);
          setStatus(direction === 'outgoing' ? 'Dang cho nguoi ben kia...' : 'Da vao cuoc goi');
        });
        instance.addListener('participantJoined', () => mountedRef.current && setStatus('Dang goi'));
        instance.addListener('participantLeft', () => mountedRef.current && setStatus('Nguoi ben kia da roi cuoc goi'));
        instance.addListener('videoConferenceLeft', () => void finish());
        instance.addListener('readyToClose', () => void finish());
      } catch (err) {
        if (!cancelled) {
          setJoining(false);
          setError(err?.response?.data?.message || err?.message || 'Khong mo duoc Jitsi.');
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      try { apiRef.current?.dispose?.(); } catch { /* ignore */ }
      apiRef.current = null;
    };
  }, [callSessionId, direction, isAudio]);

  useEffect(() => {
    if (externalStatus) setStatus(externalStatus);
  }, [externalStatus]);

  const reopen = () => window.location.reload();
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
          <button type="button" onClick={fullscreen} title="Toan man hinh"><Maximize2 size={19} /></button>
        </header>

        <div className="jitsi-call-stage">
          {joining && <div className="jitsi-call-loading"><span className="jitsi-call-spinner" /><b>Dang mo Jitsi rieng...</b></div>}
          {error && (
            <div className="jitsi-call-error">
              <Avatar user={peer} size={84} />
              <b>{error}</b>
              <button type="button" onClick={reopen}><RefreshCcw size={17} /> Thu lai</button>
            </div>
          )}
          <div ref={parentRef} className="jitsi-call-frame" />
        </div>

        <footer className="jitsi-call-footer">
          <span>{isAudio ? 'Goi thoai 1-1 qua Jitsi' : 'Goi video 1-1 qua Jitsi'}</span>
          <button type="button" className="jitsi-call-hangup" onClick={() => void finish()}>
            <PhoneOff size={20} /> Ket thuc
          </button>
        </footer>
      </section>
    </div>
  );
}
