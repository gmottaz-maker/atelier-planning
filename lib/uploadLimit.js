// Taille maximale d'un fichier envoyé aux routes de scan et d'import.
//
// La contrainte ne vient PAS de nous : Vercel refuse toute requête dont le
// corps dépasse 4,5 Mo, avant même que la fonction serverless démarre. Le
// `sizeLimit` d'une route Next ne peut pas relever ce plafond — il ne peut que
// l'abaisser. Une route qui annonce `sizeLimit: '15mb'` promet donc quelque
// chose que la plateforme n'accordera jamais.
//
// Deux conséquences que ce module traite :
//
//  1. le refus arrive en TEXTE BRUT (« Request Entity Too Large »), pas en
//     JSON. Un `await res.json()` posé dessus lève « Unexpected token 'R' »,
//     ce que l'utilisateur a effectivement vu à l'écran ;
//  2. le fichier voyage en base64, qui gonfle d'environ un tiers. Le plafond
//     réel sur le fichier d'origine est donc nettement sous 4,5 Mo.

export const LIMITE_CORPS_VERCEL = 4.5 * 1024 * 1024

// base64 = 4 octets pour 3, plus l'enveloppe JSON (noms de champs, guillemets,
// type MIME). Le facteur 1,4 couvre les deux avec une marge.
export const MAX_FICHIER_OCTETS = Math.floor(LIMITE_CORPS_VERCEL / 1.4)

export function formaterTaille(octets) {
  const mo = octets / (1024 * 1024)
  if (mo >= 1) return `${mo.toFixed(1)} Mo`
  return `${Math.max(1, Math.round(octets / 1024))} Ko`
}

/**
 * Le fichier peut-il passer ? Vérifié AVANT lecture et envoi : lire 8 Mo en
 * base64 pour se faire refuser ensuite fait patienter pour rien.
 * @returns {{ ok: boolean, message?: string }}
 */
export function verifierTailleFichier(file) {
  const taille = file?.size ?? 0
  if (taille <= MAX_FICHIER_OCTETS) return { ok: true }
  return {
    ok: false,
    message: `Fichier trop volumineux (${formaterTaille(taille)}). `
      + `La limite est de ${formaterTaille(MAX_FICHIER_OCTETS)} par envoi — c'est un plafond de l'hébergeur, pas un réglage. `
      + `Découpe le PDF et envoie les parties séparément.`,
  }
}

/**
 * Lit la réponse d'une route de scan ou d'import.
 *
 * Ne suppose JAMAIS du JSON : un refus de la plateforme (413) ou une panne de
 * passerelle (502, 504) répond en texte brut, et `res.json()` lève alors une
 * erreur de syntaxe qui ne dit rien à personne.
 */
export async function lireReponse(res) {
  const type = res.headers.get('content-type') || ''
  const corps = type.includes('application/json') ? await res.json().catch(() => null) : null

  if (res.ok) {
    if (corps) return corps
    throw new Error('Réponse illisible du serveur.')
  }

  if (res.status === 413) {
    throw new Error(
      `Fichier trop volumineux : refusé par l'hébergeur. La limite est de ${formaterTaille(MAX_FICHIER_OCTETS)} par envoi. `
      + `Découpe le PDF et envoie les parties séparément.`,
    )
  }
  // `lib/apiError.js` renvoie { error, code, request_id } ; l'identifiant sert
  // à retrouver la trace dans les journaux Vercel, on le garde.
  if (corps?.error) {
    throw new Error(corps.request_id ? `${corps.error} (réf. ${corps.request_id})` : corps.error)
  }
  throw new Error(`Le serveur a répondu ${res.status}.`)
}
