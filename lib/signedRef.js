// Jetons signés à durée de vie courte, pour autoriser l'accès à une ressource
// externe que l'application vient elle-même de désigner.
//
// Cas d'usage : les fichiers et dossiers listés en direct depuis kDrive ne sont
// pas référencés en base. On ne peut donc pas vérifier après coup qu'un
// `fileId` reçu du navigateur appartient bien au projet. Le serveur signe donc
// ce qu'il a lui-même renvoyé, et n'accepte ensuite que ses propres signatures.
import { createHmac, timingSafeEqual } from 'crypto'

// Pas de nouvelle variable d'environnement à provisionner : on dérive la clé de
// la clé de service, qui ne quitte jamais le serveur. KDRIVE_TOKEN_SECRET
// permet de la séparer si besoin.
function key() {
  const base = process.env.KDRIVE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Secret de signature absent')
  return createHmac('sha256', base).update('kdrive-ref-v1').digest()
}

const b64 = buf => Buffer.from(buf).toString('base64url')

export const DEFAULT_TTL_MS = 60 * 60 * 1000   // 1 h : la durée d'une consultation

export function signRef(payload, ttlMs = DEFAULT_TTL_MS) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }))
  const sig = b64(createHmac('sha256', key()).update(body).digest())
  return `${body}.${sig}`
}

/** Renvoie la charge utile si la signature est valide et non expirée, sinon null. */
export function verifyRef(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  let expected
  try {
    expected = b64(createHmac('sha256', key()).update(body).digest())
  } catch { return null }
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (!payload?.exp || payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}
