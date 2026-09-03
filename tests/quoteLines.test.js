import { describe, it, expect } from 'vitest'
import { lignesDevis, totauxDevis, normaliserDevis, copierItem, totalItem } from '../lib/quoteLines'
import { computeQuoteTotal } from '../lib/quoteTotals'
import { buildDevisHtml } from '../lib/devisHtml'

const sections = l => l.filter(x => x.kind === 'section')
const lignes   = l => l.filter(x => x.kind === 'line')
const roles    = l => lignes(l).map(x => `${x.level}:${x.role}:${x.title}`)

describe('normalisation', () => {
  it('accepte un devis vide', () => {
    expect(lignesDevis(null)).toEqual([])
    expect(totauxDevis(null).total).toBe(0)
  })

  it('replie l\'ancien format plat sur un item unique', () => {
    const q = { purchases: [{ description: 'Bois', unit_price: 100, quantity: 2 }] }
    expect(normaliserDevis(q).items).toHaveLength(1)
    expect(totauxDevis(q).total).toBe(200)
  })

  it('donne des éléments vides aux items qui n\'en ont pas', () => {
    expect(normaliserDevis({ items: [{ name: 'A' }] }).items[0].elements).toEqual([])
  })
})

describe('trois niveaux', () => {
  const devis = {
    items: [{
      name: 'Cabane',
      purchases: [{ description: 'Vis', unit_price: 10, quantity: 1 }],
      labor: [{ description: 'Montage', rate: 100, quantity: 2 }],
      elements: [{
        name: 'Toiture',
        purchases: [
          { description: 'Panneau', unit_price: 500, quantity: 2 },
          { description: 'Étanchéité', unit_price: 300, quantity: 1 },
        ],
        labor: [{ description: 'Pose', rate: 100, quantity: 3 }],
      }],
    }],
  }

  it('empile item → composition directe → élément → sa composition', () => {
    expect(roles(lignesDevis(devis))).toEqual([
      '1:item:Cabane',
      '2:composition:Vis',
      '2:composition:Montage',
      '2:element:Toiture',
      '3:composition:Panneau',
      '3:composition:Étanchéité',
      '3:composition:Pose',
    ])
  })

  it('fait remonter les montants : élément, puis item', () => {
    const l = lignesDevis(devis)
    const item = lignes(l).find(x => x.role === 'item')
    const el = lignes(l).find(x => x.role === 'element')
    expect(el.total).toBe(1600)      // 1000 + 300 + 300
    expect(item.total).toBe(1810)    // 1600 + 10 + 200
    expect(totauxDevis(devis).total).toBe(1810)
  })

  it('ne donne pas de prix unitaire à un item ni à un élément', () => {
    for (const r of lignes(lignesDevis(devis))) {
      if (r.role === 'item' || r.role === 'element') expect(r.price).toBeNull()
    }
  })

  it('fusionne un item sans élément et à ligne unique', () => {
    const q = { items: [{ name: 'Néon', purchases: [{ description: 'Néon 100cm', unit_price: 1800, quantity: 1 }] }] }
    const l = lignes(lignesDevis(q))
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ level: 1, role: 'item', title: 'Néon', total: 1800 })
  })
})

