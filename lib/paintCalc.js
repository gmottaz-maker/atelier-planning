// Chiffrage d'un travail de peinture : quantités, coût matière, temps.
//
// Module pur — aucune dépendance à l'interface. Le calculateur d'origine
// mêlait le calcul au DOM ; le sortir permet de le tester, et surtout de le
// recalibrer quand les essais d'atelier auront affiné les coefficients.
//
// Toute la chaîne part d'une surface RÉELLE et lui applique, dans cet ordre :
// le coefficient de complexité géométrique, les pertes de pulvérisation, puis
// le nombre de couches. L'ordre compte : les pertes s'appliquent à la surface
// déjà pondérée, pas à la surface brute.
//
// Les deux facteurs sont distincts et ne se remplacent pas :
//   • `quantite` (complexité) — surconsommation due à la FORME de la pièce ;
//   • `pertes` — amorçage, réglage, fond de godet, valables même sur un plat.

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }

/**
 * Coefficients de complexité géométrique.
 *
 * `quantite` est un facteur de SURCONSOMMATION de peinture dû à la forme de la
 * pièce : chants, retours, recoins, angles rentrants où le pistolet repasse et
 * où le brouillard se perd. Il ne recouvre PAS les pertes normales de
 * pulvérisation — amorçage, réglage, fond de godet — qui valent pour toute
 * pièce, même un panneau plat, et qui ont leur propre réglage (`pertes`).
 *
 * `temps` est le facteur de durée correspondant.
 *
 * HYPOTHÈSES AMAZING LAB, pas des données RUCO : ces valeurs sont là pour être
 * recalibrées à partir d'essais réels, pas pour faire foi.
 */
export const COMPLEXITES_DEFAUT = {
  A0: { label: 'Panneau plat / pièce simple',                quantite: 1.00, temps: 1.00 },
  A1: { label: 'Meuble simple, quelques chants',             quantite: 1.10, temps: 1.20 },
  A2: { label: 'Bibliothèque, niches, angles',               quantite: 1.20, temps: 1.50 },
  A3: { label: 'Meuble très découpé, nombreux retours',      quantite: 1.35, temps: 2.00 },
  A4: { label: 'Lettrage, formes complexes, recoins',        quantite: 1.60, temps: 3.00 },
}

export const REGLAGES_DEFAUT = {
  margeMatiere: 20,   // %
  pertes: 5,          // % — pertes normales de pulvérisation, toute pièce confondue
  tempsA0: 8,         // min/m²/couche, à recalibrer
  tauxHoraire: 100,   // CHF/h
}

/**
 * Prix du mélange prêt à durcir, durcisseur compris.
 * Un 2K chiffré au seul prix du composant A est sous-évalué : le durcisseur
 * coûte souvent plus cher que la peinture.
 */
export function prixMelange(p) {
  if (p?.prixA == null) return null
  if (!p.ratioB) return p.prixA
  if (p.prixDurcisseur == null) return null
  return (p.prixA * p.ratioA + p.prixDurcisseur * p.ratioB) / (p.ratioA + p.ratioB)
}

/** Rendement retenu selon le mode : prudent, moyen, optimiste. */
export function rendement(p, mode = 'moyen') {
  const { rendMin, rendMax } = p || {}
  if (rendMin == null && rendMax == null) return null
  if (rendMin == null) return rendMax
  if (rendMax == null) return rendMin
  if (mode === 'min') return rendMin
  if (mode === 'max') return rendMax
  return (rendMin + rendMax) / 2
}

/** Taux de dilution retenu selon le mode. */
export function dilution(p, mode = 'retenue') {
  if (!p) return null
  const v = mode === 'min' ? p.dilMin : mode === 'max' ? p.dilMax : p.dilRetenue
  return v == null ? null : v
}

/**
 * Chiffrage complet.
 *
 * Renvoie toujours un objet : les valeurs incalculables valent `null` et sont
 * accompagnées d'un avertissement. Ne jamais inventer une valeur manquante —
 * un chiffrage faux coûte plus cher qu'un chiffrage absent.
 */
