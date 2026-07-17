import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, PhoneOff } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const DEFAULT_SERVER_URL =
  import.meta.env.VITE_JITSI_SERVER_URL || 'https://42.96.12.227';

const ACTIVE_MEETING_KEY = 'nexoraActiveMeetingId';
const loadedScripts = new Map();

const GLOBAL_JITSI_REGISTRY_KEY = '__LEGATALK_JITSI_INSTANCE_REGISTRY__';

function getJitsiInstanceRegistry() {
  if (!window[GLOBAL_JITSI_REGISTRY_KEY]) {
    window[GLOBAL_JITSI_REGISTRY_KEY] = new Map();
  }

  return window[GLOBAL_JITSI_REGISTRY_KEY];
}

function safeDisposeInstance(instance, parentNode) {
  try {
    instance?.dispose?.();
  } catch {
    // Jitsi may already be closing.
  }

  if (parentNode) parentNode.innerHTML = '';
}

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

function idOf(value) {
  if (value && typeof value === 'object') return String(value._id || value.id || '');
  return String(value || '');
}

function isMeetingHost(meeting, userId, explicitHost) {
  if (explicitHost) return true;
  if (!meeting || !userId) return false;

  if (idOf(meeting.createdBy || meeting.creator || meeting.host || meeting.owner) === String(userId)) {
    return true;
  }

  return Boolean(
    meeting.participants?.some?.((participant) =>
      idOf(participant?.user) === String(userId) && String(participant?.role) === 'host'),
  );
}

function announceActive(meetingId) {
  if (!meetingId) return;
  sessionStorage.setItem(ACTIVE_MEETING_KEY, String(meetingId));
  window.dispatchEvent(
    new CustomEvent('nexora:meeting-active', {
      detail: { meetingId: String(meetingId) },
    }),
  );
}

function announceClosed(meetingId) {
  if (
    String(sessionStorage.getItem(ACTIVE_MEETING_KEY) || '') ===
    String(meetingId)
  ) {
    sessionStorage.removeItem(ACTIVE_MEETING_KEY);
  }

  window.dispatchEvent(
    new CustomEvent('nexora:meeting-closed', {
      detail: { meetingId: String(meetingId) },
    }),
  );
}

function allowScreenCapture(container) {
  const iframe = container?.querySelector?.('iframe');
  if (!iframe) return false;

  iframe.setAttribute(
    'allow',
    [
      'camera',
      'microphone',
      'display-capture',
      'fullscreen',
      'clipboard-read',
      'clipboard-write',
      'autoplay',
    ].join('; '),
  );
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  return true;
}

function mergedJitsiConfig({
  backendConfig,
  configOverwrite,
  subject,
  lang,
  startWithAudioMuted,
  startWithVideoMuted,
}) {
  const explicitButtons = Array.isArray(configOverwrite.toolbarButtons)
    ? configOverwrite.toolbarButtons.filter(Boolean)
    : null;

  const merged = {
    ...backendConfig,
    ...configOverwrite,
    subject,
    defaultLanguage: lang,
    language: lang,
    disableDeepLinking: true,
    'deeplinking.disabled': true,
    disableInviteFunctions: configOverwrite.disableInviteFunctions ?? false,
    prejoinPageEnabled: false,
    prejoinConfig: {
      ...objectOf(backendConfig.prejoinConfig),
      ...objectOf(configOverwrite.prejoinConfig),
      enabled: false,
    },
    startWithAudioMuted:
      startWithAudioMuted ??
      configOverwrite.startWithAudioMuted ??
      backendConfig.startWithAudioMuted ??
      false,
    startWithVideoMuted:
      startWithVideoMuted ??
      configOverwrite.startWithVideoMuted ??
      backendConfig.startWithVideoMuted ??
      false,
    enableLayerSuspension: false,
    desktopSharingFrameRate: {
      min: 5,
      max: 30,
      ...objectOf(backendConfig.desktopSharingFrameRate),
      ...objectOf(configOverwrite.desktopSharingFrameRate),
    },
    toolbarConfig: {
      ...objectOf(backendConfig.toolbarConfig),
      ...objectOf(configOverwrite.toolbarConfig),
      autoHideWhileChatIsOpen: false,
    },
  };

  // Undefined toolbarButtons means: enable every button that this Jitsi server
  // build and the current user's role/features actually support.
  if (explicitButtons?.length) merged.toolbarButtons = [...new Set(explicitButtons)];
  else delete merged.toolbarButtons;

  return merged;
}

