// `fetch` avec délai maximal, pour tous les appels sortants (kDrive, Anthropic,
// Resend, Todoist, Odoo).
//
// Sans délai, une dépendance externe qui ne répond pas immobilise la fonction
// serverless jusqu'à son propre plafond (60 s ici) : l'utilisateur voit une
// page figée, et les rendus PDF, sérialisés par conteneur, attendent derrière.
// Un échec rapide et lisible vaut mieux qu'une attente muette.

export const DELAI_DEFAUT = 20_000
// L'OCR d'une facture prend couramment 30 à 60 s : un délai court le tuerait.
export const DELAI_IA = 120_000

export class TimeoutError extends Error {
  constructor(url, ms) {
    super(`Délai dépassé (${Math.round(ms / 1000)} s) : ${new URL(url, 'http://x').host || url}`)
    this.name = 'TimeoutError'
    this.timeout = true
  }
}

/**
 * `fetch` qui abandonne après `timeoutMs`. Un `signal` déjà fourni par
 * l'appelant reste respecté : les deux causes d'annulation coexistent.
 */
export async function fetchTimeout(url, options = {}, timeoutMs = DELAI_DEFAUT) {
  const ctrl = new AbortController()
  const minuteur = setTimeout(() => ctrl.abort(), timeoutMs)

  const externe = options.signal
  const relais = () => ctrl.abort()
  if (externe) {
    if (externe.aborted) ctrl.abort()
    else externe.addEventListener('abort', relais, { once: true })
  }

  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } catch (e) {
    // On ne requalifie que NOTRE délai : une annulation venue de l'appelant
    // doit rester une annulation.
    if (e?.name === 'AbortError' && !externe?.aborted) throw new TimeoutError(url, timeoutMs)
    throw e
  } finally {
    clearTimeout(minuteur)
    if (externe) externe.removeEventListener('abort', relais)
  }
}
