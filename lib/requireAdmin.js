import { timingSafeEqual } from 'crypto'
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

// Cache mémoire des tokens déjà vérifiés. Une même instance serverless sert de
// nombreuses requêtes d'affilée avec le même token : sans cache, CHAQUE appel
// API payait deux allers-retours Supabase (auth.getUser + profiles), soit
// ~200-450 ms d'overhead avant tout travail utile. TTL court : la fenêtre
// pendant laquelle un token révoqué resterait accepté ; l'expiration du JWT
// lui-même (1 h) reste contrôlée par Supabase à chaque miss.
const userCache = new Map()  // token → { user, until }
const USER_CACHE_TTL = 5 * 60 * 1000
const USER_CACHE_MAX = 200

export async function getVerifiedUser(req) {
  const token = tokenFromReq(req)
  if (!token) return null
  const hit = userCache.get(token)
  if (hit && hit.until > Date.now()) return hit.user
  try {
    const supabase = getSupabaseServer()
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null
    const { data: profile } = await supabase
      .from('profiles').select('name').eq('id', user.id).maybeSingle()
    const verified = {
      id: user.id,
      email: user.email,
      name: profile?.name || user.user_metadata?.name || user.email,
    }
    if (userCache.size >= USER_CACHE_MAX) userCache.delete(userCache.keys().next().value)
    userCache.set(token, { user: verified, until: Date.now() + USER_CACHE_TTL })
    return verified
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

/**
 * Comparaison de secrets à temps constant. `===` sur des chaînes s'arrête au
 * premier caractère différent : la durée de la réponse fuit le préfixe correct.
 */
export function secretMatches(provided, expected) {
  if (!provided || !expected) return false
  const a = Buffer.from(String(provided))
  const b = Buffer.from(String(expected))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Routes cron : autorise soit Vercel Cron (en-tête Bearer <CRON_SECRET>), soit
 * un ADMIN connecté pour un déclenchement manuel. Un simple utilisateur vérifié
 * ne suffit pas : ces routes génèrent des factures, synchronisent des clients
 * ou notifient toute l'équipe.
 * Renvoie { cron: true } | user | null (réponse 401/403 déjà envoyée).
 */
export async function requireCronOrAdmin(req, res) {
  const auth = req.headers.authorization || ''
  const secret = process.env.CRON_SECRET
  if (secret && auth.startsWith('Bearer ') && secretMatches(auth.slice(7), secret)) {
    return { cron: true }
  }
  return await requireAdmin(req, res)
}
