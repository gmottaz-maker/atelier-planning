export const ADMIN_USER = 'Guillaume'

/**
 * Renvoie true si l'utilisateur (header x-actor) est admin. Sinon renvoie 403 et return false.
 * Usage: if (!requireAdmin(req, res)) return
 */
export function requireAdmin(req, res) {
  const actor = req.headers['x-actor']
  if (actor !== ADMIN_USER) {
    res.status(403).json({ error: 'Accès réservé à l\'administrateur' })
    return false
  }
  return true
}
