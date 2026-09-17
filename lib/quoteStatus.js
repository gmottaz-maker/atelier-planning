import { C } from './theme'

// Statuts d'un devis (stockés dans quote_data.status — pas de migration DB)
export const QUOTE_STATUSES = [
  { key: 'brouillon',  label: 'Brouillon',  color: '#6b7280', bg: '#f3f4f6' },
  { key: 'envoye',     label: 'Envoyé',     color: '#1d4ed8', bg: '#dbeafe' },
  { key: 'a_corriger', label: 'À corriger', color: '#b45309', bg: '#fef3c7' },
  { key: 'accepte',    label: 'Accepté',    color: '#15803d', bg: '#dcfce7' },
  { key: 'refuse',     label: 'Refusé',     color: '#b91c1c', bg: '#fee2e2' },
]

export function quoteStatusMeta(key) {
  return QUOTE_STATUSES.find(s => s.key === key) || QUOTE_STATUSES[0]
}

// ── Pastille d'offre sur la carte projet — où en est l'offre ─────────────────
//
// Volontairement séparée du liseré HAUT (`statutProjet`, lib/projectStatus.js),
// qui dit l'échéance. Les deux informations sont orthogonales : un projet peut
// être en retard ET son offre acceptée. Les faire partager un seul signal
// obligeait à en sacrifier une — c'est pourquoi il y en a deux.
//
//   rouge  quelque chose t'attend : pas d'offre, brouillon, ou à corriger
//   vert   acceptée
//   gris   refusée — dossier clos, plus une alerte, juste un projet mort
//   null   envoyée : la balle est chez le client, il n'y a rien à faire.
//          Un rouge ici rendrait une offre partie hier aussi alarmante
//          qu'une offre jamais écrite.
//
// Renvoie `null` quand il n'y a rien à signaler ; l'appelant n'affiche alors
// aucune pastille. Rien à compenser : l'avatar du responsable qu'elle précède
// est aligné à droite, il ne bouge pas.
export function quoteStripe(quoteData) {
  const status = quoteData?.status
  if (status === 'accepte') return C.success
  if (status === 'refuse')  return C.muted
  if (status === 'envoye')  return null
  return C.danger   // absent, 'brouillon', 'a_corriger', ou clé inconnue
}

// ── Fond de la carte projet : rien n'est encore parti au client ──────────────
//
// Vrai quand le projet n'a AUCUNE offre, ou une offre restée en brouillon.
// Ce sont les deux cas où le client n'a rien reçu et où la balle est chez nous.
//
// « À corriger » n'en fait volontairement pas partie : cette offre-là est déjà
// partie une fois. La pastille la signale (elle appelle une action), mais la
// carte ne s'allume pas — sinon le fond ne veut plus dire « rien n'est parti ».
// ── Filtre « où en sont les offres » ────────────────────────────────────────
//
// Une question qui revient à chaque fois que la liste s'allonge : combien de
// projets attendent encore que j'écrive ou que je corrige leur offre ? La
// pastille de la carte le dit projet par projet ; ce filtre les rassemble.
//
// « à faire » réunit l'offre ABSENTE, le brouillon et « à corriger » : dans les
// trois cas la balle est chez nous, et les distinguer dans la liste
// obligerait à cliquer trois fois pour une seule question.
export const CATEGORIES_OFFRE = [
  { key: 'a_faire', label: 'offre à faire' },
  { key: 'envoye',  label: 'offre envoyée' },
  { key: 'accepte', label: 'offre acceptée' },
  { key: 'refuse',  label: 'offre refusée' },
]

export function categorieOffre(quoteData) {
  const status = quoteData?.status
  if (status === 'accepte') return 'accepte'
  if (status === 'refuse')  return 'refuse'
  if (status === 'envoye')  return 'envoye'
  return 'a_faire'
}

/** Compte les projets par catégorie d'offre, dans l'ordre d'affichage. */
export function compterOffres(projets = []) {
  const total = {}
  for (const { key } of CATEGORIES_OFFRE) total[key] = 0
  for (const p of projets) total[categorieOffre(p?.quote_data)] += 1
  return total
}

export function offreAFaire(quoteData) {
  const status = quoteData?.status
  return !status || status === 'brouillon'
}
