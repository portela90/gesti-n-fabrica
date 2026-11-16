// Avisos al móvil: lo que hace el «service worker» cuando llega un aviso (aunque la app esté cerrada) y al tocarlo.
// Lo carga el service worker de la app (vite.config.ts → workbox.importScripts).
self.addEventListener('push', (evento) => {
  let d = {};
  try { d = evento.data ? evento.data.json() : {}; } catch { d = { titulo: evento.data ? evento.data.text() : 'Aviso' }; }
  evento.waitUntil(self.registration.showNotification(d.titulo || 'Gestión de fábrica', {
    body: d.texto || '',
    tag: d.etiqueta || undefined,
    renotify: !!d.etiqueta,
    requireInteraction: !!d.urgente,
    icon: 'icono.svg',
    data: { ruta: d.ruta || '/' },
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const ruta = (evento.notification.data && evento.notification.data.ruta) || '/';
  const destino = new URL('./#' + ruta, self.registration.scope).href;
  evento.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abiertas) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); if ('navigate' in c) await c.navigate(destino); return; }
    }
    await self.clients.openWindow(destino);
  })());
});
