import { useState } from 'react';
import { api } from '../services/api';

function cleanError(error) {
  return error?.response?.data?.message || error?.message || 'Có lỗi xảy ra.';
}

const css = `
.nx-security-card {
  --primary: #1877f2;
  --purple: #7c3aed;
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid #dbeafe;
  border-radius: 22px;
  background:
    radial-gradient(circle at 100% 0, rgba(124,58,237,.08), transparent 34%),
    #ffffff;
  box-shadow: 0 16px 42px rgba(15,23,42,.07);
}

.nx-security-card * { box-sizing: border-box; }

.nx-security-card__head {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 14px;
}

.nx-security-card__icon {
  width: 43px;
  height: 43px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  font-size: 20px;
  font-weight: 900;
  background: linear-gradient(135deg, var(--primary), var(--purple));
  box-shadow: 0 12px 26px rgba(24,119,242,.2);
}

.nx-security-card h3 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -.35px;
}

.nx-security-card__head p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12.5px;
  font-weight: 650;
}

.nx-security-card__form {
  display: grid;
  gap: 10px;
}

.nx-security-card__field {
  position: relative;
}

.nx-security-card__field input {
  width: 100%;
  height: 48px;
  padding: 0 12px 0 41px;
  border: 1px solid #dbe3ef;
  border-radius: 15px;
  outline: none;
  background: #fff;
  color: #0f172a;
  font-size: 14px;
  font-weight: 720;
}

.nx-security-card__field input:focus {
  border-color: rgba(24,119,242,.58);
  box-shadow: 0 0 0 4px rgba(24,119,242,.09);
}

.nx-security-card__field span {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 13px;
  font-weight: 950;
}

.nx-security-card__button {
  min-height: 48px;
  border: 0;
  border-radius: 15px;
  color: #fff;
  background: linear-gradient(135deg, var(--primary), var(--purple));
  box-shadow: 0 13px 28px rgba(24,119,242,.2);
  font-size: 14px;
  font-weight: 950;
  cursor: pointer;
}

.nx-security-card__button:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.nx-security-card__message {
  padding: 10px 12px;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: #f8fbff;
  color: #1e3a8a;
  font-size: 13px;
  font-weight: 800;
}

.nx-security-card__hint {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 650;
}

@media (max-width: 560px) {
  .nx-security-card {
    padding: 15px;
    border-radius: 19px;
  }
}
`;

function PasswordField({ icon, ...props }) {
  return (
    <label className="nx-security-card__field">
      <span>{icon}</span>
      <input type="password" {...props} />
    </label>
  );
}

export default function ChangePasswordCard() {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  function setField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setMessage('Nhập đầy đủ cả 3 ô mật khẩu.');
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

    if (form.currentPassword === form.newPassword) {
      setMessage('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data } = await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      setForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      setMessage(data.message || 'Đã đổi mật khẩu.');
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="nx-security-card">
      <style>{css}</style>

      <div className="nx-security-card__head">
        <div className="nx-security-card__icon">✓</div>
        <div>
          <h3>Bảo mật tài khoản</h3>
          <p>Đổi mật khẩu đăng nhập Legatalk Connect</p>
        </div>
      </div>

      <form className="nx-security-card__form" onSubmit={submit}>
        <PasswordField
          icon="●"
          value={form.currentPassword}
          onChange={(event) => setField('currentPassword', event.target.value)}
          placeholder="Mật khẩu hiện tại"
          autoComplete="current-password"
        />

        <PasswordField
          icon="●"
          value={form.newPassword}
          onChange={(event) => setField('newPassword', event.target.value)}
          placeholder="Mật khẩu mới"
          autoComplete="new-password"
        />

        <PasswordField
          icon="✓"
          value={form.confirmPassword}
          onChange={(event) => setField('confirmPassword', event.target.value)}
          placeholder="Nhập lại mật khẩu mới"
          autoComplete="new-password"
        />

        <div className="nx-security-card__hint">
          Sau khi đổi mật khẩu, các thiết bị khác sẽ phải đăng nhập lại.
        </div>

        <button
          className="nx-security-card__button"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu'}
        </button>

        {message && (
          <div className="nx-security-card__message">{message}</div>
        )}
      </form>
    </section>
  );
}
