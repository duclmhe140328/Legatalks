import { Phone, PhoneOff, Video } from 'lucide-react';
import Avatar from './Avatar';

export default function IncomingCall({ call, onAnswer, onDecline }) {
  if (!call) return null;
  return (
    <div className="incoming-call-overlay" role="dialog" aria-modal="true" aria-label="Cuộc gọi đến">
      <div className="incoming-call-card">
        <div className="incoming-pulse"><Avatar user={call.from} size={96} /></div>
        <span className="incoming-label">{call.mode === 'video' ? 'CUỘC GỌI VIDEO ĐẾN' : 'CUỘC GỌI THOẠI ĐẾN'}</span>
        <h2>{call.from?.displayName || 'Người dùng Nexora'}</h2>
        <p>{call.mode === 'video' ? 'Muốn gọi video với bạn' : 'Đang gọi cho bạn'}</p>
        <div className="incoming-actions">
          <button className="decline-call" onClick={onDecline}><PhoneOff /><span>Từ chối</span></button>
          <button className="answer-call" onClick={onAnswer}>{call.mode === 'video' ? <Video /> : <Phone />}<span>Nghe</span></button>
        </div>
      </div>
    </div>
  );
}
