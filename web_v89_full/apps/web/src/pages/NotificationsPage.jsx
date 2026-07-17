import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { api, errorMessage } from '../services/api';
import Avatar from '../components/Avatar';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasPrevious: false, hasNext: false });
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (targetPage = page) => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications', { params: { page: targetPage, limit: 15 } });
      setItems(data.items || []);
      setPagination(data.pagination || { page: targetPage, totalPages: 1 });
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(page); }, [page]);
  useEffect(() => {
    const refresh = () => void load(page);
    window.addEventListener('notifications:refresh-page', refresh);
    return () => window.removeEventListener('notifications:refresh-page', refresh);
  }, [page]);

  const openNotification = async (item) => {
    if (!item.readAt) {
      await api.post(`/notifications/${item._id}/read`).catch(() => {});
      setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, readAt: new Date().toISOString() } : entry));
      setUnreadCount((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event('notifications:refresh'));
    }
    if (item.data?.conversationId) {
      sessionStorage.setItem('openConversationId', item.data.conversationId);
      navigate('/chats');
    } else if (item.data?.postId) {
      navigate(`/timeline?post=${item.data.postId}`);
    }
  };

  const readAll = async () => {
    await api.post('/notifications/read-all');
    setUnreadCount(0);
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    window.dispatchEvent(new Event('notifications:refresh'));
  };

  return (
    <section className="notifications-page">
      <header className="page-heading notifications-heading">
        <div><span className="heading-kicker"><Bell size={15} /> Trung tâm thông báo</span><h2>Tất cả thông báo</h2><p>{pagination.total || 0} thông báo · {unreadCount} chưa đọc</p></div>
        <button className="secondary-action" disabled={!unreadCount} onClick={readAll}><CheckCheck size={17} /> Đánh dấu tất cả đã đọc</button>
      </header>

      {status && <div className="form-status global">{status}</div>}
      <div className="notifications-card card">
        {loading && <div className="empty-state compact"><div className="empty-icon">🔔</div><p>Đang tải thông báo…</p></div>}
        {!loading && items.length === 0 && <div className="empty-state compact"><div className="empty-icon">🔕</div><h3>Chưa có thông báo</h3><p>Các tin nhắn, cuộc gọi và tương tác mới sẽ xuất hiện tại đây.</p></div>}
        {!loading && items.map((item) => (
          <button key={item._id} className={`notification-page-item ${item.readAt ? 'read' : 'unread'}`} onClick={() => openNotification(item)}>
            <Avatar user={item.actor} size={48} />
            <div className="notification-page-copy">
              <div><b>{item.title || 'Thông báo mới'}</b>{!item.readAt && <span className="unread-dot" />}</div>
              <p>{item.body || 'Bạn có một cập nhật mới.'}</p>
              <time>{format(new Date(item.createdAt), "HH:mm · dd 'tháng' MM, yyyy", { locale: vi })}</time>
            </div>
          </button>
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <nav className="pagination-bar" aria-label="Phân trang thông báo">
          <button disabled={!pagination.hasPrevious} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft /> Trước</button>
          <span>Trang <b>{pagination.page}</b> / {pagination.totalPages}</span>
          <button disabled={!pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Sau <ChevronRight /></button>
        </nav>
      )}
    </section>
  );
}
