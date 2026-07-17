import axios from 'axios';

const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${browserOrigin}/api` : 'http://localhost:4000/api');
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? browserOrigin : 'http://localhost:4000');

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original?._retry || original?.url?.includes('/auth/refresh')) throw error;
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      localStorage.removeItem('accessToken');
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    original._retry = true;
    refreshPromise ||= axios.post(`${API_URL}/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        localStorage.setItem('accessToken', data.accessToken);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        return data.accessToken;
      })
      .catch((refreshError) => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        throw refreshError;
      })
      .finally(() => { refreshPromise = null; });
    const accessToken = await refreshPromise;
    original.headers.Authorization = `Bearer ${accessToken}`;
    return api(original);
  }
);

export function errorMessage(error) {
  return error.response?.data?.message || error.message || 'Có lỗi xảy ra.';
}