describe('masquage', () => {
  const devis = {
    items: [{
      name: 'Cabane',
      purchases: [
        { description: 'Panneau', unit_price: 1000, quantity: 1 },
        { description: 'Ossature', unit_price: 500, quantity: 1, hidden: true },
      ],
      labor: [{ description: 'Montage', rate: 100, quantity: 5, hidden: true }],
    }],
    logistics: [{ trajet: 'Transport', rate: 200, quantity: 1 }],
  }

  it('retire la ligne du document', () => {
    expect(roles(lignesDevis(devis)))
      .toEqual(['1:item:Cabane', '2:composition:Panneau', '1:prestation:Transport'])
  })

  it('NE CHANGE AUCUN TOTAL — c\'est un filtre, pas une suppression', () => {
    const visible = JSON.parse(JSON.stringify(devis))
    for (const r of visible.items[0].purchases) delete r.hidden
    for (const r of visible.items[0].labor) delete r.hidden
    expect(totauxDevis(devis).total).toBe(totauxDevis(visible).total)
    expect(lignesDevis(devis).find(x => x.role === 'item').total).toBe(2000)
    expect(sections(lignesDevis(devis))[0].total).toBe(2000)
  })

  it('laisse un item entièrement masqué afficher son titre et son montant', () => {
    const q = { items: [{ name: 'Cabane', purchases: [
      { description: 'A', unit_price: 100, quantity: 1, hidden: true },
      { description: 'B', unit_price: 200, quantity: 1, hidden: true },
    ] }] }
    const l = lignes(lignesDevis(q))
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ role: 'item', title: 'Cabane', total: 300 })
  })

  it('masque un élément et toute sa composition d\'un coup', () => {
    const q = { items: [{ name: 'X', elements: [
      { name: 'Visible', purchases: [{ description: 'a', unit_price: 10, quantity: 1 }] },
      { name: 'Caché', hidden: true, purchases: [{ description: 'b', unit_price: 90, quantity: 1 }] },
    ] }] }
    expect(roles(lignesDevis(q))).toEqual(['1:item:X', '2:element:Visible', '3:composition:a'])
    expect(totauxDevis(q).total).toBe(100)   // le caché compte toujours
  })

  it('masque aussi une prestation de gestion, sous-traitance ou logistique', () => {
    const q = {
      management: [{ item: 'Projet', rate: 100, quantity: 1, hidden: true }],
      subcontracting: [{ item: 'Impression', rate: 200, quantity: 1 }],
      logistics: [{ trajet: 'Aller', rate: 50, quantity: 1, hidden: true }],
    }
    expect(roles(lignesDevis(q))).toEqual(['1:prestation:Impression'])
    expect(totauxDevis(q).total).toBe(350)
    // les sections restent, avec leur sous-total complet
    expect(sections(lignesDevis(q)).map(s => [s.label, s.total]))
      .toEqual([['Gestion projet', 100], ['Sous-traitance', 200], ['Logistique', 50]])
  })

  it('ne masque que sur `hidden === true`', () => {
    const q = { items: [{ name: 'X', purchases: [
      { description: 'a', unit_price: 10, quantity: 1, hidden: false },
      { description: 'b', unit_price: 10, quantity: 1, hidden: 'oui' },
    ] }] }
    expect(lignes(lignesDevis(q))).toHaveLength(3)   // item + 2 lignes visibles
  })
})

describe('barème', () => {
  it('applique la marge aux achats et à la sous-traitance, jamais à la main d\'œuvre', () => {
    const q = {
      general_margin: 20,
      management: [{ item: 'Projet', rate: 100, quantity: 1 }],
      items: [{ name: 'A', purchases: [{ description: 'Bois', unit_price: 100, quantity: 1 }] }],
      subcontracting: [{ item: 'Impression', rate: 200, quantity: 1 }],
    }
    const t = totauxDevis(q)
    expect(t.gestion).toBe(100)
    expect(t.fabrication).toBe(120)
    expect(t.soustraitance).toBe(240)
  })

  it('n\'applique jamais la marge générale à la logistique', () => {
    const q = { general_margin: 50, logistics: [
      { trajet: 'Aller', rate: 50, quantity: 1 },
      { trajet: 'Retour', rate: 50, quantity: 1, margin: 10 },
    ] }
    expect(totauxDevis(q).logistique).toBe(105)
  })

  it('déduit l\'escompte et le signale dans la description', () => {
    const q = { management: [{ item: 'Projet', description: 'Suivi', rate: 100, quantity: 2, discount: 10 }] }
    const l = lignes(lignesDevis(q))[0]
    expect(l.total).toBe(180)
    expect(l.desc).toContain('escompte')
  })

  it('reste la seule source du barème — computeQuoteTotal en dépend', () => {
    const q = { items: [{ name: 'A', elements: [{ name: 'E', purchases: [{ description: 'x', unit_price: 700, quantity: 1 }] }] }] }
    expect(computeQuoteTotal(q)).toBe(totauxDevis(q).total)
    expect(computeQuoteTotal(q)).toBe(700)
  })

  it('réunit quantité et unité dans une seule colonne', () => {
    const q = { management: [{ item: 'Projet', rate: 120, quantity: 2.5, unit: 'heure(s)' }] }
    expect(lignes(lignesDevis(q))[0].qty).toBe('2,5 heure(s)')
  })
})

