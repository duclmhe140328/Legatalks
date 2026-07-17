import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? `${window.location.origin}/api` : 'http://localhost:4000/api')
).replace(/\/$/, '');

const MIROTALK_PUBLIC_URL = (import.meta.env.VITE_MIROTALK_BRO_PUBLIC_URL || 'https://bro.mirotalk.com').replace(/\/+$/, '');

function getAuthToken() {
  return (
    localStorage.getItem('accessToken') ||
    localStorage.getItem('token') ||
    localStorage.getItem('jwt') ||
    ''
  );
}

async function apiRequest(method, path, body) {
  const url = `${API_URL}${String(path || '').startsWith('/') ? path : `/${path}`}`;
  const token = getAuthToken();

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');

    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        const refreshData = await refreshResponse.json().catch(() => ({}));

        if (refreshResponse.ok && refreshData?.accessToken) {
          localStorage.setItem('accessToken', refreshData.accessToken);
          if (refreshData.refreshToken) localStorage.setItem('refreshToken', refreshData.refreshToken);

          response = await fetch(url, {
            method,
            headers: { ...headers, Authorization: `Bearer ${refreshData.accessToken}` },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
        }
      } catch (_) {}
    }
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.response = { status: response.status, data };
    throw error;
  }

  return { data };
}

const api = {
  get: (path) => apiRequest('GET', path),
  post: (path, body) => apiRequest('POST', path, body),
};

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.streams)) return data.streams;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function unwrapOne(data) {
  return data?.stream || data?.data || data;
}

function idOf(item) {
  return item?._id || item?.id || item?.streamId || '';
}

function safeRoom(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '');
}

function liveRoomName(stream) {
  const id = idOf(stream);
  return safeRoom(stream?.mirotalkRoom || stream?.broadcastRoom || stream?.roomName || stream?.room || stream?.jitsiRoom || `nexora-live-${id || Date.now()}`);
}

function publicBroadcastUrl(value) {
  try {
    const url = new URL(value || MIROTALK_PUBLIC_URL, MIROTALK_PUBLIC_URL);

    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname)) {
      const base = new URL(MIROTALK_PUBLIC_URL);
      url.protocol = base.protocol;
      url.host = base.host;
    }

    return url.toString();
  } catch (_) {
    return '';
  }
}

function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null') || {};
  } catch (_) {
    return {};
  }
}

function userName(user, fallback = 'Người dùng') {
  return user?.displayName || user?.name || user?.username || fallback;
}

function userAvatar(user) {
  return user?.avatar || user?.photoURL || '';
}

function hostOf(stream) {
  return typeof stream?.host === 'object' ? stream.host : stream?.hostUser || stream?.user || {};
}

function hostIdOf(stream) {
  const host = hostOf(stream);
  return host?._id || host?.id || stream?.host || stream?.hostId || '';
}

function isLive(stream) {
  return String(stream?.status || 'live') === 'live';
}

function liveVisibilityText(stream) {
  const v = String(stream?.visibility || stream?.privacy || 'public');
  if (v === 'friends') return 'Bạn bè';
  if (v === 'private') return 'Riêng tư';
  return 'Công khai';
}

function getCommentText(comment) {
  return comment?.text || comment?.body || comment?.content || '';
}

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

const styles = {
  page: {
    minHeight: '100%',
    padding: 18,
    background:
      'radial-gradient(circle at top left, rgba(239,68,68,.18), transparent 32%), linear-gradient(135deg, #f8fafc 0%, #eef2ff 45%, #fff7ed 100%)',
  },
  shell: {
    display: 'grid',
    gridTemplateColumns: '320px minmax(0, 1fr) 360px',
    gap: 16,
    alignItems: 'start',
  },
  card: {
    background: 'rgba(255,255,255,.92)',
    border: '1px solid rgba(226,232,240,.9)',
    borderRadius: 24,
    boxShadow: '0 20px 60px rgba(15,23,42,.08)',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid #e5e7eb',
    outline: 'none',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 700,
  },
  button: {
    border: 0,
    borderRadius: 14,
    padding: '11px 14px',
    fontWeight: 900,
    cursor: 'pointer',
  },
};

