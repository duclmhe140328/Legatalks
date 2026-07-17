const DEFAULT_PATH = '/notifications';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
    const path = data.path || data.url || DEFAULT_PATH;

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: 'NEXORA_WEB_PUSH', payload }));

    const hasVisibleWindow = windows.some((client) => client.visibilityState === 'visible');
    if (hasVisibleWindow) return;

    const unread = Number(data.unreadCount || 0);
    if (unread > 0 && self.registration.setAppBadge) {
      await self.registration.setAppBadge(unread).catch(() => {});
    }

    await self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.notificationId || data.type || 'nexora-notification',
      renotify: true,
      vibrate: [180, 80, 180],
      data: { ...data, path },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path || DEFAULT_PATH;
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(targetUrl);
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
