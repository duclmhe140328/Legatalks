import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CalendarClock, Clock, Globe2, History, Link as LinkIcon, Lock, Play, Plus, Users, Video, X } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import Avatar from '../components/Avatar';
import JitsiMeetFrame from '../components/JitsiMeetFrame';
import { useSocket } from '../context/SocketContext';

function defaultStart() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export default function MeetingsPage() {
  const navigate = useNavigate();
  const { meetingId } = useParams();
  const { socket } = useSocket();
  const [scope, setScope] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [friends, setFriends] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({
    title: 'Cuộc họp Legatalk',
    description: '',
    startsAt: defaultStart(),
    startInMinutes: 30,
    durationMinutes: 60,
    mode: 'relative',
    isPublic: false,
    participantIds: []
  });

  const selectedMeeting = useMemo(() => items.find((item) => String(item._id) === String(meetingId)), [items, meetingId]);

  const load = async () => {
    const { data } = await api.get('/meetings', { params: { scope, page, limit: 12 } });
    setItems(data.items || []);
    setTotalPages(data.totalPages || 1);
  };

  useEffect(() => { void load(); }, [scope, page]);
  useEffect(() => { api.get('/users/me').then(({ data }) => setFriends(data.friends || [])).catch(() => {}); }, []);
  useEffect(() => {
    const refresh = () => void load();
    socket?.on('meeting:new', refresh);
    socket?.on('meeting:updated', refresh);
    socket?.on('meeting:ended', refresh);
    return () => {
      socket?.off('meeting:new', refresh);
      socket?.off('meeting:updated', refresh);
      socket?.off('meeting:ended', refresh);
    };
  }, [socket, scope, page]);

  const createMeeting = async (startNow = false) => {
    setStatus('');
    try {
      const payload = {
        title: form.title,
        description: form.description,
        durationMinutes: Number(form.durationMinutes || 60),
        participantIds: form.participantIds,
        startInMinutes: startNow ? 0 : Number(form.startInMinutes || 0),
        startsAt: !startNow && form.mode === 'exact' ? new Date(form.startsAt).toISOString() : undefined,
        visibility: form.isPublic ? 'public' : 'private',
        isPublic: form.isPublic
      };
      const { data } = await api.post('/meetings', payload);
      setFormOpen(false);
      await load();
      navigate(`/meetings/${data._id}`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const copyLink = async (meeting) => {
    const url = `${window.location.origin}/meetings/${meeting._id}`;
    await navigator.clipboard?.writeText(url);
    setStatus('Đã sao chép link phòng họp.');
  };

  return <div className="meetings-page">
    <section className="meetings-hero card">
      <div className="meeting-hero-actions"><button className="primary-btn" onClick={() => createMeeting(true)}><Play size={17} /> Họp ngay</button><button className="soft-btn" onClick={() => setFormOpen(true)}><CalendarClock size={17} /> Đặt lịch</button></div>
    </section>

    {meetingId && <JitsiMeetFrame meetingId={meetingId} onEnded={() => { void load(); }} onMinimize={() => navigate('/chats')} />}

    <section className="meetings-grid">
      <div className="meeting-list-panel card">
        <div className="meeting-tabs"><button className={scope === 'upcoming' ? 'active' : ''} onClick={() => { setScope('upcoming'); setPage(1); }}><CalendarClock size={16} /> Sắp tới</button><button className={scope === 'history' ? 'active' : ''} onClick={() => { setScope('history'); setPage(1); }}><History size={16} /> Lịch sử</button></div>
        <div className="meeting-list">
          {items.length === 0 && <div className="empty-mini">Chưa có cuộc họp nào.</div>}
          {items.map((meeting) => <MeetingCard key={meeting._id} meeting={meeting} active={String(meeting._id) === String(meetingId)} onOpen={() => navigate(`/meetings/${meeting._id}`)} onCopy={() => copyLink(meeting)} />)}
        </div>
        <div className="pager"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trang trước</button><span>{page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Trang sau</button></div>
      </div>

      <aside className="meeting-side card">
        <h3>Tạo nhanh</h3>
        <label>Tiêu đề<input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></label>
        <label>Sau bao lâu thì họp?<input type="number" min="0" value={form.startInMinutes} onChange={(e) => setForm((current) => ({ ...current, startInMinutes: e.target.value, mode: 'relative' }))} /><span>phút nữa</span></label>
        <label>Họp trong bao lâu?<input type="number" min="5" max="1440" value={form.durationMinutes} onChange={(e) => setForm((current) => ({ ...current, durationMinutes: e.target.value }))} /><span>phút</span></label>
        <label className="check-line meeting-public-check"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((current) => ({ ...current, isPublic: e.target.checked }))} /><span>Phòng họp công cộng, mọi tài khoản đều xem được</span></label>
        <button className="primary-btn full" onClick={() => createMeeting(false)}><Plus size={17} /> Tạo lịch họp</button>
        {status && <div className="form-status">{status}</div>}
      </aside>
    </section>

    {formOpen && <div className="modal-backdrop"><div className="modal-card meeting-modal"><div className="modal-head"><div><h3>Đặt lịch họp</h3><p>Chọn người tham gia, giờ bắt đầu và thời lượng.</p></div><button onClick={() => setFormOpen(false)}><X /></button></div><label>Tiêu đề<input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></label><label>Mô tả<textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></label><label>Thời gian bắt đầu<input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((current) => ({ ...current, startsAt: e.target.value, mode: 'exact' }))} /></label><label>Thời lượng phút<input type="number" min="5" max="1440" value={form.durationMinutes} onChange={(e) => setForm((current) => ({ ...current, durationMinutes: e.target.value }))} /></label><label className="check-line meeting-public-check"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((current) => ({ ...current, isPublic: e.target.checked }))} /><span>Phòng họp công cộng, mọi tài khoản đều thấy trong tab Họp online</span></label><div className="member-picker meeting-picker">{friends.map((friend) => <label key={friend._id}><input type="checkbox" checked={form.participantIds.includes(friend._id)} onChange={() => setForm((current) => ({ ...current, participantIds: current.participantIds.includes(friend._id) ? current.participantIds.filter((id) => id !== friend._id) : [...current.participantIds, friend._id] }))} /><Avatar user={friend} size={36} /><span>{friend.displayName}</span></label>)}</div>{status && <div className="form-status">{status}</div>}<button className="primary-btn full" onClick={() => createMeeting(false)}>Lưu lịch họp</button></div></div>}
  </div>;
}

function MeetingCard({ meeting, active, onOpen, onCopy }) {
  const statusText = meeting.status === 'live' ? 'Đang họp' : meeting.status === 'ended' ? 'Đã kết thúc' : meeting.status === 'cancelled' ? 'Đã hủy' : 'Sắp tới';
  return <article className={`meeting-card ${active ? 'active' : ''}`}>
    <div className="meeting-card-icon"><Video size={20} /></div>
    <div className="meeting-card-copy"><b>{meeting.title}</b><span><Clock size={13} /> {format(new Date(meeting.startsAt), 'HH:mm dd/MM/yyyy')} · {meeting.durationMinutes} phút</span><p>{statusText}{meeting.startsAt && meeting.status !== 'ended' ? ` · ${formatDistanceToNow(new Date(meeting.startsAt), { addSuffix: true, locale: vi })}` : ''}</p><div className="meeting-people"><Users size={14} /> {meeting.participants?.length || 1} người tham gia <span className={`meeting-privacy ${meeting.visibility === 'public' ? 'public' : ''}`}>{meeting.visibility === 'public' ? <Globe2 size={13} /> : <Lock size={13} />}{meeting.visibility === 'public' ? 'Công cộng' : 'Riêng tư'}</span></div></div>
    <div className="meeting-card-actions"><button onClick={onOpen}>Vào phòng</button><button onClick={onCopy}><LinkIcon size={15} /></button></div>
  </article>;
}
