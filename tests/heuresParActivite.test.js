import { describe, it, expect } from 'vitest'
import { heuresParActivite, lignesSansActivite, lignesMainOeuvre } from '../lib/rentabilite'

const ACTIVITES = [
  { code: 10, libelle: 'Gestion de projet', famille: 'gestion', facturee_heure: true },
  { code: 23, libelle: 'Assemblage', famille: 'atelier', facturee_heure: true },
  { code: 31, libelle: 'Peinture / vernis / sticker', famille: 'finitions', facturee_heure: true },
  { code: 40, libelle: 'Montage sur place', famille: 'chantier', facturee_heure: true },
  { code: 51, libelle: 'Conduite', famille: 'logistique', facturee_heure: false },
]
const h = (activite, heures) => ({ activite, minutes: heures * 60 })

describe('heuresParActivite — offert contre passé, métier par métier', () => {
  const devis = {
    management: [{ rate: 140, quantity: 4, unit: 'heure(s)', activite: 10 }],
    items: [{
      name: 'Comptoir',
      labor: [
        { rate: 120, quantity: 12, unit: 'heure(s)', activite: 31 },
        { rate: 120, quantity: 8, unit: 'heure(s)', activite: 23 },
      ],
      elements: [{ name: 'Base', labor: [{ rate: 120, quantity: 2, unit: 'heure(s)', activite: 23 }] }],
    }],
    logistics: [
      { trajet: 'Montage', rate: 120, quantity: 6, unit: 'heure(s)', activite: 40 },
      { trajet: 'Aller', rate: 3, quantity: 58, unit: 'km' },
    ],
  }

  it('additionne les heures offertes par code, éléments compris', () => {
    const { lignes } = heuresParActivite(devis, [], ACTIVITES)
    const par = Object.fromEntries(lignes.map(l => [l.code, l.prevu]))
    expect(par).toEqual({ 10: 4, 23: 10, 31: 12, 40: 6 })
  })

  it('met le réel en face, et dit où ça dérape', () => {
    const { lignes } = heuresParActivite(devis, [h(31, 19), h(23, 7)], ACTIVITES)
    const peinture = lignes.find(l => l.code === 31)
    expect(peinture).toMatchObject({ prevu: 12, reel: 19, ecart: 7, pct: 58, libelle: 'Peinture / vernis / sticker' })
    const assemblage = lignes.find(l => l.code === 23)
    expect(assemblage.ecart).toBe(-3)
  })

  it('le total ne dit rien quand deux métiers se compensent — le détail, si', () => {
    const { lignes } = heuresParActivite(
      { items: [{ labor: [
        { quantity: 10, unit: 'heure(s)', activite: 31 },
        { quantity: 10, unit: 'heure(s)', activite: 23 },
      ] }] },
      [h(31, 15), h(23, 5)], ACTIVITES)
    expect(lignes.reduce((s, l) => s + l.ecart, 0)).toBe(0)
    expect(lignes.find(l => l.code === 31).ecart).toBe(5)
  })

  it('une ligne sans code n\'invente pas son activité', () => {
    const r = heuresParActivite({ items: [{ labor: [{ quantity: 5, unit: 'heure(s)', description: 'main-d\'oeuvre' }] }] }, [], ACTIVITES)
    expect(r.lignes).toEqual([])
    expect(r.prevuSansCode).toBe(5)
  })

  it('les jours et les kilomètres ne se convertissent pas en heures', () => {
    const r = heuresParActivite({
      items: [{ labor: [{ quantity: 2, unit: 'jour(s)', activite: 23 }] }],
      logistics: [{ quantity: 58, unit: 'km', activite: 51 }],
    }, [], ACTIVITES)
    expect(r.lignes).toEqual([])
    expect(r.prevuSansCode).toBe(0)
  })

  it('la conduite, même imputée, ne se met pas en face des heures offertes', () => {
    const { lignes } = heuresParActivite({}, [h(51, 3), h(40, 5)], ACTIVITES)
    expect(lignes.map(l => l.code)).toEqual([40])
  })

  it('une activité passée mais jamais offerte ressort, avec rien en face', () => {
    const { lignes } = heuresParActivite({}, [h(40, 5)], ACTIVITES)
    expect(lignes[0]).toMatchObject({ code: 40, prevu: 0, reel: 5, pct: null })
  })

  it('la compensation de consulting compte comme ses heures de code 14', () => {
    const { lignes } = heuresParActivite({
      management: [{ quantity: 1.5, unit: 'heure(s)', activite: 14, compensation: true, hidden: true }],
    }, [], [...ACTIVITES, { code: 14, libelle: 'Consulting', facturee_heure: true }])
    expect(lignes[0]).toMatchObject({ code: 14, prevu: 1.5 })
  })

  it('range par code, donc par famille', () => {
    const { lignes } = heuresParActivite(devis, [], ACTIVITES)
    expect(lignes.map(l => l.code)).toEqual([10, 23, 31, 40])
  })
})

