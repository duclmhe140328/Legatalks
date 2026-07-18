import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  Check, Clapperboard, Globe2, Heart, ImagePlus, Link2, LockKeyhole, MapPin,
  MessageCircle, MessagesSquare, Mic, MoreHorizontal, Newspaper, Plus, Repeat2,
  Pause, Play, Reply, Search, Send, Share2, ShieldCheck, SmilePlus, UserPlus, Users, Video, Radio, X
} from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Avatar from '../components/Avatar';
import { EmbeddedVideo, extractVideoEmbed, removeEmbeddedUrl } from '../services/videoEmbeds';
import LivePanel from '../components/LivePanel';
function normalizeUploadedMedia(raw = {}) {
  const mimeType = String(
    raw?.mimeType ||
    raw?.contentType ||
    '',
  );

  const url = String(
    raw?.url ||
    raw?.fileUrl ||
    raw?.path ||
    '',
  );

  let type = String(raw?.type || '');

  if (type !== 'image' && type !== 'video') {
    type = mimeType.startsWith('video/')
      ? 'video'
      : 'image';
  }

  return {
    ...raw,
    url,
    thumbUrl:
      raw?.thumbUrl ||
      raw?.thumbnailUrl ||
      url,
    mimeType,
    type,
  };
}
const originalPost = (post) => post?.repostOf || post;
const emojiChoices = ['😀', '😂', '😍', '🥰', '😮', '😢', '😡', '👍', '❤️', '🔥', '🎉', '🙏'];
const stickerChoices = ['👋', '🎉', '💯', '🚀', '🤣', '🥳', '❤️‍🔥', '👏'];

