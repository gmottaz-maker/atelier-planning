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
