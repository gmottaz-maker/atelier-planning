// Amazing Lab Planning — Service Worker
// Gère les push notifications et le cache PWA

const CACHE_NAME = 'al-planning-v1'

// Installation
self.addEventListener('install', e => {
  self.skipWaiting()
})

// Activation
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim())
})

// Push notification reçue
self.addEventListener('push', e => {
  if (!e.data) return

  const data = e.data.json()
  const { title, body, badge, tag, url } = data

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      badge: badge || '/icon-192.png',
      icon: '/icon-192.png',
      tag: tag || 'al-task',
      data: { url: url || '/tasks' },
      vibrate: [100, 50, 100],
      requireInteraction: false,
    })
  )
})

// Clic sur une notification → ouvre l'app
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/tasks'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si l'app est déjà ouverte, focus dessus
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Sinon ouvre un nouvel onglet
      return clients.openWindow(url)
    })
  )
})