function SmartVideo({ src, poster, className = '', preload = 'metadata', muted = false, autoPlay = false }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.paused || video.ended) await video.play();
      else video.pause();
    } catch {
      // Trình duyệt có thể chặn autoplay; nút controls gốc vẫn dùng được.
    }
  };

  return <div className={`smart-video-shell ${className}`.trim()}>
    <video
      ref={videoRef}
      src={src}
      poster={poster || undefined}
      controls
      playsInline
      preload={preload}
      muted={muted}
      autoPlay={autoPlay}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
    />
    <button
      type="button"
      className={`smart-video-toggle ${playing ? 'is-playing' : ''}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void togglePlayback();
      }}
      aria-label={playing ? 'Tạm dừng video' : 'Phát video'}
      title={playing ? 'Tạm dừng' : 'Phát'}
    >
      {playing ? <Pause /> : <Play />}
    </button>
  </div>;
}


function normalizeTimelineTab(value) {
  const tab = String(value || 'feed').toLowerCase();
  if (tab === 'livestream') return 'live';
  if (tab === 'videos') return 'video';
  if (tab === 'group') return 'groups';
  return ['feed', 'video', 'groups', 'live'].includes(tab) ? tab : 'feed';
}

export default function TimelinePage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState(() => normalizeTimelineTab(new URLSearchParams(window.location.search).get('tab')));
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [privacy, setPrivacy] = useState('friends');
  const [media, setMedia] = useState([]);
  const [status, setStatus] = useState('');
  const [sharePost, setSharePost] = useState(null);
  const fileInput = useRef(null);
  const scrollAreaRef = useRef(null);
  const deepLinkHandled = useRef(false);
  const loadedPostIds = useRef(new Set());
  const commentRefreshTimers = useRef(new Map());
  const draftEmbed = useMemo(() => extractVideoEmbed(text), [text]);

  const setTimelineTab = (nextTab) => {
    const normalized = normalizeTimelineTab(nextTab);
    const params = new URLSearchParams(location.search);
    if (normalized === 'feed') params.delete('tab');
    else params.set('tab', normalized);
    params.delete('post');
    navigate(`/timeline${params.toString() ? `?${params.toString()}` : ''}`);
  };

  useEffect(() => {
    const nextTab = normalizeTimelineTab(new URLSearchParams(location.search).get('tab'));
    setTab((current) => current === nextTab ? current : nextTab);
  }, [location.search]);

  const load = async () => {
    if (tab === 'groups' || tab === 'live') return;
    try {
      setStatus('');
      const { data } = await api.get('/posts/feed', { params: tab === 'video' ? { type: 'video', limit: 50 } : { limit: 40 } });
      let next = data;
      const targetId = new URLSearchParams(window.location.search).get('post');
      if (targetId && !next.some((item) => String(item._id) === String(targetId))) {
        try {
          const target = (await api.get(`/posts/${targetId}`)).data;
          next = [target, ...next];
        } catch { /* bài không còn quyền xem */ }
      }
      setPosts(next);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  useEffect(() => {
    scrollAreaRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    void load();
  }, [tab]);

  useEffect(() => {
    loadedPostIds.current = new Set(posts.map((item) => String(item._id)));
  }, [posts]);

  useEffect(() => {
    if (!socket) return undefined;
    const onCommentChanged = ({ postId }) => {
      const id = String(postId || '');
      if (!id || !loadedPostIds.current.has(id)) return;
      const existing = commentRefreshTimers.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(async () => {
        commentRefreshTimers.current.delete(id);
        try {
          const { data } = await api.get(`/posts/${id}`);
          setPosts((list) => list.map((item) => String(item._id) === id ? data : item));
        } catch {
          // Bài có thể đã bị xóa hoặc người dùng không còn quyền xem.
        }
      }, 80);
      commentRefreshTimers.current.set(id, timer);
    };
    socket.on('post:comment:changed', onCommentChanged);
    return () => {
      socket.off('post:comment:changed', onCommentChanged);
      commentRefreshTimers.current.forEach((timer) => window.clearTimeout(timer));
      commentRefreshTimers.current.clear();
    };
  }, [socket]);

  useEffect(() => {
    const targetId = new URLSearchParams(window.location.search).get('post');
    if (!targetId || deepLinkHandled.current || posts.length === 0) return;
    deepLinkHandled.current = true;
    window.requestAnimationFrame(() => document.getElementById(`post-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [posts]);

  const upload = async (file) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const item = (await api.post('/uploads', form)).data;
      setMedia((list) => [...list, { url: item.url, thumbUrl: item.thumbUrl, type: file.type.startsWith('video/') ? 'video' : 'image' }]);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const create = async () => {
    if (!text.trim() && media.length === 0) return;
    try {
      const contentType = draftEmbed || media.some((item) => item.type === 'video') ? 'video' : 'post';
      const { data } = await api.post('/posts', { text, media, privacy, contentType });
      if (tab === 'feed' || contentType === 'video') setPosts((list) => [data, ...list]);
      setText('');
      setMedia([]);
      setStatus('Đã đăng bài.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const like = async (post) => {
    const { data } = await api.post(`/posts/${post._id}/like`);
    setPosts((list) => list.map((item) => item._id === post._id ? {
      ...item,
      likes: data.liked ? [...item.likes, user._id] : item.likes.filter((id) => String(id?._id || id) !== user._id)
    } : item));
  };

  const comment = async (post, payload) => {
    const { data } = await api.post(`/posts/${post._id}/comments`, payload);
    setPosts((list) => list.map((item) => item._id === post._id
      ? { ...item, comments: [...(item.comments || []), data] }
      : item));
    return data;
  };

  const updatePostItem = (updated) => setPosts((list) => list.map((item) => String(item._id) === String(updated._id) ? updated : item));
  const removePostItem = (postId) => setPosts((list) => list.filter((item) => String(item._id) !== String(postId)));

  const updateOriginalShareCount = (postId, shareCount) => {
    setPosts((list) => list.map((item) => {
      if (String(item._id) === String(postId)) return { ...item, shareCount };
      if (String(item.repostOf?._id) === String(postId)) return { ...item, repostOf: { ...item.repostOf, shareCount } };
      return item;
    }));
  };

  const repost = async (post, caption, repostPrivacy) => {
    const source = originalPost(post);
    const { data } = await api.post(`/posts/${source._id}/repost`, { text: caption, privacy: repostPrivacy });
    setPosts((list) => [data, ...list]);
    updateOriginalShareCount(source._id, (source.shareCount || 0) + 1);
    setStatus('Đã đăng lại bài viết.');
  };

  return <div className="timeline-shell">
    <div className="timeline-tabbar-wrap">
      <div className="timeline-tabs" role="tablist" aria-label="Chế độ Nhật ký">
        <button role="tab" aria-selected={tab === 'feed'} className={tab === 'feed' ? 'active' : ''} onClick={() => setTimelineTab('feed')}>
          <span className="timeline-tab-icon"><Newspaper /></span><span><b>Bảng tin</b><small>Bài viết từ bạn bè</small></span>
        </button>
        <button role="tab" aria-selected={tab === 'video'} className={tab === 'video' ? 'active' : ''} onClick={() => setTimelineTab('video')}>
          <span className="timeline-tab-icon"><Clapperboard /></span><span><b>Video</b><small>Cuộn xem toàn màn hình</small></span>
        </button>
        <button role="tab" aria-selected={tab === 'groups'} className={tab === 'groups' ? 'active' : ''} onClick={() => setTimelineTab('groups')}>
          <span className="timeline-tab-icon"><Users /></span><span><b>Nhóm</b><small>Cộng đồng và nhóm kín</small></span>
        </button>
        <button role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'active' : ''} onClick={() => setTimelineTab('live')}>
          <span className="timeline-tab-icon"><Radio /></span><span><b>Livestream</b><small>Phát và xem trực tiếp</small></span>
        </button>
      </div>
    </div>

    <div ref={scrollAreaRef} className="timeline-scroll-area">
      {tab === 'feed' ? <div className="timeline-page">
        <div className="timeline-main">
          <CreatePost user={user} text={text} setText={setText} privacy={privacy} setPrivacy={setPrivacy} media={media} draftEmbed={draftEmbed} fileInput={fileInput} upload={upload} create={create} status={status} />
          <StoriesBar user={user} />
          <div className="feed-list">{posts.map((post) => <PostCard key={post._id} post={post} user={user} onLike={() => like(post)} onComment={(payload) => comment(post, payload)} onShare={() => setSharePost(post)} onUpdated={updatePostItem} onDeleted={removePostItem} />)}</div>
        </div>
        <aside className="timeline-side card"><h3>Nhật ký của bạn</h3><div className="stat-grid"><div><b>{posts.filter((post) => post.author?._id === user._id).length}</b><span>Bài viết</span></div><div><b>{user.friends?.length || 0}</b><span>Bạn bè</span></div><div><b>{user.followingOfficial?.length || 0}</b><span>OA theo dõi</span></div></div><p>Dán link YouTube, TikTok đầy đủ, Vimeo hoặc video trực tiếp vào ô đăng bài để hệ thống tự tạo player.</p></aside>
      </div> : tab === 'video' ? <div className="video-journal-layout">
        <div className="video-create-wrap"><CreatePost compact user={user} text={text} setText={setText} privacy={privacy} setPrivacy={setPrivacy} media={media} draftEmbed={draftEmbed} fileInput={fileInput} upload={upload} create={create} status={status} /></div>
        <div className="short-video-feed">
          {posts.length === 0 && <div className="empty-state card"><div className="empty-icon">🎬</div><h3>Chưa có video</h3><p>Đăng video hoặc dán link video vào Bảng tin.</p></div>}
          {posts.map((post) => <VideoPost key={post._id} post={post} user={user} onLike={() => like(post)} onComment={(payload) => comment(post, payload)} onShare={() => setSharePost(post)} />)}
        </div>
      </div> : tab === 'groups' ? <CommunityGroupsPanel user={user} /> : <LivePanel />}
    </div>

    {sharePost && <ShareDialog post={sharePost} currentUser={user} onClose={() => setSharePost(null)} onRepost={repost} onShareCount={updateOriginalShareCount} />}
  </div>;
}


