// Statuts d'une facture fournisseur.
//
// Stockés en base : pending | sent_to_bank | paid
// Calculé à l'affichage : overdue (échéance dépassée alors que rien n'est parti
// à la banque) — ne jamais l'écrire en base.
import { dateDuJour as todayStr } from './aujourdhui'

export const STORED_STATUSES = {
  pending:      { label: 'À payer',              color: '#f59e0b' },
  sent_to_bank: { label: 'Transmis à la banque', color: '#3b82f6' },
  paid:         { label: 'Payée',                color: '#22c55e' },
}

export const DISPLAY_STATUSES = {
  ...STORED_STATUSES,
  overdue: { label: 'En retard', color: '#dc2626' },
}

// Ordre de progression, utilisé pour trier la colonne Statut.
export const STATUS_ORDER = ['overdue', 'pending', 'sent_to_bank', 'paid']


// Statut à afficher. Une facture transmise à la banque n'est pas « en retard » :
// l'ordre est parti, on attend son exécution.
// Comparaison de chaînes YYYY-MM-DD volontaire : `new Date('2026-07-17')` est du
// UTC et ferait basculer une facture en retard dès la veille au soir.
export function effectiveStatus(inv, today = todayStr()) {
  if (!inv) return 'pending'
  if (inv.status === 'paid' || inv.status === 'sent_to_bank') return inv.status
  const due = String(inv.due_date || '').slice(0, 10)
  if (due && due < today) return 'overdue'
  return 'pending'
}

// ── Ce que couvre chaque filtre de la liste ─────────────────────────────────
//
// `effectiveStatus` renvoie UN seul statut : une facture en retard vaut
// « overdue », pas « pending ». Comparer le filtre par égalité stricte sortait
// donc les factures en retard de « À payer » — le filtre le plus utilisé
// cachait précisément les plus urgentes.
//
// « À payer » les inclut désormais : une facture en retard est d'abord une
// facture à payer. « En retard » reste un sous-ensemble, pour les isoler quand
// c'est ce qu'on cherche.
//
// « Transmises » n'entre pas dans « À payer » : l'ordre est parti à la banque,
// il n'y a plus rien à faire. C'est un choix différent de celui du TOTAL
// affiché en tête de page, qui lui regroupe tout ce qui doit encore sortir du
// compte — deux questions différentes, deux regroupements.
export const FILTRES_LISTE = {
  all:          null,
  pending:      ['pending', 'overdue'],
  overdue:      ['overdue'],
  sent_to_bank: ['sent_to_bank'],
  paid:         ['paid'],
}

/** La facture entre-t-elle dans le filtre choisi ? */
export function correspondAuFiltre(inv, filtre, today = todayStr()) {
  const attendus = FILTRES_LISTE[filtre]
  if (!attendus) return true   // « Toutes », ou un filtre inconnu : on n'ampute rien
  return attendus.includes(effectiveStatus(inv, today))
}
