// Date du jour en heure LOCALE, au format YYYY-MM-DD.
//
// Une seule source, parce que la variante naïve est un piège qui s'est déjà
// refermé : `new Date('2026-09-04') < new Date()` compare un instant UTC à
// l'heure locale, et fait donc basculer une échéance « en retard » dès la
// veille au soir en Suisse. Comparer deux chaînes YYYY-MM-DD évite entièrement
// la question du fuseau.
export function dateDuJour(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Jour LOCAL d'un horodatage, au format YYYY-MM-DD.
 *
 * Un `TIMESTAMPTZ` revient de Postgres en UTC. Le découper à la main
 * (`created_at.split('T')[0]`) donne donc le jour UTC, pas celui qu'on a vécu :
 * en Suisse d'été, tout ce qui se passe entre 22h00 et minuit est daté du
 * LENDEMAIN, et tout ce qui se passe entre minuit et 02h00 de la VEILLE.
 *
 * Ce n'est pas qu'un problème d'affichage : c'est ce décalage qui décide si une
 * tâche compte comme « terminée aujourd'hui ».
 */
export function jourLocal(horodatage) {
  if (!horodatage) return null
  const d = new Date(horodatage)
  return Number.isNaN(d.getTime()) ? null : dateDuJour(d)
}
