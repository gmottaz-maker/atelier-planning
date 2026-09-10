// Synthèse d'un projet à partir de son dump.
//
// Le fil du projet accumule des notes de téléphone, des mails recopiés, des
// PDF, des liens et des vocaux, dans le désordre et sur des mois. Ce qui manque
// n'est pas la matière : c'est la vue d'ensemble. La synthèse est là pour
// répondre à « où en est ce projet ? » sans relire trente entrées.
//
// Elle est refaite à chaque dépôt (choix assumé : toujours à jour plutôt que
// juste-à-temps), donc elle doit être bon marché — d'où Haiku, et un fil de
// matière plafonné.

import { fetchTimeout, DELAI_IA } from './fetchTimeout'
import { ErreurClaude } from './scanErreur'
import { MODELE_RAPIDE } from './modelesClaude'

export const MODELE_SYNTHESE = MODELE_RAPIDE
// Au-delà, on ne résume plus : on paie. Les entrées les plus anciennes sont
// les premières sacrifiées — un dump se lit du plus récent au plus vieux.
export const MAX_CARACTERES_MATIERE = 60_000
export const MAX_ENTREES = 120

/** Ce qu'une entrée du dump apporte à la synthèse, ou null si elle n'apporte rien. */
export function matiereEntree(u) {
  const morceaux = []
  const texte = String(u?.content || '').trim()
  // Un lien déposé seul est stocké à la fois en `content` et en `url` : ne pas
  // le compter deux fois dans la matière envoyée au modèle.
  if (texte && texte !== u?.url) morceaux.push(texte)
  if (u?.url) morceaux.push(`Lien : ${u.url}${u.url_titre ? ` — ${u.url_titre}` : ''}`)
  if (u?.url_extrait) morceaux.push(`Extrait de la page : ${u.url_extrait}`)
  if (u?.transcription) morceaux.push(`Message vocal transcrit : ${u.transcription}`)
  const fichier = u?.file_filename || u?.image_filename
  if (fichier && !u?.transcription) morceaux.push(`Pièce jointe : ${fichier}`)
  if (morceaux.length === 0) return null
  return morceaux.join('\n')
}

/**
 * Assemble la matière, du plus récent au plus ancien, sous le plafond.
 * Renvoie { texte, retenues, ignorees }.
 */
export function assemblerMatiere(updates, { jourLocal } = {}) {
  const liste = (Array.isArray(updates) ? updates : [])
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

  const blocs = []
  let taille = 0
  let retenues = 0
  for (const u of liste) {
    if (retenues >= MAX_ENTREES) break
    const matiere = matiereEntree(u)
    if (!matiere) continue
    const jour = jourLocal ? jourLocal(u.created_at) : String(u.created_at || '').slice(0, 10)
    const bloc = `[${jour || 'date inconnue'} · ${u.author || 'inconnu'}]\n${matiere}`
    if (taille + bloc.length > MAX_CARACTERES_MATIERE) break
    blocs.push(bloc)
    taille += bloc.length
    retenues += 1
  }
  const utiles = liste.filter(u => matiereEntree(u)).length
  return { texte: blocs.join('\n\n'), retenues, ignorees: utiles - retenues }
}

export function promptSynthese({ projet, client, matiere, ignorees = 0 }) {
  const coupe = ignorees > 0
    ? `\n\nAttention : ${ignorees} entrée${ignorees > 1 ? 's' : ''} plus ancienne${ignorees > 1 ? 's' : ''} ne ${ignorees > 1 ? 'sont' : 'est'} pas fournie${ignorees > 1 ? 's' : ''} ici. Ne prétends pas couvrir toute l'histoire du projet.`
    : ''
  return `Tu assistes Amazing Lab, un atelier suisse de création et d'installation d'expositions et d'événements.

Voici le fil de notes brutes du projet « ${projet} »${client ? ` pour le client ${client}` : ''} : appels téléphoniques, mails recopiés, liens, messages vocaux transcrits, pièces jointes. C'est du désordre, du plus récent au plus ancien.

Rédige une synthèse en français, destinée à quelqu'un qui reprend le projet et n'a pas le temps de tout lire. Structure-la ainsi, en sautant toute section sur laquelle le fil ne dit rien — ne remplis pas pour remplir :

**Où on en est** — deux ou trois phrases sur l'état réel du projet.
**Ce qui est décidé** — les choix arrêtés, avec qui les a pris quand c'est dit.
**En suspens** — les questions ouvertes, ce qu'on attend et de qui.
**Points d'attention** — délais, budget, contraintes techniques ou d'accès, risques.
**Prochaines actions** — ce qu'il faut faire, dans l'ordre d'urgence.

Règles :
- N'invente rien. Si une information manque, dis-le ou tais-toi.
- Cite les dates et les montants tels qu'ils apparaissent.
- Signale les contradictions entre entrées au lieu de choisir en silence.
- Pas de préambule, pas de conclusion, pas d'emoji. Va au fait.${coupe}

Fil du projet :
${matiere}`
}

/** Appelle Claude. Lève ErreurClaude si le service refuse. */
export async function genererSynthese({ projet, client, matiere, ignorees = 0, apiKey, fetcher = fetchTimeout }) {
  const r = await fetcher('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELE_SYNTHESE,
      max_tokens: 1500,
      messages: [{ role: 'user', content: promptSynthese({ projet, client, matiere, ignorees }) }],
    }),
  }, DELAI_IA)

  if (!r.ok) throw new ErreurClaude(r.status, await r.text().catch(() => ''))
  const data = await r.json()
  const texte = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
  if (!texte) throw new ErreurClaude(502, 'Réponse vide')
  return texte
}
