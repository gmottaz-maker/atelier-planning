// Calculateur de prix d'impression 3D — le moteur, sans écran.
//
// Spécification : « Calculateur de prix d'impression 3D », octobre 2026. Les
// valeurs par défaut viennent d'un vrai job (122 pièces origami pour une
// vitrine), calibrées sur les temps réels de Bambu Studio : quatre plateaux
// X1C, PLA, couche 0,28 mm, 2 parois, brim 10 mm.
//
// La géométrie (lecture des fichiers, volume, surface, empreinte) vit dans
// lib/maillage3d.js. Ce module ne reçoit que des nombres : il est donc
// testable sans fichier, et le cas de test du job réel le garde.
//
// Deux règles :
//   1. Ce qui vient du slicer (poids ou temps collés par l'utilisateur)
//      remplace l'estimation, et le résultat le dit : `source: 'slicer'`.
//   2. Les prix au kg sont des valeurs de départ, pas des prix d'achat.

export const MATIERES = {
  PLA:  { densite: 1.24, prixKg: 25, facteurTemps: 1.00, rates: 0.03 },
  PETG: { densite: 1.27, prixKg: 25, facteurTemps: 1.25, rates: 0.04 },
  ASA:  { densite: 1.07, prixKg: 30, facteurTemps: 1.20, rates: 0.05 },
  'TPU 95A': { densite: 1.21, prixKg: 40, facteurTemps: 2.50, rates: 0.08 },
}

// Plateau UTILE : le plateau réel moins les marges de brim et, sur le H2D, la
// zone commune aux deux buses.
export const MACHINES = {
  'Bambu Lab X1C / P1S':       { facteurTemps: 1.00, plateau: [232, 232] },
  'Bambu Lab H2D (une buse)':  { facteurTemps: 0.85, plateau: [280, 296] },
  'Bambu Lab H2S':             { facteurTemps: 0.85, plateau: [300, 296] },
}

// Pièces non limitées par le débit : une couche plus fine, c'est plus de
// couches à parcourir.
export const COUCHES = { 0.20: 1.25, 0.24: 1.10, 0.28: 1.00 }

export const REGLAGES_DEFAUT = {
  matieres: MATIERES,
  // Calibration mesurée : 1 149 g réels pour 1 349 g estimés (Bambu Studio).
  kCal: 0.85,
  // temps_pièce = a × poids + b, sur X1C / PLA / 0,28 mm.
  a: 0.0174,
  b: 0.261,
}

export const GLOBAUX_DEFAUT = {
  matiere: 'PLA',
  machine: 'Bambu Lab X1C / P1S',
  couche: 0.28,
  parois: 2,
  remplissage: 0.10,
  tarifMachine: 3,
  manutention: 10,
  forfaitPlateau: 3.5,
  heuresProjet: 0,
  tarifProjet: 140,
  remise: false,
  tva: 0.081,
  plateauxForces: null,
  machinesParalleles: 1,
}

export const BRIM = 10      // mm, de chaque côté
export const JEU = 4        // mm entre deux pièces sur le plateau
export const ALERTE_ELANCEMENT = 4

const num = (v, defaut) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return v === '' || v == null || !Number.isFinite(n) ? defaut : n
}

/** Arrondi suisse au 0,05 CHF. */
export const arrondi05 = x => Math.round(Math.round(x * 100) / 5) * 5 / 100

/** Épaisseur de coque équivalente (mm) : parois + dessus/dessous. */
export const epaisseurCoque = parois => 0.42 * parois + 0.42

/**
 * Poids estimé d'une pièce, en grammes.
 * V en cm³, A en cm², remplissage en fraction (0,10).
 */
export function poidsEstime({ V, A }, { parois, remplissage, densite, kCal }) {
  const coque = A * epaisseurCoque(parois) / 10
  const imprime = Math.min(V, coque) + remplissage * Math.max(V - coque, 0)
  return imprime * densite * kCal
}

/** Facteur de temps total : machine × couche × matière. */
export function facteurTemps(globaux, reglages = REGLAGES_DEFAUT) {
  const m = MACHINES[globaux.machine]?.facteurTemps ?? 1
  const c = COUCHES[globaux.couche] ?? 1
  const mat = reglages.matieres[globaux.matiere]?.facteurTemps ?? 1
  return m * c * mat
}

/** Temps machine estimé d'une pièce, en heures. */
export const tempsEstime = (poids, { a, b }, facteur = 1) => (a * poids + b) * facteur

