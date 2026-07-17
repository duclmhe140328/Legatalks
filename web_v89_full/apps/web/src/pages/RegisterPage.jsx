import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { user, saveAuth } = useAuth();
  const [form, setForm] = useState({ phone: '', displayName: '', password: '', otp: '', accountType: 'personal' });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const sendOtp = async () => {
    try {
      const { data } = await api.post('/auth/request-otp', { phone: form.phone, purpose: 'register' });
      setStatus(data.devCode ? `OTP local: ${data.devCode}` : data.message);
      if (data.devCode) set('otp', data.devCode);
    } catch (error) { setStatus(errorMessage(error)); }
  };
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setStatus('');
    try {
      const deviceId = crypto.randomUUID(); localStorage.setItem('deviceId', deviceId);
      const { data } = await api.post('/auth/register', { ...form, device: { deviceId, deviceName: navigator.platform || 'Web browser' } });
      saveAuth(data);
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page register">
      <section className="auth-visual"><div className="auth-copy"><div className="brand-mark">N</div><h1>Tạo danh tính số của bạn.</h1><p>Bảo mật theo từng thiết bị, hỗ trợ mật khẩu, OTP và sinh trắc học sau khi đăng ký.</p><div className="feature-pills"><span><ShieldCheck /> Bảo mật</span><span><Sparkles /> Miễn phí khởi tạo</span></div></div></section>
      <section className="auth-panel"><form className="auth-card" onSubmit={submit}>
        <h2>Đăng ký tài khoản</h2><p className="muted">Mã OTP local mặc định là 123456.</p>
        <label>Tên hiển thị<input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} required /></label>
        <label>Số điện thoại<input value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></label>
        <label>Mật khẩu<input type="password" minLength="8" value={form.password} onChange={(e) => set('password', e.target.value)} required /></label>
        <label>Loại tài khoản<select value={form.accountType} onChange={(e) => set('accountType', e.target.value)}><option value="personal">Cá nhân</option><option value="official">Official Account demo</option></select></label>
        <label>Mã OTP<div className="inline-field"><input value={form.otp} onChange={(e) => set('otp', e.target.value)} required /><button type="button" onClick={sendOtp}>Gửi mã</button></div></label>
        {status && <div className="form-status">{status}</div>}
        <button className="primary-btn" disabled={loading}>{loading ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
        <p className="auth-foot">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
      </form></section>
    </div>
  );
}
