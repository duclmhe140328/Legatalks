import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

import AuthEmailPage from './pages/AuthEmailPage';
import AppShell from './components/AppShell';
import ChatPage from './pages/ChatPage';
import TimelinePage from './pages/TimelinePage';
import ContactsPage from './pages/ContactsPage';
import ProfilePage from './pages/ProfilePage';
import IntegrationsPage from './pages/IntegrationsPage';
import MiniAppsPage from './pages/MiniAppsPage';
import UserProfilePage from './pages/UserProfilePage';
import CallHistoryPage from './pages/CallHistoryPage';
import NotificationsPage from './pages/NotificationsPage';
import MeetingsPage from './pages/MeetingsPage';
import GuestMeetingPage from './pages/GuestMeetingPage';

function Protected({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <img src="https://legatalk.io.vn/images/logo.png" alt="Legatalk Logo" className="brand-mark" />
        <p>Đang tải Legatalk Connect…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <SocketProvider>{children}</SocketProvider>;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <img src="https://legatalk.io.vn/images/logo.png" alt="Legatalk Logo" className="brand-mark" />
        <p>Đang tải Legatalk Connect…</p>
      </div>
    );
  }

  if (user) return <Navigate to="/timeline" replace />;

  return children;
}

/**
 * Clicking the current user's avatar may navigate to /users/:userId.
 * Without this wrapper React renders the old UserProfilePage, so the new
 * Facebook-style ProfilePage appears to have "not changed".
 */
function OwnOrPublicProfile() {
  const { user } = useAuth();
  const { userId } = useParams();

  const currentUserId = String(user?._id || user?.id || '');
  const requestedUserId = String(userId || '');

  if (currentUserId && currentUserId === requestedUserId) {
    return <ProfilePage />;
  }

  return <UserProfilePage />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <AuthEmailPage initialMode="login" />
          </GuestRoute>
        }
      />

      <Route
        path="/register"
        element={
          <GuestRoute>
            <AuthEmailPage initialMode="register" />
          </GuestRoute>
        }
      />

      <Route
        path="/forgot-password"
        element={
          <GuestRoute>
            <AuthEmailPage initialMode="forgot" />
          </GuestRoute>
        }
      />

      <Route path="/join-meeting/:meetingId" element={<GuestMeetingPage />} />

      <Route path="/" element={<Protected><AppShell /></Protected>}>
        <Route index element={<Navigate to="/timeline" replace />} />
        <Route path="chats" element={<ChatPage />} />
        <Route path="calls" element={<CallHistoryPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:meetingId" element={<MeetingsPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="mini-apps" element={<MiniAppsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="users/:userId" element={<OwnOrPublicProfile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
