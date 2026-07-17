import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import JitsiMeetFrame from './JitsiMeetFrame';

const ACTIVE_MEETING_KEY = 'nexoraActiveMeetingId';

export default function MeetingDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const [meetingId, setMeetingId] = useState(() => sessionStorage.getItem(ACTIVE_MEETING_KEY) || '');

  useEffect(() => {
    const sync = (event) => {
      const id = event?.detail?.meetingId || sessionStorage.getItem(ACTIVE_MEETING_KEY) || '';
      setMeetingId(id);
    };
    const closed = (event) => {
      const closedId = event?.detail?.meetingId || '';
      if (!closedId || String(closedId) === String(meetingId)) setMeetingId('');
    };
    window.addEventListener('nexora:meeting-active', sync);
    window.addEventListener('nexora:meeting-closed', closed);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('nexora:meeting-active', sync);
      window.removeEventListener('nexora:meeting-closed', closed);
      window.removeEventListener('storage', sync);
    };
  }, [meetingId]);

  const currentMeetingRouteId = useMemo(() => {
    const match = location.pathname.match(/^\/meetings\/([^/]+)/);
    return match?.[1] || '';
  }, [location.pathname]);

  if (!meetingId || String(currentMeetingRouteId) === String(meetingId)) return null;

  return <div className="meeting-mini-dock">
    <JitsiMeetFrame
      meetingId={meetingId}
      compact
      onExpand={() => navigate(`/meetings/${meetingId}`)}
      onClosed={() => setMeetingId('')}
    />
  </div>;
}
