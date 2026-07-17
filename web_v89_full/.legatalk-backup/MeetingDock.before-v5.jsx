import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Video } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import JitsiMeetFrame from './JitsiMeetFrame';

const ACTIVE_MEETING_KEY = 'nexoraActiveMeetingId';

function routeMeetingId(pathname) {
  const match = String(pathname || '').match(/^\/meetings\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export default function MeetingDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentMeetingRouteId = useMemo(
    () => routeMeetingId(location.pathname),
    [location.pathname],
  );

  const [meetingId, setMeetingId] = useState(
    () => currentMeetingRouteId || sessionStorage.getItem(ACTIVE_MEETING_KEY) || '',
  );

  useEffect(() => {
    if (!currentMeetingRouteId) return;
    sessionStorage.setItem(ACTIVE_MEETING_KEY, currentMeetingRouteId);
    setMeetingId(currentMeetingRouteId);
  }, [currentMeetingRouteId]);

  useEffect(() => {
    const sync = (event) => {
      const id =
        event?.detail?.meetingId ||
        sessionStorage.getItem(ACTIVE_MEETING_KEY) ||
        '';
      setMeetingId(String(id));
    };

    const closed = (event) => {
      const closedId = String(event?.detail?.meetingId || '');
      setMeetingId((current) => {
        if (!closedId || closedId === String(current)) return '';
        return current;
      });
    };

    window.addEventListener('nexora:meeting-active', sync);
    window.addEventListener('nexora:meeting-closed', closed);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener('nexora:meeting-active', sync);
      window.removeEventListener('nexora:meeting-closed', closed);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!meetingId) return null;

  const expanded = String(currentMeetingRouteId) === String(meetingId);

  const handleClosed = () => {
    sessionStorage.removeItem(ACTIVE_MEETING_KEY);
    setMeetingId('');
    if (expanded) navigate('/meetings', { replace: true });
  };

  return (
    <>
      {/*
        IMPORTANT: the Jitsi iframe always stays at exactly the same full-screen
        geometry. Minimizing only makes the fixed surface almost transparent and
        disables pointer input. We never resize, move, scale, display:none or
        remount the cross-origin WebRTC iframe, which avoids Chromium black frames.
      */}
      <div
        className={`meeting-persistent-surface ${
          expanded ? 'is-expanded' : 'is-minimized'
        }`}
        aria-hidden={!expanded}
      >
        <JitsiMeetFrame
          meetingId={meetingId}
          compact={false}
          onMinimize={() => navigate('/timeline')}
          onExpand={() => navigate(`/meetings/${meetingId}`)}
          onClosed={handleClosed}
        />
      </div>

      {!expanded && (
        <aside className="meeting-mini-controller" aria-label="Cuộc họp đang chạy">
          <span className="meeting-mini-controller-icon">
            <Video size={20} />
          </span>
          <span className="meeting-mini-controller-copy">
            <b>Cuộc họp đang chạy</b>
            <small>Bạn vẫn nghe và nói trong khi xem bảng tin hoặc nhắn tin.</small>
          </span>
          <button
            type="button"
            onClick={() => navigate(`/meetings/${meetingId}`)}
          >
            <Maximize2 size={16} />
            Phóng to
          </button>
        </aside>
      )}
    </>
  );
}
