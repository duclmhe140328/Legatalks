import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Bot, CalendarClock, ContactRound, Home, LogOut, Menu, MessageCircleMore,
  PhoneCall, Search, Send, Settings, Store, UserRound, UsersRound, Video, Radio, X
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';
import { enableWebPush, getWebPushState, syncGrantedWebPush } from '../services/webPush';
import Avatar from './Avatar';
import IncomingCall from './IncomingCall';
import CallModal from './CallModal';
import MeetingDock from './MeetingDock';
import '../facebook-social-spec.css';

const defaultTopTabs = [
  { href: '/timeline', label: 'Trang chủ', Icon: Home, active: (location) => location.pathname.startsWith('/timeline') && !location.search.includes('tab=groups') },
  { href: '/meetings', label: 'Họp', Icon: Video, active: (location) => location.pathname.startsWith('/meetings') },
  { href: '/timeline?tab=groups', label: 'Nhóm', Icon: UsersRound, active: (location) => location.pathname.startsWith('/timeline') && location.search.includes('tab=groups') },
];

const leftItems = [
  { href: '/timeline', label: 'Bảng tin', Icon: Home },
  { href: '/chats', label: 'Tin nhắn', Icon: MessageCircleMore, unread: true },
  { href: '/contacts', label: 'Bạn bè', Icon: ContactRound },
  { href: '/timeline?tab=groups', label: 'Nhóm', Icon: UsersRound },
  { href: '/timeline?tab=live', label: 'Livestream', Icon: Radio },
  { href: '/meetings', label: 'Họp online', Icon: Video },
  { href: '/calls', label: 'Cuộc gọi', Icon: PhoneCall },
  { href: '/mini-apps', label: 'Mini App', Icon: Store },
  { href: '/integrations', label: 'OA & Bot', Icon: Bot },
];

function cleanMeetingCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.at(-1) || '';
  } catch {
    return raw.replace(/^.*\/meetings\//, '').replace(/^\/+|\/+$/g, '');
  }
}

function normalizeTimelineTab(rawTab) {
  const value = String(rawTab || 'feed').toLowerCase();
  if (value === 'videos') return 'video';
  if (value === 'group') return 'groups';
  if (value === 'livestream') return 'live';
  return value;
}

function getMessageList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function getUserId(entity) {
  return String(entity?._id || entity?.id || '');
}

function getMessageId(message) {
  return String(message?._id || message?.id || message?.clientId || '');
}

function getMessageSenderId(message) {
  return String(
    message?.sender?._id ||
    message?.sender?.id ||
    message?.author?._id ||
    message?.author?.id ||
    message?.user?._id ||
    message?.user?.id ||
    message?.from?._id ||
    message?.from?.id ||
    message?.senderId ||
    message?.userId ||
    ''
  );
}

