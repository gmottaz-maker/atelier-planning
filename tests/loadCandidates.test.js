import { describe, it, expect } from 'vitest'
import { faireSupabase } from './helpers/routeHarness'
import { loadCandidates } from '../lib/reconcileRun'

// Ce fichier existe pour une raison précise : les factures CLIENTES et les
// factures FOURNISSEURS ont deux vocabulaires de statut distincts, et rien ne
// le rappelait. `loadCandidates` cherchait les factures clientes en
// `status = 'pending'` — un statut fournisseur. Aucune ne l'a jamais porté, la
// liste des candidates était donc toujours vide, et un virement de client ne
// pouvait se rapprocher d'aucune facture. Ni automatiquement, ni à la main.
//
// Une confusion de chaînes entre deux tables ne se voit ni au build, ni au
// lint, ni à l'exécution : la requête réussit, elle ne renvoie simplement rien.

const base = (tables) => faireSupabase({ tables: { bank_transactions: [], ...tables } })

describe('loadCandidates — factures clientes', () => {
  const FACTURES = [
    { id: 1, status: 'created',   client_name: 'Manor',     amount: 1200 },
    { id: 2, status: 'sent',      client_name: 'Migros',    amount: 800 },
    { id: 3, status: 'paid',      client_name: 'Coop',      amount: 500 },
    { id: 4, status: 'cancelled', client_name: 'Nespresso', amount: 300 },
  ]

  it('propose les factures émises et envoyées', async () => {
    const c = await loadCandidates(base({ customer_invoices: FACTURES }))
    expect(c.customer_invoices.map(i => i.id).sort()).toEqual([1, 2])
  })

  it('écarte une facture déjà payée ou annulée', async () => {
    const c = await loadCandidates(base({ customer_invoices: FACTURES }))
    const ids = c.customer_invoices.map(i => i.id)
    expect(ids).not.toContain(3)   // payée
    expect(ids).not.toContain(4)   // annulée
  })

  // Le bug lui-même : « pending » appartient aux factures FOURNISSEURS.
  it('ne cherche pas un statut du vocabulaire fournisseur', async () => {
    const c = await loadCandidates(base({
      customer_invoices: [{ id: 9, status: 'pending', client_name: 'X', amount: 100 }],
    }))
    expect(c.customer_invoices).toHaveLength(0)
  })

  it('ne repropose pas une facture déjà liée à une transaction', async () => {
    const sb = faireSupabase({
      tables: {
        customer_invoices: FACTURES,
        bank_transactions: [{ id: 77, matched_to_type: 'customer_invoice', matched_to_id: 2 }],
      },
    })
    const c = await loadCandidates(sb)
    expect(c.customer_invoices.map(i => i.id)).toEqual([1])
  })
})

describe('loadCandidates — les autres types ne bougent pas', () => {
  it('garde les factures fournisseurs en attente ou transmises à la banque', async () => {
    const c = await loadCandidates(base({
      supplier_invoices: [
        { id: 1, status: 'pending' }, { id: 2, status: 'sent_to_bank' },
        { id: 3, status: 'paid' },
      ],
    }))
    expect(c.supplier_invoices.map(i => i.id).sort()).toEqual([1, 2])
  })

  it('garde les frais payés par l\'entreprise', async () => {
    const c = await loadCandidates(base({
      expenses: [{ id: 1, payment_method: 'company' }, { id: 2, payment_method: 'personal' }],
    }))
    expect(c.expenses.map(e => e.id)).toEqual([1])
  })
})
