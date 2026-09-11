import { describe, it, expect } from 'vitest'
import { prevuDevis, reelProjet, comparaison, validerCout, montant } from '../lib/rentabilite'

const devis = {
  general_margin: 30,
  management: [{ item: 'Projet', rate: 120, quantity: 3, unit: 'heure(s)' }],
  items: [{
    name: 'Canapé',
    purchases: [{ description: 'CP 18mm', unit_price: 100, quantity: 2, margin: 50, discount: 10 }],
    labor: [{ description: 'Assemblage', rate: 100, quantity: 5, unit: 'heure(s)' }],
    elements: [{
      name: 'Coussins',
      purchases: [{ description: 'Mousse', unit_price: 40, quantity: 3, hidden: true }],
      labor: [{ description: 'Couture', rate: 100, quantity: 1, unit: 'jour(s)' }],
    }],
  }],
  subcontracting: [{ item: 'Laquage', rate: 300, quantity: 1, margin: 20 }],
  logistics: [
    { trajet: 'Aller', rate: 3, quantity: 58, unit: 'km' },
    { trajet: 'Montage', rate: 100, quantity: 6, unit: 'heure(s)' },
    { trajet: 'Forfait', rate: 150, quantity: 1, unit: 'pce' },
  ],
}

describe('prevuDevis — au prix de revient', () => {
  const p = prevuDevis(devis)

  it('compte les matériaux au prix d\'achat, sans marge ni escompte', () => {
    expect(p.materiel).toBe(320)   // 100×2 + 40×3
  })
  it('compte les lignes masquées : le masquage n\'est qu\'un filtre d\'affichage', () => {
    expect(prevuDevis({ items: [{ name: 'X', purchases: [{ unit_price: 50, quantity: 1, hidden: true }] }] }).materiel).toBe(50)
  })
  it('compte la sous-traitance à son coût, sans marge', () => {
    expect(p.sous_traitance).toBe(300)
  })
  it('additionne les heures de gestion, de fabrication et de montage', () => {
    expect(p.heures).toBe(14)      // 3 + 5 + 6
  })
  // Une journée ne vaut pas le même nombre d'heures pour tout le monde :
  // deviner fausserait l'écart sans prévenir.
  it('ne convertit pas les jours, mais les signale', () => {
    expect(p.lignesNonConverties).toBe(1)
  })
  it('ignore les kilomètres et les forfaits de la logistique', () => {
    const seul = prevuDevis({ logistics: devis.logistics.filter(l => l.unit !== 'heure(s)') })
    expect(seul).toMatchObject({ heures: 0, lignesNonConverties: 0 })
  })
  it('signale une ligne de main-d\'œuvre sans unité', () => {
    expect(prevuDevis({ management: [{ rate: 120, quantity: 2 }] }).lignesNonConverties).toBe(1)
  })
  it('supporte une offre vide', () => {
    expect(prevuDevis(null)).toEqual({ materiel: 0, sous_traitance: 0, autre: 0, heures: 0, lignesNonConverties: 0 })
  })
})

describe('reelProjet', () => {
  it('additionne les coûts par catégorie, avoirs compris', () => {
    const r = reelProjet([
      { categorie: 'materiel', montant_ht: 250.5 },
      { categorie: 'materiel', montant_ht: '120.00' },
      { categorie: 'materiel', montant_ht: -20 },
      { categorie: 'sous_traitance', montant_ht: 310 },
      { categorie: 'inconnue', montant_ht: 999 },
    ], [{ minutes: 120 }, { minutes: 90 }])
    expect(r).toEqual({ materiel: 350.5, sous_traitance: 310, autre: 0, heures: 3.5 })
  })
})

describe('comparaison', () => {
  const lignes = comparaison({ materiel: 320, sous_traitance: 300, autre: 0, heures: 14 },
                             { materiel: 350.5, sous_traitance: 280, autre: 45, heures: 17.5 })
  it('dit de combien on a dépassé, en valeur et en pourcentage', () => {
    expect(lignes.find(l => l.cle === 'materiel')).toMatchObject({ ecart: 30.5, pct: 10 })
    expect(lignes.find(l => l.cle === 'sous_traitance')).toMatchObject({ ecart: -20, pct: -7 })
    expect(lignes.find(l => l.cle === 'heures')).toMatchObject({ ecart: 3.5, pct: 25, unite: 'h' })
  })
  it('ne calcule pas de pourcentage d\'un zéro', () => {
    expect(lignes.find(l => l.cle === 'autre')).toMatchObject({ prevu: 0, reel: 45, pct: null })
  })
})

describe('validerCout', () => {
  it('accepte un montant recopié d\'une facture suisse', () => {
    expect(montant("1'234.50")).toBe(1234.5)
    expect(montant('1234,50')).toBe(1234.5)
    const v = validerCout({ categorie: 'materiel', libelle: ' Panneaux ', fournisseur: ' Hornbach ', montant_ht: "1'234.50", date: '2026-09-10' })
    expect(v).toEqual({ ok: true, valeur: { categorie: 'materiel', libelle: 'Panneaux', fournisseur: 'Hornbach', montant_ht: 1234.5, date: '2026-09-10' } })
  })
  it('accepte un avoir négatif', () => {
    expect(validerCout({ categorie: 'materiel', libelle: 'Avoir', montant_ht: '-50' }).valeur.montant_ht).toBe(-50)
  })
  it('refuse un montant vide, nul ou illisible', () => {
    for (const m of ['', '0', 'abc', null]) {
      expect(validerCout({ categorie: 'materiel', libelle: 'x', montant_ht: m }).ok, String(m)).toBe(false)
    }
  })
  it('refuse une catégorie inconnue, un libellé vide, une date invalide', () => {
    expect(validerCout({ categorie: 'repas', libelle: 'x', montant_ht: 10 }).ok).toBe(false)
    expect(validerCout({ categorie: 'materiel', libelle: '  ', montant_ht: 10 }).ok).toBe(false)
    expect(validerCout({ categorie: 'materiel', libelle: 'x', montant_ht: 10, date: '2026-02-30' }).ok).toBe(false)
  })
  it('ne laisse passer aucun champ inattendu', () => {
    const v = validerCout({ categorie: 'autre', libelle: 'x', montant_ht: 10, project_id: 'autre', created_by: 'Pirate', id: 3 })
    expect(Object.keys(v.valeur).sort()).toEqual(['categorie', 'date', 'fournisseur', 'libelle', 'montant_ht'])
  })
})
