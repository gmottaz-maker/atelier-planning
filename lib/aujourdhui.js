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
