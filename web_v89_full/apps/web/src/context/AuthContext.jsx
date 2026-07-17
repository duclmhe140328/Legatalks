import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('accessToken')));

  const saveAuth = (data) => {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
  };

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) return;
    api.get('/users/me').then(({ data }) => setUser(data)).catch(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }).finally(() => setLoading(false));
  }, []);

  async function logout() {
  try {
    const token = localStorage.getItem('accessToken');

    if (token) {
      await api.post('/auth/logout');
    }
  } catch (error) {
    console.warn('Logout API failed:', error?.response?.data || error);
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('jwt');

    window.location.replace('/login');
  }
}

  const refreshMe = async () => {
    const { data } = await api.get('/users/me');
    setUser(data);
    return data;
  };

  const value = useMemo(() => ({ user, setUser, loading, saveAuth, logout, refreshMe }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
