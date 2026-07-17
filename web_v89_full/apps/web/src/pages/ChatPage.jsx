import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, isToday } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  CalendarPlus, Check, CheckCheck, File, ImagePlus, Mic, MoreHorizontal, Newspaper, Paperclip,
  Phone, Pin, Plus, Reply, Search, Send, SmilePlus, Trash2, UserPlus, Video, X
} from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Avatar from '../components/Avatar';

const emojis = ['❤️', '👍', '😂', '😮', '😢', '😡'];
const kindFromMime = (mime = '') => mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
const messageIdentity = (message) => message?.metadata?.type === 'call'
  ? `call:${message.metadata.callSessionId || message.callSession}`
  : `message:${message?._id}`;

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { socket, onlineUsers, startCall, markConversationActive, unreadByConversation } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [typing, setTyping] = useState('');
  const [search, setSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [mobileList, setMobileList] = useState(() => window.innerWidth <= 850 && !sessionStorage.getItem('openConversationId'));
  const [friends, setFriends] = useState([]);
  const fileInput = useRef(null);
  const endRef = useRef(null);
  const recorder = useRef(null);
  const typingTimer = useRef(null);

  const selected = conversations.find((c) => c._id === selectedId);
  const peer = selected?.type !== 'group' ? selected?.members.find((m) => m.user?._id !== user._id)?.user : null;
  const title = selected?.type === 'group' ? selected.name : peer?.displayName || selected?.name || 'Cuộc trò chuyện';

  const loadConversations = async () => {
    const { data } = await api.get('/conversations');
    setConversations(data);
    const requested = sessionStorage.getItem('openConversationId') || new URLSearchParams(window.location.search).get('conversation');
    if (requested) sessionStorage.removeItem('openConversationId');
    setSelectedId((current) => requested || current || data[0]?._id || null);
    if (requested) setMobileList(false);
  };
  useEffect(() => { loadConversations(); api.get('/users/me').then(({ data }) => setFriends(data.friends || [])); }, []);

  useEffect(() => {
    if (!selectedId) return setMessages([]);
    api.get(`/messages/${selectedId}`, { params: messageSearch ? { search: messageSearch } : {} }).then(({ data }) => {
      setMessages(data);
      api.post(`/messages/${selectedId}/read`).catch(() => {});
    });
    socket?.emit('conversation:join', { conversationId: selectedId });
  }, [selectedId, messageSearch]);

  useEffect(() => {
    const onMessage = (message) => {
      setConversations((list) => list.map((c) => c._id === message.conversation ? { ...c, lastMessage: message, lastMessageAt: message.createdAt } : c).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)));
      if (message.conversation === selectedId) {
        setMessages((list) => list.some((item) => messageIdentity(item) === messageIdentity(message)) ? list : [...list, message].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
        if (String(message.sender?._id || message.sender) !== String(user._id)) {
          // CallSession được ghép vào chat bằng event ảo `call-event-...`.
          // Chỉ gửi receipt cho Message thật có Mongo ObjectId 24 ký tự.
          const isPersistedMessage = /^[a-f\d]{24}$/i.test(String(message._id || ''));
          if (isPersistedMessage) socket.emit('message:delivered', { messageId: message._id });
          api.post(`/messages/${selectedId}/read`).catch(() => {});
        }
      } else loadConversations();
    };
    const onReaction = (message) => setMessages((list) => list.map((m) => m._id === message._id ? { ...m, reactions: message.reactions } : m));
    const onRevoked = ({ messageId }) => setMessages((list) => list.map((m) => m._id === messageId ? { ...m, revokedAt: new Date().toISOString(), text: '', media: [] } : m));
    const onRead = ({ userId, readAt }) => setMessages((list) => list.map((m) => m.sender?._id === user._id ? { ...m, receipts: (m.receipts || []).map((r) => String(r.user?._id || r.user) === String(userId) ? { ...r, deliveredAt: r.deliveredAt || readAt, readAt } : r) } : m));
    const onTyping = ({ conversationId, displayName }) => { if (conversationId === selectedId) setTyping(`${displayName} đang nhập…`); };
    const stopTyping = ({ conversationId }) => { if (conversationId === selectedId) setTyping(''); };
    const upsertConversation = (conversation) => {
      if (!conversation?._id) return;
      setConversations((list) => {
        const exists = list.some((item) => String(item._id) === String(conversation._id));
        return exists ? list.map((item) => String(item._id) === String(conversation._id) ? { ...item, ...conversation } : item) : [conversation, ...list];
      });
      socket?.emit('conversation:join', { conversationId: conversation._id });
    };
    const onConversationCreated = (conversation) => upsertConversation(conversation);
    const onConversationUpdated = (conversation) => upsertConversation(conversation);
    socket?.on('message:new', onMessage);
    socket?.on('call:chat-event', onMessage);
    socket?.on('message:reaction', onReaction);
    socket?.on('message:revoked', onRevoked);
    socket?.on('message:read', onRead);
    socket?.on('typing:start', onTyping);
    socket?.on('typing:stop', stopTyping);
    socket?.on('conversation:created', onConversationCreated);
    socket?.on('conversation:updated', onConversationUpdated);
    return () => {
      socket?.off('message:new', onMessage); socket?.off('call:chat-event', onMessage); socket?.off('message:reaction', onReaction); socket?.off('message:revoked', onRevoked);
      socket?.off('message:read', onRead); socket?.off('typing:start', onTyping); socket?.off('typing:stop', stopTyping);
      socket?.off('conversation:created', onConversationCreated); socket?.off('conversation:updated', onConversationUpdated);
    };
  }, [socket, selectedId, conversations, user._id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  useEffect(() => {
    markConversationActive(selectedId);
    return () => markConversationActive(null);
  }, [selectedId, markConversationActive]);

  const send = (payload = {}) => {
    if (!selectedId || (!text.trim() && !payload.media)) return;
    const body = {
      conversationId: selectedId,
      clientId: crypto.randomUUID(),
      kind: payload.kind || 'text',
      text: payload.text ?? text.trim(),
      media: payload.media || [],
      replyTo: replyTo?._id || null
    };
    socket.emit('message:send', body, (result) => { if (!result?.ok) setStatus(result?.message || 'Gửi thất bại'); });
    setText(''); setReplyTo(null); socket.emit('typing:stop', { conversationId: selectedId });
  };

  const type = (value) => {
    setText(value);
    socket?.emit('typing:start', { conversationId: selectedId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket?.emit('typing:stop', { conversationId: selectedId }), 900);
  };

  const upload = async (file) => {
    const form = new FormData(); form.append('file', file);
    setBusy(true);
    try {
      const media = (await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
      send({ kind: kindFromMime(file.type), media: [media], text: file.name });
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setBusy(false); }
  };

  const recordVoice = async () => {
    if (recorder.current?.state === 'recording') return recorder.current.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await upload(new window.File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' }));
        recorder.current = null;
      };
      mediaRecorder.start(); setStatus('Đang ghi âm… Nhấn micro lần nữa để gửi.');
    } catch (error) { setStatus(error.message); }
  };

  const sendGif = () => {
    const url = window.prompt('Dán URL GIF (https://...gif):');
    if (url?.startsWith('http')) send({ kind: 'gif', media: [{ url, name: 'GIF', mimeType: 'image/gif' }], text: '' });
    setShowExtras(false);
  };

  const beginCall = async (mode) => {
    if (!selected) return;
    try { await startCall(selected, mode); }
    catch (error) { setStatus(error.message || errorMessage(error)); }
  };

  const createInstantMeeting = async () => {
    if (!selectedId) return;
    try {
      setBusy(true);
      await api.post('/meetings', {
        conversationId: selectedId,
        title: `Phòng họp với ${title} - ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
        startInMinutes: 0,
        durationMinutes: 60,
        visibility: 'private',
        sendToConversation: true
      });
      setStatus('Đã tạo phòng họp và gửi link vào đoạn chat này.');
      const refreshed = await api.get(`/messages/${selectedId}`, { params: messageSearch ? { search: messageSearch } : {} });
      setMessages(refreshed.data || []);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const blockPeer = async () => {
    if (!peer?._id) return setStatus('Chỉ chặn nhanh trong cuộc trò chuyện 1-1.');
    if (!window.confirm(`Chặn ${peer.displayName}? Hai bên sẽ không thể nhắn/gọi cho nhau.`)) return;
    try {
      await api.post(`/users/block/${peer._id}`);
      setShowChatMenu(false);
      setStatus(`Đã chặn ${peer.displayName}.`);
      await loadConversations();
    } catch (error) { setStatus(errorMessage(error)); }
  };

  const filtered = useMemo(() => conversations.filter((c) => {
    const other = c.members.find((m) => m.user?._id !== user._id)?.user;
    return (c.name || other?.displayName || '').toLowerCase().includes(search.toLowerCase());
  }), [conversations, search, user._id]);

  return (
    <div className={`chat-layout ${mobileList ? 'mobile-list-open' : ''}`}>
      <section className="conversation-pane">
        <div className="pane-title"><div><h2>Tin nhắn</h2><span>{conversations.length} cuộc trò chuyện</span></div><button className="icon-btn soft" onClick={() => setShowNewGroup(true)}><Plus /></button></div>
        <div className="search-box"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm cuộc trò chuyện" /></div>
        <div className="conversation-list">
          {filtered.map((conversation) => {
            const other = conversation.members.find((m) => m.user?._id !== user._id)?.user;
            const name = conversation.type === 'group' ? conversation.name : other?.displayName;
            const avatarUser = conversation.type === 'group' ? { displayName: conversation.name, avatar: conversation.avatar } : other;
            return <button key={conversation._id} className={`conversation-item ${selectedId === conversation._id ? 'active' : ''}`} onClick={() => { setSelectedId(conversation._id); setMobileList(false); }}>
              <div className="avatar-wrap"><Avatar user={avatarUser} size={48} />{other && onlineUsers.has(String(other._id)) && <i className="online-dot" />}</div>
              <div className="conversation-copy"><div><b>{name || 'Cuộc trò chuyện'}</b><time>{conversation.lastMessageAt ? format(new Date(conversation.lastMessageAt), 'HH:mm') : ''}</time></div><p>{conversation.lastMessage?.revokedAt ? 'Tin nhắn đã thu hồi' : conversation.lastMessage?.text || 'Bắt đầu trò chuyện'}</p></div>{unreadByConversation[conversation._id] > 0 && <span className="conversation-unread">{unreadByConversation[conversation._id] > 9 ? '9+' : unreadByConversation[conversation._id]}</span>}
            </button>;
          })}
        </div>
      </section>

      <section className="message-pane">
        {!selected ? <div className="empty-state"><div className="empty-icon">💬</div><h3>Chọn một cuộc trò chuyện</h3><p>Tin nhắn của bạn sẽ xuất hiện tại đây.</p></div> : <>
          <header className="message-head">
            <button className="mobile-back" onClick={() => setMobileList(true)}>‹</button>
            <button className="chat-person" onClick={() => peer && navigate(`/users/${peer._id}`)} disabled={!peer}><Avatar user={selected.type === 'group' ? { displayName: title, avatar: selected.avatar } : peer} size={44} /><div><b>{title}</b><span>{typing || (peer && onlineUsers.has(String(peer._id)) ? 'Đang hoạt động' : selected.type === 'group' ? `${selected.members.length} thành viên` : 'Ngoại tuyến')}</span></div></button>
            <div className="head-actions"><button title="Gọi thoại" onClick={() => beginCall('voice')}><Phone /></button><button title="Gọi video" onClick={() => beginCall('video')}><Video /></button><button title="Tạo phòng họp Jitsi" onClick={createInstantMeeting}><CalendarPlus /></button><button><UserPlus /></button><div className="chat-more-wrap"><button onClick={() => setShowChatMenu((value) => !value)}><MoreHorizontal /></button>{showChatMenu && <div className="chat-more-menu"><button onClick={createInstantMeeting}><CalendarPlus size={15} /> Tạo phòng họp</button>{peer && <button className="danger" onClick={blockPeer}>Chặn người dùng</button>}</div>}</div></div>
          </header>
          <div className="message-search"><Search size={16} /><input value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Tìm nội dung, ảnh hoặc file cũ…" />{messageSearch && <button onClick={() => setMessageSearch('')}><X size={15} /></button>}</div>
          <div className="message-scroll">
            {messages.map((message, index) => {
              const mine = message.sender?._id === user._id;
              const showDate = index === 0 || new Date(messages[index - 1].createdAt).toDateString() !== new Date(message.createdAt).toDateString();
              return <div key={message._id}>{showDate && <div className="date-divider">{isToday(new Date(message.createdAt)) ? 'Hôm nay' : format(new Date(message.createdAt), 'dd MMMM yyyy', { locale: vi })}</div>}<MessageBubble message={message} mine={mine} onReply={setReplyTo} onReact={async (emoji) => api.patch(`/messages/${message._id}/reaction`, { emoji })} onRevoke={async () => api.post(`/messages/${message._id}/revoke`)} onDelete={async () => { await api.delete(`/messages/${message._id}`); setMessages((list) => list.filter((m) => m._id !== message._id)); }} onPin={async () => api.post(`/conversations/${selectedId}/pin/${message._id}`)} /></div>;
            })}
            <div ref={endRef} />
          </div>
          <footer className="composer">
            {replyTo && <div className="reply-preview"><Reply size={16} /><div><b>Trả lời {replyTo.sender?.displayName}</b><span>{replyTo.text || replyTo.kind}</span></div><button onClick={() => setReplyTo(null)}><X /></button></div>}
            {status && <div className="composer-status" onClick={() => setStatus('')}>{status} <X size={13} /></div>}
            <div className="composer-row"><button onClick={() => fileInput.current?.click()} title="Gửi file"><Paperclip /></button><button onClick={() => fileInput.current?.click()} title="Gửi ảnh"><ImagePlus /></button><input ref={fileInput} type="file" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
              <textarea rows="1" value={text} onChange={(e) => type(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={busy ? 'Đang tải file…' : 'Nhập tin nhắn…'} />
              <div className="extras-wrap"><button onClick={() => setShowExtras((v) => !v)}><SmilePlus /></button>{showExtras && <div className="extras-panel"><div><b>Emoji</b>{['😀','😂','😍','🥳','😎','😭','😡','👍','❤️','🔥'].map((emoji) => <button key={emoji} onClick={() => { type(text + emoji); setShowExtras(false); }}>{emoji}</button>)}</div><div><b>Sticker</b>{['👋','🎉','🙏','💯','🚀'].map((sticker) => <button className="sticker-choice" key={sticker} onClick={() => { send({ kind: 'sticker', text: sticker }); setShowExtras(false); }}>{sticker}</button>)}</div><button className="gif-link" onClick={sendGif}>Gửi GIF bằng URL</button></div>}</div><button className={recorder.current?.state === 'recording' ? 'recording' : ''} onClick={recordVoice}><Mic /></button><button className="send-btn" onClick={() => send()}><Send /></button>
            </div>
          </footer>
        </>}
      </section>
      {showNewGroup && <NewGroup friends={friends} onClose={() => setShowNewGroup(false)} onCreated={(conversation) => { setConversations((list) => [conversation, ...list]); setSelectedId(conversation._id); setShowNewGroup(false); }} />}
    </div>
  );
}

function MessageBubble({ message, mine, onReply, onReact, onRevoke, onDelete, onPin }) {
  const [menu, setMenu] = useState(false);
  if (message.kind === 'system' && message.metadata?.type === 'call') return <CallSystemMessage message={message} />;
  if (message.kind === 'system' && message.metadata?.type === 'meeting') return <MeetingSystemMessage message={message} />;
  const receipts = message.receipts || [];
  const read = receipts.some((r) => r.readAt);
  const delivered = receipts.some((r) => r.deliveredAt);
  return <div className={`message-row ${mine ? 'mine' : ''}`}>
    {!mine && <Avatar user={message.sender} size={30} />}
    <div className="bubble-wrap">
      {!mine && <span className="sender-name">{message.sender?.displayName}</span>}
      <div className={`message-bubble ${message.revokedAt ? 'revoked' : ''}`}>
        {message.replyTo && <div className="quoted"><b>{message.replyTo.sender?.displayName}</b><span>{message.replyTo.text || message.replyTo.kind}</span></div>}
        {message.revokedAt ? <i>Tin nhắn đã được thu hồi</i> : <>
          {message.metadata?.sharedPost && <SharedPostMessage post={message.metadata.sharedPost} />}
          {message.media?.map((media, i) => <MediaItem key={i} media={media} kind={message.kind} />)}
          {message.text && !message.metadata?.sharedPost && !['image', 'video', 'audio', 'file'].includes(message.kind) && <p>{message.text}</p>}
        </>}
        <div className="bubble-meta"><time>{format(new Date(message.createdAt), 'HH:mm')}</time>{mine && (read ? <CheckCheck className="read" size={15} /> : delivered ? <CheckCheck size={15} /> : <Check size={15} />)}</div>
      </div>
      {message.reactions?.length > 0 && <div className="reaction-summary">{Object.entries(message.reactions.reduce((acc, r) => ({ ...acc, [r.emoji]: (acc[r.emoji] || 0) + 1 }), {})).map(([emoji, count]) => <span key={emoji}>{emoji} {count}</span>)}</div>}
    </div>
    <div className="message-tools"><button onClick={() => setMenu((v) => !v)}><MoreHorizontal size={17} /></button>{menu && <div className="message-menu"><div className="emoji-row">{emojis.map((emoji) => <button key={emoji} onClick={() => { onReact(emoji); setMenu(false); }}>{emoji}</button>)}</div><button onClick={() => { onReply(message); setMenu(false); }}><Reply /> Trả lời</button><button onClick={() => { onPin(); setMenu(false); }}><Pin /> Ghim</button>{mine && !message.revokedAt && <button onClick={() => { onRevoke(); setMenu(false); }}><Trash2 /> Thu hồi</button>}<button onClick={() => { onDelete(); setMenu(false); }}><Trash2 /> Xóa phía tôi</button></div>}</div>
  </div>;
}



function CallSystemMessage({ message }) {
  const event = message.metadata || {};
  const isVideo = event.mode === 'video';
  const status = event.status;
  const statusClass = ['missed', 'declined', 'busy'].includes(status) ? 'failed' : 'completed';
  const label = status === 'missed'
    ? 'Cuộc gọi nhỡ'
    : status === 'declined'
      ? 'Cuộc gọi bị từ chối'
      : status === 'busy'
        ? 'Người nhận đang bận'
        : 'Cuộc gọi đã kết thúc';
  const duration = Number(event.durationSeconds || 0);
  const durationText = duration > 0
    ? duration >= 60
      ? `${Math.floor(duration / 60)} phút ${duration % 60} giây`
      : `${duration} giây`
    : '';

  return <div className={`call-message-event ${statusClass}`}>
    <span className="call-message-icon">{isVideo ? <Video size={18} /> : <Phone size={18} />}</span>
    <div><b>{label}</b><span>{isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}{durationText ? ` · ${durationText}` : ''}</span></div>
    <time>{format(new Date(message.createdAt), 'HH:mm')}</time>
  </div>;
}


function MeetingSystemMessage({ message }) {
  const meeting = message.metadata?.meeting || {};
  const startsAt = meeting.startsAt ? new Date(meeting.startsAt) : null;
  const isLive = !startsAt || startsAt <= new Date();
  return <div className="meeting-message-event">
    <span className="meeting-message-icon"><CalendarPlus size={18} /></span>
    <div><b>{meeting.title || 'Phòng họp Legatalk'}</b><span>{startsAt ? `Bắt đầu ${format(startsAt, 'HH:mm dd/MM/yyyy')}` : 'Có thể vào phòng ngay'} · {meeting.durationMinutes || 60} phút</span></div>
    <div className="meeting-message-actions"><Link to={`/meetings/${meeting.meetingId}`}>{isLive ? 'Vào họp' : 'Xem lịch'}</Link><button onClick={async () => navigator.clipboard?.writeText(`${window.location.origin}/meetings/${meeting.meetingId}`)}>Copy link</button></div>
  </div>;
}

function SharedPostMessage({ post }) {
  const preview = post.media?.[0];
  return <a className="shared-post-message" href={`/timeline?post=${post.postId}`}>
    {preview && (preview.type === 'video'
      ? <video src={preview.url} muted playsInline preload="metadata" />
      : <img src={preview.thumbUrl || preview.url} alt="Bài viết được chia sẻ" />)}
    <div className="shared-post-copy"><span><Newspaper size={14} /> Bài viết được chia sẻ</span><b>{post.author?.displayName || 'Người dùng Legatalk'}</b><p>{post.text?.slice(0, 180) || (post.contentType === 'video' ? 'Video' : 'Mở bài viết')}</p></div>
  </a>;
}

function MediaItem({ media, kind }) {
  if (kind === 'image' || kind === 'gif') return <a href={media.hdUrl || media.url} target="_blank" rel="noreferrer"><img className="message-image" src={media.url} alt={media.name} /></a>;
  if (kind === 'sticker' && media.url) return <img className="message-sticker" src={media.url} alt={media.name || 'sticker'} />;
  if (kind === 'video') return <video className="message-video" src={media.url} controls />;
  if (kind === 'audio') return <audio src={media.url} controls />;
  return <a className="file-card" href={media.url} target="_blank" rel="noreferrer"><File size={30} /><div><b>{media.name}</b><span>{Math.ceil((media.size || 0) / 1024)} KB</span></div></a>;
}

function NewGroup({ friends, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState('');
  const create = async () => {
    try {
      const { data } = await api.post('/conversations/group', { name, description, privacy, memberIds: selected });
      onCreated(data);
    } catch (error) { setStatus(errorMessage(error)); }
  };
  return <div className="modal-backdrop"><div className="modal-card"><div className="modal-head"><div><h3>Tạo nhóm nhắn tin</h3><p>Nhóm này cũng xuất hiện trong mục Nhóm của Nhật ký.</p></div><button onClick={onClose}><X /></button></div><label>Tên nhóm<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhóm dự án…" /></label><label>Mô tả<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mục đích của nhóm…" /></label><label>Quyền riêng tư<select value={privacy} onChange={(event) => setPrivacy(event.target.value)}><option value="private">Nhóm kín — cần trưởng nhóm duyệt</option><option value="public">Nhóm công khai</option></select></label><div className="member-picker">{friends.map((friend) => <label key={friend._id}><input type="checkbox" checked={selected.includes(friend._id)} onChange={() => setSelected((list) => list.includes(friend._id) ? list.filter((id) => id !== friend._id) : [...list, friend._id])} /><Avatar user={friend} size={36} /><span>{friend.displayName}</span></label>)}</div>{status && <div className="form-status">{status}</div>}<button className="primary-btn" disabled={!name.trim() || selected.length < 1} onClick={create}>Tạo nhóm ({selected.length + 1} thành viên)</button></div></div>;
}