function StoriesBar({ user }) {
  const [stories, setStories] = useState([]);
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const loadStories = async () => {
    try { setStories((await api.get('/stories')).data || []); }
    catch (loadError) { setError(errorMessage(loadError)); }
  };
  useEffect(() => { void loadStories(); }, []);

  useEffect(() => {
    if (!active?._id) return;
    let cancelled = false;
    api.post(`/stories/${active._id}/view`).then(({ data }) => {
      if (cancelled || !data?._id) return;
      setStories((list) => list.map((item) => String(item._id) === String(data._id) ? data : item));
      setActive((current) => String(current?._id) === String(data._id) ? data : current);
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [active?._id]);
  const uploadStoryMedia = async (file) => {
    setBusy(true);
    setError('');

    try {
      const form = new FormData();
      form.append('file', file);

      const { data: item } = await api.post('/uploads', form);

      setMedia({
        url: item.url,
        thumbUrl: item.thumbUrl || item.url,
        mimeType: item.mimeType || file.type,
        type:
          item.type ||
          (file.type.startsWith('video/') ? 'video' : 'image'),
      });
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  };

  const createStory = async () => {
    if (!text.trim() && !media) return;
    try {
      const { data } = await api.post('/stories', { text, media: media ? [media] : [], privacy: 'friends' });
      setStories((list) => [data, ...list]);
      setText(''); setMedia(null); setError('');
    } catch (createError) { setError(errorMessage(createError)); }
  };

  const reactStory = async (story, emoji = '❤️') => {
    const { data } = await api.post(`/stories/${story._id}/react`, { emoji });
    setStories((list) => list.map((item) => String(item._id) === String(data._id) ? data : item));
    setActive(data);
  };

  const replyStory = async () => {
    if (!active || !reply.trim()) return;
    const { data } = await api.post(`/stories/${active._id}/replies`, { text: reply.trim() });
    setStories((list) => list.map((item) => String(item._id) === String(data._id) ? data : item));
    setActive(data); setReply('');
  };

  return <section className="stories-card card">
    <div className="stories-create">
  <Avatar user={user} size={38} />

  <input
    value={text}
    onChange={(event) => setText(event.target.value)}
    placeholder="Đăng story 24h…"
    disabled={busy}
  />

  <button
    type="button"
    disabled={busy}
    onClick={() => fileRef.current?.click()}
  >
    <ImagePlus size={16} />
    {busy ? 'Đang tải…' : 'Ảnh/video'}
  </button>

  <input
    ref={fileRef}
    type="file"
    accept="image/*,video/*"
    hidden
    onChange={(event) => {
      const file = event.target.files?.[0];

      if (file) {
        void uploadStoryMedia(file);
      }

      event.target.value = '';
    }}
  />

  <button
    type="button"
    className="story-send"
    disabled={busy}
    onClick={createStory}
  >
    <Plus size={16} />
    Đăng
  </button>
</div>
    {media && <div className="story-selected">{media.type === 'video' ? <video src={media.url} muted /> : <img src={media.thumbUrl || media.url} alt="Story" />}<span>{media.mimeType || media.type}</span><button onClick={() => setMedia(null)}><X size={14} /></button></div>}
    {error && <div className="comment-error">{error}</div>}
    <div className="stories-strip">
      {stories.length === 0 && <span className="story-empty">Chưa có story từ bạn bè.</span>}
      {stories.map((story) => {
        const item = story.media?.[0];
        return <button className="story-chip" key={story._id} onClick={() => setActive(story)}>
          <div className="story-thumb">{item?.type === 'video' ? <video src={item.thumbUrl || item.url} muted /> : item?.url ? <img src={item.thumbUrl || item.url} alt="Story" /> : <Avatar user={story.author} size={52} />}</div>
          <span>{story.author?.displayName || 'Story'}</span>
        </button>;
      })}
    </div>
    {active && <div className="story-viewer" onClick={() => setActive(null)}>
      <div className="story-viewer-card" onClick={(event) => event.stopPropagation()}>
        <button className="story-close" onClick={() => setActive(null)}><X /></button>
        <div className="story-viewer-head"><Avatar user={active.author} size={34} /><b>{active.author?.displayName}</b><span>{formatDistanceToNow(new Date(active.createdAt), { addSuffix: true, locale: vi })}</span></div>
        {active.media?.[0]?.type === 'video'
          ? <video className="story-viewer-media" src={active.media[0].url} controls autoPlay />
          : active.media?.[0]?.url ? <img className="story-viewer-media" src={active.media[0].url} alt="Story" /> : null}
        {active.text && <p className="story-viewer-text">{active.text}</p>}
        <div className="story-insights">
          <span>👁 {active.viewers?.length || active.viewCount || 0} lượt xem</span>
          <span>❤️ {active.reactions?.length || 0} react</span>
          <span>💬 {active.replies?.length || 0} trả lời</span>
        </div>
        <div className="story-reactions">{['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) => <button key={emoji} onClick={() => void reactStory(active, emoji)}>{emoji}</button>)}<span>{active.reactions?.length || 0} react</span></div>
        <div className="story-reply-box"><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder={`Trả lời ${active.author?.displayName || 'story'}…`} onKeyDown={(event) => { if (event.key === 'Enter') void replyStory(); }} /><button onClick={() => void replyStory()}><Send size={15} /></button></div>
      </div>
    </div>}
  </section>;
}

function CommunityGroupsPanel({ user }) {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [postText, setPostText] = useState('');
  const [postMedia, setPostMedia] = useState([]);
  const [postBusy, setPostBusy] = useState(false);
  const groupFile = useRef(null);
  const groupPostIds = useRef(new Set());
  const groupCommentTimers = useRef(new Map());

  const loadGroups = async () => {
    try {
      const { data } = await api.get('/groups', { params: search ? { search } : {} });
      setGroups(data || []);
      setSelectedId((current) => current || data?.[0]?._id || null);
    } catch (error) { setStatus(errorMessage(error)); }
  };

  const loadSelected = async (id) => {
    if (!id) { setSelected(null); setPosts([]); return; }
    try {
      const detail = (await api.get(`/groups/${id}`)).data;
      setSelected(detail);
      if (detail.privacy === 'public' || detail.isMember) {
        setPosts((await api.get(`/groups/${id}/posts`)).data || []);
      } else setPosts([]);
    } catch (error) { setStatus(errorMessage(error)); }
  };

  useEffect(() => { void loadGroups(); }, []);
  useEffect(() => { void loadSelected(selectedId); }, [selectedId]);
  useEffect(() => {
    groupPostIds.current = new Set(posts.map((item) => String(item._id)));
  }, [posts]);
  useEffect(() => {
    if (!socket) return undefined;
    const onCommentChanged = ({ postId }) => {
      const id = String(postId || '');
      if (!id || !groupPostIds.current.has(id)) return;
      const existing = groupCommentTimers.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(async () => {
        groupCommentTimers.current.delete(id);
        try {
          const { data } = await api.get(`/posts/${id}`);
          setPosts((list) => list.map((item) => String(item._id) === id ? data : item));
        } catch {
          // Không còn quyền xem hoặc bài đã xóa.
        }
      }, 80);
      groupCommentTimers.current.set(id, timer);
    };
    socket.on('post:comment:changed', onCommentChanged);
    return () => {
      socket.off('post:comment:changed', onCommentChanged);
      groupCommentTimers.current.forEach((timer) => window.clearTimeout(timer));
      groupCommentTimers.current.clear();
    };
  }, [socket]);

  const refresh = async () => { await loadGroups(); await loadSelected(selectedId); };

  const join = async () => {
    try {
      const { data } = await api.post(`/groups/${selectedId}/join`);
      setStatus(data.message);
      await refresh();
    } catch (error) { setStatus(errorMessage(error)); }
  };

  const approve = async (userId) => {
    await api.post(`/groups/${selectedId}/requests/${userId}/approve`);
    await refresh();
  };

  const reject = async (userId) => {
    await api.delete(`/groups/${selectedId}/requests/${userId}`);
    await refresh();
  };

  const uploadGroupMedia = async (file) => {
    const form = new FormData(); form.append('file', file);
    const item = (await api.post('/uploads', form)).data;
    setPostMedia([{ url: item.url, thumbUrl: item.thumbUrl, type: file.type.startsWith('video/') ? 'video' : 'image' }]);
  };

  const createPost = async () => {
    if (!postText.trim() && postMedia.length === 0) return;
    setPostBusy(true);
    try {
      const { data } = await api.post('/posts', {
        groupId: selectedId,
        text: postText,
        media: postMedia,
        contentType: postMedia.some((item) => item.type === 'video') || extractVideoEmbed(postText) ? 'video' : 'post'
      });
      setPosts((list) => [data, ...list]);
      setPostText(''); setPostMedia([]);
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setPostBusy(false); }
  };

  const like = async (post) => {
    const { data } = await api.post(`/posts/${post._id}/like`);
    setPosts((list) => list.map((item) => item._id === post._id ? {
      ...item,
      likes: data.liked ? [...item.likes, user._id] : item.likes.filter((id) => String(id?._id || id) !== String(user._id))
    } : item));
  };

  const comment = async (post, payload) => {
    const { data } = await api.post(`/posts/${post._id}/comments`, payload);
    setPosts((list) => list.map((item) => item._id === post._id ? { ...item, comments: [...(item.comments || []), data] } : item));
    return data;
  };

  const openChat = () => {
    const conversationId = selected?.conversation?._id || selected?.conversation;
    if (!conversationId) return;
    sessionStorage.setItem('openConversationId', conversationId);
    navigate('/chats');
  };

  return <div className="community-layout">
    <aside className="community-sidebar card">
      <div className="community-sidebar-head"><div><b>Nhóm</b><span>{groups.length} cộng đồng</span></div><button className="icon-btn soft" onClick={() => setShowCreate(true)}><Plus /></button></div>
      <div className="search-box community-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && loadGroups()} placeholder="Tìm nhóm" /></div>
      <div className="community-list">{groups.map((group) => <button key={group._id} className={selectedId === group._id ? 'active' : ''} onClick={() => setSelectedId(group._id)}>
        <Avatar user={{ displayName: group.name, avatar: group.avatar }} size={46} />
        <span><b>{group.name}</b><small>{group.privacy === 'private' ? <><LockKeyhole /> Nhóm kín</> : <><Globe2 /> Công khai</>} · {group.membersCount || group.members?.length || 0} thành viên</small></span>
        {group.hasPendingRequest && <em>Đang chờ</em>}
      </button>)}</div>
    </aside>

    <main className="community-main">
      {!selected && <div className="empty-state card"><div className="empty-icon">👥</div><h3>Chọn một nhóm</h3><p>Xem bài viết, tham gia hoặc tạo nhóm mới.</p></div>}
      {selected && <>
        <section className="community-hero card">
          <div className="community-cover">{selected.cover && <img src={selected.cover} alt="Ảnh bìa nhóm" />}</div>
          <div className="community-info"><Avatar user={{ displayName: selected.name, avatar: selected.avatar }} size={72} /><div><h2>{selected.name}</h2><p>{selected.description || 'Chưa có mô tả nhóm.'}</p><span>{selected.privacy === 'private' ? <><LockKeyhole /> Nhóm kín</> : <><Globe2 /> Nhóm công khai</>} · {selected.membersCount || selected.members?.length || 0} thành viên</span></div><div className="community-actions">
            {selected.isMember && <button className="secondary-btn" onClick={openChat}><MessagesSquare /> Mở chat nhóm</button>}
            {!selected.isMember && <button className="primary-btn" disabled={selected.hasPendingRequest} onClick={join}>{selected.hasPendingRequest ? 'Đang chờ duyệt' : selected.privacy === 'private' ? 'Gửi yêu cầu tham gia' : 'Tham gia nhóm'}</button>}
          </div></div>
        </section>

        {status && <div className="form-status global">{status}</div>}

        {selected.isManager && selected.pendingRequests?.length > 0 && <section className="group-requests card"><div className="section-head"><div><h3>Yêu cầu tham gia</h3><p>Chỉ trưởng nhóm và quản trị viên được duyệt.</p></div><ShieldCheck /></div>{selected.pendingRequests.map((request) => <div className="group-request-row" key={request.user?._id || request.user}><Avatar user={request.user} size={40} /><div><b>{request.user?.displayName}</b><span>Muốn tham gia nhóm kín</span></div><button className="accept" onClick={() => approve(request.user?._id || request.user)}><Check /> Duyệt</button><button onClick={() => reject(request.user?._id || request.user)}><X /> Từ chối</button></div>)}</section>}

        {selected.isMember && <section className="group-post-composer card"><div className="create-row"><Avatar user={user} size={42} /><textarea value={postText} onChange={(event) => setPostText(event.target.value)} placeholder={`Đăng bài trong ${selected.name}…`} /></div>{postMedia.length > 0 && <div className="post-preview">{postMedia.map((item) => item.type === 'video' ? <video key={item.url} src={item.url} controls /> : <img key={item.url} src={item.thumbUrl || item.url} alt="Xem trước" />)}</div>}<div className="group-post-actions"><button onClick={() => groupFile.current?.click()}><ImagePlus /> Ảnh/Video</button><input ref={groupFile} hidden type="file" accept="image/*,video/*" onChange={(event) => event.target.files?.[0] && uploadGroupMedia(event.target.files[0])} /><button className="publish-btn" disabled={postBusy} onClick={createPost}>Đăng trong nhóm</button></div></section>}

        {selected.privacy === 'private' && !selected.isMember ? <div className="private-group-wall card"><LockKeyhole /><h3>Nội dung chỉ dành cho thành viên</h3><p>Gửi yêu cầu và chờ trưởng nhóm duyệt để xem bài viết và tham gia chat nhóm.</p></div> : <div className="feed-list community-feed">{posts.length === 0 && <div className="empty-state card"><div className="empty-icon">📝</div><h3>Nhóm chưa có bài viết</h3><p>Hãy là người đầu tiên chia sẻ nội dung.</p></div>}{posts.map((post) => <PostCard key={post._id} post={post} user={user} onLike={() => like(post)} onComment={(payload) => comment(post, payload)} onUpdated={(updated) => setPosts((list) => list.map((item) => String(item._id) === String(updated._id) ? updated : item))} onDeleted={(postId) => setPosts((list) => list.filter((item) => String(item._id) !== String(postId)))} />)}</div>}
      </>}
    </main>

    {showCreate && <CreateCommunityGroup user={user} onClose={() => setShowCreate(false)} onCreated={async (group) => { setShowCreate(false); await loadGroups(); setSelectedId(group._id); }} />}
  </div>;
}

function CreateCommunityGroup({ user, onClose, onCreated }) {
  const friends = (user.friends || []).filter((friend) => friend && typeof friend === 'object');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post('/groups', { name, description, privacy, memberIds: selected });
      onCreated(data);
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop"><div className="modal-card community-create-modal"><div className="modal-head"><div><h3>Tạo nhóm Nhật ký</h3><p>Nhóm sẽ đồng thời có một cuộc trò chuyện nhóm trong Tin nhắn.</p></div><button onClick={onClose}><X /></button></div><label>Tên nhóm<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Cộng đồng React Việt Nam" /></label><label>Mô tả<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mục đích và nội quy nhóm…" /></label><label>Quyền riêng tư<select value={privacy} onChange={(event) => setPrivacy(event.target.value)}><option value="private">Nhóm kín — phải được duyệt</option><option value="public">Nhóm công khai — ai cũng có thể xem</option></select></label><div className="member-picker"><b>Thêm người tham gia</b>{friends.length === 0 && <p>Danh sách bạn bè đang trống.</p>}{friends.map((friend) => <label key={friend._id}><input type="checkbox" checked={selected.includes(friend._id)} onChange={() => setSelected((list) => list.includes(friend._id) ? list.filter((id) => id !== friend._id) : [...list, friend._id])} /><Avatar user={friend} size={36} /><span>{friend.displayName}</span></label>)}</div>{status && <div className="form-status">{status}</div>}<button className="primary-btn" disabled={busy || !name.trim()} onClick={create}><UserPlus /> Tạo nhóm ({selected.length + 1} thành viên)</button></div></div>;
}

function CreatePost({ user, text, setText, privacy, setPrivacy, media, draftEmbed, fileInput, upload, create, status, compact = false }) {
  return <div className={`create-post card ${compact ? 'compact' : ''}`}>
    <div className="create-row"><Avatar user={user} size={44} /><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={compact ? 'Dán link hoặc mô tả video…' : `${user.displayName} ơi, bạn đang nghĩ gì?`} /></div>
    {draftEmbed && <div className="link-video-preview"><EmbeddedVideo embed={draftEmbed} /></div>}
    {media.length > 0 && <div className="post-preview">{media.map((item, index) => item.type === 'video' ? <video key={index} src={item.url} controls /> : <img key={index} src={item.thumbUrl || item.url} alt="Bản xem trước" />)}</div>}
    {status && <div className="form-status">{status}</div>}
    <div className="create-actions"><div><button onClick={() => fileInput.current?.click()}><ImagePlus /> Ảnh</button><button onClick={() => fileInput.current?.click()}><Video /> Video</button><button><MapPin /> Check-in</button><input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(event) => event.target.files[0] && upload(event.target.files[0])} /></div><div><select value={privacy} onChange={(event) => setPrivacy(event.target.value)}><option value="public">Công khai</option><option value="friends">Bạn bè</option><option value="only_me">Chỉ mình tôi</option><option value="except">Ngoại trừ…</option></select><button className="publish-btn" onClick={create}>Đăng bài</button></div></div>
  </div>;
}

function PostContent({ post, nested = false }) {
  const embed = extractVideoEmbed(post?.text || '');
  const displayText = removeEmbeddedUrl(post?.text || '', embed);
  return <div className={nested ? 'repost-content' : ''}>
    {displayText && <p className="post-text">{displayText}</p>}
    {post?.location?.name && <div className="location-tag"><MapPin size={15} /> {post.location.name}</div>}
    {embed && <div className={`embedded-video ${embed.provider}`}><EmbeddedVideo embed={embed} /></div>}
    {post?.media?.length > 0 && <div className={`post-media count-${Math.min(post.media.length, 4)}`}>{post.media.map((item, index) => item.type === 'video' ? <SmartVideo className="post-media-video-wrap" key={index} src={item.url} poster={item.thumbUrl || undefined} preload="metadata" /> : <img className="post-media-image" key={index} src={item.thumbUrl || item.url} data-full-src={item.url} loading="lazy" decoding="async" alt="Nội dung bài viết" />)}</div>}
  </div>;
}

function RepostPreview({ post }) {
  if (!post) return <div className="repost-missing">Bài viết gốc không còn tồn tại.</div>;
  return <div className="repost-preview">
    <div className="repost-author"><Avatar user={post.author} size={36} /><div><b>{post.author?.displayName}</b><span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: vi })}</span></div></div>
    <PostContent post={post} nested />
  </div>;
}

export function PostCard({ post, user, onLike, onComment, onShare = () => { }, onUpdated = () => { }, onDeleted = () => { }, profileMode = false }) {
  const liked = post.likes.some((id) => String(id?._id || id) === user._id);
  const source = originalPost(post);
  const inputId = `comment-input-${post._id}`;
  const mine = String(post.author?._id || post.author) === String(user._id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text || '');
  const saveEdit = async () => {
    const { data } = await api.patch(`/posts/${post._id}`, { text: draft });
    onUpdated(data);
    setEditing(false);
    setMenuOpen(false);
  };
  const deletePost = async () => {
    if (!window.confirm('Xóa bài viết này?')) return;
    await api.delete(`/posts/${post._id}`);
    onDeleted(post._id);
  };
  return <article id={`post-${post._id}`} className={`post-card card ${profileMode ? 'profile-post' : ''}`}>
    <header><Avatar user={post.author} size={44} /><div><b>{post.author?.displayName} {post.repostOf && <em>đã đăng lại</em>}</b><span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: vi })} · {post.privacy === 'public' ? 'Công khai' : post.privacy === 'only_me' ? 'Chỉ mình tôi' : 'Bạn bè'}</span></div><div className="post-more-wrap"><button onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal /></button>{menuOpen && <div className="post-more-menu">{mine ? <><button onClick={() => { setDraft(post.text || ''); setEditing(true); }}>Sửa bài viết</button><button className="danger" onClick={deletePost}>Xóa bài viết</button></> : <button onClick={() => setMenuOpen(false)}>Ẩn menu</button>}</div>}</div></header>
    {editing ? <div className="post-edit-box"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows="4" /><div><button className="soft-btn" onClick={() => setEditing(false)}>Hủy</button><button className="primary-btn" onClick={saveEdit}>Lưu</button></div></div> : post.repostOf ? <><PostContent post={{ text: post.text }} /><RepostPreview post={post.repostOf} /></> : <PostContent post={post} />}
    <div className="post-counts"><span>{post.likes.length} lượt thích</span><span>{post.comments.length} bình luận · {source?.shareCount || 0} lượt chia sẻ</span></div>
    <div className="post-actions"><button className={liked ? 'liked' : ''} onClick={onLike}><Heart fill={liked ? 'currentColor' : 'none'} /> Thích</button><button onClick={() => document.getElementById(inputId)?.focus()}><MessageCircle /> Bình luận</button><button onClick={onShare}><Share2 /> Chia sẻ</button></div>
    <CommentsSection comments={post.comments || []} user={user} onSubmit={onComment} inputId={inputId} />
  </article>;
}

