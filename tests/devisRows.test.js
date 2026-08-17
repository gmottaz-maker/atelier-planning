import { describe, it, expect } from 'vitest'
import { buildOfferRows, buildDevisHtml } from '../lib/devisHtml'

const sections = rows => rows.filter(r => r.kind === 'section')
const lines = rows => rows.filter(r => r.kind === 'line')
const total = rows => sections(rows).reduce((s, r) => s + r.total, 0)

describe('buildOfferRows', () => {
  it('ne produit aucune ligne pour un devis vide', () => {
    expect(buildOfferRows(null)).toEqual([])
    expect(buildOfferRows({})).toEqual([])
  })

  it('fusionne un item qui n\'a qu\'une seule ligne', () => {
    const rows = buildOfferRows({
      items: [{ name: 'Néon tournant', purchases: [{ description: 'Néon 100cm avec moteur', unit_price: 1800, quantity: 1, unit: 'pce' }], labor: [] }],
    })
    const l = lines(rows)
    expect(l).toHaveLength(1)
    expect(l[0].level).toBe(1)
    expect(l[0].title).toBe('Néon tournant')
    expect(l[0].desc).toBe('Néon 100cm avec moteur')
    expect(l[0].total).toBe(1800)
  })

  it('développe en sous-lignes un item qui en a plusieurs', () => {
    const rows = buildOfferRows({
      items: [{
        name: 'Décoration générale',
        purchases: [{ description: 'Panneaux', unit_price: 720, quantity: 1 }],
        labor: [{ description: 'Pose', rate: 100, quantity: 2 }],
      }],
    })
    const l = lines(rows)
    expect(l.map(r => r.level)).toEqual([1, 2, 2])
    expect(l[0].title).toBe('Décoration générale')
    expect(l[0].price).toBeNull()   // le titre d'item ne porte pas de prix unitaire
    expect(l[0].total).toBe(920)
    expect(l[1].title).toBe('Panneaux')
    expect(l[2].total).toBe(200)
  })

  it('applique la marge aux achats et à la sous-traitance, jamais à la main d\'œuvre', () => {
    const rows = buildOfferRows({
      general_margin: 20,
      management: [{ item: 'Projet', rate: 100, quantity: 1 }],
      items: [{ name: 'A', purchases: [{ description: 'Bois', unit_price: 100, quantity: 1 }], labor: [] }],
      subcontracting: [{ item: 'Impression', rate: 200, quantity: 1 }],
    })
    const s = sections(rows)
    expect(s.map(r => r.label)).toEqual(['Gestion projet', 'Fabrication', 'Sous-traitance'])
    expect(s[0].total).toBe(100)   // main d'œuvre : pas de marge
    expect(s[1].total).toBe(120)
    expect(s[2].total).toBe(240)
  })

  it('n\'applique jamais la marge générale à la logistique', () => {
    const rows = buildOfferRows({
      general_margin: 50,
      logistics: [
        { trajet: 'Aller', rate: 50, quantity: 1 },
        { trajet: 'Retour', rate: 50, quantity: 1, margin: 10 },
      ],
    })
    expect(sections(rows)[0].total).toBe(105)   // 50 + 55, jamais 150
  })

  it('déduit l\'escompte de ligne et le signale dans la description', () => {
    const rows = buildOfferRows({
      management: [{ item: 'Projet', description: 'Suivi', rate: 100, quantity: 2, discount: 10 }],
    })
    expect(lines(rows)[0].total).toBe(180)
    expect(lines(rows)[0].desc).toContain('escompte')
  })

  it('réunit quantité et unité dans une seule colonne', () => {
    const rows = buildOfferRows({ management: [{ item: 'Projet', rate: 120, quantity: 2.5, unit: 'heure(s)' }] })
    expect(lines(rows)[0].qty).toBe('2,5 heure(s)')
  })
})

describe('buildDevisHtml', () => {
  const project = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0a2f',
    name: 'Folklor', client: 'Red Bull AG',
    quote_data: {
      management: [{ item: 'Projet', rate: 120, quantity: 2, unit: 'heure(s)' }],
      items: [{ name: 'Néon', purchases: [{ description: 'Néon 100cm', unit_price: 1800, quantity: 1 }], labor: [] }],
    },
  }

  it('ajoute la TVA à 8,1 % par défaut et affiche le total TTC', () => {
    const html = buildDevisHtml(project, {})
    expect(html).toContain('TVA (8,1 %)')
    expect(html).toContain("2'040,00 CHF")   // sous-total HT
    expect(html).toContain("2'205,24 CHF")   // TTC
  })

  it('respecte un taux de TVA explicite', () => {
    const html = buildDevisHtml({ ...project, quote_data: { ...project.quote_data, vat_rate: 0 } }, {})
    expect(html).toContain('TVA (0 %)')
  })

  it('reprend le numéro saisi sur l\'offre, sinon le repli année-mois-id', () => {
    expect(buildDevisHtml({ ...project, quote_data: { ...project.quote_data, number: '2026-042' } }, {})).toContain('2026-042')
    expect(buildDevisHtml(project, {})).toContain('0A2F')
  })

  it('en mode résumé, ne garde que les sections', () => {
    const html = buildDevisHtml(project, {}, 'summary')
    expect(html).toContain('Gestion projet')   // capitalisé par CSS à l'affichage
    expect(html).not.toContain('Néon 100cm')
  })
})
