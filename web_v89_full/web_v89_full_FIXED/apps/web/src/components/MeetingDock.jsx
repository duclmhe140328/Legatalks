import { useEffect, useMemo, useState } from 'react';
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
    <div className={expanded ? 'meeting-full-dock' : 'meeting-mini-dock'}>
      <JitsiMeetFrame
        meetingId={meetingId}
        compact={!expanded}
        onMinimize={() => navigate('/chats')}
        onExpand={() => navigate(`/meetings/${meetingId}`)}
        onClosed={handleClosed}
      />
    </div>
  );
}
