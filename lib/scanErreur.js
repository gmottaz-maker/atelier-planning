// Classification des échecs d'appel à Claude, partagée par les routes de scan
// (justificatifs, factures fournisseurs) et par la synthèse de projet.
//
// La CAUSE et le MESSAGE sont séparés : la cause est la même pour tout le
// monde, la phrase affichée ne l'est pas. « La lecture automatique n'a pas
// abouti » n'a aucun sens sous une synthèse de projet, où rien n'est lu.
//
// Pourquoi : toute erreur venant de Claude affichait « La lecture automatique
// n'a pas abouti. Réessaie dans un instant. » Le 28 août 2026, le compte
// Anthropic s'est retrouvé sans crédit — un 400 définitif — et l'écran a
// conseillé de réessayer. On pouvait recommencer indéfiniment.
//
// Un échec passager (surcharge, limite de débit, délai dépassé) mérite un
// « réessaie ». Un échec permanent (crédit épuisé, clé invalide, document
// refusé) doit dire quoi faire, et à qui.

/** Erreur d'appel à Claude, porteuse du statut HTTP et du corps de réponse. */
export class ErreurClaude extends Error {
  constructor(status, corps) {
    super(`Claude API: ${String(corps).substring(0, 200)}`)
    this.name = 'ErreurClaude'
    this.status = status
    this.corps = corps
  }
}

/**
 * Pourquoi l'appel a échoué, indépendamment de ce qu'on en dira.
 * @returns {'delai'|'credit'|'cle'|'modele'|'saturation'|'document'|'inconnu'}
 */
export function causeErreurClaude(e) {
  const corps = String(e?.corps || e?.message || '')
  const status = e?.status

  // Délai dépassé côté serveur : une nouvelle tentative a de vraies chances
  // d'aboutir.
  if (e?.timeout) return 'delai'

  // Crédit épuisé : définitif tant que personne ne recharge le compte. C'est
  // une action d'administration, pas une nouvelle tentative.
  if (/credit balance is too low/i.test(corps)) return 'credit'

  if (status === 401 || status === 403 || /authentication|invalid x-api-key|permission/i.test(corps)) return 'cle'

  // Modèle retiré de l'API. Arrivé le 10 septembre 2026 avec
  // claude-3-5-haiku-20241022 : un 404 que le fourre-tout final rangeait parmi
  // les échecs passagers, donc l'écran conseillait de réessayer un appel qui
  // ne pouvait plus jamais aboutir. Seul un changement de code y remédie.
  if (status === 404 || /not_found_error|model:/i.test(corps)) return 'modele'

  if (status === 429 || status === 529 || (status >= 500 && status < 600)) return 'saturation'

  // Autres 400 : le document lui-même est en cause (format, taille, nombre de
  // pages). Réessayer à l'identique ne changera rien.
  if (status === 400) return 'document'

  return 'inconnu'
}

/** Un « réessaie » est-il un conseil honnête pour cette cause ? */
export const PASSAGER = { delai: true, saturation: true, inconnu: true, credit: false, cle: false, modele: false, document: false }

const MESSAGES_SCAN = {
  delai:      "La lecture automatique a pris trop de temps. Réessaie dans un instant.",
  credit:     "Lecture automatique indisponible : le compte Anthropic n'a plus de crédit. "
              + "Recharge-le dans la console Anthropic (Plans & Billing). Tu peux saisir le justificatif à la main en attendant.",
  cle:        "Lecture automatique indisponible : la clé d'API Anthropic est refusée. "
              + "Vérifie ANTHROPIC_API_KEY dans les variables d'environnement Vercel.",
  modele:     "Lecture automatique indisponible : le modèle Claude configuré n'existe plus. "
              + "C'est une correction à faire dans le code (lib/modelesClaude.js), pas une manipulation de ton côté.",
  saturation: "Le service de lecture est momentanément saturé. Réessaie dans un instant.",
  document:   "Ce document n'a pas pu être lu automatiquement. Vérifie qu'il s'agit d'un PDF ou d'une photo "
              + "nette de moins de 15 Mo, ou saisis le justificatif à la main.",
  inconnu:    "La lecture automatique n'a pas abouti. Réessaie dans un instant.",
}

const MESSAGES_SYNTHESE = {
  delai:      "La synthèse a pris trop de temps. Réessaie dans un instant.",
  credit:     "Synthèse indisponible : le compte Anthropic n'a plus de crédit. "
              + "Recharge-le dans la console Anthropic (Plans & Billing). Le fil du projet, lui, est intact.",
  cle:        "Synthèse indisponible : la clé d'API Anthropic est refusée. "
              + "Vérifie ANTHROPIC_API_KEY dans les variables d'environnement Vercel.",
  modele:     "Synthèse indisponible : le modèle Claude configuré n'existe plus. "
              + "C'est une correction à faire dans le code (lib/modelesClaude.js), pas une manipulation de ton côté.",
  saturation: "Le service est momentanément saturé. La synthèse se refera au prochain dépôt.",
  document:   "La synthèse a été refusée par le service. Le fil du projet est intact.",
  inconnu:    "La synthèse n'a pas abouti. Elle se refera au prochain dépôt.",
}

/**
 * Que dire à l'utilisateur, et faut-il l'inviter à réessayer ?
 * @returns {{ passager: boolean, message: string }}
 */
export function classerErreurScan(e) {
  const cause = causeErreurClaude(e)
  return { passager: PASSAGER[cause], message: MESSAGES_SCAN[cause] }
}

/** Même classement, dit dans les mots de la synthèse de projet. */
export function classerErreurSynthese(e) {
  const cause = causeErreurClaude(e)
  return { passager: PASSAGER[cause], message: MESSAGES_SYNTHESE[cause] }
}