describe('lignesSansActivite — la liste de ce qu\'il reste à coder', () => {
  const devis = {
    management: [{ item: 'Suivi', rate: 140, quantity: 4, unit: 'heure(s)' }],          // sans code
    items: [{
      name: 'Bar',
      labor: [
        { description: 'Peinture', rate: 120, quantity: 12, unit: 'heure(s)', activite: 31 },
        { description: 'Ponçage', rate: 120, quantity: 3, unit: 'heure(s)' },           // sans code
      ],
      elements: [{ name: 'Socle', labor: [{ description: 'Soudure', rate: 120, quantity: 2, unit: 'h' }] }],  // sans code
    }],
    logistics: [
      { trajet: 'Aller', rate: 3, quantity: 58, unit: 'km' },                           // pas des heures
      { trajet: 'Montage', rate: 120, quantity: 6, unit: 'heure(s)', activite: 40 },
    ],
  }

  it('ne retient QUE les lignes en heures sans code', () => {
    const manquantes = lignesSansActivite(devis)
    expect(manquantes.map(m => m.description)).toEqual(['Suivi', 'Ponçage', 'Soudure'])
    // Le kilométrage n'a pas d'activité et n'en a pas besoin : il ne se
    // compare à aucune ligne de feuille d'heures.
    expect(manquantes.some(m => m.description === 'Aller')).toBe(false)
  })

  it('dit d\'où vient chaque ligne, pour la retrouver dans un devis long', () => {
    expect(lignesSansActivite(devis).map(m => m.ou)).toEqual(['Gestion projet', 'Bar', 'Bar › Socle'])
  })

  it('signale EXACTEMENT les heures que la jauge ne sait pas ventiler', () => {
    // La propriété qui compte : l'éditeur et le calcul parcourent la même
    // liste. S'ils divergeaient, l'offre dirait « tout est ventilé » pendant
    // que la jauge compterait des heures orphelines.
    const { prevuSansCode } = heuresParActivite(devis, [], ACTIVITES)
    const total = lignesSansActivite(devis).reduce((s, m) => s + m.heures, 0)
    expect(total).toBe(prevuSansCode)
    expect(total).toBe(9)
  })

  it('ne signale rien quand tout est codé', () => {
    const propre = { management: [{ item: 'Suivi', quantity: 4, unit: 'heure(s)', activite: 10 }] }
    expect(lignesSansActivite(propre)).toEqual([])
    expect(heuresParActivite(propre, [], ACTIVITES).prevuSansCode).toBe(0)
  })

  it('parcourt la gestion, la logistique, les items et leurs éléments', () => {
    expect(lignesMainOeuvre(devis)).toHaveLength(6)
  })

  it('supporte un devis vide ou absent', () => {
    expect(lignesSansActivite(null)).toEqual([])
    expect(lignesSansActivite({})).toEqual([])
  })
})
