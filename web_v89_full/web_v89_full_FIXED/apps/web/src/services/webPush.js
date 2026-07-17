import { api } from './api';

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;
}

export function webPushSupported() {
  return window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function getWebPushState() {
  if (!webPushSupported()) {
    return { state: 'unsupported', message: 'Trình duyệt hoặc kết nối hiện tại chưa hỗ trợ thông báo nền.' };
  }

  if (isIos() && !isStandalone()) {
    return { state: 'install-required', message: 'Trên iPhone/iPad, hãy thêm Nexora vào Màn hình chính rồi mở từ biểu tượng PWA.' };
  }

  if (Notification.permission === 'denied') {
    return { state: 'denied', message: 'Thông báo đang bị chặn trong cài đặt trình duyệt hoặc thiết bị.' };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (Notification.permission === 'granted' && subscription) {
    return { state: 'enabled', message: 'Thông báo nền đang bật.' };
  }

  return { state: 'available', message: 'Bật để nhận tin nhắn, cuộc gọi và thông báo khi đã thoát PWA.' };
}

export async function enableWebPush() {
  if (!webPushSupported()) throw new Error('Thiết bị hoặc trình duyệt này chưa hỗ trợ Web Push.');
  if (isIos() && !isStandalone()) {
    throw new Error('Trên iPhone/iPad, hãy thêm website vào Màn hình chính và mở bằng biểu tượng Nexora trước.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') throw new Error('Bạn chưa cấp quyền thông báo cho Nexora.');

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const { data } = await api.get('/web-push/public-key');
  if (!data?.publicKey) throw new Error('Backend chưa cấu hình VAPID_PUBLIC_KEY.');

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(data.publicKey),
    });
  }

  await api.post('/web-push/subscribe', {
    subscription: subscription.toJSON(),
    userAgent: navigator.userAgent,
  });

  return { state: 'enabled', message: 'Đã bật thông báo nền cho thiết bị này.' };
}

export async function syncGrantedWebPush() {
  if (!webPushSupported() || Notification.permission !== 'granted') return getWebPushState();
  if (isIos() && !isStandalone()) return getWebPushState();

  try {
    return await enableWebPush();
  } catch {
    return getWebPushState();
  }
}
