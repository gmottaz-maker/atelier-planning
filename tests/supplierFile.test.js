import { describe, it, expect } from 'vitest'
import { quarterOf, supplierInvoiceFilename } from '../lib/supplierFile'

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

  it('construit date_FOURNISSEUR_numéro', () => {
    expect(name({ supplier_name: 'BOIS SA', invoice_number: '2026-0451', issue_date: '2026-05-12' }, 'scan.pdf'))
      .toBe('2026-05-12_BOIS-SA_2026-0451.pdf')
  })

  it('retire les accents et la ponctuation du fournisseur', () => {
    expect(name({ supplier_name: 'Peintures Dubois Sàrl', invoice_number: 'F-8891', issue_date: '2026-05-14' }, 'a.pdf'))
      .toBe('2026-05-14_PEINTURES-DUBOIS-SARL_F-8891.pdf')
  })

  it('omet le numéro si l\'OCR ne l\'a pas trouvé', () => {
    expect(name({ supplier_name: 'Bois SA', invoice_number: null, issue_date: '2026-05-12' }, 'a.pdf'))
      .toBe('2026-05-12_BOIS-SA.pdf')
  })

  it('conserve l\'extension d\'origine pour une photo de reçu', () => {
    expect(name({ supplier_name: 'Bois SA', invoice_number: '1', issue_date: '2026-05-12' }, 'IMG_4021.JPEG'))
      .toBe('2026-05-12_BOIS-SA_1.jpeg')
  })

  it('retombe sur .pdf sans nom de fichier d\'origine', () => {
    expect(name({ supplier_name: 'Bois SA', invoice_number: '1', issue_date: '2026-05-12' }))
      .toBe('2026-05-12_BOIS-SA_1.pdf')
  })

  it('reste lisible sur un fournisseur sans nom', () => {
    expect(name({ supplier_name: null, invoice_number: null, issue_date: '2026-05-12' }, 'a.pdf'))
      .toBe('2026-05-12_FOURNISSEUR.pdf')
  })

  it('tronque un fournisseur à rallonge sans laisser de tiret en fin', () => {
    const out = name({
      supplier_name: 'Entreprise Générale de Construction et de Rénovation du Canton de Vaud',
      invoice_number: '7', issue_date: '2026-05-12',
    }, 'a.pdf')
    expect(out.length).toBeLessThan(70)
    expect(out).not.toMatch(/-_/)
    expect(out).toBe('2026-05-12_ENTREPRISE-GENERALE-DE-CONSTRUCTION-ET-D_7.pdf')
  })
})