/** Une pièce haute sur une petite base tombe pendant l'impression. */
export const elancee = ({ hauteur, empreinte }) =>
  empreinte > 0 && hauteur / empreinte > ALERTE_ELANCEMENT

/**
 * Côté du carré qu'une pièce occupe sur le plateau (mm).
 *
 * Le brim ne compte que pour une pièce ÉLANCÉE — celle à qui l'alerte le
 * recommande. La spec l'appliquait à toutes : un socle de 96 mm occupait alors
 * 120 mm et se retrouvait seul sur un plateau de 232, ce qu'aucun slicer ne
 * ferait. Une pièce à large base n'en a pas besoin.
 */
export const carreOccupe = piece =>
  Math.max(piece.largeurXY, elancee(piece) ? (piece.empreinte ?? 0) + 2 * BRIM : 0) + JEU

/**
 * Range des carrés sur des plateaux W × H, plus grands d'abord, par étagères.
 * `pieces` : [{ id, cote }]. Rend [{ pieces: [{ id, x, y, cote }], rempli }]
 * et `tropGrandes` pour ce qui ne tient sur aucun plateau (un plateau chacune).
 */
export function rangerPlateaux(pieces, [W, H]) {
  const triees = [...pieces].sort((p, q) => q.cote - p.cote)
  const plateaux = []
  const tropGrandes = []
  for (const p of triees) {
    if (p.cote > W || p.cote > H) {
      tropGrandes.push(p.id)
      plateaux.push({ etageres: [], pieces: [{ ...p, x: 0, y: 0 }], hauteur: H, horsGabarit: true })
      continue
    }
    let place = false
    for (const pl of plateaux) {
      if (pl.horsGabarit) continue
      // Sur une étagère existante assez haute, s'il reste de la largeur.
      for (const e of pl.etageres) {
        if (e.h >= p.cote && W - e.x >= p.cote) {
          pl.pieces.push({ ...p, x: e.x, y: e.y })
          e.x += p.cote
          place = true
          break
        }
      }
      if (place) break
      // Sinon une nouvelle étagère, s'il reste de la hauteur.
      if (H - pl.hauteur >= p.cote) {
        pl.etageres.push({ y: pl.hauteur, h: p.cote, x: p.cote })
        pl.pieces.push({ ...p, x: 0, y: pl.hauteur })
        pl.hauteur += p.cote
        place = true
        break
      }
    }
    if (!place) {
      plateaux.push({ etageres: [{ y: 0, h: p.cote, x: p.cote }], pieces: [{ ...p, x: 0, y: 0 }], hauteur: p.cote })
    }
  }
  return {
    plateaux: plateaux.map(pl => ({
      pieces: pl.pieces.map(({ id, x, y, cote }) => ({ id, x, y, cote })),
      rempli: Math.min(1, pl.pieces.reduce((s, q) => s + q.cote * q.cote, 0) / (W * H)),
      horsGabarit: !!pl.horsGabarit,
    })),
    tropGrandes,
  }
}

/**
 * Régression des moindres carrés sur temps = a × g + b × n, sans constante.
 * `plateaux` : [{ poids, pieces, heures }]. Rend { a, b } ou null si les
 * données ne suffisent pas à séparer les deux termes.
 */
export function calibrer(plateaux) {
  const ok = plateaux.filter(p => p.poids > 0 && p.pieces > 0 && p.heures > 0)
  if (ok.length < 2) return null
  let gg = 0, gn = 0, nn = 0, gt = 0, nt = 0
  for (const { poids: g, pieces: n, heures: t } of ok) {
    gg += g * g; gn += g * n; nn += n * n; gt += g * t; nt += n * t
  }
  const det = gg * nn - gn * gn
  if (Math.abs(det) < 1e-9 * gg * nn) return null
  const a = (gt * nn - nt * gn) / det
  const b = (nt * gg - gt * gn) / det
  if (!(a > 0) || !(b >= 0)) return null
  const ecarts = ok.map(p => p.heures - (a * p.poids + b * p.pieces))
  const rms = Math.sqrt(ecarts.reduce((s, e) => s + e * e, 0) / ok.length)
  return { a, b, rms }
}

/**
 * Répartit des plateaux sur `n` machines (le plus long d'abord, sur la
 * machine la moins chargée). Rend la durée du plus long poste, en heures.
 */