export default function JitsiMeetFrame({
  meetingId = '',
  roomName,
  room,
  serverUrl = DEFAULT_SERVER_URL,
  jwt = '',
  purpose = 'meeting',
  subject = 'LegaTalk Meeting',
  displayName,
  email,
  avatar = '',
  isHost = false,
  startWithAudioMuted,
  startWithVideoMuted,
  compact = false,
  className = '',
  configOverwrite = {},
  interfaceConfigOverwrite = {},
  onReady,
  onJoined,
  onLeft,
  onEnded,
  onMinimize,
  onExpand,
  onClosed,
}) {
  const { user } = useAuth();
  const parentRef = useRef(null);
  const apiRef = useRef(null);
  const instanceOwnerRef = useRef(
    `legatalk-jitsi-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const registryKeyRef = useRef('');
  const joinedRef = useRef(false);
  const closingRef = useRef(false);
  const finalizedRef = useRef(false);
  const closeMessageRef = useRef('Đã thoát phòng họp.');
  const callbacksRef = useRef({ onReady, onJoined, onLeft, onEnded, onClosed });

  const [error, setError] = useState('');
  const [status, setStatus] = useState('Đang tải phòng họp…');
  const [meeting, setMeeting] = useState(null);
  const [closed, setClosed] = useState(false);
  const [resolvedRoom, setResolvedRoom] = useState('');

  useEffect(() => {
    callbacksRef.current = { onReady, onJoined, onLeft, onEnded, onClosed };
  }, [onReady, onJoined, onLeft, onEnded, onClosed]);

  const explicitRoom = useMemo(
    () => safeJitsiRoom(roomName || room),
    [roomName, room],
  );

  const effectiveMeetingId = useMemo(
    () => String(meetingId || '').trim(),
    [meetingId],
  );

  const currentUserId = idOf(user);
  const computedHost = isMeetingHost(meeting, currentUserId, isHost);
  const title = firstNonEmpty(meeting?.title, subject, 'LegaTalk Meeting');

  const dispose = () => {
    const instance = apiRef.current;
    apiRef.current = null;
    safeDisposeInstance(instance, parentRef.current);

    const registryKey = registryKeyRef.current;
    if (!registryKey) return;

    const registry = getJitsiInstanceRegistry();
    const active = registry.get(registryKey);

    if (active?.ownerId === instanceOwnerRef.current) {
      registry.delete(registryKey);
    }
  };

  const finalizeClose = (message) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    dispose();
    announceClosed(effectiveMeetingId);
    setClosed(true);
    setStatus(message || 'Đã thoát phòng họp.');
    callbacksRef.current.onEnded?.();
    callbacksRef.current.onClosed?.();
  };

  const closeMeeting = async () => {
    if (closingRef.current || finalizedRef.current) return;
    closingRef.current = true;

    const endForAll = computedHost;
    const finalMessage = endForAll
      ? 'Đã kết thúc phòng họp.'
      : 'Đã thoát phòng họp.';
    closeMessageRef.current = finalMessage;

    setStatus(endForAll ? 'Đang kết thúc phòng họp…' : 'Đang thoát phòng họp…');

    try {
      if (effectiveMeetingId && purpose === 'meeting') {
        if (endForAll) await api.post(`/meetings/${effectiveMeetingId}/end`);
        else await api.post(`/meetings/${effectiveMeetingId}/leave`);
      }
    } catch (requestError) {
      console.warn('meeting close warning:', requestError);
    }

    try {
      apiRef.current?.executeCommand?.('hangup');
    } catch {
      // Finalize below even when Jitsi has already closed itself.
    }

    window.setTimeout(() => finalizeClose(finalMessage), 700);
  };

  useEffect(() => {
    let cancelled = false;

    /*
     * React development mode, route transitions, or two meeting wrappers may
     * mount the imperative Jitsi IFrame API more than once. Claim one global
     * meeting slot per browser tab so only the latest mounted meeting creates
     * an actual Jitsi participant.
     */
    const registry = getJitsiInstanceRegistry();
    const registryKey = purpose === 'meeting' ? 'meeting' : `jitsi:${purpose}`;
    const previous = registry.get(registryKey);
    const claim = {
      ownerId: instanceOwnerRef.current,
      token: `${Date.now()}-${Math.random()}`,
      api: null,
      parentNode: parentRef.current,
    };

    registryKeyRef.current = registryKey;
    registry.set(registryKey, claim);

    if (previous && previous !== claim) {
      safeDisposeInstance(previous.api, previous.parentNode);
    }

    const stillOwnsSlot = () =>
      !cancelled && registry.get(registryKey) === claim;

    joinedRef.current = false;
    closingRef.current = false;
    finalizedRef.current = false;
    closeMessageRef.current = 'Đã thoát phòng họp.';
    setClosed(false);
    setError('');
    setStatus('Đang tải phòng họp…');
    setResolvedRoom('');

    if (effectiveMeetingId) announceActive(effectiveMeetingId);

    async function mountJitsi() {
      try {
        let meetingData = {};
        let joinConfig = {};
        let routeFetchFailed = false;

        if (effectiveMeetingId && purpose === 'meeting') {
          try {
            const response = await api.get(`/meetings/${effectiveMeetingId}`);
            meetingData = meetingFromPayload(response.data);
            joinConfig = joinConfigFromPayload(response.data);
            if (stillOwnsSlot()) setMeeting(meetingData);
          } catch {
            routeFetchFailed = true;
          }
        }

        let effectiveRoom = resolveRoom({
          explicitRoom,
          meeting: meetingData,
          joinConfig,
          meetingId: routeFetchFailed ? '' : effectiveMeetingId,
        });

        if (!effectiveRoom && effectiveMeetingId && routeFetchFailed) {
          effectiveRoom = safeJitsiRoom(effectiveMeetingId);
        }

        if (!effectiveRoom) {
          throw new Error(
            'Thiếu room Jitsi. Trang họp chưa truyền roomName/room hoặc meetingId hợp lệ.',
          );
        }

        let effectiveServer = resolveServerUrl({
          explicitServer: serverUrl,
          meeting: meetingData,
          joinConfig,
        });

        let effectiveJwt = resolveJwt({
          explicitJwt: jwt,
          joinConfig,
        });

        const host = isMeetingHost(meetingData, currentUserId, isHost);
        let tokenUser = {};

        if (!effectiveJwt) {
          const response = await api.post('/jitsi/token', {
            room: effectiveRoom,
            purpose,
            meetingId: effectiveMeetingId || undefined,
            moderator: host,
          });

          const tokenConfig = objectOf(response.data);
          tokenUser = objectOf(tokenConfig.user);
          effectiveServer = cleanServerUrl(
            tokenConfig.serverUrl || tokenConfig.serverURL || effectiveServer,
          );
          effectiveRoom = safeJitsiRoom(
            tokenConfig.room || tokenConfig.roomName || effectiveRoom,
          );
          effectiveJwt = tokenConfig.token || tokenConfig.jwt || '';
        }

        if (!effectiveJwt) {
          throw new Error('Backend không trả JWT Jitsi.');
        }

        if (!stillOwnsSlot()) return;

        setResolvedRoom(effectiveRoom);
        await loadJitsiExternalApi(effectiveServer);

        if (
          !stillOwnsSlot() ||
          !parentRef.current ||
          !window.JitsiMeetExternalAPI
        ) {
          return;
        }

        /* Clear only this component's previous iframe without releasing the
         * global claim that protects against duplicate participants. */
        safeDisposeInstance(apiRef.current, parentRef.current);
        apiRef.current = null;

        const backendConfig = objectOf(joinConfig.configOverwrite);
        const backendInterfaceConfig = objectOf(
          joinConfig.interfaceConfigOverwrite,
        );
        const lang =
          joinConfig.lang ||
          backendConfig.defaultLanguage ||
          import.meta.env.VITE_JITSI_LANGUAGE ||
          'vi';

        const effectiveDisplayName = firstNonEmpty(
          displayName,
          tokenUser.displayName,
          user?.displayName,
          'Người tham gia',
        );
        const effectiveEmail = firstNonEmpty(
          email,
          tokenUser.email,
          user?.email,
          'guest@nexora.local',
        );
        const effectiveAvatar = firstNonEmpty(
          avatar,
          tokenUser.avatar,
          user?.avatar,
        );

        const instance = new window.JitsiMeetExternalAPI(
          domainFromUrl(effectiveServer),
          {
            roomName: effectiveRoom,
            jwt: effectiveJwt,
            parentNode: parentRef.current,
            width: '100%',
            height: '100%',
            lang,
            userInfo: {
              displayName: effectiveDisplayName,
              email: effectiveEmail,
              avatarURL: effectiveAvatar || undefined,
            },
            configOverwrite: mergedJitsiConfig({
              backendConfig,
              configOverwrite,
              subject: firstNonEmpty(
                meetingData.title,
                meetingData.name,
                subject,
                'LegaTalk Meeting',
              ),
              lang,
              startWithAudioMuted,
              startWithVideoMuted,
            }),
            interfaceConfigOverwrite: {
              ...backendInterfaceConfig,
              ...interfaceConfigOverwrite,
              SHOW_JITSI_WATERMARK: false,
              SHOW_WATERMARK_FOR_GUESTS: false,
              SHOW_BRAND_WATERMARK: false,
              SHOW_POWERED_BY: false,
              MOBILE_APP_PROMO: false,
              LANG_DETECTION: false,
              DEFAULT_LOCAL_DISPLAY_NAME: effectiveDisplayName,
            },
          },
        );

        if (!stillOwnsSlot()) {
          safeDisposeInstance(instance, parentRef.current);
          return;
        }

        apiRef.current = instance;
        claim.api = instance;
        claim.parentNode = parentRef.current;

        const patchIframePermissions = () => allowScreenCapture(parentRef.current);
        window.setTimeout(patchIframePermissions, 150);
        window.setTimeout(patchIframePermissions, 600);
        window.setTimeout(patchIframePermissions, 1500);

        instance.addListener('videoConferenceJoined', (event) => {
          joinedRef.current = true;
          setStatus('');
          if (effectiveMeetingId) announceActive(effectiveMeetingId);
          if (effectiveMeetingId && purpose === 'meeting') {
            void api.post(`/meetings/${effectiveMeetingId}/join`, {}).catch(() => {});
          }
          callbacksRef.current.onJoined?.(event);
        });

        instance.addListener('videoConferenceLeft', (event) => {
          callbacksRef.current.onLeft?.(event);
          if (
            joinedRef.current &&
            effectiveMeetingId &&
            purpose === 'meeting' &&
            !closingRef.current
          ) {
            void api.post(`/meetings/${effectiveMeetingId}/leave`).catch(() => {});
          }
        });

        instance.addListener('readyToClose', (event) => {
          callbacksRef.current.onLeft?.(event);
          finalizeClose(closeMessageRef.current);
        });

        callbacksRef.current.onReady?.(instance);
      } catch (err) {
        if (stillOwnsSlot()) {
          const message =
            err?.response?.data?.message ||
            err?.message ||
            'Không mở được Jitsi.';
          setError(message);
          setStatus('');
        }
      }
    }

    /* Delay imperative iframe creation slightly. React StrictMode immediately
     * cleans up the first development mount, so its timer is cancelled before
     * a phantom Jitsi participant can connect. */
    const startTimer = window.setTimeout(() => {
      if (stillOwnsSlot()) void mountJitsi();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);

      const current = registry.get(registryKey);
      const instance = apiRef.current;
      apiRef.current = null;
      safeDisposeInstance(instance, parentRef.current);

      if (current === claim) {
        registry.delete(registryKey);
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
    currentUserId,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      allowScreenCapture(parentRef.current);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [compact]);

  return (
    <section
      className={`jitsi-stage card ${compact ? 'is-compact' : ''} ${className}`.trim()}
    >
      <div className="jitsi-stage-head">
        <div>
          <b>{title}</b>
          <span>
            {compact
              ? 'Cuộc họp vẫn đang chạy — bạn có thể tiếp tục làm việc trên web'
              : 'Jitsi Meet SDK · chia sẻ màn hình và các công cụ họp'}
          </span>
        </div>

        <div className="jitsi-head-actions">
          {compact ? (
            <button type="button" className="soft-btn tiny" onClick={onExpand}>
              <Maximize2 size={14} /> Phóng to
            </button>
          ) : (
            !closed && (
              <button type="button" className="soft-btn tiny" onClick={onMinimize}>
                <Minimize2 size={14} /> Thu nhỏ
              </button>
            )
          )}

          {!closed && (
            <button type="button" className="ghost-danger" onClick={closeMeeting}>
              <PhoneOff size={14} /> {computedHost ? 'Kết thúc phòng' : 'Thoát phòng'}
            </button>
          )}
        </div>
      </div>

      <div className={`jitsi-container ${closed ? 'is-closed' : ''}`}>
        {(status || error) && (
          <div className="jitsi-status jitsi-status-overlay">
            <div>
              {error ? <b>{error}</b> : status}
              {error ? (
                <div style={{ opacity: 0.7, marginTop: 8 }}>
                  Room: {resolvedRoom || explicitRoom || '(empty)'}
                </div>
              ) : null}
            </div>
          </div>
        )}
        <div className="jitsi-iframe-host" ref={parentRef} />
      </div>

      {closed && (
        <div className="jitsi-ended-panel">
          <div>
            <h3>Phòng họp đã đóng</h3>
            <p>Bạn có thể quay lại danh sách cuộc họp.</p>
          </div>
        </div>
      )}
    </section>
  );
}
