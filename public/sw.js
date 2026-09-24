// Maze Project — Service Worker
//
// Il ne fait QUE les notifications push. Il n'y a aucun cache ici : une
// constante `CACHE_NAME` traînait sans être utilisée nulle part, et le
// commentaire promettait un « cache PWA » qui n'a jamais existé. Mieux vaut
// dire ce qu'il fait — hors ligne est un chantier à part, qui demande de
// décider quoi servir périmé, et une offre périmée est pire que pas d'offre.

const ICONE = '/icons/icon-192.png'

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
      // `/icon-192.png` était écrit ici, à la racine : ce fichier n'a jamais
      // existé — il n'y avait qu'un icon.svg — et les notifications
      // s'affichaient donc sans icône depuis toujours.
      badge: badge || ICONE,
      icon: ICONE,
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
