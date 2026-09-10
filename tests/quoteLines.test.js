import { describe, it, expect } from 'vitest'
import { lignesDevis, totauxDevis, normaliserDevis, copierItem, totalItem, deplacerLigne, libelleEscompte } from '../lib/quoteLines'
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

  // L'escompte n'était qu'un suffixe gris collé à la description, et la ligne
  // portait directement le montant NET : Prix × Qté ne retombait pas sur le
  // sous-total affiché, et le client lisait un écart inexpliqué là où on lui
  // faisait un geste. Il occupe désormais ses propres lignes.
  describe('escompte sur une position', () => {
    const q = { management: [{ item: 'Projet', description: 'Suivi', rate: 100, quantity: 2, discount: 10 }] }

    it('donne trois lignes : le plein, ce qu\'on retire, le net', () => {
      const l = lignes(lignesDevis(q, { fmtCHF: n => n.toFixed(2) }))
      expect(l.map(x => [x.role, x.total])).toEqual([
        ['prestation', 200],
        ['escompte', -20],
        ['net', 180],
      ])
    })

    it('le calcul de la première ligne se vérifie à l\'œil', () => {
      const [tete] = lignes(lignesDevis(q))
      expect(tete.price * 2).toBe(tete.total)
    })

    it('ne touche pas au total du devis', () => {
      expect(totauxDevis(q).total).toBe(180)
      expect(totauxDevis(q).gestion).toBe(180)
    })

    it('ne parasite plus la description', () => {
      expect(lignes(lignesDevis(q))[0].desc).toBe('Suivi')
    })

    it('sans escompte, une seule ligne comme avant', () => {
      const sans = { management: [{ item: 'Projet', rate: 100, quantity: 2 }] }
      expect(lignes(lignesDevis(sans)).map(x => x.role)).toEqual(['prestation'])
    })

    it('nomme le taux, le montant fixe, ou les deux', () => {
      const f = n => n.toFixed(2)
      expect(libelleEscompte({ discount: 20 }, f)).toBe('Escompte 20 %')
      expect(libelleEscompte({ discount_amount: 50 }, f)).toBe('Escompte 50.00 CHF')
      expect(libelleEscompte({ discount: 10, discount_amount: 50 }, f)).toBe('Escompte 10 % + 50.00 CHF')
      expect(libelleEscompte({}, f)).toBe('Escompte')
    })

    it('écrit la virgule décimale du taux à la suisse', () => {
      expect(libelleEscompte({ discount: 12.5 })).toBe('Escompte 12,5 %')
    })

    it('vaut pour toutes les sections, pas seulement la gestion', () => {
      const partout = {
        management:     [{ item: 'G', rate: 100, quantity: 1, discount: 10 }],
        subcontracting: [{ item: 'S', rate: 100, quantity: 1, discount: 10 }],
        logistics:      [{ trajet: 'L', rate: 100, quantity: 1, discount: 10 }],
        items: [{ name: 'I', labor: [{ description: 'a', rate: 100, quantity: 1, discount: 10 }] }],
      }
      const roles = lignes(lignesDevis(partout)).filter(x => x.role === 'escompte')
      expect(roles).toHaveLength(4)
      for (const r of roles) expect(r.total).toBe(-10)
    })

    // Un escompte de 100 % ramène la position à zéro : la ligne « net » doit
    // exister quand même, sans quoi on lit un plein tarif sans contrepartie.
    it('supporte un escompte de 100 %', () => {
      const gratuit = { management: [{ item: 'Visite', rate: 250, quantity: 1, discount: 100 }] }
      expect(lignes(lignesDevis(gratuit)).map(x => [x.role, x.total])).toEqual([
        ['prestation', 250], ['escompte', -250], ['net', 0],
      ])
    })

    it('borne à zéro : un escompte fixe supérieur au montant ne rend rien', () => {
      const trop = { management: [{ item: 'X', rate: 100, quantity: 1, discount_amount: 400 }] }
      const l = lignes(lignesDevis(trop))
      expect(l.find(x => x.role === 'net').total).toBe(0)
      expect(l.find(x => x.role === 'escompte').total).toBe(-100)
    })

    // La position et son escompte forment un bloc : le filet de séparation ne
    // doit pas passer au milieu.
    it('marque la tête de bloc pour que le filet soit reporté sous le net', () => {
      expect(lignes(lignesDevis(q))[0].escompte).toBe(true)
      const sans = { management: [{ item: 'Projet', rate: 100, quantity: 2 }] }
      expect(lignes(lignesDevis(sans))[0].escompte).toBeUndefined()
    })
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

  // Sur le PDF envoyé au client, la colonne Prix montrait le tarif plein et le
  // sous-total le montant remisé : 2 h × 120.— affichait 192.—, sans qu'aucun
  // chiffre n'explique l'écart. Le rabais consenti passait pour une erreur.
  it('imprime l\'escompte, et le calcul de la ligne se vérifie', () => {
    const remise = JSON.parse(JSON.stringify(project))
    remise.quote_data.management[0].discount = 20
    const html = buildDevisHtml(remise, {})
    expect(html).toContain('Escompte 20 %')
    expect(html).toContain('− 48,00')     // ce que le rabais retire
    expect(html).toContain('240,00')      // le plein, qui vaut bien 2 × 120
    expect(html).toContain('192,00')      // le net de la position
    expect(html).toContain("1'992,00 CHF") // sous-total du devis, remise déduite
  })

  it('n\'imprime rien de tel sans escompte', () => {
    expect(buildDevisHtml(project, {})).not.toContain('Escompte')
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

describe('deplacerLigne — l\'ordre de saisie est l\'ordre du document', () => {
  const l = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const ids = arr => arr.map(x => x.id)

  it('échange avec la voisine du dessus', () => {
    expect(ids(deplacerLigne(l(), 1, -1))).toEqual(['b', 'a', 'c'])
  })

  it('échange avec la voisine du dessous', () => {
    expect(ids(deplacerLigne(l(), 1, 1))).toEqual(['a', 'c', 'b'])
  })

  // Les boutons sont désactivés aux extrémités, mais la fonction ne doit pas
  // dépendre de l'interface pour rester correcte.
  it('ne fait rien aux bords de la liste', () => {
    expect(ids(deplacerLigne(l(), 0, -1))).toEqual(['a', 'b', 'c'])
    expect(ids(deplacerLigne(l(), 2, 1))).toEqual(['a', 'b', 'c'])
  })

  it('ne fait rien sur un index hors bornes', () => {
    expect(ids(deplacerLigne(l(), -1, 1))).toEqual(['a', 'b', 'c'])
    expect(ids(deplacerLigne(l(), 9, -1))).toEqual(['a', 'b', 'c'])
  })

  // Le vrai risque d'une réorganisation : perdre ou dupliquer une ligne.
  it('conserve exactement les mêmes lignes, sans perte ni doublon', () => {
    const avant = l()
    for (const [idx, sens] of [[0, 1], [1, 1], [2, -1], [0, -1], [2, 1], [-1, 1], [5, -1]]) {
      const apres = deplacerLigne(avant, idx, sens)
      expect(apres).toHaveLength(avant.length)
      expect(new Set(ids(apres))).toEqual(new Set(ids(avant)))
    }
  })

  it('ne modifie pas le tableau d\'origine', () => {
    const avant = l()
    deplacerLigne(avant, 0, 1)
    expect(ids(avant)).toEqual(['a', 'b', 'c'])
  })

  it('tolère une liste absente ou vide', () => {
    expect(deplacerLigne(undefined, 0, 1)).toBeUndefined()
    expect(deplacerLigne([], 0, 1)).toEqual([])
    expect(ids(deplacerLigne([{ id: 'a' }], 0, 1))).toEqual(['a'])
  })
})