export function dureeParallele(dureesPlateaux, n) {
  const machines = Array(Math.max(1, Math.floor(n) || 1)).fill(0)
  for (const d of [...dureesPlateaux].sort((x, y) => y - x)) {
    let i = 0
    for (let k = 1; k < machines.length; k++) if (machines[k] < machines[i]) i = k
    machines[i] += d
  }
  return Math.max(...machines)
}

/** Remise quantité : 50+ pièces −5 %, 200+ −10 %. */
export const tauxRemise = n => (n >= 200 ? 0.10 : n >= 50 ? 0.05 : 0)

/**
 * Le devis complet.
 *
 * `references` : [{ id, nom, quantite, inclus, V, A, largeurXY, hauteur,
 * empreinte, poidsReel, tempsReel }] — V en cm³, A en cm², longueurs en mm,
 * poidsReel en g, tempsReel en h (vides = estimés).
 */
export function chiffrer(references, globauxBruts = {}, reglages = REGLAGES_DEFAUT) {
  const g = { ...GLOBAUX_DEFAUT, ...globauxBruts }
  const matiere = reglages.matieres[g.matiere] ?? MATIERES.PLA
  const machine = MACHINES[g.machine] ?? MACHINES['Bambu Lab X1C / P1S']
  const facteur = facteurTemps(g, reglages)
  const remplissage = num(g.remplissage, 0.10)
  const parois = num(g.parois, 2)

  const lignes = references.map(r => {
    const reelG = num(r.poidsReel, null)
    const reelH = lireHeures(r.tempsReel)
    const poids = reelG ?? poidsEstime(r, { parois, remplissage, densite: matiere.densite, kCal: reglages.kCal })
    const temps = reelH ?? tempsEstime(poids, reglages, facteur)
    return {
      ...r,
      quantite: Math.max(0, Math.round(num(r.quantite, 1))),
      inclus: r.inclus !== false,
      poids, temps,
      sourcePoids: reelG != null ? 'slicer' : 'estimé',
      sourceTemps: reelH != null ? 'slicer' : 'estimé',
      cote: carreOccupe(r),
      elancee: elancee(r),
    }
  })

  const retenues = lignes.filter(l => l.inclus && l.quantite > 0)
  const nbPieces = retenues.reduce((s, l) => s + l.quantite, 0)

  // Plateaux : une entrée par exemplaire.
  const aRanger = retenues.flatMap(l => Array.from({ length: l.quantite }, (_, k) => ({ id: `${l.id}:${k}`, ref: l.id, cote: l.cote })))
  const rangement = rangerPlateaux(aRanger, machine.plateau)
  const forces = num(g.plateauxForces, null)
  const nbPlateaux = forces != null && forces > 0 ? Math.round(forces) : rangement.plateaux.length

  const tempsDe = Object.fromEntries(retenues.map(l => [l.id, l.temps]))
  const dureesPlateaux = rangement.plateaux.map(pl => pl.pieces.reduce((s, p) => s + tempsDe[p.id.split(':').slice(0, -1).join(':')], 0))

  const partPlateaux = nbPieces ? nbPlateaux * g.forfaitPlateau / nbPieces : 0
  const partProjet = nbPieces ? num(g.heuresProjet, 0) * g.tarifProjet / nbPieces : 0

  for (const l of lignes) {
    l.coutMatiere = l.poids / 1000 * matiere.prixKg
    l.coutMachine = l.temps * g.tarifMachine
    l.base = (l.coutMatiere + l.coutMachine) * (1 + matiere.rates)
    l.prixUnitaire = arrondi05(l.base + g.manutention + partPlateaux + partProjet)
    l.total = l.inclus ? arrondi05(l.prixUnitaire * l.quantite) : 0
  }

  const somme = f => retenues.reduce((s, l) => s + f(l) * l.quantite, 0)
  const kg = somme(l => l.poids) / 1000
  const heures = somme(l => l.temps)
  const postes = {
    matiere: { quantite: kg, montant: somme(l => l.coutMatiere) },
    machine: { quantite: heures, montant: somme(l => l.coutMachine) },
    rates: { taux: matiere.rates, montant: somme(l => (l.coutMatiere + l.coutMachine) * matiere.rates) },
    manutention: { quantite: nbPieces, montant: nbPieces * g.manutention },
    plateaux: { quantite: nbPlateaux, montant: nbPlateaux * g.forfaitPlateau },
    projet: { quantite: num(g.heuresProjet, 0), montant: num(g.heuresProjet, 0) * g.tarifProjet },
  }
  const sousTotalPostes = Object.values(postes).reduce((s, p) => s + p.montant, 0)
  const sousTotal = retenues.reduce((s, l) => s + l.total, 0)
  const taux = g.remise ? tauxRemise(nbPieces) : 0
  const remise = arrondi05(sousTotal * taux)
  const totalHT = arrondi05(sousTotal - remise)
  const tva = arrondi05(totalHT * g.tva)

  // Plateaux forcés : on ne sait plus quoi est sur quoi, on répartit à la moyenne.
  const enParallele = forces != null && forces > 0
    ? Math.max(heures / Math.max(1, g.machinesParalleles), ...retenues.map(l => l.temps))
    : dureeParallele(dureesPlateaux, g.machinesParalleles)

  return {
    lignes, nbPieces, nbPlateaux, rangement, dureesPlateaux,
    postes,
    arrondis: sousTotal - sousTotalPostes,
    sousTotal, tauxRemise: taux, remise, totalHT, tva, totalTTC: totalHT + tva,
    heures, enParallele,
    facteurTemps: facteur,
  }
}

