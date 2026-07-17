import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, CreditCard, Plus, Store, X } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function MiniAppsPage() {
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [active, setActive] = useState(null);
  const [payment, setPayment] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', icon: '🧩', launchUrl: 'https://example.com', isPublished: true });
  const [status, setStatus] = useState('');
  const load = async () => {
    try {
      const { data } = await api.get('/integrations/mini-apps');
      setApps(data);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    try { const { data } = await api.post('/integrations/mini-apps', form); setApps((list) => [data, ...list]); setStatus('Đã tạo Mini App.'); }
    catch (e) { setStatus(errorMessage(e)); }
  };
  const createPayment = async (app) => {
    try {
      const { data } = await api.post('/integrations/payments/create', { miniAppId: app._id, amount: 99000, metadata: { item: 'Gói demo' } });
      setPayment(data.payment);
    } catch (e) { setStatus(errorMessage(e)); }
  };
  const confirmPayment = async () => {
    const { data } = await api.post(`/integrations/payments/${payment._id}/mock-confirm`, { success: true });
    setPayment(data);
  };

  return <div className="miniapps-page">
    <section className="miniapps-hero card"><div><span className="eyebrow">NEXORA ECOSYSTEM</span><h2>Mini App trong ứng dụng chat</h2><p>Mở dịch vụ bên thứ ba bằng WebView, cấp scope nội bộ và khởi tạo giao dịch từ SDK.</p></div><div className="hero-cubes"><i>💬</i><i>🛍️</i><i>💳</i></div></section>
    {status && <div className="form-status global">{status}</div>}
    <section><div className="section-title"><div><h3>Khám phá Mini App</h3><p>{apps.length} ứng dụng khả dụng</p></div></div><div className="miniapp-grid">{apps.map((app) => <article className="miniapp-card card" key={app._id}><div className="miniapp-icon">{app.icon?.startsWith('http') ? <img src={app.icon} /> : app.icon || '🧩'}</div><div><h3>{app.name}</h3><span>bởi {app.owner?.displayName}</span><p>{app.description || 'Mini App Nexora'}</p></div><div className="miniapp-actions"><button onClick={() => setActive(app)}>Mở <ArrowUpRight /></button><button onClick={() => createPayment(app)}><CreditCard /> Thanh toán thử</button></div></article>)}</div></section>
    {user.accountType === 'official' && <section className="card create-miniapp"><h3><Plus /> Đăng ký Mini App</h3><div className="miniapp-form"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên Mini App" /><input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Emoji hoặc URL icon" /><input value={form.launchUrl} onChange={(e) => setForm({ ...form, launchUrl: e.target.value })} placeholder="Launch URL HTTPS" /><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mô tả" /><button className="primary-btn" onClick={create}>Tạo Mini App</button></div></section>}
    {active && <div className="modal-backdrop"><div className="webview-modal"><div className="webview-bar"><b>{active.name}</b><button onClick={() => setActive(null)}><X /></button></div><iframe src={active.launchUrl} title={active.name} sandbox="allow-scripts allow-forms allow-same-origin allow-popups" /><div className="webview-foot">WebView sandbox · Scopes: {(active.scopes || []).join(', ')}</div></div></div>}
    {payment && <div className="modal-backdrop"><div className="payment-modal card">{payment.status === 'paid' ? <><CheckCircle2 className="payment-success" /><h2>Thanh toán thành công</h2><p>Mã giao dịch: {payment.providerTransactionId}</p><button className="primary-btn" onClick={() => setPayment(null)}>Hoàn tất</button></> : <><CreditCard className="payment-icon" /><h2>Xác nhận thanh toán mock</h2><p>Đơn hàng <b>{payment.orderId}</b></p><strong>{payment.amount.toLocaleString('vi-VN')} {payment.currency}</strong><button className="primary-btn" onClick={confirmPayment}>Thanh toán ngay</button><button className="secondary-btn" onClick={() => setPayment(null)}>Hủy</button></>}</div></div>}
  </div>;
}
