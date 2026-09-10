import { describe, it, expect } from 'vitest'
import { champsCommande, majCommande } from '../lib/commandes'

const tache = {
  id: 31,
  title: 'Vis M6 inox',
  responsible: 'Arnaud',
  status: 'active',
  category: 'commande',
  category_data: {
    quantity: '10',
    vendor: 'Brico',
    order_date: '2026-09-01',
    expected_date: '2026-09-05',
  },
}

describe('champsCommande', () => {
  it('remplit le formulaire depuis la tâche', () => {
    expect(champsCommande(tache)).toEqual({
      article: 'Vis M6 inox',
      quantity: '10',
      vendor: 'Brico',
      order_date: '2026-09-01',
      expected_date: '2026-09-05',
      responsible: 'Arnaud',
    })
  })

  it('ne rend jamais null : les champs vides sont des chaînes', () => {
    const vide = champsCommande({ id: 1, title: 'X', category_data: { vendor: null } })
    expect(vide.vendor).toBe('')
    expect(vide.quantity).toBe('')
    expect(vide.responsible).toBe('')
  })

  it('supporte une tâche sans category_data', () => {
    expect(() => champsCommande({ id: 1 })).not.toThrow()
  })
})

describe('majCommande', () => {
  it('renvoie les champs modifiés', () => {
    const maj = majCommande(tache, {
      article: '  Vis M8 inox  ',
      quantity: ' 20 ',
      vendor: ' Hilti ',
      order_date: '2026-09-02',
      expected_date: '2026-09-06',
      responsible: 'Gabin',
    })
    expect(maj.title).toBe('Vis M8 inox')
    expect(maj.responsible).toBe('Gabin')
    expect(maj.category_data.quantity).toBe('20')
    expect(maj.category_data.vendor).toBe('Hilti')
    expect(maj.category_data.order_date).toBe('2026-09-02')
    expect(maj.category_data.expected_date).toBe('2026-09-06')
  })

  it('préserve la réception — la route remplace category_data en bloc', () => {
    const recue = {
      ...tache,
      status: 'completed',
      category_data: {
        ...tache.category_data,
        received_at: '2026-09-04',
        received_by: 'Arnaud',
        storage_location: 'Économat',
      },
    }
    const maj = majCommande(recue, champsCommande(recue))
    expect(maj.category_data).toMatchObject({
      received_at: '2026-09-04',
      received_by: 'Arnaud',
      storage_location: 'Économat',
    })
  })

  it('ne renvoie pas de statut : modifier ne rouvre ni ne clôt une commande', () => {
    const maj = majCommande(tache, champsCommande(tache))
    expect('status' in maj).toBe(false)
    expect('received_at' in maj).toBe(false)
  })

  it('la date d\'exécution suit la réception prévue, sinon la commande', () => {
    const base = champsCommande(tache)
    expect(majCommande(tache, base).execution_date).toBe('2026-09-05')
    expect(majCommande(tache, { ...base, expected_date: '' }).execution_date).toBe('2026-09-01')
    expect(majCommande(tache, { ...base, expected_date: '', order_date: '' }).execution_date).toBe(null)
  })

  it('vide les champs effacés plutôt que de garder l\'ancienne valeur', () => {
    const maj = majCommande(tache, { ...champsCommande(tache), vendor: '   ', quantity: '', order_date: '' })
    expect(maj.category_data.vendor).toBe(null)
    expect(maj.category_data.quantity).toBe(null)
    expect(maj.category_data.order_date).toBe(null)
  })
})
