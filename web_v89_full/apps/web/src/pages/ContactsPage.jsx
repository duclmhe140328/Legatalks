import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ContactRound, Phone, QrCode, Search, ShieldBan, UserPlus, Users, X } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import Avatar from '../components/Avatar';

export default function ContactsPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState({ friends: [], friendRequestsIncoming: [] });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [phones, setPhones] = useState('0902222222\n0903333333');
  const [matches, setMatches] = useState([]);
  const [qrValue, setQrValue] = useState('');
  const [status, setStatus] = useState('');
  const load = async () => {
    try {
      const { data } = await api.get('/users/me');
      setMe(data);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const search = async () => {
    if (!query.trim()) return setResults([]);
    try { setResults((await api.get('/users/search', { params: { q: query } })).data); }
    catch (error) { setStatus(errorMessage(error)); }
  };
  const request = async (id) => { try { setStatus((await api.post(`/users/friends/request/${id}`)).data.message); load(); } catch (e) { setStatus(errorMessage(e)); } };
  const accept = async (id) => { await api.post(`/users/friends/accept/${id}`); load(); };
  const sync = async () => {
    try {
      const data = (await api.post('/users/contacts/sync', { phones: phones.split(/[\n,;]+/).map((p) => p.trim()) })).data;
      setMatches(data); setStatus(`Tìm thấy ${data.length} tài khoản.`);
    } catch (e) { setStatus(errorMessage(e)); }
  };
  const chat = async (id) => {
    const { data } = await api.post('/conversations/direct', { userId: id });
    sessionStorage.setItem('openConversationId', data._id);
    navigate('/chats');
  };
  const scanQr = async () => {
    try { const data = (await api.post('/users/qr/add', { value: qrValue })).data; setResults([data]); }
    catch (e) { setStatus(errorMessage(e)); }
  };

  return <div className="contacts-page">
    <section className="contacts-main card">
      <div className="section-head"><div><h2>Danh bạ</h2><p>Tìm kiếm, kết bạn và đồng bộ số điện thoại.</p></div><ContactRound /></div>
      <div className="search-users"><div className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Tên, username hoặc số điện thoại" /></div><button className="primary-small" onClick={search}>Tìm</button></div>
      {status && <div className="form-status">{status}</div>}
      {me.friendRequestsIncoming?.length > 0 && <div className="contact-section"><h3>Lời mời kết bạn</h3>{me.friendRequestsIncoming.map((person) => <ContactRow key={person._id} person={person} onOpen={() => navigate(`/users/${person._id}`)} actions={<><button className="accept" onClick={() => accept(person._id)}><Check /> Chấp nhận</button><button><X /></button></>} />)}</div>}
      {results.length > 0 && <div className="contact-section"><h3>Kết quả tìm kiếm</h3>{results.map((person) => <ContactRow key={person._id} person={person} onOpen={() => navigate(`/users/${person._id}`)} actions={<button className="accept" onClick={() => request(person._id)}><UserPlus /> Kết bạn</button>} />)}</div>}
      <div className="contact-section"><h3>Bạn bè ({me.friends?.length || 0})</h3>{me.friends?.map((person) => <ContactRow key={person._id} person={person} onOpen={() => navigate(`/users/${person._id}`)} actions={<><button onClick={() => chat(person._id)}><Phone /> Nhắn tin</button><button title="Chặn" onClick={() => api.post(`/users/block/${person._id}`).then(load)}><ShieldBan /></button></>} />)}</div>
    </section>
    <aside className="contacts-tools">
      <div className="card tool-card"><h3><Users /> Đồng bộ danh bạ</h3><p>Dán danh sách số điện thoại, mỗi số một dòng. Bản native có thể gửi danh bạ thiết bị vào API này.</p><textarea value={phones} onChange={(e) => setPhones(e.target.value)} /><button className="primary-btn" onClick={sync}>Đồng bộ và matching</button>{matches.map((person) => <ContactRow key={person._id} person={person} onOpen={() => navigate(`/users/${person._id}`)} compact actions={<button onClick={() => request(person._id)}><UserPlus /></button>} />)}</div>
      <div className="card tool-card"><h3><QrCode /> Thêm bằng QR</h3><p>Dán nội dung dạng <code>legatalk://user/...</code>.</p><input value={qrValue} onChange={(e) => setQrValue(e.target.value)} placeholder="nexora://user/..." /><button className="secondary-btn" onClick={scanQr}>Kiểm tra mã</button></div>
    </aside>
  </div>;
}

function ContactRow({ person, actions, compact = false, onOpen }) {
  return <div className={`contact-row ${compact ? 'compact' : ''}`}><button className="contact-person" onClick={onOpen} disabled={!onOpen}><Avatar user={person} size={compact ? 36 : 46} /><div><b>{person.displayName}{person.verified && ' ✓'}</b><span>{person.accountType === 'official' ? person.officialCategory || 'Official Account' : person.phone ? `+${person.phone}` : 'Số điện thoại riêng tư'}</span></div></button><div className="contact-actions">{actions}</div></div>;
}
