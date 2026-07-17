import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, Maximize2, Mic, MicOff, MonitorUp, PhoneOff, ScreenShareOff, Users } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const ACTIVE_MEETING_KEY = 'nexoraActiveMeetingId';

function announceActive(meetingId) {
  if (!meetingId) return;
  sessionStorage.setItem(ACTIVE_MEETING_KEY, String(meetingId));
  window.dispatchEvent(new CustomEvent('nexora:meeting-active', { detail: { meetingId: String(meetingId) } }));
}

function announceClosed(meetingId) {
  if (String(sessionStorage.getItem(ACTIVE_MEETING_KEY) || '') === String(meetingId)) sessionStorage.removeItem(ACTIVE_MEETING_KEY);
  window.dispatchEvent(new CustomEvent('nexora:meeting-closed', { detail: { meetingId: String(meetingId) } }));
}

function displayName(user) {
  return user?.displayName || user?.name || 'Người tham gia';
}

function VideoTile({ stream, name, muted = false, local = false, sharing = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <div className={`nexora-meet-tile ${local ? 'is-local' : ''}`}>
    {stream ? <video ref={ref} autoPlay playsInline muted={muted} className="nexora-meet-video" /> : <div className="nexora-meet-avatar"><Users size={38} /></div>}
    <span className="nexora-meet-name">{name}{sharing ? ' · đang chia sẻ' : ''}</span>
  </div>;
}

export default function NexoraMeetFrame({ meetingId, onEnded, onMinimize, onExpand, onClosed, compact = false }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [meeting, setMeeting] = useState(null);
  const [status, setStatus] = useState('Đang tải phòng họp Legatalk RTC…');
  const [localStream, setLocalStream] = useState(null);
  const [remoteTiles, setRemoteTiles] = useState([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [closed, setClosed] = useState(false);
  const peersRef = useRef(new Map());
  const remoteRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const iceServersRef = useRef([]);
  const endedRef = useRef(false);
  const joinedRef = useRef(false);

  const me = useMemo(() => {
    const myId = String(user?._id || '');
    return meeting?.participants?.find((item) => String(item.user?._id || item.user) === myId);
  }, [meeting, user?._id]);
  const isHost = String(me?.role) === 'host' || String(meeting?.createdBy?._id || meeting?.createdBy) === String(user?._id);

  const refreshTiles = () => setRemoteTiles([...remoteRef.current.values()]);

  const cleanup = () => {
    peersRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    peersRef.current.clear();
    remoteRef.current.clear();
    refreshTiles();
    [screenStreamRef.current, cameraStreamRef.current, localStreamRef.current].forEach((stream) => stream?.getTracks?.().forEach((track) => track.stop()));
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    localStreamRef.current = null;
    setLocalStream(null);
    setSharing(false);
  };

  const createPeer = (socketId, remoteUser) => {
    if (peersRef.current.has(socketId)) return peersRef.current.get(socketId);
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peersRef.current.set(socketId, pc);
    localStreamRef.current?.getTracks?.().forEach((track) => pc.addTrack(track, localStreamRef.current));
    pc.onicecandidate = (event) => {
      if (event.candidate) socket?.emit('meeting:rtc:ice-candidate', { meetingId, target: socketId, candidate: event.candidate });
    };
    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream) return;
      remoteRef.current.set(socketId, { socketId, stream, user: remoteUser });
      refreshTiles();
    };
    return pc;
  };

  const makeOffer = async (target, remoteUser) => {
    const pc = createPeer(target, remoteUser);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket?.emit('meeting:rtc:offer', { meetingId, target, sdp: pc.localDescription });
  };

  const removePeer = (socketId) => {
    const pc = peersRef.current.get(socketId);
    if (pc) { try { pc.close(); } catch {} peersRef.current.delete(socketId); }
    remoteRef.current.delete(socketId);
    refreshTiles();
  };

  const closeLocalFrame = async ({ endForAll = false } = {}) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus(endForAll ? 'Đang kết thúc phòng họp…' : 'Đang thoát phòng họp…');
    try { socket?.emit('meeting:rtc:leave', { meetingId }); } catch {}
    try {
      if (endForAll && isHost) await api.post(`/meetings/${meetingId}/end`);
      else await api.post(`/meetings/${meetingId}/leave`);
    } catch {}
    cleanup();
    announceClosed(meetingId);
    setClosed(true);
    setStatus(endForAll && isHost ? 'Đã kết thúc phòng họp.' : 'Đã thoát phòng họp.');
    onEnded?.();
    onClosed?.();
  };

  useEffect(() => {
    if (!socket) return undefined;
    let cancelled = false;
    endedRef.current = false;
    joinedRef.current = false;
    setClosed(false);
    setStatus('Đang tải phòng họp Legatalk RTC…');
    announceActive(meetingId);

    const start = async () => {
      try {
        const [{ data }, iceResponse] = await Promise.all([
          api.get(`/meetings/${meetingId}`),
          api.get('/calls/ice-servers').catch(() => ({ data: [] }))
        ]);
        if (cancelled) return;
        setMeeting(data.meeting);
        iceServersRef.current = Array.isArray(iceResponse.data) ? iceResponse.data : [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        cameraStreamRef.current = stream;
        localStreamRef.current = stream;
        setLocalStream(stream);
        await api.post(`/meetings/${meetingId}/join`).catch(() => {});
        socket.emit('meeting:rtc:join', { meetingId }, async (result) => {
          if (!result?.ok) return setStatus(result?.message || 'Không vào được phòng họp.');
          joinedRef.current = true;
          setStatus(result.participants?.length ? '' : 'Đang chờ người khác vào phòng…');
          await Promise.all((result.participants || []).map((item) => makeOffer(item.socketId, item.user)));
        });
      } catch (error) {
        if (!cancelled) setStatus(errorMessage(error));
      }
    };

    const onOffer = async ({ from, sdp, user: remoteUser, meetingId: incomingMeetingId }) => {
      if (String(incomingMeetingId) !== String(meetingId)) return;
      const pc = createPeer(from, remoteUser);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('meeting:rtc:answer', { meetingId, target: from, sdp: pc.localDescription });
    };
    const onAnswer = async ({ from, sdp, meetingId: incomingMeetingId }) => {
      if (String(incomingMeetingId) !== String(meetingId)) return;
      const pc = peersRef.current.get(from);
      if (pc && !pc.currentRemoteDescription) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    };
    const onIce = async ({ from, candidate, meetingId: incomingMeetingId }) => {
      if (String(incomingMeetingId) !== String(meetingId)) return;
      const pc = peersRef.current.get(from) || createPeer(from);
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };
    const onJoined = ({ socketId, user: remoteUser, meetingId: incomingMeetingId }) => {
      if (String(incomingMeetingId) !== String(meetingId)) return;
      setStatus(`${displayName(remoteUser)} đã vào phòng`);
      createPeer(socketId, remoteUser);
    };
    const onLeft = ({ socketId, meetingId: incomingMeetingId }) => {
      if (String(incomingMeetingId) !== String(meetingId)) return;
      removePeer(socketId);
    };
    const onMeetingEnded = ({ meetingId: incomingMeetingId }) => {
      if (String(incomingMeetingId) !== String(meetingId)) return;
      void closeLocalFrame({ endForAll: false });
    };

    socket.on('meeting:rtc:offer', onOffer);
    socket.on('meeting:rtc:answer', onAnswer);
    socket.on('meeting:rtc:ice-candidate', onIce);
    socket.on('meeting:rtc:participant-joined', onJoined);
    socket.on('meeting:rtc:participant-left', onLeft);
    socket.on('meeting:ended', onMeetingEnded);
    void start();

    return () => {
      cancelled = true;
      socket.off('meeting:rtc:offer', onOffer);
      socket.off('meeting:rtc:answer', onAnswer);
      socket.off('meeting:rtc:ice-candidate', onIce);
      socket.off('meeting:rtc:participant-joined', onJoined);
      socket.off('meeting:rtc:participant-left', onLeft);
      socket.off('meeting:ended', onMeetingEnded);
      if (joinedRef.current && !endedRef.current) socket.emit('meeting:rtc:leave', { meetingId });
      cleanup();
    };
  }, [meetingId, socket, user?.displayName]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    cameraStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
  };
  const toggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    cameraStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
  };
  const replaceVideoForPeers = async (track) => {
    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) sender.replaceTrack(track);
      else if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
    });
  };
  const stopShare = async () => {
    const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0];
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    if (cameraTrack) await replaceVideoForPeers(cameraTrack);
    localStreamRef.current = cameraStreamRef.current;
    setLocalStream(cameraStreamRef.current);
    setSharing(false);
  };
  const shareScreen = async () => {
    try {
      if (sharing) return await stopShare();
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screen.getVideoTracks()[0];
      if (!screenTrack) throw new Error('Không lấy được màn hình.');
      screenStreamRef.current = screen;
      await replaceVideoForPeers(screenTrack);
      localStreamRef.current = screen;
      setLocalStream(screen);
      setSharing(true);
      screenTrack.onended = () => void stopShare();
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  return <section className={`nexora-meet-stage card ${compact ? 'is-compact' : ''}`}>
    <div className="jitsi-stage-head">
      <div><b>{meeting?.title || 'Phòng họp Legatalk'}</b><span>{compact ? 'Đang họp ở cửa sổ nhỏ' : 'Legatalk RTC · web/app dùng chung · có share màn hình mobile'}</span></div>
      <div className="jitsi-head-actions">
        {compact && <button className="soft-btn tiny" onClick={onExpand}><Maximize2 size={14} /> Phóng to</button>}
        {!compact && !closed && <button className="soft-btn tiny" onClick={() => { announceActive(meetingId); onMinimize?.(); }}>Thu nhỏ</button>}
        {!closed && <button className="ghost-danger" onClick={() => closeLocalFrame({ endForAll: isHost })}><PhoneOff size={15} /> {isHost ? 'Kết thúc phòng' : 'Thoát phòng'}</button>}
      </div>
    </div>

    {status && <div className="jitsi-status">{status}</div>}
    <div className="nexora-meet-grid">
      <VideoTile stream={localStream} muted local name="Bạn" sharing={sharing} />
      {remoteTiles.map((tile) => <VideoTile key={tile.socketId} stream={tile.stream} name={displayName(tile.user)} />)}
      {!remoteTiles.length && <div className="nexora-meet-empty"><Users size={42} /><b>Đang chờ người khác vào phòng</b><span>Link phòng họp vẫn là /meetings/{meetingId}</span></div>}
    </div>
    {!closed && <div className="nexora-meet-controls">
      <button className={micOn ? 'soft-btn' : 'ghost-danger'} onClick={toggleMic}>{micOn ? <Mic size={17} /> : <MicOff size={17} />}{micOn ? 'Mic' : 'Tắt mic'}</button>
      <button className={cameraOn ? 'soft-btn' : 'ghost-danger'} onClick={toggleCamera}>{cameraOn ? <Camera size={17} /> : <CameraOff size={17} />}{cameraOn ? 'Camera' : 'Tắt cam'}</button>
      <button className={sharing ? 'primary-btn' : 'soft-btn'} onClick={shareScreen}>{sharing ? <ScreenShareOff size={17} /> : <MonitorUp size={17} />}{sharing ? 'Dừng share' : 'Chia sẻ màn hình'}</button>
      <button className="danger-btn" onClick={() => closeLocalFrame({ endForAll: isHost })}><PhoneOff size={17} /> {isHost ? 'Kết thúc' : 'Thoát'}</button>
    </div>}
    {closed && <div className="jitsi-ended-panel"><h3>Phòng họp đã đóng</h3><p>Bạn có thể quay lại danh sách hoặc mở lại nếu cuộc họp chưa kết thúc.</p></div>}
  </section>;
}
