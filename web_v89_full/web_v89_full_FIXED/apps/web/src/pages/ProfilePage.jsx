import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

function cleanError(error) {
  return error?.response?.data?.message || error?.message || 'Có lỗi xảy ra.';
}

function getId(value) {
  return value?._id || value?.id || '';
}

function getName(user) {
  return user?.displayName || user?.name || user?.username || 'Người dùng Nexora';
}

function getAvatar(user) {
  return user?.avatar || user?.photoURL || user?.picture || '';
}

function firstLetter(user) {
  return getName(user).trim().charAt(0).toUpperCase() || 'N';
}

function asList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.posts)) return data.posts;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function firstPostImage(post) {
  const media = Array.isArray(post?.media) ? post.media : [];
  const item = media[0];
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.url || item.path || item.fileUrl || '';
}

const css = `
.nx-fb-profile {
  --fb-blue: #1877f2;
  --fb-blue-hover: #166fe5;
  --fb-bg: #f0f2f5;
  --fb-card: #ffffff;
  --fb-text: #050505;
  --fb-muted: #65676b;
  --fb-line: #e4e6eb;
  min-height: 100%;
  background: var(--fb-bg);
  color: var(--fb-text);
  padding-bottom: 36px;
}

.nx-fb-profile * { box-sizing: border-box; }

.nx-fb-profile__shell {
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 0 16px;
}

.nx-fb-profile__hero {
  overflow: hidden;
  background: var(--fb-card);
  border-radius: 0 0 14px 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,.1);
}

.nx-fb-profile__cover {
  position: relative;
  height: clamp(190px, 28vw, 345px);
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 20%, rgba(255,255,255,.28), transparent 22%),
    radial-gradient(circle at 82% 26%, rgba(255,255,255,.18), transparent 24%),
    linear-gradient(135deg, #1877f2 0%, #3b82f6 46%, #7c3aed 100%);
}

.nx-fb-profile__cover::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 42%;
  background: linear-gradient(transparent, rgba(15,23,42,.18));
}

.nx-fb-profile__identity {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 20px;
  min-height: 126px;
  padding: 0 28px 16px;
}

.nx-fb-profile__avatar-wrap {
  position: relative;
  flex: 0 0 auto;
  margin-top: -78px;
}

.nx-fb-profile__avatar,
.nx-fb-profile__avatar-fallback {
  width: 168px;
  height: 168px;
  border-radius: 50%;
  border: 5px solid #fff;
  object-fit: cover;
  background: #e7f3ff;
  box-shadow: 0 2px 8px rgba(0,0,0,.18);
}

.nx-fb-profile__avatar-fallback {
  display: grid;
  place-items: center;
  color: var(--fb-blue);
  font-size: 58px;
  font-weight: 900;
}

.nx-fb-profile__camera {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #e4e6eb;
  color: #050505;
  cursor: pointer;
  font-size: 17px;
}

.nx-fb-profile__camera:hover { background: #d8dadf; }

.nx-fb-profile__title {
  min-width: 0;
  flex: 1;
  padding-bottom: 8px;
}

.nx-fb-profile__title h1 {
  margin: 0;
  font-size: clamp(25px, 3vw, 34px);
  line-height: 1.12;
  letter-spacing: -.7px;
}

.nx-fb-profile__title p {
  margin: 7px 0 0;
  color: var(--fb-muted);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
}

.nx-fb-profile__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-bottom: 8px;
}

.nx-fb-profile__button {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 8px;
  padding: 0 14px;
  background: #e4e6eb;
  color: #050505;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.nx-fb-profile__button:hover { background: #d8dadf; }

.nx-fb-profile__button.is-primary {
  background: var(--fb-blue);
  color: #fff;
}

.nx-fb-profile__button.is-primary:hover { background: var(--fb-blue-hover); }

.nx-fb-profile__tabs {
  display: flex;
  gap: 4px;
  margin: 0 28px;
  border-top: 1px solid var(--fb-line);
  padding-top: 4px;
}

.nx-fb-profile__tab {
  position: relative;
  min-height: 54px;
  display: grid;
  place-items: center;
  padding: 0 16px;
  color: var(--fb-muted);
  font-size: 14px;
  font-weight: 800;
}

.nx-fb-profile__tab.is-active {
  color: var(--fb-blue);
}

.nx-fb-profile__tab.is-active::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--fb-blue);
}

.nx-fb-profile__grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}

.nx-fb-profile__side {
  position: sticky;
  top: 12px;
  display: grid;
  gap: 16px;
}

.nx-fb-profile__card {
  border-radius: 12px;
  background: var(--fb-card);
  box-shadow: 0 1px 2px rgba(0,0,0,.1);
  padding: 16px;
}

.nx-fb-profile__card h2,
.nx-fb-profile__card h3 {
  margin: 0;
  letter-spacing: -.25px;
}

.nx-fb-profile__card h2 { font-size: 20px; }
.nx-fb-profile__card h3 { font-size: 17px; }

.nx-fb-profile__bio {
  margin: 10px 0 0;
  text-align: center;
  line-height: 1.48;
  font-size: 14px;
}

.nx-fb-profile__full {
  width: 100%;
  margin-top: 12px;
}

.nx-fb-profile__info-list {
  display: grid;
  gap: 13px;
  margin-top: 14px;
}

.nx-fb-profile__info-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--fb-muted);
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
}

.nx-fb-profile__info-icon {
  width: 22px;
  flex: 0 0 22px;
  color: #8a8d91;
  text-align: center;
}

.nx-fb-profile__security {
  overflow: hidden;
  border: 1px solid #dbeafe;
  background:
    radial-gradient(circle at 100% 0, rgba(24,119,242,.1), transparent 36%),
    #fff;
}

.nx-fb-profile__security-head {
  display: flex;
  align-items: center;
  gap: 11px;
}

.nx-fb-profile__security-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #e7f3ff;
  color: var(--fb-blue);
  font-size: 19px;
  font-weight: 900;
}

.nx-fb-profile__security p {
  margin: 4px 0 0;
  color: var(--fb-muted);
  font-size: 13px;
  line-height: 1.45;
  font-weight: 600;
}

.nx-fb-profile__feed {
  display: grid;
  gap: 16px;
}

.nx-fb-profile__composer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nx-fb-profile__mini-avatar,
.nx-fb-profile__mini-fallback {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
  background: #e7f3ff;
}

.nx-fb-profile__mini-fallback {
  display: grid;
  place-items: center;
  color: var(--fb-blue);
  font-weight: 900;
}

.nx-fb-profile__composer-placeholder {
  flex: 1;
  min-height: 42px;
  display: flex;
  align-items: center;
  border-radius: 999px;
  background: var(--fb-bg);
  color: var(--fb-muted);
  padding: 0 16px;
  font-size: 15px;
}

.nx-fb-profile__post {
  padding: 0;
  overflow: hidden;
}

.nx-fb-profile__post-head {
  display: flex;
  gap: 10px;
  padding: 14px 16px 8px;
}

.nx-fb-profile__post-meta {
  min-width: 0;
  flex: 1;
}

.nx-fb-profile__post-meta strong {
  display: block;
  font-size: 14px;
}

.nx-fb-profile__post-meta span {
  display: block;
  margin-top: 2px;
  color: var(--fb-muted);
  font-size: 12px;
}

.nx-fb-profile__post-text {
  padding: 4px 16px 14px;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.nx-fb-profile__post-image {
  display: block;
  width: 100%;
  max-height: 620px;
  object-fit: contain;
  background: #000;
}

.nx-fb-profile__post-stats {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  color: var(--fb-muted);
  font-size: 13px;
}

.nx-fb-profile__post-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  border-top: 1px solid var(--fb-line);
  margin: 0 16px;
  padding: 4px 0;
}

.nx-fb-profile__post-action {
  min-height: 36px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fb-muted);
  font-weight: 800;
}

.nx-fb-profile__empty,
.nx-fb-profile__loading {
  text-align: center;
  color: var(--fb-muted);
  padding: 34px 18px;
  font-weight: 700;
}

.nx-fb-modal-backdrop {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0,0,0,.5);
}

.nx-fb-modal {
  width: min(100%, 500px);
  max-height: min(720px, calc(100svh - 32px));
  overflow: auto;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 20px 80px rgba(0,0,0,.3);
}

.nx-fb-modal__head {
  position: relative;
  border-bottom: 1px solid var(--fb-line);
  padding: 16px 54px;
  text-align: center;
}

.nx-fb-modal__head h2 {
  margin: 0;
  font-size: 20px;
}

.nx-fb-modal__close {
  position: absolute;
  right: 12px;
  top: 10px;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: #e4e6eb;
  color: #050505;
  cursor: pointer;
  font-size: 20px;
}

.nx-fb-modal__body {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.nx-fb-field {
  display: grid;
  gap: 6px;
}

.nx-fb-field span {
  color: #4b4f56;
  font-size: 13px;
  font-weight: 800;
}

.nx-fb-field input,
.nx-fb-field textarea {
  width: 100%;
  border: 1px solid #ccd0d5;
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #050505;
  padding: 12px;
  font: inherit;
}

.nx-fb-field input:focus,
.nx-fb-field textarea:focus {
  border-color: var(--fb-blue);
  box-shadow: 0 0 0 2px rgba(24,119,242,.14);
}

.nx-fb-field textarea {
  min-height: 92px;
  resize: vertical;
}

.nx-fb-modal__notice {
  padding: 11px 12px;
  border-radius: 8px;
  background: #e7f3ff;
  color: #1c4f8f;
  font-size: 13px;
  line-height: 1.45;
  font-weight: 700;
}

.nx-fb-modal__message {
  padding: 11px 12px;
  border-radius: 8px;
  background: #fff1f2;
  color: #9f1239;
  font-size: 13px;
  font-weight: 800;
}

.nx-fb-modal__message.is-success {
  background: #ecfdf5;
  color: #166534;
}

.nx-fb-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--fb-line);
  padding: 12px 16px;
}

@media (max-width: 900px) {
  .nx-fb-profile__identity {
    align-items: center;
    flex-direction: column;
    gap: 8px;
    padding: 0 16px 14px;
    text-align: center;
  }

  .nx-fb-profile__avatar-wrap {
    margin-top: -72px;
  }

  .nx-fb-profile__avatar,
  .nx-fb-profile__avatar-fallback {
    width: 144px;
    height: 144px;
  }

  .nx-fb-profile__title {
    padding-bottom: 0;
  }

  .nx-fb-profile__actions {
    width: 100%;
    justify-content: center;
    padding-bottom: 0;
  }

  .nx-fb-profile__actions .nx-fb-profile__button {
    flex: 1;
  }

  .nx-fb-profile__tabs {
    margin: 0 12px;
    overflow-x: auto;
  }

  .nx-fb-profile__grid {
    grid-template-columns: 1fr;
  }

  .nx-fb-profile__side {
    position: static;
  }
}

@media (max-width: 560px) {
  .nx-fb-profile__shell {
    padding: 0;
  }

  .nx-fb-profile__hero {
    border-radius: 0;
  }

  .nx-fb-profile__cover {
    height: 210px;
  }

  .nx-fb-profile__grid {
    gap: 9px;
    margin-top: 9px;
  }

  .nx-fb-profile__side {
    gap: 9px;
  }

  .nx-fb-profile__card {
    border-radius: 0;
    box-shadow: 0 1px 2px rgba(0,0,0,.1);
  }

  .nx-fb-profile__title h1 {
    font-size: 25px;
  }

  .nx-fb-profile__actions {
    flex-direction: column;
  }

  .nx-fb-profile__post-actions {
    margin: 0 8px;
  }
}
`;