function getMessageText(message) {
  return String(message?.text || message?.body || message?.message || '').trim();
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    socket,
    onlineUsers,
    incomingCall,
    activeCall,
    callNotice,
    answerCall,
    declineCall,
    closeActiveCall,
    unreadTotal,
    startCall,
  } = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [contacts, setContacts] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [quickContact, setQuickContact] = useState(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [meetingCode, setMeetingCode] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [pushState, setPushState] = useState({ state: 'checking', message: 'Đang kiểm tra thông báo nền…' });
  const [pushBusy, setPushBusy] = useState(false);

  const [quickConversation, setQuickConversation] = useState(null);
  const [quickMessages, setQuickMessages] = useState([]);
  const [quickComposer, setQuickComposer] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickSending, setQuickSending] = useState(false);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const timelineTab = normalizeTimelineTab(searchParams.get('tab') || 'feed');

  const isChatRoute = location.pathname.startsWith('/chats');
  const isTimelineRoute = location.pathname.startsWith('/timeline');
  const isMeetingRoom = /^\/meetings\/[^/]+/.test(location.pathname);
  const isWideTimelineTab = isTimelineRoute && ['groups', 'live'].includes(timelineTab);
  const showLeftRail = !isChatRoute && !isMeetingRoom;
  const showRightRail = isTimelineRoute && !isMeetingRoom && !isWideTimelineTab;

  const timelineHeaderTabs = [
    { href: '/timeline', label: 'Bảng tin', Icon: Home, active: () => timelineTab === 'feed' },
    { href: '/timeline?tab=video', label: 'Video',Icon: Video, active: () => timelineTab === 'video' },
    { href: '/timeline?tab=groups', label: 'Nhóm', Icon: UsersRound, active: () => timelineTab === 'groups' },
    { href: '/timeline?tab=live', label: 'Livestream', Icon: Radio, active: () => timelineTab === 'live' },
  ];

  const topTabs = isTimelineRoute ? timelineHeaderTabs : defaultTopTabs;

  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const aOnline = onlineUsers?.has(String(a?._id || a?.id)) ? 1 : 0;
      const bOnline = onlineUsers?.has(String(b?._id || b?.id)) ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return String(a?.displayName || '').localeCompare(String(b?.displayName || ''), 'vi');
    });
  }, [contacts, onlineUsers]);

  const loadNotificationPreview = async () => {
    try {
      const { data } = await api.get('/notifications', { params: { page: 1, limit: 7 } });
      setNotifications(data.items || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      setNotifications([]);
    }
  };

  const loadSocialPreview = async () => {
    const [meResult, meetingsResult] = await Promise.allSettled([
      api.get('/users/me'),
      api.get('/meetings', { params: { scope: 'upcoming', page: 1, limit: 3 } }),
    ]);

    if (meResult.status === 'fulfilled') {
      const friends = meResult.value.data?.friends || [];
      setContacts(friends.filter((friend) => friend && typeof friend === 'object'));
    }

    if (meetingsResult.status === 'fulfilled') {
      setUpcomingMeetings(meetingsResult.value.data?.items || []);
    }
  };

  useEffect(() => {
    void loadNotificationPreview();
    void loadSocialPreview();
    void syncGrantedWebPush().then(setPushState).catch(() => getWebPushState().then(setPushState));
  }, []);

  const activateBackgroundPush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      setPushState(await enableWebPush());
    } catch (error) {
      setPushState({ state: 'error', message: error?.message || 'Không bật được thông báo nền.' });
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setNotificationOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onNew = (item) => {
      setNotifications((current) => [item, ...current.filter((entry) => entry._id !== item._id)].slice(0, 7));
      if (!item.readAt) setUnreadCount((count) => count + 1);
    };
    const onReadSync = () => void loadNotificationPreview();
    const onMeetingSync = () => void loadSocialPreview();

    socket?.on('notification:new', onNew);
    socket?.on('meeting:new', onMeetingSync);
    socket?.on('meeting:updated', onMeetingSync);
    socket?.on('meeting:ended', onMeetingSync);
    window.addEventListener('notifications:refresh', onReadSync);

    return () => {
      socket?.off('notification:new', onNew);
      socket?.off('meeting:new', onMeetingSync);
      socket?.off('meeting:updated', onMeetingSync);
      socket?.off('meeting:ended', onMeetingSync);
      window.removeEventListener('notifications:refresh', onReadSync);
    };
  }, [socket]);

  const openNotification = async (item) => {
    if (!item.readAt) {
      await api.post(`/notifications/${item._id}/read`).catch(() => {});
      setNotifications((list) => list.map((entry) => (
        entry._id === item._id ? { ...entry, readAt: new Date().toISOString() } : entry
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event('notifications:refresh-page'));
    }

    const conversationId = item.data?.conversationId;
    const postId = item.data?.postId;
    const meetingId = item.data?.meetingId;
    const path = item.data?.path;

    if (conversationId) {
      sessionStorage.setItem('openConversationId', conversationId);
      navigate('/chats');
    } else if (meetingId) {
      navigate(`/meetings/${meetingId}`);
    } else if (path) {
      navigate(path);
    } else if (postId) {
      navigate(`/timeline?post=${postId}`);
    }

    setNotificationOpen(false);
  };

  const readAll = async () => {
    await api.post('/notifications/read-all');
    setUnreadCount(0);
    setNotifications((list) => list.map((item) => ({
      ...item,
      readAt: item.readAt || new Date().toISOString(),
    })));
    window.dispatchEvent(new Event('notifications:refresh-page'));
  };

  const submitGlobalSearch = (event) => {
    event.preventDefault();
    const value = searchValue.trim();
    if (!value) return;
    navigate(`/contacts?search=${encodeURIComponent(value)}`);
    setMobileSearchOpen(false);
  };

  const ensureDirectConversation = async (contact) => {
    if (!contact?._id) return null;
    const { data } = await api.post('/conversations/direct', { userId: contact._id });
    return data;
  };

  const loadQuickMessages = async (conversationId) => {
    if (!conversationId) return;
    const { data } = await api.get(`/messages/${conversationId}`);
    setQuickMessages(getMessageList(data));
  };

  const openContactChat = async (contact) => {
    if (!contact?._id || quickBusy) return;
    setQuickBusy(true);
    setQuickLoading(true);
    try {
      const conversation = await ensureDirectConversation(contact);
      if (!conversation?._id) return;
      setQuickConversation(conversation);
      setQuickContact(contact);
      await loadQuickMessages(conversation._id);
    } finally {
      setQuickBusy(false);
      setQuickLoading(false);
    }
  };

  const openConversationHub = async () => {
    if (!quickConversation?._id) return;
    sessionStorage.setItem('openConversationId', quickConversation._id);
    navigate('/chats');
    setQuickContact(null);
  };

  const openContactCall = async (contact, mode) => {
    if (!contact?._id || quickBusy) return;
    setQuickBusy(true);
    try {
      const conversation = await ensureDirectConversation(contact);
      if (conversation?._id) await startCall(conversation, mode);
    } finally {
      setQuickBusy(false);
    }
  };

  const sendQuickMessage = async () => {
    const text = quickComposer.trim();
    if (!text || !quickConversation?._id || quickSending) return;

    setQuickSending(true);
    try {
      await api.post('/messages', {
        conversationId: quickConversation._id,
        text,
        body: text,
        kind: 'text',
        attachments: [],
        media: [],
        clientId: `${Date.now()}`,
      });
      setQuickComposer('');
      await loadQuickMessages(quickConversation._id);
    } finally {
      setQuickSending(false);
    }
  };

  const joinMeeting = () => {
    const code = cleanMeetingCode(meetingCode);
    if (!code) return;
    navigate(`/meetings/${code}`);
    setMeetingCode('');
  };

  useEffect(() => {
    if (!quickContact?._id) {
      setQuickConversation(null);
      setQuickMessages([]);
      setQuickComposer('');
      setQuickLoading(false);
      return;
    }
    void openContactChat(quickContact);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickContact?._id]);

  useEffect(() => {
    if (!socket || !quickConversation?._id) return undefined;

    const onMessage = async (payload) => {
      const payloadConversationId = String(payload?.conversationId || payload?.conversation?._id || payload?.conversation?.id || '');
      if (payloadConversationId && payloadConversationId === String(quickConversation._id)) {
        await loadQuickMessages(quickConversation._id);
      }
    };

    socket.on('message:new', onMessage);
    socket.on('message:created', onMessage);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:created', onMessage);
    };
  }, [socket, quickConversation?._id]);

  return (
    <div className={`fb-shell ${isMeetingRoom ? 'meeting-room-mode' : ''} ${isWideTimelineTab ? 'timeline-wide-shell' : ''} ${mobileSearchOpen ? 'mobile-search-open' : ''}`}>
      <header className="fb-top-nav">
        <div className="fb-top-left">
          <button className="fb-mobile-menu" type="button" onClick={() => setMobileMenuOpen((value) => !value)} aria-label="Mở menu">
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <NavLink to="/timeline" className="fb-logo" aria-label="Nexora Connect">
            <span>L</span>
          </NavLink>
          <form
            className={`fb-global-search ${mobileSearchOpen ? 'expanded' : ''}`}
            onSubmit={submitGlobalSearch}
            onClick={() => setMobileSearchOpen(true)}
          >
            <Search size={19} />
            <input
              value={searchValue}
              autoFocus={mobileSearchOpen}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Tìm kiếm bạn bè, nhóm, OA..."
            />
            {mobileSearchOpen && (
              <button
                type="button"
                className="fb-search-close"
                aria-label="Đóng tìm kiếm"
                onClick={(event) => {
                  event.stopPropagation();
                  setMobileSearchOpen(false);
                }}
              >
                <X size={17} />
              </button>
            )}
          </form>
        </div>

        <nav className={`fb-top-tabs ${isTimelineRoute ? 'fb-top-tabs-social' : ''}`} aria-label="Điều hướng chính">
          {topTabs.map(({ href, label, sublabel, Icon, active }) => (
            <NavLink key={href} to={href} className={active(location) ? 'active' : ''} title={label}>
              <Icon size={isTimelineRoute ? 22 : 25} />
              <span>
                <strong>{label}</strong>
                {sublabel && <small>{sublabel}</small>}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="fb-top-actions">
          <button type="button" className="fb-circle-action" onClick={() => navigate('/chats')} aria-label="Tin nhắn">
            <MessageCircleMore size={21} />
            {unreadTotal > 0 && <span className="fb-action-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
          </button>

          <div className="fb-popover-anchor">
            <button
              type="button"
              className={`fb-circle-action ${notificationOpen ? 'active' : ''}`}
              onClick={() => { setNotificationOpen((value) => !value); setProfileOpen(false); }}
              aria-label="Thông báo"
            >
              <Bell size={21} />
              {unreadCount > 0 && <span className="fb-action-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>

            {notificationOpen && (
              <div className="fb-notification-popover">
                <div className="fb-popover-title">
                  <div><h3>Thông báo</h3><span>Cập nhật mới nhất của bạn</span></div>
                  <button type="button" onClick={readAll}>Đánh dấu đã đọc</button>
                </div>
                <div className={`fb-pwa-push-card state-${pushState.state}`}>
                  <div>
                    <b>Thông báo khi đã thoát PWA</b>
                    <span>{pushState.message}</span>
                  </div>
                  {pushState.state !== 'enabled' && pushState.state !== 'unsupported' && pushState.state !== 'denied' && (
                    <button type="button" disabled={pushBusy} onClick={activateBackgroundPush}>
                      {pushBusy ? 'Đang bật…' : 'Bật thông báo'}
                    </button>
                  )}
                </div>
                <div className="fb-notification-list">
                  {notifications.length === 0 && <div className="fb-empty-small">Chưa có thông báo.</div>}
                  {notifications.map((item) => (
                    <button
                      type="button"
                      key={item._id}
                      className={`fb-notification-row ${item.readAt ? '' : 'unread'}`}
                      onClick={() => openNotification(item)}
                    >
                      <Avatar user={item.actor} size={46} />
                      <span className="fb-notification-copy">
                        <b>{item.title || 'Thông báo mới'}</b>
                        <p>{item.body || 'Bạn có một cập nhật mới.'}</p>
                        <time>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: vi })}</time>
                      </span>
                    </button>
                  ))}
                </div>
                <button type="button" className="fb-see-all" onClick={() => navigate('/notifications')}>Xem tất cả thông báo</button>
              </div>
            )}
          </div>

          <div className="fb-popover-anchor">
            <button
              type="button"
              className="fb-avatar-button"
              onClick={() => { setProfileOpen((value) => !value); setNotificationOpen(false); }}
              aria-label="Tài khoản"
            >
              <Avatar user={user} size={40} />
            </button>

            {profileOpen && (
              <div className="fb-profile-menu">
                <button type="button" className="fb-profile-summary" onClick={() => navigate('/profile')}>
                  <Avatar user={user} size={48} />
                  <span><b>{user.displayName}</b><small>Xem trang cá nhân</small></span>
                </button>
                <div className="fb-menu-divider" />
                <button type="button" onClick={() => navigate('/profile')}><Settings size={20} /><span>Cài đặt tài khoản</span></button>
                <button type="button" onClick={logout}><LogOut size={20} /><span>Đăng xuất</span></button>
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileMenuOpen && <button type="button" className="fb-mobile-menu-backdrop" aria-label="Đóng menu" onClick={() => setMobileMenuOpen(false)} />}

      <div className={`fb-app-body ${showLeftRail ? 'with-left' : ''} ${showRightRail ? 'with-right' : ''} ${isChatRoute ? 'chat-route' : ''} ${isWideTimelineTab ? 'timeline-wide-body' : ''}`}>
        {showLeftRail && (
          <aside className={`fb-left-rail ${mobileMenuOpen ? 'open' : ''}`}>
            <NavLink to="/profile" className="fb-side-profile">
              <Avatar user={user} size={38} />
              <span>{user.displayName}</span>
            </NavLink>

            <nav className="fb-side-nav">
              {leftItems.map(({ href, label, Icon, unread }) => (
                <NavLink
                  key={href}
                  to={href}
                  className={({ isActive }) => {
                    if (href === '/timeline') return isActive && timelineTab === 'feed' ? 'active' : '';
                    if (href.includes('tab=groups')) return location.pathname.startsWith('/timeline') && timelineTab === 'groups' ? 'active' : '';
                    if (href.includes('tab=live')) return location.pathname.startsWith('/timeline') && timelineTab === 'live' ? 'active' : '';
                    return isActive ? 'active' : '';
                  }}
                >
                  <span className="fb-side-icon"><Icon size={21} /></span>
                  <span>{label}</span>
                  {unread && unreadTotal > 0 && <i>{unreadTotal > 99 ? '99+' : unreadTotal}</i>}
                </NavLink>
              ))}
            </nav>

            <section className="fb-upcoming-card">
              <div className="fb-upcoming-head">
                <span><CalendarClock size={18} /> Phòng họp sắp tới</span>
                <button type="button" onClick={() => navigate('/meetings')}>Xem</button>
              </div>
              {upcomingMeetings.length === 0 ? (
                <p>Chưa có lịch họp. Tạo một phòng để bắt đầu.</p>
              ) : upcomingMeetings.slice(0, 2).map((meeting) => (
                <button type="button" key={meeting._id} className="fb-upcoming-row" onClick={() => navigate(`/meetings/${meeting._id}`)}>
                  <span className="fb-meeting-mini-icon"><Video size={16} /></span>
                  <span><b>{meeting.title}</b><small>{format(new Date(meeting.startsAt), 'HH:mm · dd/MM')}</small></span>
                </button>
              ))}
              <button type="button" className="fb-create-meeting" onClick={() => navigate('/meetings')}>+ Tạo cuộc họp</button>
            </section>

            <footer className="fb-side-footer">Legatalk Connect · Chat & Họp trực tuyến</footer>
          </aside>
        )}

        <main className={`fb-main-route ${isWideTimelineTab ? 'wide-content' : ''}`}>
          {location.pathname === '/meetings' && (
            <section className="fb-meeting-quickjoin">
              <div>
                <span className="fb-meeting-quick-icon"><Video size={22} /></span>
                <div><b>Tham gia bằng mã phòng</b><small>Nhập mã hoặc dán đường dẫn cuộc họp</small></div>
              </div>
              <div className="fb-meeting-code-form">
                <input value={meetingCode} onChange={(event) => setMeetingCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') joinMeeting(); }} placeholder="Mã phòng họp" />
                <button type="button" onClick={joinMeeting}>Tham gia</button>
              </div>
            </section>
          )}
          <div className={`fb-route-view ${isTimelineRoute ? 'timeline-route-view' : ''} ${isWideTimelineTab ? 'timeline-full-route' : ''}`}><Outlet /></div>
        </main>

        {showRightRail && (
          <aside className="fb-right-rail">
            <div className="fb-contact-heading">
              <h3>Người liên hệ</h3>
              <div><button type="button" onClick={() => navigate('/contacts')} aria-label="Tìm bạn bè"><Search size={17} /></button><button type="button" aria-label="Tùy chọn"><Menu size={17} /></button></div>
            </div>

            <div className="fb-contact-list">
              {sortedContacts.length === 0 && <div className="fb-empty-small">Kết bạn để xem danh sách liên hệ.</div>}
              {sortedContacts.slice(0, 14).map((contact) => {
                const online = onlineUsers?.has(String(contact._id));
                return (
                  <button type="button" key={contact._id} className="fb-contact-row" onClick={() => setQuickContact(contact)}>
                    <span className="fb-contact-avatar"><Avatar user={contact} size={36} />{online && <i />}</span>
                    <span>{contact.displayName}</span>
                  </button>
                );
              })}
            </div>

            <section className="fb-right-promo">
              <span className="fb-right-promo-icon"><Video size={19} /></span>
              <div><b>Tạo phòng họp nhanh</b><p>Mời bạn bè tham gia ngay trong hệ sinh thái Nexora.</p><button type="button" onClick={() => navigate('/meetings')}>Mở Meeting Hub</button></div>
            </section>
          </aside>
        )}
      </div>

      <nav className="fb-mobile-bottom-nav">
        <NavLink to="/timeline"><Home size={22} /><span>Trang chủ</span></NavLink>
        <NavLink to="/chats"><MessageCircleMore size={22} /><span>Tin nhắn</span>{unreadTotal > 0 && <i>{unreadTotal > 9 ? '9+' : unreadTotal}</i>}</NavLink>
        <NavLink to="/meetings"><Video size={22} /><span>Họp</span></NavLink>
        <NavLink to="/contacts"><ContactRound size={22} /><span>Bạn bè</span></NavLink>
        <NavLink to="/profile"><UserRound size={22} /><span>Tôi</span></NavLink>
      </nav>

      {quickContact && (
        <section className="fb-quick-chat fb-quick-chat-rich">
          <header>
            <button type="button" className="fb-quick-person" onClick={() => navigate(`/users/${quickContact._id}`)}>
              <span className="fb-contact-avatar"><Avatar user={quickContact} size={38} />{onlineUsers?.has(String(quickContact._id)) && <i />}</span>
              <span><b>{quickContact.displayName}</b><small>{onlineUsers?.has(String(quickContact._id)) ? 'Đang hoạt động' : 'Ngoại tuyến'}</small></span>
            </button>
            <div>
              <button type="button" title="Mở hộp thư" disabled={quickBusy} onClick={openConversationHub}><MessageCircleMore size={17} /></button>
              <button type="button" title="Gọi thoại" disabled={quickBusy} onClick={() => openContactCall(quickContact, 'voice')}><PhoneCall size={17} /></button>
              <button type="button" title="Gọi video" disabled={quickBusy} onClick={() => openContactCall(quickContact, 'video')}><Video size={17} /></button>
              <button type="button" title="Đóng" onClick={() => setQuickContact(null)}><X size={17} /></button>
            </div>
          </header>

          <div className="fb-quick-chat-body fb-quick-chat-thread">
            {quickLoading ? (
              <div className="fb-empty-small">Đang tải cuộc trò chuyện…</div>
            ) : quickMessages.length === 0 ? (
              <div className="fb-empty-small">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.</div>
            ) : (
              quickMessages.map((message) => {
                const mine = getMessageSenderId(message) === getUserId(user);
                return (
                  <div key={getMessageId(message)} className={`fb-quick-msg ${mine ? 'mine' : 'other'}`}>
                    {!mine && <Avatar user={message?.sender || message?.author || quickContact} size={28} />}
                    <div className="fb-quick-bubble-wrap">
                      <div className="fb-quick-bubble">{getMessageText(message) || '[Tin nhắn media]'}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <footer className="fb-quick-chat-composer">
            <input
              value={quickComposer}
              onChange={(event) => setQuickComposer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuickMessage();
                }
              }}
              placeholder={`Nhắn cho ${quickContact.displayName}...`}
            />
            <button type="button" onClick={() => void sendQuickMessage()} disabled={quickSending || !quickComposer.trim()}>
              <Send size={16} />
            </button>
          </footer>
        </section>
      )}

      <IncomingCall call={incomingCall} onAnswer={answerCall} onDecline={declineCall} />
      {activeCall && <CallModal {...activeCall} externalStatus={callNotice} onClose={closeActiveCall} />}
      <MeetingDock />
    </div>
  );
}
