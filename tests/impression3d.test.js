import { describe, it, expect } from 'vitest'
import {
  chiffrer, poidsEstime, tempsEstime, epaisseurCoque, arrondi05, carreOccupe,
  elancee, rangerPlateaux, calibrer, dureeParallele, tauxRemise, fmtHeures,
  tableauTexte, normaliserReglages, facteurTemps, lireHeures, REGLAGES_DEFAUT, MATIERES,
} from '../lib/impression3d'

const PLA = { parois: 2, remplissage: 0.10, densite: 1.24, kCal: 0.85 }
const proche = (x, cible, tol = 0.02) => expect(Math.abs(x - cible) / cible).toBeLessThanOrEqual(tol)

// Le job réel d'octobre 2026 : 122 pièces, 10 plateaux, 3 h de projet.
const JOB = { plateauxForces: 10, heuresProjet: 3 }

describe('poids', () => {
  it('donne 1,26 mm de coque pour 2 parois', () => {
    expect(epaisseurCoque(2)).toBeCloseTo(1.26, 6)
  })

  it('retrouve les ~46 g de Base4', () => {
    proche(poidsEstime({ V: 186.2, A: 218.2 }, PLA), 46, 0.02)
  })

  it('compte une pièce plus fine que sa coque comme pleine', () => {
    // V < coque : tout le volume est imprimé, rien au remplissage.
    expect(poidsEstime({ V: 2, A: 100 }, PLA)).toBeCloseTo(2 * 1.24 * 0.85, 6)
  })
})

describe('temps', () => {
  it('retrouve les temps de la spécification', () => {
    expect(fmtHeures(tempsEstime(2, REGLAGES_DEFAUT))).toBe('0 h 18')
    expect(fmtHeures(tempsEstime(46, REGLAGES_DEFAUT))).toBe('1 h 04')
    expect(fmtHeures(tempsEstime(93, REGLAGES_DEFAUT))).toBe('1 h 53')
  })

  it('multiplie machine, couche et matière', () => {
    const f = facteurTemps({ machine: 'Bambu Lab H2D (une buse)', couche: 0.20, matiere: 'PETG' })
    expect(f).toBeCloseTo(0.85 * 1.25 * 1.25, 6)
  })

  it('reste dans les ±20 min des plateaux réels', () => {
    const plateaux = [[6, 227, 5 + 19 / 60], [12, 386, 9 + 49 / 60], [12, 301, 8 + 42 / 60], [13, 236, 7 + 18 / 60]]
    for (const [n, g, reel] of plateaux) {
      const estime = REGLAGES_DEFAUT.a * g + REGLAGES_DEFAUT.b * n
      expect(Math.abs(estime - reel) * 60).toBeLessThanOrEqual(20)
    }
  })
})

describe('calibration', () => {
  it('refait a et b sur les plateaux réels', () => {
    const r = calibrer([
      { pieces: 6, poids: 227, heures: 5 + 19 / 60 },
      { pieces: 12, poids: 386, heures: 9 + 49 / 60 },
      { pieces: 12, poids: 301, heures: 8 + 42 / 60 },
      { pieces: 13, poids: 236, heures: 7 + 18 / 60 },
    ])
    expect(r.a).toBeGreaterThan(0.010)
    expect(r.a).toBeLessThan(0.025)
    expect(r.b).toBeGreaterThan(0.15)
    expect(r.b).toBeLessThan(0.40)
    expect(r.rms).toBeLessThan(20 / 60)
  })

  it('retrouve exactement un modèle sans bruit', () => {
    const vrai = (g, n) => 0.02 * g + 0.3 * n
    const r = calibrer([{ poids: 100, pieces: 2, heures: vrai(100, 2) }, { poids: 300, pieces: 10, heures: vrai(300, 10) }])
    expect(r.a).toBeCloseTo(0.02, 9)
    expect(r.b).toBeCloseTo(0.3, 9)
  })

  it('refuse de conclure sur un seul plateau ou des plateaux proportionnels', () => {
    expect(calibrer([{ poids: 100, pieces: 2, heures: 3 }])).toBeNull()
    expect(calibrer([{ poids: 100, pieces: 2, heures: 3 }, { poids: 200, pieces: 4, heures: 6 }])).toBeNull()
  })
})

