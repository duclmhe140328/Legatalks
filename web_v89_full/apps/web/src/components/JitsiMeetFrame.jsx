import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';

const DEFAULT_SERVER_URL =
  import.meta.env.VITE_JITSI_SERVER_URL || 'https://42.96.12.227';

const loadedScripts = new Map();

function cleanServerUrl(value = DEFAULT_SERVER_URL) {
  const raw = String(value || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_SERVER_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function domainFromUrl(value = DEFAULT_SERVER_URL) {
  return new URL(cleanServerUrl(value)).host;
}

function removeOldJitsiScript() {
  document
    .querySelectorAll('script[data-nexora-jitsi-api="true"]')
    .forEach((node) => node.remove());

  try {
    delete window.JitsiMeetExternalAPI;
  } catch {
    window.JitsiMeetExternalAPI = undefined;
  }
}

async function loadJitsiExternalApi(serverUrl = DEFAULT_SERVER_URL) {
  const base = cleanServerUrl(serverUrl);
  const currentBase = window.__NEXORA_JITSI_EXTERNAL_API_BASE__;

  if (window.JitsiMeetExternalAPI && currentBase === base) return;

  if (currentBase && currentBase !== base) {
    removeOldJitsiScript();
    loadedScripts.clear();
  }

  if (loadedScripts.has(base)) {
    await loadedScripts.get(base);
    return;
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}/external_api.js`;
    script.async = true;
    script.dataset.nexoraJitsiApi = 'true';

    script.onload = () => {
      window.__NEXORA_JITSI_EXTERNAL_API_BASE__ = base;
      resolve();
    };

    script.onerror = () => {
      loadedScripts.delete(base);
      reject(new Error(`Không tải được ${base}/external_api.js`));
    };

    document.body.appendChild(script);
  });

  loadedScripts.set(base, promise);
  await promise;
}

export function safeJitsiRoom(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, 180);
}

export function liveRoomName(stream) {
  const id = stream?._id || stream?.id || stream?.streamId;
  const existing =
    stream?.jitsiRoom ||
    stream?.roomName ||
    stream?.room ||
    stream?.jitsi_room;

  return safeJitsiRoom(existing || `nexora-live-${id || Date.now()}`);
}

function objectOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function meetingIdFromLocation() {
  if (typeof window === 'undefined') return '';

  const match = window.location.pathname.match(/^\/meetings\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function firstObject(...values) {
  for (const value of values) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      return value;
    }
  }

  return {};
}

function meetingFromPayload(payload) {
  const root = objectOf(payload);

  return firstObject(
    root.meeting,
    root.item,
    root.data?.meeting,
    root.data?.item,
    root.data,
    root,
  );
}

function joinConfigFromPayload(payload) {
  const root = objectOf(payload);

  return firstObject(
    root.jitsi,
    root.join,
    root.config,
    root.data?.jitsi,
    root.data?.join,
    root.data?.config,
  );
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function resolveRoom({ explicitRoom, meeting, joinConfig, meetingId }) {
  const raw = firstNonEmpty(
    explicitRoom,
    joinConfig.room,
    joinConfig.roomName,
    joinConfig.jitsiRoom,
    joinConfig.jitsi_room,
    meeting.room,
    meeting.roomName,
    meeting.jitsiRoom,
    meeting.jitsi_room,
    meeting.meetingRoom,
    meeting.meetingRoomName,
  );

  if (raw) return safeJitsiRoom(raw);
  if (meetingId) return safeJitsiRoom(`nexora-meeting-${meetingId}`);
  return '';
}

function resolveServerUrl({ explicitServer, meeting, joinConfig }) {
  return cleanServerUrl(
    firstNonEmpty(
      joinConfig.serverUrl,
      joinConfig.serverURL,
      joinConfig.jitsiServerUrl,
      joinConfig.jitsiServerURL,
      joinConfig.url,
      joinConfig.domain,
      joinConfig.jitsiDomain,
      meeting.serverUrl,
      meeting.serverURL,
      meeting.jitsiServerUrl,
      meeting.jitsiDomain,
      explicitServer,
      DEFAULT_SERVER_URL,
    ),
  );
}

function resolveJwt({ explicitJwt, joinConfig }) {
  return firstNonEmpty(
    explicitJwt,
    joinConfig.jwt,
    joinConfig.token,
    joinConfig.jitsiJwt,
  );
}

function creatorId(meeting) {
  const creator =
    meeting.createdBy ||
    meeting.creator ||
    meeting.host ||
    meeting.owner;

  if (creator && typeof creator === 'object') {
    return String(creator._id || creator.id || '');
  }

  return String(creator || '');
}

export default function JitsiMeetFrame({
  meetingId = '',
  roomName,
  room,
  serverUrl = DEFAULT_SERVER_URL,
  jwt = '',
  purpose = 'meeting',
  subject = 'Nexora Meeting',
  displayName = 'Người tham gia',
  email = 'guest@nexora.local',
  avatar = '',
  isHost = false,
  startWithAudioMuted,
  startWithVideoMuted,
  height = '100%',
  className = '',
  style = {},
  configOverwrite = {},
  interfaceConfigOverwrite = {},
  onReady,
  onJoined,
  onLeft,
}) {
  const parentRef = useRef(null);
  const apiRef = useRef(null);
  const [error, setError] = useState('');
  const [resolvedRoom, setResolvedRoom] = useState('');

  const explicitRoom = useMemo(
    () => safeJitsiRoom(roomName || room),
    [roomName, room],
  );

  const effectiveMeetingId = useMemo(
    () => String(meetingId || meetingIdFromLocation()).trim(),
    [meetingId],
  );

  useEffect(() => {
    let cancelled = false;

    async function mountJitsi() {
      setError('');
      setResolvedRoom('');

      try {
        let meeting = {};
        let joinConfig = {};
        let routeFetchFailed = false;

        if (effectiveMeetingId && purpose === 'meeting') {
          try {
            const response = await api.get(`/meetings/${effectiveMeetingId}`);
            meeting = meetingFromPayload(response.data);
            joinConfig = joinConfigFromPayload(response.data);

            try {
              await api.post(`/meetings/${effectiveMeetingId}/join`, {});
            } catch {
              // GET detail has already checked access.
            }
          } catch {
            routeFetchFailed = true;
          }
        }

        let effectiveRoom = resolveRoom({
          explicitRoom,
          meeting,
          joinConfig,
          meetingId: routeFetchFailed ? '' : effectiveMeetingId,
        });

        // Manual room URLs may use /meetings/<room-code> instead of a DB id.
        if (!effectiveRoom && effectiveMeetingId && routeFetchFailed) {
          effectiveRoom = safeJitsiRoom(effectiveMeetingId);
        }

        if (!effectiveRoom) {
          throw new Error(
            'Thiếu room Jitsi. Trang họp chưa truyền roomName/room và URL không có meetingId.',
          );
        }

        let effectiveServer = resolveServerUrl({
          explicitServer: serverUrl,
          meeting,
          joinConfig,
        });

        let effectiveJwt = resolveJwt({
          explicitJwt: jwt,
          joinConfig,
        });

        if (!effectiveJwt) {
          const response = await api.post('/jitsi/token', {
            room: effectiveRoom,
            purpose,
            meetingId: effectiveMeetingId || undefined,
            moderator:
              isHost ||
              Boolean(joinConfig.moderator) ||
              Boolean(joinConfig.isHost) ||
              Boolean(meeting.isHost),
          });

          const tokenConfig = objectOf(response.data);
          effectiveServer = cleanServerUrl(
            tokenConfig.serverUrl ||
              tokenConfig.serverURL ||
              effectiveServer,
          );
          effectiveRoom = safeJitsiRoom(
            tokenConfig.room ||
              tokenConfig.roomName ||
              effectiveRoom,
          );
          effectiveJwt =
            tokenConfig.token ||
            tokenConfig.jwt ||
            '';
        }

        if (!effectiveJwt) {
          throw new Error('Backend không trả JWT Jitsi.');
        }

        setResolvedRoom(effectiveRoom);

        await loadJitsiExternalApi(effectiveServer);

        if (
          cancelled ||
          !parentRef.current ||
          !window.JitsiMeetExternalAPI
        ) {
          return;
        }

        apiRef.current?.dispose?.();
        parentRef.current.innerHTML = '';

        const effectiveSubject = firstNonEmpty(
          subject,
          meeting.title,
          meeting.name,
          meeting.subject,
          'Nexora Meeting',
        );

        const instance = new window.JitsiMeetExternalAPI(
          domainFromUrl(effectiveServer),
          {
            roomName: effectiveRoom,
            jwt: effectiveJwt,
            parentNode: parentRef.current,
            width: '100%',
            height: '100%',
            lang: 'vi',
            userInfo: {
              displayName,
              email,
              avatarURL: avatar || undefined,
            },
            configOverwrite: {
              subject: effectiveSubject,
              prejoinConfig: { enabled: false },
              disableDeepLinking: true,
              'deeplinking.disabled': true,
              startWithAudioMuted: startWithAudioMuted ?? false,
              startWithVideoMuted: startWithVideoMuted ?? false,
              defaultLanguage: 'vi',
              ...configOverwrite,
            },
            interfaceConfigOverwrite: {
              SHOW_JITSI_WATERMARK: false,
              SHOW_WATERMARK_FOR_GUESTS: false,
              DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
              MOBILE_APP_PROMO: false,
              ...interfaceConfigOverwrite,
            },
          },
        );

        apiRef.current = instance;
        instance.addListener('videoConferenceJoined', (event) => {
          onJoined?.(event);
        });
        instance.addListener('videoConferenceLeft', (event) => {
          onLeft?.(event);
        });
        instance.addListener('readyToClose', (event) => {
          onLeft?.(event);
        });
        onReady?.(instance);
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              'Không mở được Jitsi.',
          );
        }
      }
    }

    void mountJitsi();

    return () => {
      cancelled = true;
      apiRef.current?.dispose?.();
      apiRef.current = null;

      if (parentRef.current) {
        parentRef.current.innerHTML = '';
      }
    };
  }, [
    effectiveMeetingId,
    explicitRoom,
    serverUrl,
    jwt,
    purpose,
    subject,
    displayName,
    email,
    avatar,
    isHost,
    startWithAudioMuted,
    startWithVideoMuted,
  ]);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height,
        minHeight: 800,
        background: '#020617',
        borderRadius: 18,
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {error ? (
        <div
          style={{
            color: 'white',
            padding: 20,
            textAlign: 'center',
          }}
        >
          <b>{error}</b>
          <div style={{ opacity: 0.7, marginTop: 8 }}>
            Room: {resolvedRoom || explicitRoom || '(empty)'}
          </div>
        </div>
      ) : null}

      <div
        ref={parentRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
