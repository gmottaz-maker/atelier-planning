import { describe, it, expect } from 'vitest'
import { chiffrer, prixMelange, rendement, dilution, coutParM2, fmtDuree,
         normaliserComplexites, COMPLEXITES_DEFAUT } from '../lib/paintCalc'
import { PEINTURES, chercherPrix } from '../lib/paintPrices'

const atapur = chercherPrix('126040000-056')     // 2K solvant, ratio 10:1
const magistrator = chercherPrix('180150014-580') // 1K eau, diluant gratuit
const rucopur = chercherPrix('186630014-550')     // rendement en m²/L, prix diluant inconnu
const sansPrix = chercherPrix('126330000-052')    // facturé à 100 % de rabais

describe('catalogue de prix', () => {
  it('retrouve un produit par son SKU', () => {
    expect(atapur?.nom).toContain('ATAPUR 2000')
    expect(chercherPrix('inexistant')).toBeNull()
    expect(chercherPrix(null)).toBeNull()
  })

  it('retrouve un produit dont la référence porte deux SKU', () => {
    // « 126040/126020-052 » : même produit, deux brillances
    expect(chercherPrix('126040')?.nom).toContain('ATAPUR 2000')
  })

  it('garde un prix inconnu à null, jamais à zéro', () => {
    // Ce produit a été facturé avec 100 % de rabais : son prix catalogue
    // reste inconnu, il ne vaut pas 0 CHF.
    expect(sansPrix.prixA).toBeNull()
    expect(PEINTURES.every(p => p.prixA === null || p.prixA > 0)).toBe(true)
  })
})

describe('prix du mélange', () => {
  it('pondère A et B par leur ratio pour un 2K', () => {
    // (42.48 × 10 + 52.17 × 1) / 11
    expect(prixMelange(atapur)).toBeCloseTo(43.361, 2)
  })

  it('vaut le prix du produit pour un 1K', () => {
    expect(prixMelange(magistrator)).toBe(20.69)
  })

  it('refuse de chiffrer sans prix', () => {
    expect(prixMelange(sansPrix)).toBeNull()
    expect(prixMelange({ prixA: 10, ratioA: 3, ratioB: 1, prixDurcisseur: null })).toBeNull()
  })

  it('ne se contente jamais du composant A seul sur un 2K', () => {
    // Le durcisseur coûte ici plus cher que la peinture : l'ignorer sous-évalue.
    expect(prixMelange(atapur)).toBeGreaterThan(atapur.prixA)
  })
})

describe('rendement et dilution', () => {
  it('choisit selon le mode', () => {
    expect(rendement(atapur, 'min')).toBe(7)
    expect(rendement(atapur, 'max')).toBe(9)
    expect(rendement(atapur, 'moyen')).toBe(8)
  })

  it('renvoie null quand la fiche technique manque', () => {
    expect(rendement({ rendMin: null, rendMax: null })).toBeNull()
    expect(dilution({ dilRetenue: null }, 'retenue')).toBeNull()
  })

  it('donne les trois valeurs de dilution de la fiche', () => {
    expect(dilution(atapur, 'min')).toBe(0.30)
    expect(dilution(atapur, 'retenue')).toBe(0.50)
    expect(dilution(atapur, 'max')).toBe(0.70)
  })
})