function VideoPost({ post, user, onLike, onComment, onShare }) {
  const liked = post.likes.some((id) => String(id?._id || id) === user._id);
  const source = originalPost(post);
  const embed = extractVideoEmbed(source?.text || '');
  const uploadedVideo = source?.media?.find((item) => item.type === 'video');
  const displayText = removeEmbeddedUrl(post.text || source?.text || '', embed);
  const inputId = `comment-video-${post._id}`;
  return <article id={`post-${post._id}`} className="short-video-card">
    <div className="short-video-stage">
      {uploadedVideo ? <SmartVideo className="short-video-smart" src={uploadedVideo.url} poster={uploadedVideo.thumbUrl || undefined} preload="metadata" /> : <EmbeddedVideo embed={embed} />}
      <div className="short-video-gradient" />
      <div className="short-video-copy"><div className="short-author"><Avatar user={post.author} size={42} /><div><b>{post.author?.displayName}</b>{post.repostOf && <span><Repeat2 size={13} /> Đăng lại từ {source?.author?.displayName}</span>}</div></div>{displayText && <p>{displayText}</p>}</div>
      <div className="short-video-actions"><button className={liked ? 'liked' : ''} onClick={onLike}><Heart fill={liked ? 'currentColor' : 'none'} /><span>{post.likes.length}</span></button><button onClick={() => document.getElementById(inputId)?.focus()}><MessageCircle /><span>{post.comments.length}</span></button><button onClick={onShare}><Share2 /><span>{source?.shareCount || 0}</span></button></div>
    </div>
    <CommentsSection compact comments={post.comments || []} user={user} onSubmit={onComment} inputId={inputId} />
  </article>;
}

