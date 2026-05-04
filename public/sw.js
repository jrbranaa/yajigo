self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Now Available', {
      body: data.body || 'Available for drop-in discussions',
      icon: '/icon.png',
      badge: '/icon.png',
      data: { url: data.url || '/schedule' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const target = data => data.url;
      const existing = list.find(w => w.url.includes('/schedule'));
      if (existing) return existing.focus();
      return clients.openWindow(e.notification.data.url);
    })
  );
});
