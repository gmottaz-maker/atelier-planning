import { describe, it, expect } from 'vitest'
import {
  montantAcompteHT, acomptesDuProjet, totalAcomptesTTC,
  figerDeductions, totalDeductions, resteAAcompterHT, BASES, TYPES,
} from '../lib/acomptes'
import { invoiceTotals } from '../lib/invoiceTotals'

describe('montant d\'un acompte', () => {
  it('prend un POURCENTAGE du total HT de l\'offre', () => {
    // Décision du 26 octobre 2026 : le pourcentage porte sur le HT, la TVA
    // vient par-dessus — l'acompte reste une facture ordinaire.
    expect(montantAcompteHT({ base: 'pourcentage', valeur: 30, sousTotalHT: 20000 }))
      .toEqual({ ok: true, montant: 6000 })
    expect(montantAcompteHT({ base: 'pourcentage', valeur: 33.3, sousTotalHT: 1000 }).montant).toBe(333)
  })

  it('prend un MONTANT fixe tel quel', () => {
    expect(montantAcompteHT({ base: 'montant', valeur: 5000, sousTotalHT: 20000 }))
      .toEqual({ ok: true, montant: 5000 })
  })

  it('refuse de dépasser l\'offre, dans les deux bases', () => {
    expect(montantAcompteHT({ base: 'pourcentage', valeur: 120, sousTotalHT: 20000 }).ok).toBe(false)
    expect(montantAcompteHT({ base: 'montant', valeur: 25000, sousTotalHT: 20000 }).ok).toBe(false)
  })

  it('refuse zéro plutôt que d\'émettre une facture vide', () => {
    // Un acompte à zéro part chez le client sans que personne le remarque.
    expect(montantAcompteHT({ base: 'pourcentage', valeur: 0, sousTotalHT: 20000 }).ok).toBe(false)
    expect(montantAcompteHT({ base: 'montant', valeur: '', sousTotalHT: 20000 }).ok).toBe(false)
    expect(montantAcompteHT({ base: 'pourcentage', valeur: -10, sousTotalHT: 20000 }).ok).toBe(false)
  })

  it('refuse d\'acompter une offre sans montant', () => {
    expect(montantAcompteHT({ base: 'pourcentage', valeur: 30, sousTotalHT: 0 }).ok).toBe(false)
  })

  it('refuse une base inventée', () => {
    expect(montantAcompteHT({ base: 'moitié', valeur: 30, sousTotalHT: 20000 }).ok).toBe(false)
    expect(BASES).toEqual(['pourcentage', 'montant'])
    expect(TYPES).toEqual(['facture', 'acompte'])
  })
})

describe('ce qui se déduit d\'une facture finale', () => {
  const f = (o) => ({ type: 'acompte', project_id: 'p1', status: 'sent', amount: 1000, ...o })

  it('ne retient que les acomptes du projet', () => {
    const tout = [f({ id: 1 }), f({ id: 2, project_id: 'p2' }), { ...f({ id: 3 }), type: 'facture' }]
    expect(acomptesDuProjet(tout, { projectId: 'p1' }).map(x => x.id)).toEqual([1])
  })

  it('écarte un acompte ANNULÉ, garde un acompte impayé', () => {
    // L'annulé ne sera jamais payé. L'impayé, si : le client doit le solde
    // quoi qu'il arrive, et l'acompte reste une créance sur sa propre facture.
    const tout = [f({ id: 1, status: 'cancelled' }), f({ id: 2, status: 'pending' }), f({ id: 3, status: 'paid' })]
    expect(acomptesDuProjet(tout, { projectId: 'p1' }).map(x => x.id)).toEqual([2, 3])
  })

  it('ne déduit pas la facture d\'elle-même', () => {
    const tout = [f({ id: 1 }), f({ id: 2 })]
    expect(acomptesDuProjet(tout, { projectId: 'p1', sauf: 2 }).map(x => x.id)).toEqual([1])
  })

  it('totalise en TTC, et fige ce qu\'il déduit', () => {
    const l = [f({ id: 1, amount: 6486, invoice_number: 'FA-0042', issue_date: '2026-03-01' }),
               f({ id: 2, amount: 2000, invoice_number: 'FA-0051', issue_date: '2026-05-01' })]
    expect(totalAcomptesTTC(l)).toBe(8486)
    const fige = figerDeductions(l)
    expect(fige).toEqual([
      { id: 1, numero: 'FA-0042', date: '2026-03-01', montant: 6486 },
      { id: 2, numero: 'FA-0051', date: '2026-05-01', montant: 2000 },
    ])
    // L'instantané fait foi ensuite : annuler l'acompte ne réécrit pas le
    // document déjà envoyé.
    expect(totalDeductions(fige)).toBe(8486)
  })

  it('dit ce qu\'il reste à acompter, en HT', () => {
    const l = [f({ amount: 6486 })]   // 6000 HT + 8,1 %
    expect(resteAAcompterHT({ sousTotalHT: 20000, acomptes: l, tvaRate: 8.1 })).toBe(14000)
    expect(resteAAcompterHT({ sousTotalHT: 20000, acomptes: [], tvaRate: 8.1 })).toBe(20000)
  })
})

describe('la facture finale, bout en bout', () => {
  it('déduit l\'acompte APRÈS la TVA', () => {
    // L'exemple arbitré : offre 20 000 HT, TVA 8,1 %, acompte de 30 %.
    const acompte = invoiceTotals({ subtotal: 6000, vat_rate: 8.1 })
    expect(acompte.gross).toBe(6486)

    const finale = invoiceTotals({ subtotal: 20000, vat_rate: 8.1, acomptes: acompte.gross })
    expect(finale.gross).toBe(21620)
    expect(finale.acomptes).toBe(6486)
    expect(finale.du).toBe(15134)
  })

  it('la somme des deux factures égale le total TTC — la TVA n\'est comptée qu\'une fois', () => {
    const acompte = invoiceTotals({ subtotal: 6000, vat_rate: 8.1 })
    const finale = invoiceTotals({ subtotal: 20000, vat_rate: 8.1, acomptes: acompte.gross })
    expect(acompte.gross + finale.du).toBe(21620)
    expect(acompte.vat + (finale.vat - 0)).toBeCloseTo(486 + 1620, 2)
  })

  it('sans acompte, rien ne change pour les factures existantes', () => {
    const t = invoiceTotals({ subtotal: 1000, vat_rate: 8.1 })
    expect(t.du).toBe(t.gross)
    expect(t.acomptes).toBe(0)
    expect(t.excedent).toBe(0)
  })

  it('un acompte qui dépasse le total ne rend pas un dû NÉGATIF', () => {
    // Chantier réduit en cours de route : une facture négative passerait le
    // rapprochement bancaire sans jamais se laisser payer. On borne, et on
    // sort l'excédent pour que l'écran réclame une note de crédit.
    const t = invoiceTotals({ subtotal: 1000, vat_rate: 8.1, acomptes: 2000 })
    expect(t.du).toBe(0)
    expect(t.acomptes).toBe(1081)
    expect(t.excedent).toBe(919)
  })

  it('l\'escompte global s\'applique avant la TVA, l\'acompte après', () => {
    const t = invoiceTotals({ subtotal: 20000, discount_rate: 10, vat_rate: 8.1, acomptes: 6486 })
    expect(t.net).toBe(18000)
    expect(t.vat).toBe(1458)
    expect(t.gross).toBe(19458)
    expect(t.du).toBe(12972)
  })
})