function CommentsSection({ comments, user, onSubmit, inputId, compact = false }) {
  const [text, setText] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const recorderRef = useRef(null);

  const commentById = useMemo(() => new Map((comments || []).map((item) => [String(item._id), item])), [comments]);

  const children = useMemo(() => {
    const map = new Map();
    for (const item of comments) {
      const parent = item.parentComment ? String(item.parentComment?._id || item.parentComment) : 'root';
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent).push(item);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return map;
  }, [comments]);

  const uploadAttachment = async (file, kind) => {
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const item = (await api.post('/uploads', form)).data;
      setAttachment({ kind, media: [item] });
    } catch (uploadError) { setError(errorMessage(uploadError)); }
    finally { setBusy(false); }
  };

  const recordVoice = async () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await uploadAttachment(new window.File([blob], `comment-voice-${Date.now()}.webm`, { type: 'audio/webm' }), 'audio');
        recorderRef.current = null;
      };
      recorder.start();
      setRecording(true);
    } catch (recordError) { setError(recordError.message || 'Không thể sử dụng micro.'); }
  };

  const submit = async (override = null) => {
    const payload = override || {
      kind: attachment?.kind || 'text',
      text: text.trim(),
      media: attachment?.media || [],
      parentCommentId: replyTo?._id || null
    };
    if (!payload.text && !(payload.media || []).length) return;
    setBusy(true); setError('');
    try {
      await onSubmit(payload);
      setText(''); setAttachment(null); setReplyTo(null); setPicker(false);
    } catch (submitError) { setError(errorMessage(submitError)); }
    finally { setBusy(false); }
  };

  const sendSticker = (sticker) => submit({
    kind: 'sticker',
    text: sticker,
    media: [],
    parentCommentId: replyTo?._id || null
  });

  const roots = children.get('root') || [];
  const visibleRoots = showAllComments || compact ? roots : roots.slice(-3);
  const hiddenRootCount = Math.max(0, roots.length - visibleRoots.length);
  return <section className={`comments-section ${compact ? 'compact' : ''}`}>
    {!compact && hiddenRootCount > 0 && <button className="comments-show-more" type="button" onClick={() => setShowAllComments(true)}>Xem thêm {hiddenRootCount} bình luận</button>}
    {comments.length > 0 && <div className="comment-thread-list">
      {visibleRoots.map((item) => <CommentNode key={item._id} item={item} parent={commentById.get(String(item.parentComment?._id || item.parentComment))} childrenMap={children} commentById={commentById} onReply={(comment) => {
        setReplyTo(comment);
        window.requestAnimationFrame(() => document.getElementById(inputId)?.focus());
      }} />)}
    </div>}

    <div className="comment-composer">
      {replyTo && <div className="comment-replying"><Reply size={14} /><span>Đang trả lời <b>{replyTo.user?.displayName}</b></span><button onClick={() => setReplyTo(null)}><X size={14} /></button></div>}
      {attachment && <div className="comment-attachment-preview">
        {attachment.kind === 'image' ? <img src={attachment.media[0]?.thumbUrl || attachment.media[0]?.url} alt="Ảnh bình luận" /> : <audio src={attachment.media[0]?.url} controls />}
        <button onClick={() => setAttachment(null)}><X /></button>
      </div>}
      {error && <div className="comment-error">{error}</div>}
      <div className="comment-composer-row">
        <Avatar user={user} size={compact ? 28 : 32} />
        <div className="comment-input-wrap">
          <textarea id={inputId} rows="1" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); }
          }} placeholder={replyTo ? `Trả lời ${replyTo.user?.displayName}…` : 'Viết bình luận…'} />
          <div className="comment-tools">
            <button title="Emoji và sticker" onClick={() => setPicker((value) => !value)}><SmilePlus /></button>
            <button title="Gửi ảnh" onClick={() => fileRef.current?.click()}><ImagePlus /></button>
            <button className={recording ? 'recording' : ''} title={recording ? 'Dừng ghi âm' : 'Gửi âm thanh'} onClick={recordVoice}><Mic /></button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadAttachment(file, 'image');
              event.target.value = '';
            }} />
          </div>
          {picker && <div className="comment-picker">
            <div><b>Emoji</b><div>{emojiChoices.map((emoji) => <button key={emoji} onClick={() => { setText((value) => value + emoji); setPicker(false); }}>{emoji}</button>)}</div></div>
            <div><b>Sticker</b><div>{stickerChoices.map((sticker) => <button className="comment-sticker-choice" key={sticker} onClick={() => void sendSticker(sticker)}>{sticker}</button>)}</div></div>
          </div>}
        </div>
        <button className="comment-send" disabled={busy || (!text.trim() && !attachment)} onClick={() => void submit()}><Send /></button>
      </div>
    </div>
  </section>;
}

