import { describe, it, expect } from 'vitest'
import { champsSousTraitance, majSousTraitance, etatSousTraitance, nouvelleSousTraitance, pretARecuperer, recupere, rouvrirSousTraitance, tacheRecuperation } from '../lib/sousTraitance'

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


describe('cycle d’une sous-traitance (nouvelle fiche)', () => {
  const tache = { id: 9, project_id: 'p1', title: 'Découpe panneaux', status: 'active', category_data: { subcontractor: 'Tôle Factory', drop_date: '2026-10-20' } }
  it('se crée avec la récupération prévue comme date d’exécution', () => {
    const b = nouvelleSousTraitance({ title: 'Découpe', subcontractor: ' Tôle Factory ', drop_date: '2026-10-20', expected_pickup_date: '2026-10-30', responsible: 'Arnaud' }, 'p1')
    expect(b).toMatchObject({ title: 'Découpe', execution_date: '2026-10-30', category: 'sous_traitance' })
    expect(b.category_data.subcontractor).toBe('Tôle Factory')
  })
  it('passe de chez le sous-traitant à prête, puis à l’atelier', () => {
    expect(etatSousTraitance(tache)).toBe('chez')
    expect(etatSousTraitance({ ...tache, category_data: { ready_at: '2026-10-22' } })).toBe('pret')
    expect(etatSousTraitance({ ...tache, status: 'completed' })).toBe('atelier')
  })
  it('prête : une tâche de récupération pour Arnaud, liée à la sous-traitance', () => {
    expect(tacheRecuperation(tache, '2026-10-22')).toEqual({
      title: 'Récupérer Découpe panneaux chez Tôle Factory', responsible: 'Arnaud', execution_date: '2026-10-22',
      project_id: 'p1', category: 'logistique', category_data: { source_task_id: 9, kind: 'pickup' },
    })
    expect(pretARecuperer(tache, { qui: 'Guillaume', jour: '2026-10-22', recuperationId: 12 }).category_data)
      .toEqual({ subcontractor: 'Tôle Factory', drop_date: '2026-10-20', ready_at: '2026-10-22', ready_by: 'Guillaume', pickup_task_id: 12 })
  })
  it('récupérée : rangée, l’historique gardé ; rouvrir efface tout l’avancement', () => {
    expect(recupere(tache, { lieu: 'Entrée', qui: 'Arnaud', jour: '2026-10-23' })).toMatchObject({ status: 'completed', category_data: { subcontractor: 'Tôle Factory', storage_location: 'Entrée' } })
    expect(rouvrirSousTraitance(tache).category_data).toMatchObject({ subcontractor: 'Tôle Factory', ready_at: null, picked_up_at: null, pickup_task_id: null })
  })
})
