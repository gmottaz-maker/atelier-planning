import { describe, it, expect } from 'vitest'
import { grouperFacturesParClient, SANS_CLIENT } from '../lib/facturesGroupes'

const f = (client, amount, status, due_date) => ({ client_name: client, amount, status, due_date })
const AUJ = '2026-09-17'

describe('grouperFacturesParClient', () => {
  it('rassemble les factures d\'un même client, sans se laisser avoir par une espace', () => {
    const g = grouperFacturesParClient([
      f('Manor SA', 100, 'paid'), f(' Manor SA ', 200, 'sent', '2026-12-01'), f('BCV', 50, 'paid'),
    ], AUJ)
    expect(g.map(x => x.client)).toEqual(['BCV', 'Manor SA'])
    expect(g.find(x => x.client === 'Manor SA').items).toHaveLength(2)
  })

  it('sépare ce qui est dû, ce qui est payé et ce qui est en retard', () => {
    const g = grouperFacturesParClient([
      f('Manor SA', 100, 'paid'),
      f('Manor SA', 200, 'sent', '2026-08-01'),   // échue : en retard
      f('Manor SA', 300, 'sent', '2026-12-01'),   // pas encore échue
    ], AUJ)[0]
    expect(g.facture).toBe(600)
    expect(g.paye).toBe(100)
    expect(g.retard).toBe(200)
  })

  it('n\'additionne pas une facture annulée : personne ne l\'attend', () => {
    const g = grouperFacturesParClient([f('BCV', 100, 'cancelled'), f('BCV', 40, 'paid')], AUJ)[0]
    expect(g.facture).toBe(40)
    expect(g.paye).toBe(40)
  })

  it('range les factures sans client à la fin, comme une anomalie', () => {
    const g = grouperFacturesParClient([f('', 10, 'paid'), f('Zurich SA', 10, 'paid'), f('Alpha', 10, 'paid')], AUJ)
    expect(g.map(x => x.client)).toEqual(['Alpha', 'Zurich SA', SANS_CLIENT])
  })

  it('supporte une liste vide ou absente', () => {
    expect(grouperFacturesParClient([], AUJ)).toEqual([])
    expect(grouperFacturesParClient(undefined, AUJ)).toEqual([])
  })

  it('ne perd aucune facture en chemin', () => {
    const liste = Array.from({ length: 11 }, (_, i) => f(`Client ${i % 3}`, 10, 'paid'))
    const g = grouperFacturesParClient(liste, AUJ)
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(11)
  })
})
