// Wrapper fetch qui ajoute le header x-actor pour les API admin (banking).
import { ADMIN_USER } from './requireAdmin'

export default function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-actor': ADMIN_USER,
    },
  })
}
