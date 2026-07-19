// Statuts d'une facture fournisseur.
//
// Stockés en base : pending | sent_to_bank | paid
// Calculé à l'affichage : overdue (échéance dépassée alors que rien n'est parti
// à la banque) — ne jamais l'écrire en base.

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

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
