import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

function readCachedUser() {
  try {
    const raw = localStorage.getItem('user');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isDefinitiveAuthFailure(error) {
  return [400, 401, 403].includes(Number(error?.response?.status || 0));
}

export function AuthProvider({ children }) {
  const initialUser = readCachedUser();
  const hasStoredSession = Boolean(
    localStorage.getItem('accessToken') || localStorage.getItem('refreshToken')
  );

  const [user, setUserState] = useState(initialUser);
  const [loading, setLoading] = useState(hasStoredSession && !initialUser);

  const setUser = (nextUser) => {
    setUserState(nextUser || null);
    if (nextUser) localStorage.setItem('user', JSON.stringify(nextUser));
    else localStorage.removeItem('user');
  };

  const saveAuth = (data) => {
    if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken);
    if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data?.user || null);
  };

  useEffect(() => {
    if (!hasStoredSession) {
      setLoading(false);
      return;
    }

    api.get('/users/me')
      .then(({ data }) => setUser(data))
      .catch((error) => {
        if (isDefinitiveAuthFailure(error)) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setUser(null);
        } else {
          // Mạng yếu hoặc Render đang khởi động: giữ phiên cũ, không ép đăng xuất.
          setUserState((current) => current || readCachedUser());
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) await api.post('/auth/logout');
    } catch (error) {
      console.warn('Logout API failed:', error?.response?.data || error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('jwt');
      setUserState(null);
      window.location.replace('/login');
    }
  }

  const refreshMe = async () => {
    const { data } = await api.get('/users/me');
    setUser(data);
    return data;
  };

  const value = useMemo(
    () => ({ user, setUser, loading, saveAuth, logout, refreshMe }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
