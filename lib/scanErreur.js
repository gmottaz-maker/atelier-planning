// Classification des échecs d'OCR, partagée par les deux routes de scan
// (justificatifs et factures fournisseurs).
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
 * Que dire à l'utilisateur, et faut-il l'inviter à réessayer ?
 * @returns {{ passager: boolean, message: string }}
 */
export function classerErreurScan(e) {
  const corps = String(e?.corps || e?.message || '')
  const status = e?.status

  // Délai dépassé côté serveur : le document était peut-être trop lourd, mais
  // une nouvelle tentative a de vraies chances d'aboutir.
  if (e?.timeout) {
    return { passager: true, message: "La lecture automatique a pris trop de temps. Réessaie dans un instant." }
  }

  // Crédit épuisé : définitif tant que personne ne recharge le compte. C'est
  // une action d'administration, pas une nouvelle tentative.
  if (/credit balance is too low/i.test(corps)) {
    return {
      passager: false,
      message: "Lecture automatique indisponible : le compte Anthropic n'a plus de crédit. "
        + "Recharge-le dans la console Anthropic (Plans & Billing). Tu peux saisir le justificatif à la main en attendant.",
    }
  }

  if (status === 401 || status === 403 || /authentication|invalid x-api-key|permission/i.test(corps)) {
    return {
      passager: false,
      message: "Lecture automatique indisponible : la clé d'API Anthropic est refusée. "
        + "Vérifie ANTHROPIC_API_KEY dans les variables d'environnement Vercel.",
    }
  }

  // Surcharge et limite de débit : franchement passagers.
  if (status === 429 || status === 529 || (status >= 500 && status < 600)) {
    return { passager: true, message: "Le service de lecture est momentanément saturé. Réessaie dans un instant." }
  }

  // Autres 400 : le document lui-même est en cause (format, taille, nombre de
  // pages). Réessayer à l'identique ne changera rien.
  if (status === 400) {
    return {
      passager: false,
      message: "Ce document n'a pas pu être lu automatiquement. Vérifie qu'il s'agit d'un PDF ou d'une photo "
        + "nette de moins de 15 Mo, ou saisis le justificatif à la main.",
    }
  }

  return { passager: true, message: "La lecture automatique n'a pas abouti. Réessaie dans un instant." }
}