export function chiffrer({
  produit,
  surface,
  couches = 2,
  complexite = { quantite: 1, temps: 1 },
  modeRendement = 'moyen',
  modeDilution = 'retenue',
  margeMatiere = REGLAGES_DEFAUT.margeMatiere,
  pertes = REGLAGES_DEFAUT.pertes,
  tempsA0 = REGLAGES_DEFAUT.tempsA0,
  tauxHoraire = REGLAGES_DEFAUT.tauxHoraire,
} = {}) {
  const avertissements = []
  const p = produit

  const surfaceReelle = num(surface)
  const nbCouches = Math.max(0, num(couches))
  // `matiere` : ancien nom de `quantite`, relu au cas où un réglage l'aurait
  // enregistré avant le renommage.
  const coefQte = num(complexite?.quantite ?? complexite?.matiere) || 1
  const coefTemps = num(complexite?.temps) || 1

  // Surface pondérée : complexité géométrique, puis pertes de pulvérisation.
  const surfacePonderee = surfaceReelle * coefQte * (1 + num(pertes) / 100)
  const surfaceTotale = surfacePonderee * nbCouches

  // Temps : indépendant du produit, il ne dépend que de la surface et du geste.
  const tempsMin = surfaceReelle * nbCouches * num(tempsA0) * coefTemps
  const coutTemps = (tempsMin / 60) * num(tauxHoraire)

  const base = {
    surfaceReelle, surfacePonderee, surfaceTotale,
    tempsMin, coutTemps,
    rendementRetenu: null, melange: null, quantiteA: null, quantiteB: null,
    quantiteDiluant: null, masseAGicler: null,
    prixMelange: null, coutA: null, coutB: null, coutDiluant: null,
    coutMatiere: null, coutMatiereMarge: null, total: null,
    avertissements,
  }

  if (!p) { avertissements.push('Aucun produit sélectionné.'); return base }

  // Les manques se signalent TOUS, pas seulement le premier rencontré : un
  // produit sans rendement ni prix doit dire les deux, sinon on corrige l'un
  // pour découvrir l'autre au coup suivant.
  const pMelange = prixMelange(p)
  if (pMelange == null) {
    avertissements.push(
      p.prixA == null
        ? 'Prix du produit inconnu — ne pas confondre avec un prix nul.'
        : 'Prix du durcisseur inconnu : le mélange 2K n’est pas chiffrable.')
  }

  const rend = rendement(p, modeRendement)
  if (rend == null || rend <= 0) {
    avertissements.push('Rendement inconnu pour ce produit : quantités et coût matière non calculables.')
    // `total` reste null : le coût du temps seul n'est pas un total, l'afficher
    // comme tel donnerait une fausse impression de chiffrage complet.
    return base
  }

  // Rendement en m²/L : on passe par le volume, puis la densité donne la masse.
  let melange
  if (p.rendUnite === 'm²/L') {
    if (!p.densite) {
      avertissements.push('Densité manquante : impossible de convertir les litres en kilos.')
      return { ...base, rendementRetenu: rend }
    }
    melange = (surfaceTotale / rend) * p.densite
  } else {
    melange = surfaceTotale / rend
  }

  // Répartition A / B. Un 1K a ratioB = 0, donc tout est en A.
  const total2K = p.ratioA + p.ratioB
  const quantiteA = p.ratioB ? melange * p.ratioA / total2K : melange
  const quantiteB = p.ratioB ? melange * p.ratioB / total2K : 0

  const tauxDil = dilution(p, modeDilution)
  if (tauxDil == null) avertissements.push('Taux de dilution inconnu : diluant non chiffré.')
  const quantiteDiluant = tauxDil == null ? null : melange * tauxDil

  const coutA = pMelange == null ? null : quantiteA * p.prixA
  const coutB = pMelange == null || !p.ratioB ? (p.ratioB ? null : 0) : quantiteB * p.prixDurcisseur

  let coutDiluant = null
  if (quantiteDiluant != null) {
    if (p.prixDiluant == null) {
      avertissements.push(`Prix du diluant ${p.diluant || ''} inconnu : il n’entre pas dans le coût.`.replace('  ', ' '))
    } else {
      coutDiluant = quantiteDiluant * p.prixDiluant
    }
  }

  const chiffrable = coutA != null && coutB != null
  const coutMatiere = chiffrable ? coutA + coutB + (coutDiluant || 0) : null
  const coutMatiereMarge = coutMatiere == null ? null : coutMatiere * (1 + num(margeMatiere) / 100)

  return {
    ...base,
    rendementRetenu: rend,
    melange,
    quantiteA, quantiteB, quantiteDiluant,
    masseAGicler: melange + (quantiteDiluant || 0),
    prixMelange: pMelange,
    coutA, coutB, coutDiluant,
    coutMatiere, coutMatiereMarge,
    total: coutMatiereMarge == null ? null : coutMatiereMarge + coutTemps,
    avertissements,
  }
}

