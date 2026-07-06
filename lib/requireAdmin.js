import { getSupabaseServer } from './supabase-server'

export const ADMIN_USER = 'Guillaume'

/**
 * Vérifie le JWT Supabase (header Authorization: Bearer) et renvoie
 * l'utilisateur { id, email, name } ou null. Le nom vient de `profiles`
 * (fallback user_metadata.name). On ne fait jamais confiance aux headers
 * librement modifiables par le client (ex-header x-actor) : l'identité
 * vient du token signé par Supabase.
 */
function tokenFromReq(req) {
  const auth = req.headers.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  // Fallback cookie (posé par _app.js) pour les requêtes sans header :
  // <img src>, <a href> vers les vignettes kDrive, images et PDF.
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)sb-access-token=([^;]+)/)
  return m ? m[1] : null
}

export async function getVerifiedUser(req) {
  const token = tokenFromReq(req)
  if (!token) return null
  try {
    const supabase = getSupabaseServer()
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null
    const { data: profile } = await supabase
      .from('profiles').select('name').eq('id', user.id).maybeSingle()
    return {
      id: user.id,
      email: user.email,
      name: profile?.name || user.user_metadata?.name || user.email,
    }
  } catch {
    return null
  }
}

/**
 * Renvoie l'utilisateur vérifié, sinon répond 401 et renvoie null.
 * Usage: const user = await requireUser(req, res); if (!user) return
 */
export async function requireUser(req, res) {
  const user = await getVerifiedUser(req)
  if (!user) {
    res.status(401).json({ error: 'Authentification requise' })
    return null
  }
  return user
}

/**
 * Renvoie l'utilisateur vérifié s'il est admin, sinon répond 401/403 et renvoie null.
 * Usage: const admin = await requireAdmin(req, res); if (!admin) return
 */
export async function requireAdmin(req, res) {
  const user = await getVerifiedUser(req)
  if (!user) {
    res.status(401).json({ error: 'Authentification requise' })
    return null
  }
  if (user.name !== ADMIN_USER) {
    res.status(403).json({ error: 'Accès réservé à l\'administrateur' })
    return null
  }
  return user
}
