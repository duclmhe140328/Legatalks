import axios from 'axios';

const browserOrigin =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:5173';

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? `${browserOrigin}/api`
    : 'http://localhost:4000/api');

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.PROD
    ? browserOrigin
    : 'http://localhost:4000');

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  headers: {
    Accept: 'application/json',
  },
});

const PUBLIC_AUTH_PATHS = [
  '/auth/login/password',
  '/auth/login/otp',
  '/auth/register',
  '/auth/request-otp',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/refresh',
];

function requestPath(config) {
  const url = String(config?.url || '');

  try {
    return new URL(url, API_URL).pathname.replace(/^\/api/, '');
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '');
  }
}

function isPublicAuthRequest(config) {
  const path = requestPath(config);

  return PUBLIC_AUTH_PATHS.some(
    (publicPath) =>
      path === publicPath ||
      path.endsWith(publicPath),
  );
}

function clearStoredSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('jwt');
}

api.interceptors.request.use((config) => {
  config.headers = config.headers || {};

  const isFormData =
    typeof FormData !== 'undefined' &&
    config.data instanceof FormData;

  /*
   * Không tự đặt Content-Type cho FormData.
   * Trình duyệt phải tự thêm multipart boundary.
   */
  if (isFormData) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type');
    } else {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }


  if (isPublicAuthRequest(config)) {
    if (config.headers) {
      delete config.headers.Authorization;
    }

    return config;
  }

  const token =
    localStorage.getItem('accessToken') ||
    localStorage.getItem('token') ||
    localStorage.getItem('jwt');

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    /*
     * Login sai thì trả nguyên thông báo của backend.
     * Không thử refresh và không đổi thành
     * "Phiên đăng nhập đã hết hạn".
     */
    if (
      status !== 401 ||
      !original ||
      original._retry ||
      isPublicAuthRequest(original)
    ) {
      throw error;
    }

    const refreshToken = localStorage.getItem('refreshToken');

    if (!refreshToken) {
      clearStoredSession();
      throw error;
    }

    original._retry = true;

    try {
      refreshPromise ??= axios
        .post(`${API_URL}/auth/refresh`, {
          refreshToken,
        })
        .finally(() => {
          refreshPromise = null;
        });

      const refreshResponse = await refreshPromise;
      const accessToken = refreshResponse.data?.accessToken;
      const nextRefreshToken = refreshResponse.data?.refreshToken;

      if (!accessToken) {
        throw new Error('Refresh response không có accessToken.');
      }

      localStorage.setItem('accessToken', accessToken);

      if (nextRefreshToken) {
        localStorage.setItem('refreshToken', nextRefreshToken);
      }

      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${accessToken}`;

      return api(original);
    } catch (refreshError) {
      const refreshStatus = Number(refreshError?.response?.status || 0);
      const refreshRejected = [400, 401, 403].includes(refreshStatus);

      // Chỉ xóa phiên khi server xác nhận refresh token không còn hợp lệ.
      // Mất mạng, timeout hoặc Render đang khởi động không được ép đăng xuất.
      if (refreshRejected) {
        clearStoredSession();

        const pathname = window.location.pathname;
        if (
          pathname !== '/login' &&
          pathname !== '/register' &&
          pathname !== '/forgot-password'
        ) {
          window.location.replace('/login');
        }
      }

      throw refreshError;
    }
  },
);

export function clearSession() {
  clearStoredSession();
}
export function errorMessage(error, fallback = 'Có lỗi xảy ra.') {
  const data = error?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  return (
    data?.message ||
    data?.error ||
    error?.message ||
    fallback
  );
}

export default api;