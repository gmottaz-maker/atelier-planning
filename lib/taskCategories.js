export const TASK_CATEGORIES = [
  { key: 'bureau',              label: 'Bureau',                 icon: '🏢', color: '#6366f1' },
  { key: 'fichiers_production', label: 'Fichiers de production', icon: '📐', color: '#14b8a6' },
  { key: 'commande',            label: 'Commande & Achats',      icon: '🛒', color: '#0ea5e9' },
  { key: 'sous_traitance',      label: 'Sous-traitance',         icon: '🔨', color: '#a855f7' },
  { key: 'atelier',             label: 'Atelier',                icon: '🏭', color: '#f59e0b' },
  { key: 'logistique',          label: 'Logistique',             icon: '🚚', color: '#10b981' },
]

export function getCategory(key) {
  return TASK_CATEGORIES.find(c => c.key === key) || TASK_CATEGORIES[0]
}