export default function LivePanel() {
  const me = useMemo(() => getSavedUser(), []);
  const myId = me?._id || me?.id || '';

  const [streams, setStreams] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const selectedIdRef = useRef('');
  const [comments, setComments] = useState([]);
  const [title, setTitle] = useState('Livestream mới');
  const [visibility, setVisibility] = useState('public');
  const [commentText, setCommentText] = useState('');
  const [joinCache, setJoinCache] = useState({});
  const [joinLoading, setJoinLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(
    () => streams.find((stream) => sameId(idOf(stream), selectedId)) || null,
    [streams, selectedId]
  );

  const isHost = Boolean(selected && sameId(hostIdOf(selected), myId));
  const role = isHost ? 'host' : 'viewer';
  const frameKey = selected ? `${idOf(selected)}:${role}` : '';
  const joinUrl = joinCache[frameKey] || '';
  const roomName = selected ? liveRoomName(selected) : '';

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadStreams = useCallback(async ({ autoSelect = false } = {}) => {
    setError('');
    const res = await api.get('/live');
    const list = unwrapList(res.data).filter(isLive);
    setStreams(list);

    const currentId = selectedIdRef.current;
    const stillExists = currentId && list.some((item) => sameId(idOf(item), currentId));

    if (currentId && !stillExists) {
      selectedIdRef.current = '';
      setSelectedId('');
      setComments([]);
    } else if (!currentId && autoSelect && list.length > 0) {
      const firstId = idOf(list[0]);
      selectedIdRef.current = firstId;
      setSelectedId(firstId);
    }

    return list;
  }, []);

  const loadBroadcastJoin = useCallback(async (stream, currentRole) => {
    const streamId = idOf(stream);
    if (!streamId) return '';

    const cacheKey = `${streamId}:${currentRole}`;
    if (joinCache[cacheKey]) return joinCache[cacheKey];

    setJoinLoading(true);

    try {
      const res = await api.get(`/live/${streamId}/broadcast-join?role=${currentRole}`);
      const url = publicBroadcastUrl(res.data?.joinUrl || res.data?.join || '');
      if (!url) throw new Error('Không lấy được link LEGATALK Broadcast.');

      setJoinCache((prev) => (prev[cacheKey] ? prev : { ...prev, [cacheKey]: url }));
      return url;
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không mở được LEGATALK Broadcast.');
      return '';
    } finally {
      setJoinLoading(false);
    }
  }, [joinCache]);

  const loadComments = useCallback(async (streamId = selectedIdRef.current) => {
    if (!streamId) {
      setComments([]);
      return [];
    }

    const res = await api.get(`/live/${streamId}/comments`);
    const list = unwrapList(res.data);
    setComments(list);
    return list;
  }, []);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      try {
        await loadStreams({ autoSelect: true });
      } catch (err) {
        if (active) setError(err?.response?.data?.message || err?.message || 'Không tải được livestream.');
      } finally {
        if (active) setLoading(false);
      }
    }

    boot();

    const timer = setInterval(() => {
      loadStreams({ autoSelect: true }).catch(() => {});
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadStreams]);

  useEffect(() => {
    if (!selected) {
      setComments([]);
      return undefined;
    }

    loadBroadcastJoin(selected, role).catch(() => {});
    loadComments(idOf(selected)).catch(() => {});

    const timer = setInterval(() => loadComments(idOf(selected)).catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [selectedId, role, selected, loadBroadcastJoin, loadComments]);

  async function createLive() {
    setCreating(true);
    setError('');

    try {
      const res = await api.post('/live', {
        title: title.trim() || 'Livestream mới',
        visibility,
        privacy: visibility,
        provider: 'mirotalk-bro',
      });

      const stream = unwrapOne(res.data);
      const streamId = idOf(stream);
      await loadStreams({ autoSelect: false });

      if (streamId) {
        selectedIdRef.current = streamId;
        setSelectedId(streamId);
        await loadBroadcastJoin(stream, 'host');
        await loadComments(streamId);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không tạo được livestream.');
    } finally {
      setCreating(false);
    }
  }

  async function endLive() {
    if (!selectedId) return;

    setEnding(true);

    try {
      await api.post(`/live/${selectedId}/end`, {});
      setSelectedId('');
      selectedIdRef.current = '';
      setComments([]);
      setJoinCache((prev) => {
        const next = { ...prev };
        delete next[`${selectedId}:host`];
        delete next[`${selectedId}:viewer`];
        return next;
      });
      await loadStreams({ autoSelect: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không kết thúc được livestream.');
    } finally {
      setEnding(false);
    }
  }

  async function sendComment(event) {
    event?.preventDefault?.();

    const text = commentText.trim();

    if (!selectedId || !text) return;

    setCommentText('');

    try {
      await api.post(`/live/${selectedId}/comments`, { text, body: text, content: text });
      await loadComments(selectedId);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không gửi được bình luận.');
    }
  }

  const host = hostOf(selected);

  return (
    <div className="live-panel" style={styles.page}>
      <style>{`
        @media (max-width: 1180px) {
          .nexora-live-shell { grid-template-columns: 1fr !important; }
          .nexora-live-comments { height: auto !important; min-height: 360px; }
        }
        .nexora-live-item:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(15,23,42,.08); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ color: '#ef4444', fontWeight: 900, letterSpacing: '.08em', fontSize: 12 }}>LEGATALK LIVE · LEGATALK BROADCAST</div>
          <h1 style={{ margin: '2px 0 0', color: '#0f172a', fontSize: 32, lineHeight: 1.05 }}>Livestream Broadcast</h1>
          <div style={{ color: '#64748b', fontWeight: 700 }}>Host phát live, tài khoản khác thấy link live bên dưới và bấm vào là viewer.</div>
        </div>
        <button type="button" onClick={() => loadStreams({ autoSelect: true }).catch(() => {})} style={{ ...styles.button, background: '#0f172a', color: '#fff' }}>
          Làm mới
        </button>
      </div>

      {error ? (
        <div style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 16, padding: 14, marginBottom: 14, fontWeight: 800 }}>
          {error}
        </div>
      ) : null}

      <div className="nexora-live-shell" style={styles.shell}>
        <section style={{ ...styles.card, padding: 16 }}>
          <h2 style={{ margin: '0 0 12px', color: '#0f172a' }}>Tạo live</h2>

          <div style={{ display: 'grid', gap: 10 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề live" style={styles.input} />

            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={styles.input}>
              <option value="public">Công khai</option>
              <option value="friends">Bạn bè</option>
            </select>

            <button disabled={creating} onClick={createLive} style={{ ...styles.button, background: creating ? '#fca5a5' : '#ef4444', color: 'white' }}>
              {creating ? 'Đang tạo...' : 'Tạo phòng live'}
            </button>
          </div>

          <div style={{ height: 1, background: '#e5e7eb', margin: '18px 0' }} />

          <h3 style={{ margin: '0 0 10px', color: '#0f172a' }}>Link live đang mở {streams.length ? `(${streams.length})` : ''}</h3>

          {loading ? <p style={{ color: '#64748b', fontWeight: 700 }}>Đang tải...</p> : null}
          {!loading && streams.length === 0 ? <p style={{ color: '#64748b', fontWeight: 700 }}>Chưa có livestream nào.</p> : null}

          <div style={{ display: 'grid', gap: 10 }}>
            {streams.map((stream) => {
              const itemHost = hostOf(stream);
              const mine = sameId(hostIdOf(stream), myId);
              const active = selectedId && sameId(idOf(stream), selectedId);
              const itemRoom = liveRoomName(stream);

              return (
                <button
                  type="button"
                  key={idOf(stream)}
                  className="nexora-live-item"
                  onClick={() => {
                    selectedIdRef.current = idOf(stream);
                    setSelectedId(idOf(stream));
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: active ? '2px solid #ef4444' : '1px solid #e5e7eb',
                    background: active ? '#fff1f2' : '#fff',
                    borderRadius: 18,
                    padding: 12,
                    cursor: 'pointer',
                    transition: '.15s',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 999, background: mine ? '#ef4444' : '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
                      {mine ? 'Host' : 'View'}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stream.title || 'Livestream'}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                        {userName(itemHost, 'Host')} • {mine ? 'Bạn là host' : 'Bấm vào sẽ vào viewer'}
                      </div>
                    </div>
                  </div>

                  <div style={{ color: '#334155', fontSize: 12, marginTop: 8, fontWeight: 800, background: '#f8fafc', border: '1px solid #e5e7eb', padding: '7px 9px', borderRadius: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Link live: {itemRoom}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <main style={{ ...styles.card, padding: 12, minHeight: 580 }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '4px 4px 12px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ background: '#ef4444', color: '#fff', borderRadius: 999, padding: '4px 9px', fontWeight: 900, fontSize: 12 }}>LIVE</span>
                    <span style={{ color: '#64748b', fontWeight: 800, fontSize: 13 }}>{isHost ? 'Host mode' : 'Viewer mode'}</span>
                  </div>
                  <h2 style={{ margin: 0, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title || 'Livestream'}</h2>
                  <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>Link live: {roomName}</div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      if (isHost) {
                        endLive();
                      } else {
                        setSelectedId('');
                        selectedIdRef.current = '';
                        setComments([]);
                      }
                    }}
                    style={{ ...styles.button, background: '#f8fafc', border: '1px solid #e5e7eb', color: '#0f172a' }}
                  >
                    {isHost ? 'Thoát & kết thúc' : 'Đóng'}
                  </button>
                  {isHost ? (
                    <button disabled={ending} onClick={endLive} style={{ ...styles.button, background: '#dc2626', color: 'white' }}>
                      {ending ? 'Đang kết thúc...' : 'Kết thúc'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ width: '100%', height: 'calc(100vh - 260px)', minHeight: 520, background: '#020617', borderRadius: 18, overflow: 'hidden', position: 'relative' }}>
                {joinLoading && !joinUrl ? (
                  <div style={{ color: 'white', display: 'grid', placeItems: 'center', height: '100%', fontWeight: 900 }}>
                    Đang mở MiroTalk Broadcast...
                  </div>
                ) : joinUrl ? (
                  <iframe
                    key={frameKey}
                    title="MiroTalk Broadcast"
                    src={joinUrl}
                    allow={isHost ? 'camera; microphone; fullscreen; display-capture; autoplay' : 'fullscreen; autoplay'}
                    allowFullScreen
                    style={{ width: '100%', height: '100%', border: 0, background: '#020617' }}
                  />
                ) : (
                  <div style={{ color: 'white', display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center', padding: 20 }}>
                    Không lấy được link LEGATALK BRO. 
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ minHeight: 540, display: 'grid', placeItems: 'center', color: '#64748b', fontWeight: 800, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 60, marginBottom: 12 }}>📺</div>
                Chọn một link live bên trái để xem.
              </div>
            </div>
          )}
        </main>

        <aside className="nexora-live-comments" style={{ ...styles.card, padding: 14, height: 'calc(100vh - 138px)', minHeight: 580, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            {userAvatar(host) ? (
              <img src={userAvatar(host)} alt="" style={{ width: 40, height: 40, borderRadius: 999, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 999, background: '#0f172a', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
                {selected ? userName(host, 'H').slice(0, 1).toUpperCase() : '?'}
              </div>
            )}
            <div>
              <h3 style={{ margin: 0, color: '#0f172a' }}>Bình luận live</h3>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>{selected ? userName(host, 'Host') : 'Chưa chọn live'}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', display: 'grid', alignContent: 'start', gap: 10, paddingRight: 3 }}>
            {!selected ? <p style={{ color: '#64748b', fontWeight: 700 }}>Chọn một link live để xem comment.</p> : null}
            {selected && comments.length === 0 ? <p style={{ color: '#64748b', fontWeight: 700 }}>Chưa có bình luận.</p> : null}

            {comments.map((comment) => {
              const user = comment.user || {};
              const avatar = userAvatar(user);

              return (
                <div key={comment._id || comment.id || `${comment.createdAt}-${getCommentText(comment)}`} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  {avatar ? (
                    <img src={avatar} alt="" style={{ width: 32, height: 32, borderRadius: 999, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 999, background: '#e2e8f0', color: '#0f172a', display: 'grid', placeItems: 'center', fontWeight: 900, flexShrink: 0 }}>
                      {userName(user).slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div style={{ background: '#f1f5f9', color: '#0f172a', borderRadius: 16, padding: '9px 12px', maxWidth: '100%', boxShadow: 'inset 0 0 0 1px rgba(226,232,240,.8)' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 2 }}>{userName(user)}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, color: '#111827' }}>{getCommentText(comment)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={sendComment} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              disabled={!selected}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={selected ? 'Viết bình luận...' : 'Chọn live trước'}
              style={{ ...styles.input, flex: 1 }}
            />
            <button type="submit" disabled={!selected || !commentText.trim()} style={{ ...styles.button, background: selected && commentText.trim() ? '#2563eb' : '#cbd5e1', color: 'white' }}>
              Gửi
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
