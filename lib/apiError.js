// Réponses d'erreur normalisées et journalisation structurée.
//
// Les routes renvoyaient le `message` brut de Supabase, de kDrive ou d'un autre
// fournisseur directement au navigateur : noms de colonnes, contraintes,
// requêtes, parfois des valeurs. C'est une aide au diagnostic pour un attaquant
// et une information illisible pour l'utilisateur.
//
// Le détail va donc dans les logs serveur, avec un identifiant de requête ; le
// navigateur reçoit un code stable, un message en français, et cet identifiant
// pour qu'on puisse relier les deux.
import { randomUUID } from 'crypto'

// Messages destinés à l'utilisateur. Le code, lui, est stable : l'interface
// peut s'y fier, contrairement au texte.
const MESSAGES = {
  unauthorized:  'Authentification requise',
  forbidden:     'Accès refusé',
  not_found:     'Ressource introuvable',
  bad_request:   'Requête invalide',
  conflict:      'Conflit : la ressource a changé entre-temps',
  unsupported:   'Type de fichier non autorisé',
  too_large:     'Fichier trop volumineux',
  upstream:      'Un service externe n’a pas répondu',
  internal:      'Erreur interne',
}

const STATUTS = {
  unauthorized: 401, forbidden: 403, not_found: 404, bad_request: 400,
  conflict: 409, unsupported: 415, too_large: 413, upstream: 502, internal: 500,
}

/** Identifiant de requête : celui de la plateforme s'il existe, sinon un neuf. */
export function requestId(req) {
  return req?.headers?.['x-vercel-id'] || req?.headers?.['x-request-id'] || randomUUID().slice(0, 8)
}

// Champs à ne jamais écrire dans les logs, même en cas d'erreur.
const SENSIBLES = /(token|secret|password|authorization|apikey|api_key|iban|base64|cookie)/i

/** Retire des métadonnées tout ce qui ressemble à un secret ou à une pièce jointe. */
export function nettoyer(meta) {
  if (!meta || typeof meta !== 'object') return meta
  const out = {}
  for (const [k, v] of Object.entries(meta)) {
    if (SENSIBLES.test(k)) out[k] = '[masqué]'
    else if (typeof v === 'string' && v.length > 200) out[k] = `${v.slice(0, 60)}… (${v.length} car.)`
    else if (v && typeof v === 'object') out[k] = nettoyer(v)
    else out[k] = v
  }
  return out
}

/**
 * Journalise une erreur côté serveur. Une seule ligne, préfixée de l'identifiant
 * de requête, pour la retrouver dans les logs Vercel à partir de ce que
 * l'utilisateur a vu à l'écran.
 */
export function logErreur(rid, contexte, erreur, meta) {
  const detail = erreur?.message || String(erreur ?? '')
  const extra = meta ? ` ${JSON.stringify(nettoyer(meta))}` : ''
  console.error(`[${rid}] ${contexte}: ${detail}${extra}`)
}

/**
 * Répond une erreur normalisée et journalise le détail.
 *
 *   return erreurApi(req, res, 'internal', e, { route: 'customer-invoices' })
 *
 * `message` permet de remplacer le libellé par défaut quand il est utile à
 * l'utilisateur (« L'échéance précède la date d'émission »). Ne jamais y mettre
 * le message d'un fournisseur externe.
 */
export function erreurApi(req, res, code, erreurInterne, meta, message) {
  const rid = requestId(req)
  const status = STATUTS[code] || 500
  if (erreurInterne) logErreur(rid, meta?.route || code, erreurInterne, meta)
  return res.status(status).json({
    error: message || MESSAGES[code] || MESSAGES.internal,
    code,
    request_id: rid,
  })
}
