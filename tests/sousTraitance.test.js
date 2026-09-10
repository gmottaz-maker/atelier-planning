import { describe, it, expect } from 'vitest'
import { champsSousTraitance, majSousTraitance } from '../lib/sousTraitance'

const tache = {
  id: 12,
  title: 'Découpe panneaux',
  responsible: 'Gabin',
  status: 'active',
  category: 'sous_traitance',
  category_data: {
    subcontractor: 'Lasertec',
    drop_date: '2026-09-01',
    expected_pickup_date: '2026-09-08',
  },
}

describe('champsSousTraitance', () => {
  it('remplit le formulaire depuis la tâche', () => {
    expect(champsSousTraitance(tache)).toEqual({
      title: 'Découpe panneaux',
      subcontractor: 'Lasertec',
      drop_date: '2026-09-01',
      expected_pickup_date: '2026-09-08',
      responsible: 'Gabin',
    })
  })

  it('ne rend jamais null : les champs vides sont des chaînes', () => {
    const vide = champsSousTraitance({ id: 1, title: 'X', category_data: { subcontractor: null } })
    expect(vide.subcontractor).toBe('')
    expect(vide.drop_date).toBe('')
    expect(vide.responsible).toBe('')
  })

  it('supporte une tâche sans category_data', () => {
    expect(() => champsSousTraitance({ id: 1 })).not.toThrow()
  })
})

describe('majSousTraitance', () => {
  it('renvoie les champs modifiés', () => {
    const maj = majSousTraitance(tache, {
      title: '  Découpe alu  ',
      subcontractor: ' Metaltech ',
      drop_date: '2026-09-02',
      expected_pickup_date: '2026-09-09',
      responsible: 'Arnaud',
    })
    expect(maj.title).toBe('Découpe alu')
    expect(maj.responsible).toBe('Arnaud')
    expect(maj.category_data.subcontractor).toBe('Metaltech')
    expect(maj.category_data.drop_date).toBe('2026-09-02')
    expect(maj.category_data.expected_pickup_date).toBe('2026-09-09')
  })

  it('préserve l\'avancement — la route remplace category_data en bloc', () => {
    const enCours = {
      ...tache,
      status: 'completed',
      category_data: {
        ...tache.category_data,
        ready_at: '2026-09-06',
        ready_by: 'Gabin',
        picked_up_at: '2026-09-07',
        picked_up_by: 'Arnaud',
        storage_location: 'Économat',
        pickup_task_id: 77,
      },
    }
    const maj = majSousTraitance(enCours, champsSousTraitance(enCours))
    expect(maj.category_data).toMatchObject({
      ready_at: '2026-09-06',
      ready_by: 'Gabin',
      picked_up_at: '2026-09-07',
      picked_up_by: 'Arnaud',
      storage_location: 'Économat',
      pickup_task_id: 77,
    })
  })

  it('ne renvoie pas de statut : modifier ne rouvre ni ne clôt une entrée', () => {
    const maj = majSousTraitance(tache, champsSousTraitance(tache))
    expect('status' in maj).toBe(false)
    expect('picked_up_at' in maj).toBe(false)
  })

  it('la date d\'exécution suit la récupération prévue, sinon la dépose', () => {
    const base = champsSousTraitance(tache)
    expect(majSousTraitance(tache, base).execution_date).toBe('2026-09-08')
    expect(majSousTraitance(tache, { ...base, expected_pickup_date: '' }).execution_date).toBe('2026-09-01')
    expect(majSousTraitance(tache, { ...base, expected_pickup_date: '', drop_date: '' }).execution_date).toBe(null)
  })

  it('vide les champs effacés plutôt que de garder l\'ancienne valeur', () => {
    const maj = majSousTraitance(tache, {
      ...champsSousTraitance(tache),
      subcontractor: '   ',
      drop_date: '',
    })
    expect(maj.category_data.subcontractor).toBe(null)
    expect(maj.category_data.drop_date).toBe(null)
  })
})
