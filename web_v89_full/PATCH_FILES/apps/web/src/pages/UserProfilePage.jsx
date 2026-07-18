import { useEffect, useState } from 'react';
import { ArrowLeft, Ban, MessageCircle, MoreHorizontal, Phone, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import { PostCard } from './TimelinePage';

export default function UserProfilePage() {
  const { user } = useAuth();
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async () => {
    try {
      const [profileResponse, postsResponse] = await Promise.all([
        api.get(`/users/${userId}/profile`),
        api.get(`/posts/user/${userId}`)
      ]);
      setProfile(profileResponse.data);
      setPosts(postsResponse.data);
      setStatus('');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  useEffect(() => { void load(); }, [userId]);

  const requestFriend = async () => {
    try {
      setStatus((await api.post(`/users/friends/request/${userId}`)).data.message);
      await load();
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const unfriend = async () => {
    try {
      setStatus((await api.delete(`/users/friends/${userId}`)).data.message);
      setMenuOpen(false);
      await load();
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const blockUser = async () => {
    if (!window.confirm(`Chặn ${profile?.displayName || 'người dùng này'}? Hai bên sẽ không thể xem hồ sơ, bài viết và story của nhau.`)) return;
    try {
      await api.post(`/users/block/${userId}`);
      navigate('/timeline', { replace: true });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const openChat = async () => {
    try {
      const { data } = await api.post('/conversations/direct', { userId });
      sessionStorage.setItem('openConversationId', data._id);
      navigate('/chats');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const like = async (post) => {
    const { data } = await api.post(`/posts/${post._id}/like`);
    setPosts((list) => list.map((item) => item._id === post._id ? {
      ...item,
      likes: data.liked ? [...item.likes, user._id] : item.likes.filter((id) => String(id?._id || id) !== user._id)
    } : item));
  };

  const comment = async (post, payload) => {
    const { data } = await api.post(`/posts/${post._id}/comments`, payload);
    setPosts((list) => list.map((item) => item._id === post._id ? { ...item, comments: [...item.comments, data] } : item));
    return data;
  };

  if (!profile) return <div className="public-profile-loading card"><button onClick={() => navigate(-1)}><ArrowLeft /> Quay lại</button><p>{status || 'Đang tải hồ sơ…'}</p></div>;

  return <div className="public-profile-page">
    <section className="public-profile-hero card">
      <div className="public-cover" style={{ backgroundImage: profile.cover ? `url(${profile.cover})` : undefined }} />
      <button className="profile-back" onClick={() => navigate(-1)}><ArrowLeft /></button>
      <div className="public-profile-info">
        <Avatar user={profile} size={118} />
        <div className="public-profile-copy">
          <h2>{profile.displayName}{profile.verified && ' ✓'}</h2>
          <span>{profile.username ? `@${profile.username}` : profile.accountType === 'official' ? 'Official Account' : 'Thành viên Legatalk'}</span>
          {profile.bio && <p>{profile.bio}</p>}
          {profile.phone && <small>+{profile.phone}</small>}
        </div>
        <div className="public-profile-actions">
          <button className="primary-small" onClick={openChat}><MessageCircle /> Nhắn tin</button>
          {!profile.relationship?.isFriend && !profile.relationship?.outgoing && <button className="secondary-btn" onClick={requestFriend}><UserPlus /> Kết bạn</button>}
          {profile.relationship?.isFriend && <button className="friend-state" onClick={unfriend} title="Hủy kết bạn"><UserCheck /> Bạn bè</button>}
          {profile.relationship?.outgoing && <button className="friend-state" disabled><Phone /> Đã gửi lời mời</button>}
          <div className="public-profile-more">
            <button className="secondary-btn" onClick={() => setMenuOpen((value) => !value)} aria-label="Tùy chọn hồ sơ"><MoreHorizontal /></button>
            {menuOpen && <div className="public-profile-more-menu">
              {profile.relationship?.isFriend && <button onClick={unfriend}><UserMinus /> Hủy kết bạn</button>}
              <button className="danger" onClick={blockUser}><Ban /> Chặn người dùng</button>
            </div>}
          </div>
        </div>
      </div>
      {status && <div className="form-status profile-public-status">{status}</div>}
    </section>

    <section className="public-profile-posts">
      <div className="section-head"><div><h3>Nhật ký</h3><p>{posts.length} bài viết bạn có thể xem</p></div></div>
      {posts.length === 0 && <div className="empty-state card"><div className="empty-icon">📭</div><h3>Chưa có bài viết công khai</h3></div>}
      {posts.map((post) => <PostCard key={post._id} profileMode post={post} user={user} onLike={() => like(post)} onComment={(payload) => comment(post, payload)} />)}
    </section>
  </div>;
}
