import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Clock3, History, Phone, PhoneIncoming,
  PhoneMissed, PhoneOff, PhoneOutgoing, Video
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

const statusLabels = {
  ended: 'Đã kết thúc',
  missed: 'Cuộc gọi nhỡ',
  declined: 'Đã từ chối',
  busy: 'Máy bận',
  ringing: 'Đang đổ chuông',
  active: 'Đang diễn ra'
};

function formatDuration(seconds = 0) {
  if (!seconds) return 'Chưa kết nối';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  if (hours) return `${hours} giờ ${minutes} phút`;
  if (minutes) return `${minutes} phút ${remain} giây`;
  return `${remain} giây`;
}

export default function CallHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasPrevious: false, hasNext: false });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/calls/history', { params: { page, limit: 15, ...(filter ? { status: filter } : {}) } });
      setItems(data.items || []);
      setPagination(data.pagination || { page, totalPages: 1 });
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [page, filter]);

  const summary = useMemo(() => ({
    total: pagination.total || 0,
    missed: items.filter((item) => item.status === 'missed' && String(item.startedBy?._id) !== String(user._id)).length
  }), [items, pagination.total, user._id]);

  const groupedItems = useMemo(() => {
    const groups = [];
    for (const call of items) {
      const key = format(new Date(call.startedAt || call.createdAt), 'yyyy-MM-dd');
      let group = groups.find((entry) => entry.key === key);
      if (!group) {
        group = { key, label: format(new Date(call.startedAt || call.createdAt), "EEEE, dd 'tháng' MM, yyyy", { locale: vi }), items: [] };
        groups.push(group);
      }
      group.items.push(call);
    }
    return groups;
  }, [items]);

  const peerFor = (call) => {
    const members = call.conversation?.members || [];
    return members.find((member) => String(member.user?._id) !== String(user._id))?.user
      || call.invitees?.find((invitee) => String(invitee?._id) !== String(user._id))
      || call.startedBy;
  };

  const openChat = (call) => {
    const conversationId = call.conversation?._id || call.conversation;
    if (!conversationId) return;
    sessionStorage.setItem('openConversationId', conversationId);
    navigate('/chats');
  };

  return (
    <section className="call-history-page">
      <header className="page-heading call-history-heading">
        <div><span className="heading-kicker"><History size={15} /> Nhật ký liên lạc</span><h2>Lịch sử cuộc gọi</h2><p>{summary.total} cuộc gọi · {summary.missed} cuộc gọi nhỡ trên trang này</p></div>
        <div className="call-filter-tabs">
          {[['', 'Tất cả'], ['missed', 'Gọi nhỡ'], ['ended', 'Đã kết thúc']].map(([value, label]) => <button key={value || 'all'} className={filter === value ? 'active' : ''} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}
        </div>
      </header>

      {status && <div className="form-status global">{status}</div>}
      <div className="call-history-list card">
        {loading && <div className="empty-state compact"><div className="empty-icon">📞</div><p>Đang tải lịch sử cuộc gọi…</p></div>}
        {!loading && items.length === 0 && <div className="empty-state compact"><div className="empty-icon">☎️</div><h3>Chưa có cuộc gọi</h3><p>Cuộc gọi kết thúc, nhỡ, từ chối hoặc bận sẽ xuất hiện tại đây.</p></div>}
        {!loading && groupedItems.map((group) => <section className="call-log-day" key={group.key}>
          <div className="call-log-date">{group.label}</div>
          {group.items.map((call) => {
            const outgoing = String(call.startedBy?._id || call.startedBy) === String(user._id);
            const peer = peerFor(call);
            const Icon = call.status === 'missed' ? PhoneMissed : call.status === 'declined' || call.status === 'busy' ? PhoneOff : outgoing ? PhoneOutgoing : PhoneIncoming;
            const duration = call.answeredAt && call.endedAt ? Math.max(0, Math.round((new Date(call.endedAt) - new Date(call.answeredAt)) / 1000)) : 0;
            return (
              <article key={call._id} className={`call-history-item status-${call.status}`}>
                <div className="call-avatar-wrap"><Avatar user={peer} size={52} /><span className="call-direction"><Icon size={15} /></span></div>
                <div className="call-history-copy">
                  <div><b>{call.conversation?.type === 'group' ? call.conversation.name : peer?.displayName || 'Người dùng Nexora'}</b><span className={`call-status status-${call.status}`}>{statusLabels[call.status] || call.status}</span></div>
                  <p>{outgoing ? 'Cuộc gọi đi' : 'Cuộc gọi đến'} · {call.mode === 'video' ? 'Video' : 'Thoại'}</p>
                  <small><Clock3 size={13} /> {format(new Date(call.startedAt || call.createdAt), 'HH:mm', { locale: vi })} · {formatDuration(duration)}</small>
                </div>
                <button className="call-history-action" onClick={() => openChat(call)} title="Mở cuộc trò chuyện">{call.mode === 'video' ? <Video /> : <Phone />}<span>Liên hệ lại</span></button>
              </article>
            );
          })}
        </section>)}
      </div>

      {pagination.totalPages > 1 && (
        <nav className="pagination-bar" aria-label="Phân trang lịch sử cuộc gọi">
          <button disabled={!pagination.hasPrevious} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft /> Trước</button>
          <span>Trang <b>{pagination.page}</b> / {pagination.totalPages}</span>
          <button disabled={!pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Sau <ChevronRight /></button>
        </nav>
      )}
    </section>
  );
}
