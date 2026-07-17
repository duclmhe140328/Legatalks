import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, Expand, Mic, MicOff, PhoneOff, RefreshCcw, Volume2, VolumeX } from 'lucide-react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { api, errorMessage } from '../services/api';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';
import './agora-call.css';

function RemoteAgoraTile({ user, label }) {
  const nodeRef = useRef(null);

  useEffect(() => {
    if (!nodeRef.current || !user?.videoTrack) return undefined;
    user.videoTrack.play(nodeRef.current, { fit: 'contain', mirror: false });
    return () => { try { user.videoTrack?.stop(); } catch { /* already stopped */ } };
  }, [user, user?.videoTrack]);

  return <div className="agora-call-remote-tile"><div ref={nodeRef} className="agora-call-video-node"/><span className="agora-call-remote-label">{label}</span></div>;
}

export default function CallModal({ conversation, mode = 'video', callSessionId, direction = 'outgoing', externalStatus, onClose }) {
  const { socket } = useSocket();
  const clientRef = useRef(null);
  const microphoneTrackRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const localNodeRef = useRef(null);
  const speakerOnRef = useRef(true);
  const mountedRef = useRef(true);
  const leavingRef = useRef(false);

  const [remoteUsers, setRemoteUsers] = useState(() => new Map());
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(true);
  const [ending, setEnding] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(mode === 'video');
  const [speakerOn, setSpeakerOn] = useState(true);
  const [status, setStatus] = useState(direction === 'outgoing' ? 'Đang chuẩn bị cuộc gọi…' : 'Đang kết nối…');
  const [failure, setFailure] = useState('');

  const isVideo = mode === 'video';
  const title = useMemo(() => conversation?.name || conversation?.members?.find((member) => member?.user?.displayName)?.user?.displayName || 'Cuộc gọi Nexora', [conversation]);
  const peer = conversation?.members?.find((member) => member?.user)?.user || conversation;

  const setRemote = (user) => setRemoteUsers((current) => { const next = new Map(current); next.set(String(user.uid), user); return next; });
  const removeRemote = (uid) => setRemoteUsers((current) => { const next = new Map(current); next.delete(String(uid)); return next; });

  const cleanupAgora = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const client = clientRef.current;
    const microphoneTrack = microphoneTrackRef.current;
    const cameraTrack = cameraTrackRef.current;
    clientRef.current = null; microphoneTrackRef.current = null; cameraTrackRef.current = null;
    try { microphoneTrack?.stop(); microphoneTrack?.close(); } catch { /* ignore */ }
    try { cameraTrack?.stop(); cameraTrack?.close(); } catch { /* ignore */ }
    try { client?.removeAllListeners(); await client?.leave(); } catch { /* ignore */ }
  };

  const fetchCredentials = async () => (await api.get(`/calls/${callSessionId}/agora-token`)).data;

  useEffect(() => {
    mountedRef.current = true;
    leavingRef.current = false;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    const onUserPublished = async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') { user.audioTrack?.setVolume(speakerOnRef.current ? 100 : 0); user.audioTrack?.play(); }
        setRemote(user);
        if (mountedRef.current) setStatus('Đang gọi');
      } catch (error) { if (mountedRef.current) setFailure(errorMessage(error)); }
    };
    const onUserUnpublished = (user) => setRemote(user);
    const onUserLeft = (user) => { removeRemote(user.uid); if (mountedRef.current) setStatus('Người bên kia đã rời cuộc gọi'); };
    const renewToken = async () => {
      try { const credentials = await fetchCredentials(); await client.renewToken(credentials.token); }
      catch (error) { if (mountedRef.current) setFailure(`Không gia hạn được cuộc gọi: ${errorMessage(error)}`); }
    };

    client.on('user-published', onUserPublished);
    client.on('user-unpublished', onUserUnpublished);
    client.on('user-left', onUserLeft);
    client.on('token-privilege-will-expire', renewToken);
    client.on('token-privilege-did-expire', renewToken);
    client.on('connection-state-change', (currentState) => {
      if (!mountedRef.current) return;
      if (currentState === 'CONNECTED') setStatus('Đang gọi');
      if (currentState === 'RECONNECTING') setStatus('Mạng không ổn định, đang kết nối lại…');
      if (currentState === 'DISCONNECTED') setStatus('Đã ngắt kết nối');
    });

    async function boot() {
      setJoining(true); setFailure('');
      try {
        const credentials = await fetchCredentials();
        await client.join(credentials.appId, credentials.channel, credentials.token, Number(credentials.uid));
        const microphoneTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard', AEC: true, ANS: true, AGC: true });
        microphoneTrackRef.current = microphoneTrack;
        let cameraTrack = null;
        if (isVideo) {
          cameraTrack = await AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p_2', facingMode: 'user' });
          cameraTrackRef.current = cameraTrack;
          if (localNodeRef.current) cameraTrack.play(localNodeRef.current, { fit: 'cover', mirror: true });
        }
        await client.publish(cameraTrack ? [microphoneTrack, cameraTrack] : [microphoneTrack]);
        socket?.emit('call:join', { conversationId: conversation?._id, callSessionId, mode: isVideo ? 'video' : 'voice' });
        if (!mountedRef.current) return;
        setJoined(true);
        setStatus(direction === 'outgoing' ? 'Đang chờ người nhận tham gia…' : 'Đang chờ kết nối âm thanh/hình ảnh…');
      } catch (error) {
        if (!mountedRef.current) return;
        setFailure(errorMessage(error)); setStatus('Không thể mở cuộc gọi Agora');
      } finally { if (mountedRef.current) setJoining(false); }
    }
    void boot();
    return () => { mountedRef.current = false; void cleanupAgora(); };
  }, [callSessionId, conversation?._id, direction, isVideo, socket]);

  useEffect(() => { if (externalStatus && remoteUsers.size === 0) setStatus(externalStatus); }, [externalStatus, remoteUsers.size]);

  const toggleMicrophone = async () => { const next = !micOn; try { await microphoneTrackRef.current?.setEnabled(next); setMicOn(next); } catch (error) { setFailure(errorMessage(error)); } };
  const toggleCamera = async () => { if (!isVideo) return; const next = !cameraOn; try { await cameraTrackRef.current?.setEnabled(next); setCameraOn(next); } catch (error) { setFailure(errorMessage(error)); } };
  const switchCamera = async () => {
    if (!isVideo || !cameraTrackRef.current) return;
    try {
      const cameras = await AgoraRTC.getCameras();
      if (cameras.length < 2) return setFailure('Thiết bị chỉ có một camera.');
      const currentLabel = cameraTrackRef.current.getTrackLabel();
      const currentIndex = cameras.findIndex((camera) => camera.label === currentLabel);
      await cameraTrackRef.current.setDevice(cameras[(currentIndex + 1 + cameras.length) % cameras.length].deviceId);
    } catch (error) { setFailure(errorMessage(error)); }
  };
  const toggleSpeaker = () => { const next = !speakerOn; speakerOnRef.current = next; setSpeakerOn(next); remoteUsers.forEach((user) => { user.audioTrack?.setVolume(next ? 100 : 0); if (next) user.audioTrack?.play(); }); };
  const enterFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.agora-call-shell')?.requestFullscreen?.(); } catch (error) { setFailure(errorMessage(error)); } };
  const endCall = async () => {
    if (ending) return; setEnding(true);
    try { socket?.emit('call:leave', { callSessionId }); await api.post(`/calls/${callSessionId}/end`); } catch { /* remote may have ended */ }
    finally { await cleanupAgora(); onClose?.(); }
  };

  const remoteList = [...remoteUsers.values()];
  return <div className="agora-call-backdrop"><section className="agora-call-shell">
    <header className="agora-call-head"><div className="agora-call-peer"><Avatar user={peer} size={44}/><div className="agora-call-peer-copy"><strong>{title}</strong><span>{joining ? 'Đang mở camera/micro…' : status}</span></div></div><div className="agora-call-provider">Agora RTC · {isVideo ? 'Video' : 'Thoại'}</div></header>
    <main className="agora-call-stage">{failure && <div className="agora-call-error">{failure}</div>}<div className="agora-call-remote-grid">
      {remoteList.length === 0 ? <div className="agora-call-empty"><div className="agora-call-empty-copy"><Avatar user={peer} size={92}/><strong>{title}</strong><span>{joining ? 'Đang tham gia kênh Agora…' : 'Đã vào cuộc gọi. Đang chờ người bên kia tham gia.'}</span></div></div> : remoteList.map((user) => <RemoteAgoraTile key={String(user.uid)} user={user} label={title}/>) }
    </div>{isVideo && <div className={`agora-call-local ${cameraOn ? '' : 'is-hidden'}`}><div ref={localNodeRef} className="agora-call-video-node"/>{!cameraOn && <div className="agora-call-local-off">Camera đang tắt</div>}<span className="agora-call-local-label">Bạn</span></div>}</main>
    <footer className="agora-call-controls">
      <button className={`agora-call-control ${micOn ? '' : 'is-off'}`} onClick={toggleMicrophone} disabled={!joined} title={micOn ? 'Tắt micro' : 'Bật micro'}>{micOn ? <Mic size={22}/> : <MicOff size={22}/>}</button>
      {isVideo && <><button className={`agora-call-control ${cameraOn ? '' : 'is-off'}`} onClick={toggleCamera} disabled={!joined} title={cameraOn ? 'Tắt camera' : 'Bật camera'}>{cameraOn ? <Camera size={22}/> : <CameraOff size={22}/>}</button><button className="agora-call-control" onClick={switchCamera} disabled={!joined} title="Đổi camera"><RefreshCcw size={21}/></button></>}
      <button className={`agora-call-control ${speakerOn ? '' : 'is-off'}`} onClick={toggleSpeaker} disabled={!joined} title={speakerOn ? 'Tắt tiếng loa' : 'Bật tiếng loa'}>{speakerOn ? <Volume2 size={22}/> : <VolumeX size={22}/>}</button>
      <button className="agora-call-control" onClick={enterFullscreen} title="Toàn màn hình"><Expand size={21}/></button>
      <button className="agora-call-control is-danger" onClick={endCall} disabled={ending} title="Kết thúc cuộc gọi"><PhoneOff size={25}/></button>
    </footer>
  </section></div>;
}
