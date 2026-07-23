import { useEffect, useMemo, useState } from 'react';
import { LogIn, RefreshCw, ShieldCheck, UserRound, Video } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import JitsiMeetFrame from '../components/JitsiMeetFrame';
import { useAuth } from '../context/AuthContext';
import { api, errorMessage } from '../services/api';

function idOf(value) {
  return String(value?._id || value?.id || value || '');
}

export default function GuestMeetingPage() {
  const { meetingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const guestKey = searchParams.get('key') || '';

  const [meeting, setMeeting] = useState(null);
  const [displayName, setDisplayName] = useState(
    () => user?.displayName || localStorage.getItem('legatalkGuestMeetingName') || '',
  );
  const [joinConfig, setJoinConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [status, setStatus] = useState('');

  const isHostAccount = useMemo(
    () => Boolean(user && idOf(user) === idOf(meeting?.createdBy)),
    [user, meeting],
  );

  const loadStatus = async ({ silent = false } = {}) => {
    if (!guestKey) {
      setStatus('Link phòng họp thiếu mã truy cập. Hãy copy lại link từ Legatalk.');
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const { data } = await api.get(`/meetings/public/${meetingId}`, {
        params: { key: guestKey },
      });
      setMeeting(data.meeting || null);
      setStatus('');
    } catch (error) {
      setStatus(errorMessage(error, 'Không mở được link phòng họp.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => {
      if (!joinConfig) void loadStatus({ silent: true });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [meetingId, guestKey, Boolean(joinConfig)]);

  const joinAsGuest = async () => {
    const name = displayName.trim();
    if (!name) {
      setStatus('Nhập tên hiển thị trước khi vào họp.');
      return;
    }

    setJoining(true);
    setStatus('');
    try {
      const { data } = await api.post(`/meetings/public/${meetingId}/join`, {
        key: guestKey,
        displayName: name,
      });
      localStorage.setItem('legatalkGuestMeetingName', name);
      setMeeting(data.meeting || meeting);
      setJoinConfig(data.jitsi || null);
    } catch (error) {
      setStatus(errorMessage(error, 'Không vào được phòng họp.'));
      await loadStatus({ silent: true });
    } finally {
      setJoining(false);
    }
  };

  if (joinConfig) {
    return (
      <main className="guest-meeting-live">
        <JitsiMeetFrame
          roomName={joinConfig.room}
          serverUrl={joinConfig.serverUrl}
          jwt={joinConfig.token}
          purpose="guest-meeting"
          subject={meeting?.title || 'Cuộc họp Legatalk'}
          displayName={joinConfig.displayName || displayName}
          onClosed={() => setJoinConfig(null)}
        />
      </main>
    );
  }

  return (
    <main className="guest-meeting-page">
      <section className="guest-meeting-card">
        <div className="guest-meeting-logo"><Video size={34} /></div>
        <p className="guest-meeting-eyebrow">LEGATALK MEETING</p>
        <h1>{meeting?.title || 'Phòng họp online'}</h1>
        <p className="guest-meeting-subtitle">
          Người nhận link không cần tạo tài khoản. Chủ phòng phải vào trước để mở phòng.
        </p>

        {loading ? (
          <div className="guest-meeting-state"><RefreshCw className="spin" /> Đang kiểm tra phòng họp…</div>
        ) : meeting?.status === 'ended' || meeting?.status === 'cancelled' ? (
          <div className="guest-meeting-state danger">Cuộc họp đã kết thúc.</div>
        ) : !meeting?.hostJoined ? (
          <div className="guest-meeting-waiting">
            <ShieldCheck size={28} />
            <div>
              <b>Chủ phòng chưa vào họp</b>
              <span>Khách chỉ vào được sau khi tài khoản tạo phòng đã mở cuộc họp.</span>
            </div>
          </div>
        ) : (
          <div className="guest-meeting-form">
            <label>
              <span>Tên hiển thị</span>
              <div><UserRound size={19} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nhập tên của bạn" maxLength={80} /></div>
            </label>
            <button type="button" onClick={joinAsGuest} disabled={joining}>
              <Video size={19} /> {joining ? 'Đang kết nối…' : 'Vào phòng họp'}
            </button>
          </div>
        )}

        {!meeting?.hostJoined && isHostAccount && (
          <button className="guest-host-button" type="button" onClick={() => navigate(`/meetings/${meetingId}`)}>
            <Video size={18} /> Mở phòng bằng tài khoản chủ phòng
          </button>
        )}

        {!meeting?.hostJoined && !user && (
          <button className="guest-login-button" type="button" onClick={() => {
            sessionStorage.setItem('meetingReturnTo', `/meetings/${meetingId}`);
            navigate('/login');
          }}>
            <LogIn size={18} /> Đăng nhập nếu bạn là chủ phòng
          </button>
        )}

        {status && <div className="guest-meeting-status">{status}</div>}
        <button className="guest-refresh-button" type="button" onClick={() => loadStatus()}><RefreshCw size={16} /> Kiểm tra lại</button>
      </section>
    </main>
  );
}
