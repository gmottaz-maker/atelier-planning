import { describe, it, expect } from 'vitest'
import { heuresParActivite } from '../lib/rentabilite'

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