function Avatar({ user, className, fallbackClassName }) {
  const avatar = getAvatar(user);

  if (avatar) {
    return <img className={className} src={avatar} alt={getName(user)} />;
  }

  return (
    <div className={fallbackClassName} aria-label={getName(user)}>
      {firstLetter(user)}
    </div>
  );
}

function Modal({ title, onClose, children, actions }) {
  return (
    <div className="nx-fb-modal-backdrop" onMouseDown={onClose}>
      <section className="nx-fb-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="nx-fb-modal__head">
          <h2>{title}</h2>
          <button type="button" className="nx-fb-modal__close" onClick={onClose}>×</button>
        </header>
        <div className="nx-fb-modal__body">{children}</div>
        {actions ? <footer className="nx-fb-modal__actions">{actions}</footer> : null}
      </section>
    </div>
  );
}

export default function ProfilePage() {
  const auth = useAuth();
  const fileRef = useRef(null);

  const [user, setUser] = useState(auth?.user || null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pageMessage, setPageMessage] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ displayName: '', bio: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editMessage, setEditMessage] = useState('');

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  const userId = useMemo(() => getId(user), [user]);

  async function persistUser(nextUser) {
    if (!nextUser) return;
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
    if (typeof auth?.setUser === 'function') auth.setUser(nextUser);
  }

  async function loadUser() {
    const { data } = await api.get('/users/me');
    await persistUser(data);
    return data;
  }

  async function loadPosts(id) {
    if (!id) {
      setPosts([]);
      setPostsLoading(false);
      return;
    }

    setPostsLoading(true);

    try {
      const { data } = await api.get(`/posts/user/${id}`);
      setPosts(asList(data));
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setPageMessage('');

      try {
        const nextUser = await loadUser();
        if (!active) return;
        await loadPosts(getId(nextUser));
      } catch (error) {
        if (active) setPageMessage(cleanError(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    boot();

    return () => {
      active = false;
    };
  }, []);

  function openEdit() {
    setEditForm({
      displayName: getName(user),
      bio: String(user?.bio || ''),
    });
    setEditMessage('');
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!editForm.displayName.trim()) {
      setEditMessage('Tên hiển thị không được để trống.');
      return;
    }

    setEditLoading(true);
    setEditMessage('');

    try {
      const { data } = await api.patch('/users/me', {
        displayName: editForm.displayName.trim(),
        bio: editForm.bio.trim(),
      });

      await persistUser(data);
      setEditOpen(false);
    } catch (error) {
      setEditMessage(cleanError(error));
    } finally {
      setEditLoading(false);
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPageMessage('Chỉ được chọn tệp ảnh.');
      return;
    }

    setUploading(true);
    setPageMessage('');

    try {
      const body = new FormData();
      body.append('file', file);

      const uploadResponse = await api.post('/uploads', body);
      const uploadData = uploadResponse.data || {};
      const url =
        uploadData.url ||
        uploadData.path ||
        uploadData.fileUrl ||
        uploadData.data?.url;

      if (!url) throw new Error('Server không trả về URL ảnh.');

      const { data } = await api.patch('/users/me', { avatar: url });
      await persistUser(data);
    } catch (error) {
      setPageMessage(cleanError(error));
    } finally {
      setUploading(false);
    }
  }

  function openPassword() {
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPasswordMessage({ type: '', text: '' });
    setShowPassword(false);
    setPasswordOpen(true);
  }

  async function changePassword() {
    const current = passwordForm.currentPassword;
    const next = passwordForm.newPassword;
    const confirm = passwordForm.confirmPassword;

    if (!current || !next || !confirm) {
      setPasswordMessage({ type: 'error', text: 'Nhập đầy đủ cả 3 ô mật khẩu.' });
      return;
    }

    if (next.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu mới phải từ 6 ký tự trở lên.' });
      return;
    }

    if (next !== confirm) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu nhập lại không khớp.' });
      return;
    }

    if (next === current) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage({ type: '', text: '' });

    try {
      const { data } = await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });

      setPasswordMessage({
        type: 'success',
        text: data?.message || 'Đã đổi mật khẩu.',
      });

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      setPasswordMessage({ type: 'error', text: cleanError(error) });
    } finally {
      setPasswordLoading(false);
    }
  }

  if (loading && !user) {
    return (
      <div className="nx-fb-profile">
        <style>{css}</style>
        <div className="nx-fb-profile__loading">Đang tải trang cá nhân…</div>
      </div>
    );
  }

  return (
    <div className="nx-fb-profile">
      <style>{css}</style>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={uploadAvatar}
      />

      <div className="nx-fb-profile__shell">
        <section className="nx-fb-profile__hero">
          <div className="nx-fb-profile__cover" />

          <div className="nx-fb-profile__identity">
            <div className="nx-fb-profile__avatar-wrap">
              <Avatar
                user={user}
                className="nx-fb-profile__avatar"
                fallbackClassName="nx-fb-profile__avatar-fallback"
              />
              <button
                type="button"
                className="nx-fb-profile__camera"
                title="Đổi ảnh đại diện"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? '…' : '📷'}
              </button>
            </div>

            <div className="nx-fb-profile__title">
              <h1>{getName(user)}</h1>
              <p>{user?.bio || 'Kết nối và chia sẻ trên Nexora Connect'}</p>
            </div>

            <div className="nx-fb-profile__actions">
              <button type="button" className="nx-fb-profile__button is-primary" onClick={openEdit}>
                ✎ Sửa hồ sơ
              </button>
              <button type="button" className="nx-fb-profile__button" onClick={openPassword}>
                🔒 Đổi mật khẩu
              </button>
            </div>
          </div>

          <nav className="nx-fb-profile__tabs">
            <div className="nx-fb-profile__tab is-active">Bài viết</div>
            <div className="nx-fb-profile__tab">Giới thiệu</div>
            <div className="nx-fb-profile__tab">Bạn bè</div>
            <div className="nx-fb-profile__tab">Ảnh</div>
          </nav>
        </section>

        {pageMessage ? (
          <div className="nx-fb-profile__card" style={{ marginTop: 12, color: '#9f1239', fontWeight: 800 }}>
            {pageMessage}
          </div>
        ) : null}

        <div className="nx-fb-profile__grid">
          <aside className="nx-fb-profile__side">
            <section className="nx-fb-profile__card">
              <h2>Giới thiệu</h2>
              <p className="nx-fb-profile__bio">
                {user?.bio || 'Chưa có tiểu sử.'}
              </p>

              <button
                type="button"
                className="nx-fb-profile__button nx-fb-profile__full"
                onClick={openEdit}
              >
                Chỉnh sửa tiểu sử
              </button>

              <div className="nx-fb-profile__info-list">
                <div className="nx-fb-profile__info-row">
                  <span className="nx-fb-profile__info-icon">✉</span>
                  <span>{user?.email || 'Chưa cập nhật Gmail'}</span>
                </div>
                <div className="nx-fb-profile__info-row">
                  <span className="nx-fb-profile__info-icon">☎</span>
                  <span>{user?.phone || 'Chưa cập nhật số điện thoại'}</span>
                </div>
                <div className="nx-fb-profile__info-row">
                  <span className="nx-fb-profile__info-icon">●</span>
                  <span>
                    {user?.verified ? 'Tài khoản đã xác minh' : 'Tài khoản Nexora Connect'}
                  </span>
                </div>
              </div>
            </section>

            <section className="nx-fb-profile__card nx-fb-profile__security">
              <div className="nx-fb-profile__security-head">
                <div className="nx-fb-profile__security-icon">🔒</div>
                <div>
                  <h3>Bảo mật tài khoản</h3>
                  <p>Đổi mật khẩu và đăng xuất các phiên khác.</p>
                </div>
              </div>

              <button
                type="button"
                className="nx-fb-profile__button is-primary nx-fb-profile__full"
                onClick={openPassword}
              >
                Đổi mật khẩu
              </button>
            </section>
          </aside>

          <main className="nx-fb-profile__feed">
            <section className="nx-fb-profile__card">
              <div className="nx-fb-profile__composer">
                <Avatar
                  user={user}
                  className="nx-fb-profile__mini-avatar"
                  fallbackClassName="nx-fb-profile__mini-fallback"
                />
                <div className="nx-fb-profile__composer-placeholder">
                  Bạn đang nghĩ gì?
                </div>
              </div>
            </section>

            {postsLoading ? (
              <section className="nx-fb-profile__card nx-fb-profile__loading">
                Đang tải bài viết…
              </section>
            ) : null}

            {!postsLoading && posts.length === 0 ? (
              <section className="nx-fb-profile__card nx-fb-profile__empty">
                Chưa có bài viết nào.
              </section>
            ) : null}

            {posts.map((post) => {
              const image = firstPostImage(post);
              const likes = Array.isArray(post?.likes) ? post.likes.length : Number(post?.likeCount || 0);
              const comments = Array.isArray(post?.comments) ? post.comments.length : Number(post?.commentCount || 0);

              return (
                <article className="nx-fb-profile__card nx-fb-profile__post" key={getId(post) || post.createdAt}>
                  <header className="nx-fb-profile__post-head">
                    <Avatar
                      user={user}
                      className="nx-fb-profile__mini-avatar"
                      fallbackClassName="nx-fb-profile__mini-fallback"
                    />
                    <div className="nx-fb-profile__post-meta">
                      <strong>{getName(user)}</strong>
                      <span>{formatDate(post?.createdAt)} · 🌐</span>
                    </div>
                  </header>

                  {post?.text || post?.content ? (
                    <div className="nx-fb-profile__post-text">
                      {post.text || post.content}
                    </div>
                  ) : null}

                  {image ? (
                    <img className="nx-fb-profile__post-image" src={image} alt="" />
                  ) : null}

                  <div className="nx-fb-profile__post-stats">
                    <span>👍 {likes}</span>
                    <span>{comments} bình luận</span>
                  </div>

                  <div className="nx-fb-profile__post-actions">
                    <button type="button" className="nx-fb-profile__post-action">👍 Thích</button>
                    <button type="button" className="nx-fb-profile__post-action">💬 Bình luận</button>
                    <button type="button" className="nx-fb-profile__post-action">↗ Chia sẻ</button>
                  </div>
                </article>
              );
            })}
          </main>
        </div>
      </div>

      {editOpen ? (
        <Modal
          title="Chỉnh sửa trang cá nhân"
          onClose={() => !editLoading && setEditOpen(false)}
          actions={(
            <>
              <button
                type="button"
                className="nx-fb-profile__button"
                disabled={editLoading}
                onClick={() => setEditOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="nx-fb-profile__button is-primary"
                disabled={editLoading}
                onClick={saveProfile}
              >
                {editLoading ? 'Đang lưu…' : 'Lưu'}
              </button>
            </>
          )}
        >
          <label className="nx-fb-field">
            <span>Tên hiển thị</span>
            <input
              value={editForm.displayName}
              onChange={(event) => setEditForm((previous) => ({
                ...previous,
                displayName: event.target.value,
              }))}
              placeholder="Tên hiển thị"
            />
          </label>

          <label className="nx-fb-field">
            <span>Tiểu sử</span>
            <textarea
              value={editForm.bio}
              onChange={(event) => setEditForm((previous) => ({
                ...previous,
                bio: event.target.value,
              }))}
              placeholder="Mô tả ngắn về bạn"
            />
          </label>

          {editMessage ? <div className="nx-fb-modal__message">{editMessage}</div> : null}
        </Modal>
      ) : null}

      {passwordOpen ? (
        <Modal
          title="Đổi mật khẩu"
          onClose={() => !passwordLoading && setPasswordOpen(false)}
          actions={(
            <>
              <button
                type="button"
                className="nx-fb-profile__button"
                disabled={passwordLoading}
                onClick={() => setPasswordOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="nx-fb-profile__button is-primary"
                disabled={passwordLoading}
                onClick={changePassword}
              >
                {passwordLoading ? 'Đang đổi…' : 'Đổi mật khẩu'}
              </button>
            </>
          )}
        >
          <div className="nx-fb-modal__notice">
            Sau khi đổi mật khẩu, các thiết bị khác sẽ phải đăng nhập lại.
          </div>

          <label className="nx-fb-field">
            <span>Mật khẩu hiện tại</span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((previous) => ({
                ...previous,
                currentPassword: event.target.value,
              }))}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu hiện tại"
            />
          </label>

          <label className="nx-fb-field">
            <span>Mật khẩu mới</span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((previous) => ({
                ...previous,
                newPassword: event.target.value,
              }))}
              autoComplete="new-password"
              placeholder="Từ 6 ký tự"
            />
          </label>

          <label className="nx-fb-field">
            <span>Nhập lại mật khẩu mới</span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((previous) => ({
                ...previous,
                confirmPassword: event.target.value,
              }))}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#65676b', fontSize: 13, fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Hiện mật khẩu
          </label>

          {passwordMessage.text ? (
            <div className={`nx-fb-modal__message ${passwordMessage.type === 'success' ? 'is-success' : ''}`}>
              {passwordMessage.text}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
