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