describe('plateaux', () => {
  it('ne compte le brim que pour une pièce élancée', () => {
    // Anneau de 11 mm sous une pièce de 30 mm et 140 de haut : 11 + 20 de brim = 31.
    expect(carreOccupe({ largeurXY: 30, empreinte: 11, hauteur: 140 })).toBe(35)
    // Même anneau sous une pièce basse : pas de brim, la largeur suffit.
    expect(carreOccupe({ largeurXY: 30, empreinte: 11, hauteur: 30 })).toBe(34)
    // Socle de 96 mm : 100 mm, et non 120 — quatre tiennent sur un plateau de 232.
    expect(carreOccupe({ largeurXY: 96, empreinte: 96, hauteur: 49 })).toBe(100)
    const socles = Array.from({ length: 4 }, (_, i) => ({ id: String(i), cote: 100 }))
    expect(rangerPlateaux(socles, [232, 232]).plateaux).toHaveLength(1)
  })

  it('signale une pièce haute sur petite base', () => {
    expect(elancee({ hauteur: 140, empreinte: 11 })).toBe(true)
    expect(elancee({ hauteur: 90, empreinte: 81 })).toBe(false)
  })

  it('range des carrés sans chevauchement ni débordement', () => {
    const pieces = Array.from({ length: 30 }, (_, i) => ({ id: String(i), cote: 40 + (i % 5) * 15 }))
    const { plateaux } = rangerPlateaux(pieces, [232, 232])
    expect(plateaux.flatMap(p => p.pieces)).toHaveLength(30)
    for (const pl of plateaux) {
      for (const p of pl.pieces) {
        expect(p.x + p.cote).toBeLessThanOrEqual(232)
        expect(p.y + p.cote).toBeLessThanOrEqual(232)
      }
      for (const p of pl.pieces) for (const q of pl.pieces) {
        if (p === q) continue
        const disjoints = p.x + p.cote <= q.x || q.x + q.cote <= p.x || p.y + p.cote <= q.y || q.y + q.cote <= p.y
        expect(disjoints).toBe(true)
      }
    }
  })

  it('met neuf carrés de 77 sur un plateau de 232', () => {
    const pieces = Array.from({ length: 9 }, (_, i) => ({ id: String(i), cote: 77 }))
    expect(rangerPlateaux(pieces, [232, 232]).plateaux).toHaveLength(1)
    pieces.push({ id: 'x', cote: 77 })
    expect(rangerPlateaux(pieces, [232, 232]).plateaux).toHaveLength(2)
  })

  it('donne un plateau à part à une pièce trop grande', () => {
    const r = rangerPlateaux([{ id: 'a', cote: 300 }, { id: 'b', cote: 50 }], [232, 232])
    expect(r.tropGrandes).toEqual(['a'])
    expect(r.plateaux).toHaveLength(2)
  })

  it('répartit les plateaux sur plusieurs machines', () => {
    expect(dureeParallele([5, 4, 3, 2], 1)).toBe(14)
    expect(dureeParallele([5, 4, 3, 2], 2)).toBe(7)
  })
})

