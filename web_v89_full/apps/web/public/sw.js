const DEFAULT_PATH = '/notifications';
const CALL_CLOSE_TYPES = new Set(['call_terminal', 'call_cancel']);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function callTag(data = {}) {
  return data.callSessionId ? `call-${data.callSessionId}` : 'incoming-call';
}

async function closeCallNotification(data = {}) {
  const notifications = await self.registration.getNotifications({ tag: callTag(data) });
  notifications.forEach((notification) => notification.close());
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data?.json?.() || {};
    } catch {
      payload = { body: event.data?.text?.() || '' };
    }

    const title = payload.title || 'Legatalk Connect';
    const body = payload.body || 'Bạn có thông báo mới.';
    const data = payload.data || {};
    const type = String(data.type || payload.type || '');
    const path = data.path || data.url || DEFAULT_PATH;

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: 'NEXORA_WEB_PUSH', payload }));

    if (CALL_CLOSE_TYPES.has(type)) {
      await closeCallNotification(data);
      return;
    }

    const isIncomingCall = type === 'incoming_call';
    if (isIncomingCall && data.expiresAt) {
      const expiresAt = Date.parse(data.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return;
    }

    const hasVisibleWindow = windows.some((client) => client.visibilityState === 'visible');
    if (hasVisibleWindow) return;

    const unread = Number(data.unreadCount || 0);
    if (unread > 0 && self.registration.setAppBadge) {
      await self.registration.setAppBadge(unread).catch(() => {});
    }

    const options = {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: isIncomingCall ? callTag(data) : (data.notificationId || data.type || 'nexora-notification'),
      renotify: true,
      vibrate: isIncomingCall ? [300, 120, 300, 120, 500] : [180, 80, 180],
      requireInteraction: isIncomingCall,
      timestamp: data.startedAt ? Date.parse(data.startedAt) : Date.now(),
      data: { ...data, path },
    };

    if (isIncomingCall) {
      options.actions = [
        { action: 'open-call', title: 'Mở cuộc gọi' },
        { action: 'dismiss-call', title: 'Bỏ qua' }
      ];
    }

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action || 'open';
  const data = event.notification.data || {};
  event.notification.close();
  if (action === 'dismiss-call') return;

  const path = data.path || DEFAULT_PATH;
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      existing.postMessage({ type: 'NEXORA_CALL_NOTIFICATION_CLICK', data });
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(targetUrl);
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
