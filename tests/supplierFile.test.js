import { describe, it, expect } from 'vitest'
import { quarterOf, supplierInvoiceFilename, amountTag } from '../lib/supplierFile'

describe('quarterOf', () => {
  it('classe chaque mois dans le bon trimestre', () => {
    expect(quarterOf('2026-01-01')).toEqual({ year: 2026, quarter: 1 })
    expect(quarterOf('2026-03-31')).toEqual({ year: 2026, quarter: 1 })
    expect(quarterOf('2026-04-01')).toEqual({ year: 2026, quarter: 2 })
    expect(quarterOf('2026-06-30')).toEqual({ year: 2026, quarter: 2 })
    expect(quarterOf('2026-07-01')).toEqual({ year: 2026, quarter: 3 })
    expect(quarterOf('2026-10-01')).toEqual({ year: 2026, quarter: 4 })
    expect(quarterOf('2026-12-31')).toEqual({ year: 2026, quarter: 4 })
  })

  it('ne décale pas le 1er janvier sur T4 de l\'année précédente', () => {
    // `new Date('2026-01-01')` est du UTC : un serveur en UTC-x basculerait sur 2025.
    expect(quarterOf('2026-01-01')).toEqual({ year: 2026, quarter: 1 })
  })

  it('replie sur le trimestre courant si la date manque ou est illisible', () => {
    const now = new Date()
    const fallback = { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 }
    expect(quarterOf(null)).toEqual(fallback)
    expect(quarterOf('')).toEqual(fallback)
    expect(quarterOf('12.05.2026')).toEqual(fallback)
    expect(quarterOf('2026-13-01')).toEqual(fallback)
  })
})

describe('supplierInvoiceFilename', () => {
  const name = (inv, orig) => supplierInvoiceFilename(inv, orig)
  const BOIS = { supplier_name: 'Bois SA', invoice_number: '2026-0451', issue_date: '2026-05-12', amount: 1240.5 }

  it('construit date_FOURNISSEUR-numéro_montant', () => {
    // Format de CONSIGNES-MAZE-PROJECT.md :
    // AAAA-MM-JJ_FOURNISSEUR-description_montant. Le numéro occupe la
    // description — c'est par lui qu'on retrouve la pièce dans un relevé
    // fournisseur — et le montant ferme le nom, pour le relevé bancaire.
    expect(name({ ...BOIS, supplier_name: 'BOIS SA' }, 'scan.pdf'))
      .toBe('2026-05-12_BOIS-SA-2026-0451_1240.50.pdf')
  })

  it('écrit le TOTAL avec deux décimales', () => {
    expect(name({ ...BOIS, amount: 944.1 }, 'a.pdf')).toMatch(/_944\.10\.pdf$/)
    expect(name({ ...BOIS, amount: '703.2' }, 'a.pdf')).toMatch(/_703\.20\.pdf$/)
  })

  it('n\'écrit AUCUN montant plutôt qu\'un montant faux', () => {
    // « Montant inconnu ou douteux → ne pas en mettre » : un nom sans montant
    // vaut mieux qu'un montant faux. Quatre factures DHL portaient le
    // supplément carburant à la place du total.
    expect(name({ ...BOIS, amount: null }, 'a.pdf')).toBe('2026-05-12_BOIS-SA-2026-0451.pdf')
    expect(name({ ...BOIS, amount: 'illisible' }, 'a.pdf')).toBe('2026-05-12_BOIS-SA-2026-0451.pdf')
    expect(amountTag(undefined)).toBeNull()
    expect(amountTag(0)).toBe('0.00')
  })

  it('retire les accents et la ponctuation du fournisseur', () => {
    expect(name({ supplier_name: 'Peintures Dubois Sàrl', invoice_number: 'F-8891', issue_date: '2026-05-14', amount: 80 }, 'a.pdf'))
      .toBe('2026-05-14_PEINTURES-DUBOIS-SARL-F-8891_80.00.pdf')
  })

  it('omet le numéro si l\'OCR ne l\'a pas trouvé', () => {
    expect(name({ supplier_name: 'Bois SA', invoice_number: null, issue_date: '2026-05-12', amount: 12 }, 'a.pdf'))
      .toBe('2026-05-12_BOIS-SA_12.00.pdf')
  })

  it('conserve l\'extension d\'origine pour une photo de reçu', () => {
    expect(name({ ...BOIS, invoice_number: '1' }, 'IMG_4021.JPEG'))
      .toBe('2026-05-12_BOIS-SA-1_1240.50.jpeg')
  })

  it('retombe sur .pdf sans nom de fichier d\'origine', () => {
    expect(name({ ...BOIS, invoice_number: '1' })).toBe('2026-05-12_BOIS-SA-1_1240.50.pdf')
  })

  it('reste lisible sur un fournisseur sans nom', () => {
    expect(name({ supplier_name: null, invoice_number: null, issue_date: '2026-05-12', amount: null }, 'a.pdf'))
      .toBe('2026-05-12_FOURNISSEUR.pdf')
  })

  it('tronque un fournisseur à rallonge sans laisser de tiret en fin', () => {
    const out = name({
      supplier_name: 'Entreprise Générale de Construction et de Rénovation du Canton de Vaud',
      invoice_number: '7', issue_date: '2026-05-12', amount: 99,
    }, 'a.pdf')
    expect(out).not.toMatch(/-_/)
    expect(out).toBe('2026-05-12_ENTREPRISE-GENERALE-DE-CONSTRUCTION-ET-D-7_99.00.pdf')
  })

  it('ne met ni accent ni apostrophe, qui cassent recherches et liens', () => {
    const out = name({ supplier_name: "L'Atelier d'Ébénisterie", invoice_number: null, issue_date: '2026-01-05', amount: 10 }, 'a.pdf')
    expect(out).toBe('2026-01-05_L-ATELIER-D-EBENISTERIE_10.00.pdf')
    expect(out).not.toMatch(/['\u00e9\u00e8\u00e0]/)
  })
})