describe('prix', () => {
  it('arrondit au 0,05', () => {
    expect(arrondi05(18.19)).toBe(18.2)
    expect(arrondi05(21.925)).toBe(21.95)
    expect(arrondi05(14.72)).toBe(14.7)
  })

  it('applique la remise quantité', () => {
    expect(tauxRemise(49)).toBe(0)
    expect(tauxRemise(50)).toBe(0.05)
    expect(tauxRemise(200)).toBe(0.10)
  })

  it('retrouve le cas de test du job réel', () => {
    // 122 pièces pour 3 224 g : poids du slicer, temps estimé.
    const refs = [{ id: 'serie', nom: 'Série', quantite: 122, poidsReel: 3224 / 122, largeurXY: 60, empreinte: 30, hauteur: 80 }]
    const d = chiffrer(refs, JOB)
    proche(d.postes.matiere.montant, 80.60)
    proche(d.postes.machine.quantite, 88)
    proche(d.postes.machine.montant, 263.90)
    proche(d.postes.rates.montant, 10.35)
    expect(d.postes.manutention.montant).toBe(1220)
    expect(d.postes.plateaux.montant).toBe(35)
    expect(d.postes.projet.montant).toBe(420)
    proche(d.totalHT, 2029.85)
    expect(d.tva).toBe(arrondi05(d.totalHT * 0.081))
  })

  it('retrouve les prix unitaires des exemples', () => {
    // Les trois pièces dans le contexte du job : 122 pièces au total.
    const refs = [
      { id: 'e', nom: 'Extra 2', quantite: 1, poidsReel: 2 },
      { id: 'b', nom: 'Base4', quantite: 1, poidsReel: 46 },
      { id: 't', nom: 'Top 16', quantite: 1, poidsReel: 93 },
      { id: 'reste', nom: 'Reste', quantite: 119, poidsReel: 25 },
    ].map(r => ({ ...r, largeurXY: 50, empreinte: 30, hauteur: 60 }))
    const d = chiffrer(refs, JOB)
    const prix = Object.fromEntries(d.lignes.map(l => [l.id, l.prixUnitaire]))
    proche(prix.e, 14.75)
    expect(prix.b).toBe(18.2)
    expect(prix.t).toBe(21.95)
  })

  it('préfère le poids et le temps du slicer, et le dit', () => {
    const base = { id: 'a', nom: 'A', quantite: 1, V: 186.2, A: 218.2, largeurXY: 81, empreinte: 81, hauteur: 90 }
    const estime = chiffrer([base]).lignes[0]
    expect(estime.sourcePoids).toBe('estimé')
    const slicer = chiffrer([{ ...base, poidsReel: '50', tempsReel: '2,5' }]).lignes[0]
    expect(slicer.poids).toBe(50)
    expect(slicer.temps).toBe(2.5)
    expect(slicer.sourcePoids).toBe('slicer')
    expect(slicer.sourceTemps).toBe('slicer')
  })

  it('laisse hors du devis une référence décochée', () => {
    const refs = [
      { id: 'a', nom: 'A', quantite: 2, poidsReel: 10, largeurXY: 20, empreinte: 20, hauteur: 20 },
      { id: 'b', nom: 'B', quantite: 3, poidsReel: 10, largeurXY: 20, empreinte: 20, hauteur: 20, inclus: false },
    ]
    const d = chiffrer(refs)
    expect(d.nbPieces).toBe(2)
    expect(d.lignes[1].total).toBe(0)
    expect(d.sousTotal).toBe(d.lignes[0].total)
  })

  it('justifie l’écart entre postes et lignes arrondies', () => {
    const d = chiffrer([{ id: 'a', nom: 'A', quantite: 7, poidsReel: 13, largeurXY: 30, empreinte: 30, hauteur: 30 }], { heuresProjet: 1 })
    const postes = Object.values(d.postes).reduce((s, p) => s + p.montant, 0)
    expect(postes + d.arrondis).toBeCloseTo(d.sousTotal, 9)
  })

  it('produit un tableau tabulé collable', () => {
    const d = chiffrer([{ id: 'a', nom: 'Base4', quantite: 2, poidsReel: 46, largeurXY: 81, empreinte: 81, hauteur: 90 }])
    const t = tableauTexte(d).split('\n')
    expect(t[0].split('\t')).toHaveLength(6)
    expect(t[1].startsWith('Base4\t2\t46\t')).toBe(true)
    expect(t.at(-1).startsWith('Total TTC')).toBe(true)
  })
})

describe('temps saisi', () => {
  it('lit les temps comme le slicer les affiche', () => {
    expect(lireHeures('1h04')).toBeCloseTo(1 + 4 / 60, 9)
    expect(lireHeures('1 h 04')).toBeCloseTo(1 + 4 / 60, 9)
    expect(lireHeures('5:19')).toBeCloseTo(5 + 19 / 60, 9)
    expect(lireHeures('5h19m')).toBeCloseTo(5 + 19 / 60, 9)
    expect(lireHeures('2h')).toBe(2)
    expect(lireHeures('64 min')).toBeCloseTo(64 / 60, 9)
    expect(lireHeures('1,5')).toBe(1.5)
    expect(lireHeures('')).toBeNull()
    expect(lireHeures('demain')).toBeNull()
  })
})

describe('réglages partagés', () => {
  it('retombe sur les défauts pour une valeur absente ou aberrante', () => {
    const r = normaliserReglages({ kCal: -1, a: 'x', matieres: { PLA: { prixKg: 32, rates: 3 } } })
    expect(r.kCal).toBe(REGLAGES_DEFAUT.kCal)
    expect(r.a).toBe(REGLAGES_DEFAUT.a)
    expect(r.matieres.PLA.prixKg).toBe(32)
    expect(r.matieres.PLA.rates).toBe(MATIERES.PLA.rates)
    expect(normaliserReglages(null)).toEqual(REGLAGES_DEFAUT)
  })
})
