// Phase de travail d'un projet. Vide = « En préparation » (comportement normal,
// l'échéance pilote l'urgence). Toute phase définie signifie que la livraison
// est en cours ou passée → on n'affiche plus le projet comme « en retard ».
export const PROJECT_PHASES = [
  { key: 'en_cours',  label: 'En cours',   color: '#1d4ed8', bg: '#eff6ff' },
  { key: 'demontage', label: 'Démontage',  color: '#9a3412', bg: '#fff7ed' },
  { key: 'termine',   label: 'Terminé',    color: '#15803d', bg: '#dcfce7' },
]
export function phaseMeta(key) {
  return PROJECT_PHASES.find(p => p.key === key) || null
}
// Une phase définie neutralise l'urgence liée à l'échéance.
export function isOngoing(phase) {
  return !!phase && PROJECT_PHASES.some(p => p.key === phase)
}