describe('chiffrage', () => {
  const base = { produit: atapur, surface: 10, couches: 2, complexite: COMPLEXITES_DEFAUT.A0, pertes: 0 }

  it('enchaîne complexité, pertes, puis couches', () => {
    const r = chiffrer({ ...base, complexite: COMPLEXITES_DEFAUT.A2, pertes: 10 })
    expect(r.surfacePonderee).toBeCloseTo(10 * 1.20 * 1.10, 4)   // 13.2
    expect(r.surfaceTotale).toBeCloseTo(13.2 * 2, 4)             // 26.4
  })

  it('déduit le mélange du rendement', () => {
    const r = chiffrer(base)
    expect(r.surfaceTotale).toBe(20)
    expect(r.melange).toBeCloseTo(20 / 8, 4)                     // 2.5 kg
  })

  it('répartit A et B selon le ratio', () => {
    const r = chiffrer(base)
    expect(r.quantiteA).toBeCloseTo(2.5 * 10 / 11, 4)
    expect(r.quantiteB).toBeCloseTo(2.5 * 1 / 11, 4)
    expect(r.quantiteA + r.quantiteB).toBeCloseTo(r.melange, 6)
  })

  it('met tout en A pour un 1K, et B à zéro', () => {
    const r = chiffrer({ ...base, produit: magistrator })
    expect(r.quantiteB).toBe(0)
    expect(r.quantiteA).toBeCloseTo(r.melange, 6)
    expect(r.coutB).toBe(0)
  })

  it('chiffre le diluant, et le compte à zéro quand c’est de l’eau', () => {
    const r = chiffrer({ ...base, produit: magistrator })
    expect(r.quantiteDiluant).toBeGreaterThan(0)
    expect(r.coutDiluant).toBe(0)
    expect(r.avertissements).toEqual([])
  })

  it('avertit quand le prix du diluant est inconnu, sans bloquer le reste', () => {
    const r = chiffrer({ ...base, produit: rucopur })
    expect(r.coutDiluant).toBeNull()
    expect(r.coutMatiere).toBeGreaterThan(0)          // A et B restent chiffrés
    expect(r.avertissements.join(' ')).toMatch(/diluant/i)
  })

  it('passe par la densité quand le rendement est en m²/L', () => {
    const r = chiffrer({ ...base, produit: rucopur })
    const rend = rendement(rucopur, 'moyen')
    expect(r.melange).toBeCloseTo((20 / rend) * rucopur.densite, 4)
  })

  it('refuse de chiffrer la matière sans prix, et le dit', () => {
    const r = chiffrer({ ...base, produit: sansPrix })
    expect(r.coutMatiere).toBeNull()
    expect(r.total).toBeNull()
    expect(r.avertissements.join(' ')).toMatch(/prix/i)
  })

  it('rend le temps même quand la matière n’est pas chiffrable', () => {
    // Le temps ne dépend pas du produit : il reste utile.
    const r = chiffrer({ ...base, produit: sansPrix, tempsA0: 8, tauxHoraire: 100 })
    expect(r.tempsMin).toBeCloseTo(10 * 2 * 8 * 1, 4)   // 160 min
    expect(r.coutTemps).toBeCloseTo(160 / 60 * 100, 4)
  })

  it('applique la marge matière au coût, pas au temps', () => {
    const r = chiffrer({ ...base, margeMatiere: 20 })
    expect(r.coutMatiereMarge).toBeCloseTo(r.coutMatiere * 1.2, 6)
    expect(r.total).toBeCloseTo(r.coutMatiereMarge + r.coutTemps, 6)
  })

  it('fait varier le temps avec la complexité, pas avec la matière seule', () => {
    const a0 = chiffrer({ ...base, complexite: COMPLEXITES_DEFAUT.A0 })
    const a4 = chiffrer({ ...base, complexite: COMPLEXITES_DEFAUT.A4 })
    expect(a4.tempsMin / a0.tempsMin).toBeCloseTo(3, 6)      // coefficient temps
    expect(a4.melange / a0.melange).toBeCloseTo(1.6, 6)      // coefficient matière
  })

  it('ne casse pas sans produit ni surface', () => {
    const r = chiffrer({})
    expect(r.melange).toBeNull()
    expect(r.avertissements.length).toBeGreaterThan(0)
    expect(() => chiffrer()).not.toThrow()
  })

  it('donne un « prêt à gicler » = mélange + diluant', () => {
    const r = chiffrer(base)
    expect(r.masseAGicler).toBeCloseTo(r.melange + r.quantiteDiluant, 6)
  })
})

describe('coût au m²', () => {
  it('permet de comparer deux produits', () => {
    expect(coutParM2(atapur)).toBeCloseTo(prixMelange(atapur) / 8, 4)
    expect(coutParM2(sansPrix)).toBeNull()
  })

  it('tient compte de la densité pour un rendement en litres', () => {
    expect(coutParM2(rucopur)).toBeCloseTo(prixMelange(rucopur) / rendement(rucopur, 'moyen') * rucopur.densite, 4)
  })
})

describe('durées en heures', () => {
  it('garde les minutes en dessous d’une heure', () => {
    expect(fmtDuree(45)).toBe('45 min')
    expect(fmtDuree(59)).toBe('59 min')
  })

  it('passe en heures au-delà', () => {
    expect(fmtDuree(60)).toBe('1 h')
    expect(fmtDuree(160)).toBe('2 h 40')
    expect(fmtDuree(125)).toBe('2 h 05')      // deux chiffres, pas « 2 h 5 »
    expect(fmtDuree(480)).toBe('8 h')
  })

  it('arrondit à la minute', () => {
    expect(fmtDuree(59.6)).toBe('1 h')
    expect(fmtDuree(90.4)).toBe('1 h 30')
  })

  it('ne montre rien plutôt qu’un zéro trompeur', () => {
    expect(fmtDuree(0)).toBe('—')
    expect(fmtDuree(null)).toBe('—')
    expect(fmtDuree(-5)).toBe('—')
  })
})

describe('coefficients modifiables', () => {
  it('accepte un jeu complet', () => {
    const r = normaliserComplexites({ A0: { label: 'Plat', matiere: 1, temps: 1 } })
    expect(r.A0).toMatchObject({ label: 'Plat', matiere: 1, temps: 1 })
  })

  it('retombe sur les valeurs par défaut pour ce qui manque', () => {
    const r = normaliserComplexites({ A2: { matiere: 1.14 } })
    expect(r.A2.matiere).toBe(1.14)
    expect(r.A2.temps).toBe(COMPLEXITES_DEFAUT.A2.temps)
    expect(r.A2.label).toBe(COMPLEXITES_DEFAUT.A2.label)
    expect(r.A4).toEqual(COMPLEXITES_DEFAUT.A4)
  })

  it('refuse les valeurs aberrantes plutôt que de casser un chiffrage', () => {
    const r = normaliserComplexites({ A1: { matiere: 0, temps: -3 }, A3: { matiere: 999 } })
    expect(r.A1).toEqual(COMPLEXITES_DEFAUT.A1)
    expect(r.A3.matiere).toBe(COMPLEXITES_DEFAUT.A3.matiere)
  })

  it('survit à une valeur absente ou corrompue', () => {
    expect(normaliserComplexites(null)).toEqual(COMPLEXITES_DEFAUT)
    expect(normaliserComplexites('nimporte quoi')).toEqual(COMPLEXITES_DEFAUT)
    expect(Object.keys(normaliserComplexites({}))).toEqual(['A0', 'A1', 'A2', 'A3', 'A4'])
  })
})
