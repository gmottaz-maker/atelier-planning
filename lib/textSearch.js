// Recherche libre sur plusieurs champs.
//
// Correspondance par DÉBUT DE MOT, pas par sous-chaîne : chercher « OBI » doit
// ramener « Achat OBI Renens », pas « Dépannage automobile » ni « Galaxus
// Mobile ». Une recherche de plusieurs mots exige que chacun corresponde
// (« dhl exp » trouve « DHL Express »), dans n'importe quel ordre.

export function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function queryTerms(q) {
  return normalize(q).split(/\s+/).filter(Boolean)
}

// `fields` : les valeurs du document à fouiller (contrepartie, libellé, …).
export function matchesQuery(fields, q) {
  const terms = queryTerms(q)
  if (terms.length === 0) return true
  // Un « mot » commence après tout ce qui n'est ni lettre ni chiffre.
  const words = normalize(fields.filter(v => v != null).join(' '))
    .split(/[^a-z0-9]+/).filter(Boolean)
  return terms.every(t => words.some(w => w.startsWith(t)))
}
