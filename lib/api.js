// Client API partagé : vérification de `res.ok`, erreurs typées, annulation.
//
// 66 appels de mutation ignoraient le statut de la réponse. Un PATCH qui
// répondait 405 ne faisait donc rien de visible — c'est ce qui s'était passé
// avec le bouton « Envoyée » d'une facture : l'utilisateur cliquait, rien ne
// bougeait, et aucune trace nulle part.
//
// Les routes répondent maintenant un corps normalisé (`lib/apiError.js`) :
// { error, code, request_id }. On le transporte tel quel dans l'erreur, pour
// que l'utilisateur puisse citer l'identifiant de requête.

/** Erreur d'appel API. `status`, `code` et `requestId` sont exploitables. */
export class ApiError extends Error {
  constructor(message, { status, code, requestId, url } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.url = url
  }
}

// Bus d'erreurs : `_app.js` s'y abonne pour afficher un bandeau. Un module
// plutôt qu'un contexte React, pour rester appelable hors composant.
const abonnes = new Set()
export function surErreurApi(fn) { abonnes.add(fn); return () => abonnes.delete(fn) }
export function signalerErreur(erreur) { for (const fn of abonnes) { try { fn(erreur) } catch {} } }

const MUTATION = /^(POST|PUT|PATCH|DELETE)$/i

/**
 * Appelle une route API et renvoie le JSON, ou lève une ApiError.
 *
 *   const projet = await apiFetch(`/api/projects/${id}`, { method: 'PUT', json: form })
 *
 * `json` sérialise le corps et pose le bon en-tête. `timeoutMs` annule l'appel
 * (les rendus PDF sont longs : leur passer une valeur adaptée).
 * `silencieux` empêche la remontée dans le bandeau global, quand l'appelant
 * affiche déjà l'erreur lui-même.
 */
export async function apiFetch(url, { json, timeoutMs, silencieux, ...init } = {}) {
  const options = { ...init }
  if (json !== undefined) {
    options.method = options.method || 'POST'
    options.body = JSON.stringify(json)
    options.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  }

  let minuteur = null
  if (timeoutMs) {
    const ctrl = new AbortController()
    minuteur = setTimeout(() => ctrl.abort(), timeoutMs)
    const externe = options.signal
    if (externe) externe.addEventListener('abort', () => ctrl.abort(), { once: true })
    options.signal = ctrl.signal
  }

  let res
  try {
    // Marqueur lu par l'intercepteur de _app.js : les appels passés par ici
    // signalent eux-mêmes leurs erreurs, il ne doit pas les signaler en double.
    res = await fetch(url, { ...options, __mazeApi: true })
  } catch (e) {
    if (minuteur) clearTimeout(minuteur)
    // Une annulation volontaire n'est pas une panne : on la laisse remonter
    // sans bandeau, sinon changer de page afficherait une erreur.
    if (e?.name === 'AbortError') throw e
    const erreur = new ApiError('Connexion impossible. Vérifie ta liaison réseau.', { url })
    if (!silencieux) signalerErreur(erreur)
    throw erreur
  }
  if (minuteur) clearTimeout(minuteur)

  const type = res.headers.get('content-type') || ''
  const corps = type.includes('application/json') ? await res.json().catch(() => null) : null

  if (!res.ok) {
    const erreur = new ApiError(
      corps?.error || `Erreur ${res.status}`,
      { status: res.status, code: corps?.code, requestId: corps?.request_id, url },
    )
    // Une lecture qui échoue est signalée par l'écran (état vide, message) ;
    // une mutation muette laisse croire que l'action a abouti.
    if (!silencieux && MUTATION.test(options.method || 'GET')) signalerErreur(erreur)
    throw erreur
  }

  return corps
}

export const apiGet   = (url, o) => apiFetch(url, { ...o, method: 'GET' })
export const apiPost  = (url, json, o) => apiFetch(url, { ...o, method: 'POST', json })
export const apiPut   = (url, json, o) => apiFetch(url, { ...o, method: 'PUT', json })
export const apiPatch = (url, json, o) => apiFetch(url, { ...o, method: 'PATCH', json })
export const apiDel   = (url, o) => apiFetch(url, { ...o, method: 'DELETE' })