/**
 * Un temps saisi comme le slicer l'affiche : « 1h04 », « 1 h 04 », « 1:04 »,
 * « 64 min », « 5h19m » ou en heures décimales, « 1,07 ». null si illisible.
 */
export function lireHeures(s) {
  if (typeof s === 'number') return Number.isFinite(s) && s >= 0 ? s : null
  const t = String(s ?? '').trim().toLowerCase().replace(',', '.')
  if (!t) return null
  let m = t.match(/^(\d+)\s*(?:h|:)\s*(\d{1,2})?\s*(?:m|min)?$/)
  if (m) return Number(m[1]) + Number(m[2] || 0) / 60
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:m|min)$/)
  if (m) return Number(m[1]) / 60
  m = t.match(/^\d+(?:\.\d+)?$/)
  return m ? Number(t) : null
}

/** « 1 h 04 » */
export function fmtHeures(h) {
  if (h == null || !Number.isFinite(h)) return '—'
  const min = Math.round(h * 60)
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

/** Texte tabulé, collable dans Bexio ou un tableur. */
export function tableauTexte(devis) {
  const fr = n => n.toFixed(2)
  const lignes = [['Référence', 'Quantité', 'g/pièce', 'Temps/pièce (h)', 'Prix unitaire HT', 'Total HT'].join('\t')]
  for (const l of devis.lignes.filter(x => x.inclus && x.quantite > 0)) {
    lignes.push([l.nom, l.quantite, Math.round(l.poids), l.temps.toFixed(2), fr(l.prixUnitaire), fr(l.total)].join('\t'))
  }
  if (devis.remise) lignes.push(['Remise quantité', '', '', '', '', fr(-devis.remise)].join('\t'))
  lignes.push(['Total HT', '', '', '', '', fr(devis.totalHT)].join('\t'))
  lignes.push(['TVA', '', '', '', '', fr(devis.tva)].join('\t'))
  lignes.push(['Total TTC', '', '', '', '', fr(devis.totalTTC)].join('\t'))
  return lignes.join('\n')
}

/**
 * Réglages partagés relus depuis `app_settings` : une valeur absente ou
 * aberrante retombe sur celle d'origine — un réglage corrompu ne doit pas
 * casser un chiffrage.
 */
export function normaliserReglages(brut) {
  const r = brut && typeof brut === 'object' ? brut : {}
  const positif = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
  const matieres = {}
  for (const [nom, d] of Object.entries(MATIERES)) {
    const m = r.matieres?.[nom] || {}
    matieres[nom] = {
      densite: positif(m.densite, d.densite),
      prixKg: positif(m.prixKg, d.prixKg),
      facteurTemps: positif(m.facteurTemps, d.facteurTemps),
      rates: Number.isFinite(Number(m.rates)) && Number(m.rates) >= 0 && Number(m.rates) < 1 ? Number(m.rates) : d.rates,
    }
  }
  return {
    matieres,
    kCal: positif(r.kCal, REGLAGES_DEFAUT.kCal),
    a: positif(r.a, REGLAGES_DEFAUT.a),
    b: Number.isFinite(Number(r.b)) && Number(r.b) >= 0 ? Number(r.b) : REGLAGES_DEFAUT.b,
  }
}