function CommentNode({ item, parent, childrenMap, commentById, onReply, depth = 0 }) {
  const navigate = useNavigate();
  const replies = childrenMap.get(String(item._id)) || [];
  const replyTarget = parent?.user?.displayName;
  const commentUserId = item.user?._id || item.user?.id;
  const openUserProfile = () => {
    if (commentUserId) navigate(`/users/${commentUserId}`);
  };
  return <div className={`comment-node depth-${Math.min(depth, 3)}`}>
    <button type="button" className="comment-avatar-link" onClick={openUserProfile} disabled={!commentUserId} aria-label={`Xem trang cá nhân ${item.user?.displayName || 'người dùng'}`}>
      <Avatar user={item.user} size={depth ? 27 : 31} />
    </button>
    <div className="comment-node-main">
      <div className="comment-bubble-rich">
        <button type="button" className="comment-user-link" onClick={openUserProfile} disabled={!commentUserId}>{item.user?.displayName || 'Người dùng'}</button>
        {replyTarget && <span className="comment-reply-target">Trả lời <b>{replyTarget}</b></span>}
        <CommentContent item={item} />
      </div>
      <div className="comment-meta-row"><time>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: vi })}</time><button onClick={() => onReply(item)}><Reply size={12} /> Trả lời</button></div>
      {replies.length > 0 && <div className="comment-replies">{replies.map((reply) => <CommentNode key={reply._id} item={reply} parent={item} childrenMap={childrenMap} commentById={commentById} onReply={onReply} depth={depth + 1} />)}</div>}
    </div>
  </div>;
}

