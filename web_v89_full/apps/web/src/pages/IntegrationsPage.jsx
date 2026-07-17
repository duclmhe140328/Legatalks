import { useEffect, useState } from 'react';
import { Bot, Building2, Megaphone, Plus, Radio, Send, Trash2, Webhook } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function IntegrationsPage() {
  const { user, refreshMe } = useAuth();
  const [rules, setRules] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [broadcast, setBroadcast] = useState('');
  const [rule, setRule] = useState({ name: '', pattern: '', responseText: '', matchType: 'contains' });
  const [hook, setHook] = useState({ name: '', url: '', secret: '' });
  const [status, setStatus] = useState('');

  const load = async () => {
    if (user.accountType !== 'official') return;
    const [r, w] = await Promise.all([api.get('/integrations/bot-rules'), api.get('/integrations/webhooks')]);
    setRules(r.data); setWebhooks(w.data);
  };
  useEffect(() => { load(); }, [user.accountType]);

  const enable = async () => {
    try { await api.post('/integrations/official/enable', { category: 'Doanh nghiệp' }); await refreshMe(); setStatus('Đã chuyển sang Official Account demo.'); }
    catch (e) { setStatus(errorMessage(e)); }
  };
  const addRule = async () => {
    try { const { data } = await api.post('/integrations/bot-rules', rule); setRules((list) => [data, ...list]); setRule({ name: '', pattern: '', responseText: '', matchType: 'contains' }); }
    catch (e) { setStatus(errorMessage(e)); }
  };
  const addWebhook = async () => {
    try { const { data } = await api.post('/integrations/webhooks', { ...hook, events: ['message.created'] }); setWebhooks((list) => [data, ...list]); setHook({ name: '', url: '', secret: '' }); }
    catch (e) { setStatus(errorMessage(e)); }
  };
  const sendBroadcast = async () => {
    try { const { data } = await api.post('/integrations/official/broadcast', { text: broadcast, kind: 'text' }); setStatus(`Đã gửi đến ${data.sent} follower.`); setBroadcast(''); }
    catch (e) { setStatus(errorMessage(e)); }
  };

  if (user.accountType !== 'official') return <div className="upgrade-oa card"><div className="oa-icon"><Building2 /></div><h2>Kích hoạt Official Account</h2><p>OA hỗ trợ follower, broadcast, chatbot rule, webhook và quản lý Mini App. Nút dưới chỉ dùng cho môi trường demo; bản production cần quy trình xét duyệt doanh nghiệp.</p>{status && <div className="form-status">{status}</div>}<button className="primary-btn" onClick={enable}>Kích hoạt OA demo</button></div>;

  return <div className="integrations-page">
    {status && <div className="form-status global">{status}</div>}
    <section className="card broadcast-card"><div className="section-head"><div><h2><Megaphone /> Broadcast</h2><p>Gửi tin nhắn hàng loạt đến follower của OA.</p></div><Radio /></div><textarea value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Nội dung chiến dịch…" /><button className="primary-btn" disabled={!broadcast.trim()} onClick={sendBroadcast}><Send /> Gửi broadcast</button></section>
    <div className="integration-grid">
      <section className="card integration-card"><div className="section-head"><div><h3><Bot /> Chatbot rule</h3><p>Auto-reply theo từ khóa.</p></div></div>
        <div className="mini-form"><input placeholder="Tên luật" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} /><select value={rule.matchType} onChange={(e) => setRule({ ...rule, matchType: e.target.value })}><option value="contains">Có chứa</option><option value="equals">Khớp hoàn toàn</option><option value="regex">Regex</option></select><input placeholder="Từ khóa / biểu thức" value={rule.pattern} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} /><textarea placeholder="Nội dung trả lời" value={rule.responseText} onChange={(e) => setRule({ ...rule, responseText: e.target.value })} /><button className="primary-small" onClick={addRule}><Plus /> Thêm luật</button></div>
        <div className="rule-list">{rules.map((item) => <div className="rule-row" key={item._id}><div><b>{item.name}</b><span>{item.matchType}: “{item.pattern}”</span><p>{item.responseText}</p></div><button onClick={async () => { await api.delete(`/integrations/bot-rules/${item._id}`); setRules((list) => list.filter((r) => r._id !== item._id)); }}><Trash2 /></button></div>)}</div>
      </section>
      <section className="card integration-card"><div className="section-head"><div><h3><Webhook /> Webhook API</h3><p>Nhận event message.created có chữ ký HMAC.</p></div></div>
        <div className="mini-form"><input placeholder="Tên endpoint" value={hook.name} onChange={(e) => setHook({ ...hook, name: e.target.value })} /><input placeholder="https://your-api.com/webhook" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} /><input placeholder="Secret (để trống sẽ tự sinh)" value={hook.secret} onChange={(e) => setHook({ ...hook, secret: e.target.value })} /><button className="primary-small" onClick={addWebhook}><Plus /> Tạo webhook</button></div>
        <div className="rule-list">{webhooks.map((item) => <div className="rule-row" key={item._id}><div><b>{item.name}</b><span>{item.url}</span><p>Events: {item.events.join(', ')}</p></div><button onClick={async () => { await api.delete(`/integrations/webhooks/${item._id}`); setWebhooks((list) => list.filter((w) => w._id !== item._id)); }}><Trash2 /></button></div>)}</div>
      </section>
    </div>
  </div>;
}