/**
 * Durée en heures et minutes. « 160 min » ne se lit pas : à partir d'une heure,
 * on veut « 2 h 40 ». En dessous, la minute reste plus parlante.
 */
export function fmtDuree(minutes) {
  const m = Math.round(num(minutes))
  if (!Number.isFinite(m) || m <= 0) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const reste = m % 60
  return reste === 0 ? `${h} h` : `${h} h ${String(reste).padStart(2, '0')}`
}

/**
 * Un code de niveau : court et sans espace, pour rester lisible dans un menu.
 * Douze caractères laissent la place à « LETTRAGE-3D » sans permettre d'y
 * mettre la description, qui a son propre champ.
 */
export function codeValide(code) {
  return typeof code === 'string' && /^[A-Za-z0-9_-]{1,12}$/.test(code.trim())
}

const coefValide = x => {
  const n = parseFloat(x)
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : null
}

/**
 * Valide un jeu de coefficients venu des réglages partagés.
 *
 * Un jeu enregistré est pris pour ce qu'il est : SA liste de niveaux fait foi.
 * Sans quoi un niveau supprimé réapparaîtrait au chargement suivant, et on ne
 * pourrait jamais s'écarter de A0–A4. Les valeurs par défaut ne servent donc
 * qu'à deux choses : compléter un champ manquant sur un niveau qui porte un
 * code connu, et fournir la liste entière quand rien n'est enregistré.
 *
 * L'ordre des clés est celui de l'enregistrement : il détermine l'ordre du menu.
 */
export function normaliserComplexites(brut) {
  const entrees = brut && typeof brut === 'object' && !Array.isArray(brut) ? Object.entries(brut) : []

  const out = {}
  for (const [code, v] of entrees) {
    if (!codeValide(code)) continue
    const cle = code.trim()
    const defaut = COMPLEXITES_DEFAUT[cle] || { label: cle, quantite: 1, temps: 1 }
    // `matiere` accepté en lecture : c'est l'ancien nom de `quantite`.
    const quantite = coefValide(v?.quantite ?? v?.matiere)
    const temps = coefValide(v?.temps)
    out[cle] = {
      label: typeof v?.label === 'string' && v.label.trim() ? v.label.trim() : defaut.label,
      quantite: quantite ?? defaut.quantite,
      temps: temps ?? defaut.temps,
    }
  }

  // Rien d'exploitable : on repart de l'échelle d'origine plutôt que de laisser
  // le calculateur sans aucun niveau.
  return Object.keys(out).length ? out : { ...COMPLEXITES_DEFAUT }
}

/**
 * Ajoute un niveau, en trouvant un code libre. Renvoie un NOUVEL objet :
 * l'ordre d'insertion est l'ordre d'affichage.
 */
export function ajouterComplexite(complexites, code) {
  const existants = complexites || {}
  let cle = (code || '').trim()
  if (!codeValide(cle) || existants[cle]) {
    let n = Object.keys(existants).length
    do { cle = `A${n}`; n++ } while (existants[cle])
  }
  return { ...existants, [cle]: { label: '', quantite: 1, temps: 1 } }
}

/** Retire un niveau. Le dernier ne se supprime pas : il en faut toujours un. */
export function retirerComplexite(complexites, code) {
  const reste = { ...(complexites || {}) }
  if (Object.keys(reste).length <= 1) return reste
  delete reste[code]
  return reste
}

/** Renomme le code d'un niveau en gardant sa place dans l'ordre. */
export function renommerComplexite(complexites, ancien, nouveau) {
  const cle = (nouveau || '').trim()
  if (!codeValide(cle) || (cle !== ancien && complexites?.[cle])) return complexites
  return Object.fromEntries(
    Object.entries(complexites || {}).map(([k, v]) => (k === ancien ? [cle, v] : [k, v])))
}

/**
 * Coût matière indicatif au m² et par couche, pour comparer des produits entre
 * eux dans le tableau des prix. Sans complexité ni pertes — c'est une base de
 * comparaison, pas un chiffrage.
 */
export function coutParM2(p) {
  const rend = rendement(p, 'moyen')
  const prix = prixMelange(p)
  if (!rend || prix == null) return null
  const parUnite = p.rendUnite === 'm²/L' && p.densite ? (1 / rend) * p.densite : 1 / rend
  return parUnite * prix
}
