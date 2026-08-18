import { describe, it, expect } from 'vitest'
import { buildFactureHtml } from '../lib/factureHtml'
import { qrDocument } from '../lib/docLayout'

const base = {
  invoice_number: '2026-013', issue_date: '2026-08-14', due_date: '2026-09-13',
  client_name: 'Red Bull AG', client_address: 'Poststrasse 3\n6340 Baar',
  object: 'Aménagement bar', currency: 'CHF',
  amount_net: 1000, vat_rate: 8.1, vat_amount: 81, amount: 1081,
  quote_snapshot: { items: [{ name: 'Néon', purchases: [{ description: 'Néon 100cm', unit_price: 1000, quantity: 1 }], labor: [] }] },
}

describe('buildFactureHtml', () => {
  it('reprend le gabarit de l\'offre', () => {
    const html = buildFactureHtml(base, {}, 'detailed', null)
    expect(html).toContain('IBM+Plex+Sans')
    expect(html).toContain('class="doc"')
    expect(html).toContain('N° de facture')
    expect(html).toContain('2026-013')
    expect(html).toContain('Facturé à :')
  })

  it('affiche les totaux de la facture, pas un recalcul des lignes', () => {
    // Le montant stocké prime : une facture émise ne bouge plus.
    const html = buildFactureHtml({ ...base, amount: 9999 }, {}, 'detailed', null)
    expect(html).toContain("9'999,00 CHF")
    expect(html).toContain('Total à payer')
  })

  it('détaille l\'escompte global', () => {
    const html = buildFactureHtml({ ...base, discount_rate: 10, amount_net: 900, vat_amount: 72.9, amount: 972.9 }, {}, 'detailed', null)
    expect(html).toContain('Escompte 10 %')
    expect(html).toContain("1'000,00 CHF")   // sous-total reconstitué
    expect(html).toContain('Net HT')
  })

  it('n\'affiche ni sous-total ni TVA quand la facture n\'en porte pas', () => {
    const html = buildFactureHtml({ ...base, amount_net: null, vat_amount: null }, {}, 'detailed', null)
    expect(html).not.toContain('Sous-total HT')
    expect(html).toContain('Total à payer')
  })

  it('rappelle l\'IBAN seulement en l\'absence de QR-bill', () => {
    const ci = { iban: 'CH00 1234' }
    expect(buildFactureHtml(base, ci, 'detailed', null)).toContain('CH00 1234')
    expect(buildFactureHtml(base, ci, 'detailed', '<svg id="qr"></svg>')).not.toContain('CH00 1234')
  })

  it('ne place plus le bulletin dans le corps de la facture', () => {
    // Le bulletin est un DOCUMENT séparé, fusionné au moment du PDF : ses
    // marges de page sont incompatibles avec celles du contenu, qui doivent
    // se répéter d'une page à l'autre.
    const html = buildFactureHtml(base, {}, 'detailed', '<svg id="qr"></svg>')
    expect(html).not.toContain('<svg id="qr">')
  })

  it('titre la section Stockage pour les factures de stockage', () => {
    const html = buildFactureHtml({ ...base, object: 'Stockage T3 2026' }, {}, 'detailed', null)
    expect(html).toContain('Stockage')
    expect(html).not.toContain('Fabrication')
  })

  it('rend les instantanés à l\'ancien format', () => {
    const html = buildFactureHtml({ ...base, quote_snapshot: { purchases: [{ description: 'Bois', unit_price: 500, quantity: 2 }] } }, {}, 'detailed', null)
    expect(html).toContain('Bois')
    expect(html).toContain("1'000,00")
  })
})

describe('qrDocument — page autonome du bulletin', () => {
  it('produit un document A4 sans marges, bulletin collé au bord bas', () => {
    const html = qrDocument('<svg id="qr"></svg>')
    expect(html).toContain('@page { size: A4; margin: 0; }')
    expect(html).toContain('margin-top:192mm')       // 297 − 105
    expect(html).toContain('<svg id="qr">')
  })

  it('donne au bulletin la pleine largeur du papier', () => {
    expect(qrDocument('<svg/>')).toContain('width:210mm')
  })
})
