import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

function cleanError(error) {
  return error?.response?.data?.message || error?.message || 'Có lỗi xảy ra.';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

const css = `
.nx-auth-v2 {
  --primary: #1877f2;
  --primary-dark: #0f5fd6;
  --purple: #7c3aed;
  --text: #0f172a;
  --muted: #64748b;
  --line: #dbe3ef;
  min-height: 100svh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 430px);
  background:
    radial-gradient(circle at 10% 8%, rgba(24,119,242,.15), transparent 30%),
    radial-gradient(circle at 86% 12%, rgba(124,58,237,.12), transparent 28%),
    linear-gradient(135deg, #f3f7ff 0%, #f8fafc 50%, #ffffff 100%);
  color: var(--text);
}

.nx-auth-v2 * { box-sizing: border-box; }

.nx-auth-v2__intro {
  min-width: 0;
  padding: 34px 44px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.nx-auth-v2__brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.nx-auth-v2__logo {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  font-size: 22px;
  font-weight: 950;
  background: linear-gradient(135deg, var(--primary), var(--purple));
  box-shadow: 0 14px 30px rgba(24,119,242,.22);
}

.nx-auth-v2__brand strong {
  display: block;
  font-size: 18px;
  letter-spacing: -.4px;
}

.nx-auth-v2__brand span {
  display: block;
  margin-top: 1px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.nx-auth-v2__hero {
  max-width: 590px;
  padding: 42px 0 24px;
}

.nx-auth-v2__pill {
  display: inline-flex;
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid rgba(24,119,242,.16);
  background: rgba(255,255,255,.76);
  color: var(--primary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.nx-auth-v2__hero h1 {
  margin: 15px 0 11px;
  max-width: 560px;
  font-size: clamp(34px, 5vw, 58px);
  line-height: 1.02;
  letter-spacing: -2.5px;
}

.nx-auth-v2__hero h1 span { color: var(--primary); }

.nx-auth-v2__hero p {
  max-width: 520px;
  margin: 0;
  color: #475569;
  font-size: 15px;
  line-height: 1.65;
  font-weight: 650;
}

.nx-auth-v2__points {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 10px;
  margin-top: 22px;
  max-width: 560px;
}

.nx-auth-v2__point {
  min-width: 0;
  padding: 13px;
  border: 1px solid rgba(226,232,240,.95);
  background: rgba(255,255,255,.72);
  border-radius: 18px;
}

.nx-auth-v2__point b {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
}

.nx-auth-v2__point span {
  display: block;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 700;
}

.nx-auth-v2__panel {
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 22px;
  border-left: 1px solid rgba(226,232,240,.82);
  background: rgba(255,255,255,.46);
  backdrop-filter: blur(18px);
}

.nx-auth-v2__card {
  width: min(100%, 378px);
  max-height: calc(100svh - 44px);
  overflow: auto;
  padding: 20px;
  border: 1px solid rgba(226,232,240,.96);
  border-radius: 26px;
  background: rgba(255,255,255,.95);
  box-shadow: 0 24px 70px rgba(15,23,42,.12);
}

.nx-auth-v2__card h2 {
  margin: 0;
  font-size: 23px;
  letter-spacing: -.8px;
}

.nx-auth-v2__subtitle {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.48;
  font-weight: 650;
}

.nx-auth-v2__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin: 16px 0;
  padding: 5px;
  border-radius: 17px;
  background: #f1f5f9;
}

.nx-auth-v2__tab {
  border: 0;
  border-radius: 13px;
  padding: 10px 8px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.nx-auth-v2__tab.is-active {
  color: #fff;
  background: linear-gradient(135deg, var(--primary), var(--purple));
  box-shadow: 0 11px 23px rgba(24,119,242,.2);
}

.nx-auth-v2__form {
  display: grid;
  gap: 10px;
}

.nx-auth-v2__field {
  position: relative;
  display: block;
}

.nx-auth-v2__field input {
  width: 100%;
  height: 48px;
  padding: 0 12px 0 40px;
  border: 1px solid var(--line);
  border-radius: 15px;
  outline: none;
  background: #fff;
  color: var(--text);
  font-size: 14px;
  font-weight: 730;
  transition: .16s ease;
}

.nx-auth-v2__field input:focus {
  border-color: rgba(24,119,242,.58);
  box-shadow: 0 0 0 4px rgba(24,119,242,.09);
}

.nx-auth-v2__icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 13px;
  font-weight: 950;
  pointer-events: none;
}

.nx-auth-v2__split {
  display: grid;
  grid-template-columns: minmax(0,1fr) 98px;
  gap: 8px;
}

.nx-auth-v2__button {
  min-height: 48px;
  border: 0;
  border-radius: 15px;
  padding: 0 14px;
  color: #fff;
  background: linear-gradient(135deg, var(--primary), var(--purple));
  box-shadow: 0 13px 28px rgba(24,119,242,.2);
  font-size: 14px;
  font-weight: 950;
  cursor: pointer;
}

.nx-auth-v2__button:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.nx-auth-v2__button.is-secondary {
  color: var(--primary);
  background: #eef4ff;
  box-shadow: none;
}

.nx-auth-v2__link-button {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  padding: 3px;
}

.nx-auth-v2__notice {
  display: flex;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid #dbeafe;
  border-radius: 15px;
  background: #eef4ff;
  color: #334155;
  font-size: 12.5px;
  line-height: 1.45;
  font-weight: 700;
}

.nx-auth-v2__message {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #dbeafe;
  border-radius: 15px;
  background: #f8fbff;
  color: #1e3a8a;
  font-size: 13px;
  line-height: 1.42;
  font-weight: 800;
}

.nx-auth-v2__foot {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.nx-auth-v2__foot a {
  color: var(--primary);
  font-weight: 900;
  text-decoration: none;
}

@media (max-width: 860px) {
  .nx-auth-v2 {
    display: block;
    min-height: 100svh;
  }

  .nx-auth-v2__intro {
    padding: 18px 16px 4px;
  }

  .nx-auth-v2__brand {
    justify-content: center;
  }

  .nx-auth-v2__hero {
    padding: 18px 0 4px;
    text-align: center;
    margin: auto;
  }

  .nx-auth-v2__hero h1 {
    margin: 11px 0 8px;
    font-size: 29px;
    line-height: 1.08;
    letter-spacing: -1.25px;
  }

  .nx-auth-v2__hero p {
    font-size: 13px;
    line-height: 1.52;
  }

  .nx-auth-v2__points { display: none; }

  .nx-auth-v2__panel {
    min-height: auto;
    padding: 10px 12px 22px;
    border-left: 0;
    background: transparent;
  }

  .nx-auth-v2__card {
    width: 100%;
    max-width: 398px;
    max-height: none;
    border-radius: 23px;
    padding: 17px;
  }
}

@media (max-width: 380px) {
  .nx-auth-v2__intro { padding: 14px 10px 2px; }
  .nx-auth-v2__panel { padding: 8px 9px 16px; }
  .nx-auth-v2__card { padding: 14px; border-radius: 20px; }
  .nx-auth-v2__hero h1 { font-size: 25px; }
  .nx-auth-v2__split { grid-template-columns: 1fr; }
}
`;

function Field({ icon, ...props }) {
  return (
    <label className="nx-auth-v2__field">
      <span className="nx-auth-v2__icon">{icon}</span>
      <input {...props} />
    </label>
  );
}

export default function AuthEmailPage({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const auth = useAuth();

  const [mode, setMode] = useState(initialMode || 'login');
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
  phone: '',
  email: '',
  displayName: '',
  password: '',
  confirmPassword: '',
  otp: '',
  account: '',
  newPassword: '',
});

  useEffect(() => {
    setMode(initialMode || 'login');
    setMessage('');
    setResetOtpSent(false);
  }, [initialMode]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setModeAndUrl(nextMode) {
    setMessage('');
    setMode(nextMode);
    setResetOtpSent(false);
    setField('otp', '');

    if (nextMode === 'register') navigate('/register', { replace: true });
    else if (nextMode === 'forgot') navigate('/forgot-password', { replace: true });
    else navigate('/login', { replace: true });
  }

  async function saveSession(data) {
    if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken);
    if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    if (data?.user) localStorage.setItem('user', JSON.stringify(data.user));

    if (typeof auth?.reload === 'function') await auth.reload();
    if (typeof auth?.refresh === 'function') await auth.refresh();
    if (typeof auth?.setUser === 'function' && data?.user) auth.setUser(data.user);
  }

  async function login() {
    if (!form.phone.trim() || !form.password) {
      setMessage('Nhập số điện thoại và mật khẩu.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data } = await api.post('/auth/login/password', {
        phone: form.phone.trim(),
        password: form.password,
        device: { platform: 'web', name: 'Web Browser' },
      });

      await saveSession(data);
      navigate('/timeline', { replace: true });
      window.location.reload();
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function requestRegisterOtp() {
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();

    if (!phone || !email) {
      setMessage('Nhập số điện thoại và Gmail trước.');
      return;
    }

    if (!validEmail(email)) {
      setMessage('Gmail không hợp lệ.');
      return;
    }

    setSendingOtp(true);
    setMessage('');

    try {
      const { data } = await api.post('/auth/request-otp', {
        phone,
        email,
        purpose: 'register',
        channel: 'email',
      });

      setMessage(data.message || 'Đã gửi OTP về Gmail.');
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSendingOtp(false);
    }
  }

  async function register() {
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();

    if (
      !form.displayName.trim() ||
      !phone ||
      !email ||
      !form.password ||
      !form.confirmPassword ||
      !form.otp.trim()
    ) {
      setMessage('Nhập đầy đủ toàn bộ thông tin đăng ký.');
      return;
    }

    if (!validEmail(email)) {
      setMessage('Gmail không hợp lệ.');
      return;
    }

    if (form.password.length < 6) {
      setMessage('Mật khẩu phải từ 6 ký tự trở lên.');
      return;
    }

    if (form.confirmPassword !== form.password) {
      setMessage('Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data } = await api.post('/auth/register', {
        phone,
        email,
        displayName: form.displayName.trim(),
        password: form.password,
        otp: form.otp.trim(),
        accountType: 'personal',
        device: { platform: 'web', name: 'Web Browser' },
      });

      await saveSession(data);
      navigate('/timeline', { replace: true });
      window.location.reload();
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function requestResetOtp() {
    const phone = form.resetPhone.trim();
    const email = form.resetEmail.trim().toLowerCase();

    if (!phone || !email) {
      setMessage('Phải nhập đúng cả số điện thoại và Gmail đã đăng ký.');
      return;
    }

    if (!validEmail(email)) {
      setMessage('Gmail không hợp lệ.');
      return;
    }

    setSendingOtp(true);
    setMessage('');

    try {
      const { data } = await api.post('/auth/forgot-password', {
        phone,
        email,
      });

      setResetOtpSent(true);
      setMessage(data.message || 'Đã gửi OTP về Gmail.');
    } catch (error) {
      setResetOtpSent(false);
      setMessage(cleanError(error));
    } finally {
      setSendingOtp(false);
    }
  }

  async function resetPassword() {
    const phone = form.resetPhone.trim();
    const email = form.resetEmail.trim().toLowerCase();

    if (!phone || !email || !form.otp.trim() || !form.newPassword || !form.confirmPassword) {
      setMessage('Nhập đủ số điện thoại, Gmail, OTP và mật khẩu mới.');
      return;
    }

    if (!validEmail(email)) {
      setMessage('Gmail không hợp lệ.');
      return;
    }

    if (form.newPassword.length < 6) {
      setMessage('Mật khẩu mới phải từ 6 ký tự trở lên.');
      return;
    }

    if (form.confirmPassword !== form.newPassword) {
      setMessage('Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data } = await api.post('/auth/reset-password', {
        phone,
        email,
        otp: form.otp.trim(),
        newPassword: form.newPassword,
      });

      setMessage(data.message || 'Đã đặt lại mật khẩu.');
      setModeAndUrl('login');
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  const title = useMemo(() => {
    if (mode === 'register') return 'Tạo tài khoản';
    if (mode === 'forgot') return 'Khôi phục mật khẩu';
    return 'Đăng nhập Legatalk';
  }, [mode]);

  const subtitle = useMemo(() => {
    if (mode === 'register') return 'Gmail được dùng để nhận OTP và khôi phục tài khoản.';
    if (mode === 'forgot') return 'Số điện thoại và Gmail phải cùng thuộc một tài khoản.';
    return 'Tiếp tục chat, gọi, họp và nhận thông báo.';
  }, [mode]);

  return (
    <div className="nx-auth-v2">
      <style>{css}</style>

      <section className="nx-auth-v2__intro">
        <div className="nx-auth-v2__brand">
          <div className="nx-auth-v2__logo">N</div>
          <div>
            <strong>Legatalk Connect</strong>
            <span>Realtime workspace</span>
          </div>
        </div>

        <div className="nx-auth-v2__hero">
          <div className="nx-auth-v2__pill">● Chat · Meeting · Live · Mini App</div>
          <h1>Một nền tảng cho <span>kết nối số.</span></h1>
          <p>
            Đăng nhập, đăng ký Gmail OTP và quản lý bảo mật trong cùng một giao diện đồng bộ.
          </p>

          <div className="nx-auth-v2__points">
            <div className="nx-auth-v2__point">
              <b>Đúng cặp tài khoản</b>
              <span>Điện thoại và Gmail phải khớp cùng user.</span>
            </div>
            <div className="nx-auth-v2__point">
              <b>OTP một lần</b>
              <span>Hết hạn và khóa sau nhiều lần nhập sai.</span>
            </div>
            <div className="nx-auth-v2__point">
              <b>Thu hồi phiên cũ</b>
              <span>Reset mật khẩu đăng xuất các thiết bị cũ.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="nx-auth-v2__panel">
        <div className="nx-auth-v2__card">
          <h2>{title}</h2>
          <p className="nx-auth-v2__subtitle">{subtitle}</p>

          {mode !== 'forgot' ? (
            <div className="nx-auth-v2__tabs">
              <button
                type="button"
                className={`nx-auth-v2__tab ${mode === 'login' ? 'is-active' : ''}`}
                onClick={() => setModeAndUrl('login')}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className={`nx-auth-v2__tab ${mode === 'register' ? 'is-active' : ''}`}
                onClick={() => setModeAndUrl('register')}
              >
                Đăng ký
              </button>
            </div>
          ) : <div style={{ height: 14 }} />}

          <div className="nx-auth-v2__form">
            {mode === 'login' && (
              <>
                <Field
                  icon="☎"
                  value={form.phone}
                  onChange={(event) => setField('phone', event.target.value)}
                  placeholder="Số điện thoại"
                  autoComplete="tel"
                />
                <Field
                  icon="●"
                  type="password"
                  value={form.password}
                  onChange={(event) => setField('password', event.target.value)}
                  placeholder="Mật khẩu"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="nx-auth-v2__button"
                  disabled={loading}
                  onClick={login}
                >
                  {loading ? 'Đang xử lý...' : 'Đăng nhập'}
                </button>
                <button
                  type="button"
                  className="nx-auth-v2__link-button"
                  onClick={() => {
                    setField('resetPhone', form.phone);
                    setField('resetEmail', form.email);
                    setModeAndUrl('forgot');
                  }}
                >
                  Quên mật khẩu?
                </button>
                <div className="nx-auth-v2__foot">
                  Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
                </div>
              </>
            )}

            {mode === 'register' && (
              <>
                <Field
                  icon="N"
                  value={form.displayName}
                  onChange={(event) => setField('displayName', event.target.value)}
                  placeholder="Tên hiển thị"
                  autoComplete="name"
                />
                <Field
                  icon="☎"
                  value={form.phone}
                  onChange={(event) => setField('phone', event.target.value)}
                  placeholder="Số điện thoại"
                  autoComplete="tel"
                />
                <Field
                  icon="@"
                  type="email"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  placeholder="Gmail nhận OTP"
                  autoComplete="email"
                />
                <Field
                  icon="●"
                  type="password"
                  value={form.password}
                  onChange={(event) => setField('password', event.target.value)}
                  placeholder="Mật khẩu"
                  autoComplete="new-password"
                />
                <Field
                  icon="✓"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => setField('confirmPassword', event.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
                />
                <div className="nx-auth-v2__split">
                  <Field
                    icon="#"
                    inputMode="numeric"
                    value={form.otp}
                    onChange={(event) => setField('otp', event.target.value)}
                    placeholder="OTP Gmail"
                    autoComplete="one-time-code"
                  />
                  <button
                    type="button"
                    className="nx-auth-v2__button is-secondary"
                    disabled={sendingOtp}
                    onClick={requestRegisterOtp}
                  >
                    {sendingOtp ? 'Đang gửi' : 'Gửi OTP'}
                  </button>
                </div>
                <button
                  type="button"
                  className="nx-auth-v2__button"
                  disabled={loading}
                  onClick={register}
                >
                  {loading ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
                <div className="nx-auth-v2__foot">
                  Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
                </div>
              </>
            )}

            {mode === 'forgot' && (
              <>
                <div className="nx-auth-v2__notice">
                  <span>✓</span>
                  <span>
                    Phải nhập đúng cặp số điện thoại và Gmail của cùng một tài khoản.
                    Đúng một thông tin nhưng sai thông tin còn lại cũng sẽ bị từ chối.
                  </span>
                </div>

                <Field
                  icon="☎"
                  value={form.resetPhone}
                  onChange={(event) => {
                    setField('resetPhone', event.target.value);
                    setResetOtpSent(false);
                  }}
                  placeholder="Số điện thoại đã đăng ký"
                  autoComplete="tel"
                />

                <Field
                  icon="@"
                  type="email"
                  value={form.resetEmail}
                  onChange={(event) => {
                    setField('resetEmail', event.target.value);
                    setResetOtpSent(false);
                  }}
                  placeholder="Gmail đi cùng số điện thoại"
                  autoComplete="email"
                />

                <button
                  type="button"
                  className="nx-auth-v2__button is-secondary"
                  disabled={sendingOtp}
                  onClick={requestResetOtp}
                >
                  {sendingOtp ? 'Đang gửi OTP...' : resetOtpSent ? 'Gửi lại OTP' : 'Gửi OTP về Gmail'}
                </button>

                {resetOtpSent && (
                  <>
                    <Field
                      icon="#"
                      inputMode="numeric"
                      value={form.otp}
                      onChange={(event) => setField('otp', event.target.value)}
                      placeholder="Mã OTP 6 chữ số"
                      autoComplete="one-time-code"
                    />

                    <Field
                      icon="●"
                      type="password"
                      value={form.newPassword}
                      onChange={(event) => setField('newPassword', event.target.value)}
                      placeholder="Mật khẩu mới"
                      autoComplete="new-password"
                    />

                    <Field
                      icon="✓"
                      type="password"
                      value={form.confirmPassword}
                      onChange={(event) => setField('confirmPassword', event.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      autoComplete="new-password"
                    />

                    <button
                      type="button"
                      className="nx-auth-v2__button"
                      disabled={loading}
                      onClick={resetPassword}
                    >
                      {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="nx-auth-v2__link-button"
                  onClick={() => setModeAndUrl('login')}
                >
                  Quay lại đăng nhập
                </button>
              </>
            )}
          </div>

          {message && <div className="nx-auth-v2__message">{message}</div>}
        </div>
      </section>
    </div>
  );
}