describe('document', () => {
  const project = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0a2f',
    name: 'Folklor', client: 'Red Bull AG',
    quote_data: {
      management: [{ item: 'Projet', rate: 120, quantity: 2, unit: 'heure(s)' }],
      items: [{ name: 'Néon', purchases: [{ description: 'Néon 100cm', unit_price: 1800, quantity: 1 }] }],
    },
  }

  it('ajoute la TVA à 8,1 % et affiche le total TTC', () => {
    const html = buildDevisHtml(project, {})
    expect(html).toContain('TVA (8,1 %)')
    expect(html).toContain("2'040,00 CHF")
    expect(html).toContain("2'205,24 CHF")
  })

  it('n\'imprime pas les lignes masquées', () => {
    const masque = JSON.parse(JSON.stringify(project))
    masque.quote_data.management[0].hidden = true
    const html = buildDevisHtml(masque, {})
    expect(html).not.toContain('Projet')
    expect(html).toContain("2'040,00 CHF")   // le total ne bouge pas
  })

  it('reprend le numéro saisi, sinon le repli année-mois-id', () => {
    expect(buildDevisHtml({ ...project, quote_data: { ...project.quote_data, number: '2026-042' } }, {})).toContain('2026-042')
    expect(buildDevisHtml(project, {})).toContain('0A2F')
  })
})

describe('copierItem — duplication d\'un item de Fabrication', () => {
  const original = () => ({
    _uid: 'i_source',
    name: 'Bar',
    purchases: [
      { _uid: 'r_a', description: 'Panneau 3 plis', unit_price: '80', quantity: '4', margin: '15' },
      { _uid: 'r_b', description: 'Visserie', unit_price: '12', quantity: '1', hidden: true },
    ],
    labor: [{ _uid: 'r_c', description: 'Découpe', rate: '100', quantity: '6' }],
    elements: [{
      _uid: 'i_el',
      name: 'Toiture',
      purchases: [{ _uid: 'r_d', description: 'Bâche', unit_price: '200', quantity: '1', hidden: true }],
      labor: [{ _uid: 'r_e', description: 'Pose', rate: '100', quantity: '2' }],
    }],
  })

  // Tous les _uid d'une structure, à tous les niveaux.
  const tousLesUid = (it) => [
    it._uid,
    ...(it.purchases || []).map(r => r._uid),
    ...(it.labor || []).map(r => r._uid),
    ...(it.elements || []).flatMap(el => [
      el._uid,
      ...(el.purchases || []).map(r => r._uid),
      ...(el.labor || []).map(r => r._uid),
    ]),
  ]

  it('ne réutilise AUCUN identifiant de la source', () => {
    const src = original()
    const copie = copierItem(src)
    const avant = new Set(tousLesUid(src))
    for (const uid of tousLesUid(copie)) {
      expect(avant.has(uid)).toBe(false)
    }
  })

  it('les identifiants de la copie sont tous distincts entre eux', () => {
    const uids = tousLesUid(copierItem(original()))
    expect(new Set(uids).size).toBe(uids.length)
  })

  it('ne modifie pas la source', () => {
    const src = original()
    const gele = JSON.stringify(src)
    copierItem(src)
    expect(JSON.stringify(src)).toBe(gele)
  })

  it('conserve les montants, les marges et le masquage', () => {
    const copie = copierItem(original())
    expect(copie.purchases.map(r => [r.description, r.unit_price, r.quantity, r.margin]))
      .toEqual([['Panneau 3 plis', '80', '4', '15'], ['Visserie', '12', '1', undefined]])
    expect(copie.purchases[1].hidden).toBe(true)
    expect(copie.elements[0].purchases[0].hidden).toBe(true)
    expect(copie.elements[0].name).toBe('Toiture')
  })

  // Le total est le vrai contrôle : une copie qui ne chiffre pas pareil n'est
  // pas une copie.
  it('chiffre exactement comme la source', () => {
    const src = original()
    expect(totalItem(copierItem(src), '20')).toBe(totalItem(src, '20'))
  })

  it('suffixe le nom, sauf quand il n\'y en a pas', () => {
    expect(copierItem(original()).name).toBe('Bar (copie)')
    expect(copierItem({ name: '' }).name).toBe('')
    expect(copierItem({}).name).toBe('')
  })

  it('supporte un item sans élément ni composition', () => {
    const copie = copierItem({ _uid: 'i_x', name: 'Vide' })
    expect(copie.purchases).toEqual([])
    expect(copie.labor).toEqual([])
    expect(copie.elements).toEqual([])
    expect(copie._uid).not.toBe('i_x')
  })
})