function CommentContent({ item }) {
  const media = item.media?.[0];
  if (item.kind === 'image' && media?.url) return <><p>{item.text}</p><a href={media.url} target="_blank" rel="noreferrer"><img className="comment-image" src={media.thumbUrl || media.url} alt={media.name || 'Ảnh bình luận'} /></a></>;
  if (item.kind === 'audio' && media?.url) return <><p>{item.text}</p><audio className="comment-audio" src={media.url} controls preload="metadata" /></>;
  if (item.kind === 'sticker') return <span className="comment-sticker">{item.text}</span>;
  return <p>{item.text}</p>;
}

function ShareDialog({ post, currentUser, onClose, onRepost, onShareCount }) {
  const source = originalPost(post);
  const [mode, setMode] = useState('actions');
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState('');
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState('friends');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (mode !== 'message' || conversations.length) return;
    api.get('/conversations').then(({ data }) => setConversations(data)).catch((error) => setMessage(errorMessage(error)));
  }, [mode, conversations.length]);

  const copyLink = async () => {
    const link = `${window.location.origin}/timeline?post=${source._id}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
      else {
        const input = document.createElement('textarea');
        input.value = link; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
      }
      const result = (await api.post(`/posts/${source._id}/share`, { type: 'link' })).data;
      onShareCount(source._id, result.shareCount);
      setMessage('Đã sao chép liên kết.');
    } catch (error) { setMessage(errorMessage(error)); }
  };

  const sendMessage = async (conversation) => {
    setBusy(true);
    try {
      await api.post('/messages', {
        conversationId: conversation._id,
        clientId: crypto.randomUUID(),
        kind: 'text',
        text: `Đã chia sẻ bài viết của ${source.author?.displayName || 'một người dùng'}`,
        metadata: {
          sharedPost: {
            postId: source._id,
            author: { _id: source.author?._id, displayName: source.author?.displayName, avatar: source.author?.avatar },
            text: source.text,
            media: source.media,
            contentType: source.contentType
          }
        }
      });
      const result = (await api.post(`/posts/${source._id}/share`, { type: 'message' })).data;
      onShareCount(source._id, result.shareCount);
      setMessage('Đã gửi vào tin nhắn.');
      window.setTimeout(onClose, 700);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };

  const submitRepost = async () => {
    setBusy(true);
    try {
      await onRepost(source, caption, privacy);
      onClose();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };

  const filtered = conversations.filter((conversation) => {
    const name = conversation.name || conversation.members?.find((member) => String(member.user?._id) !== String(currentUser._id))?.user?.displayName || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return <div className="share-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="share-sheet">
      <div className="share-head"><div><b>Chia sẻ bài viết</b><span>Chọn cách bạn muốn chia sẻ</span></div><button onClick={onClose}><X /></button></div>
      {mode === 'actions' && <div className="share-options">
        <button onClick={copyLink}><span className="share-option-icon link"><Link2 /></span><div><b>Sao chép liên kết</b><small>Gửi đường dẫn cho bất kỳ ai</small></div></button>
        <button onClick={() => setMode('message')}><span className="share-option-icon message"><Send /></span><div><b>Gửi vào tin nhắn</b><small>Chọn một cuộc trò chuyện Legatalk</small></div></button>
        <button onClick={() => setMode('repost')}><span className="share-option-icon repost"><Repeat2 /></span><div><b>Đăng lại</b><small>Chia sẻ lên Nhật ký của bạn</small></div></button>
      </div>}
      {mode === 'message' && <div className="share-message-mode">
        <button className="share-back" onClick={() => setMode('actions')}>‹ Quay lại</button>
        <div className="share-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm cuộc trò chuyện…" /></div>
        <div className="share-conversations">{filtered.map((conversation) => {
          const other = conversation.members?.find((member) => String(member.user?._id) !== String(currentUser._id))?.user;
          const avatar = conversation.type === 'group' ? { displayName: conversation.name, avatar: conversation.avatar } : other;
          const name = conversation.type === 'group' ? conversation.name : other?.displayName;
          return <button key={conversation._id} disabled={busy} onClick={() => sendMessage(conversation)}><Avatar user={avatar} size={42} /><div><b>{name || 'Cuộc trò chuyện'}</b><small>{conversation.type === 'group' ? `${conversation.members?.length || 0} thành viên` : 'Tin nhắn riêng'}</small></div><Send /></button>;
        })}</div>
      </div>}
      {mode === 'repost' && <div className="repost-form">
        <button className="share-back" onClick={() => setMode('actions')}>‹ Quay lại</button>
        <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Nói gì đó về bài viết này…" />
        <div className="repost-mini-preview"><Avatar user={source.author} size={34} /><div><b>{source.author?.displayName}</b><p>{removeEmbeddedUrl(source.text || '', extractVideoEmbed(source.text || '')).slice(0, 160) || (source.contentType === 'video' ? 'Video' : 'Bài viết')}</p></div></div>
        <div className="repost-submit"><select value={privacy} onChange={(event) => setPrivacy(event.target.value)}><option value="public">Công khai</option><option value="friends">Bạn bè</option><option value="only_me">Chỉ mình tôi</option></select><button disabled={busy} onClick={submitRepost}><Repeat2 /> Đăng lại</button></div>
      </div>}
      {message && <div className="share-status"><Check /> {message}</div>}
    </div>
  </div>;
}
