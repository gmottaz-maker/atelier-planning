import { describe, it, expect } from 'vitest'
import { absenceDe, demiJournee, familleBloc, libelleBloc, resumeSemaine, duree } from '../lib/vueAgenda'
import { briefReunion, tachesParProjet } from '../lib/reunion'

const AUJ = '2026-10-23'

describe('agenda — une demi-journée', () => {
  const absences = [
    { user_name: 'Arnaud', date: '2026-10-26', type: 'VACATION_AM' },
    { user_name: 'Arnaud', date: '2026-10-27', type: 'SICK' },
  ]
  it('reconnaît une absence au matin seulement, ou toute la journée', () => {
    expect(absenceDe(absences, 'Arnaud', '2026-10-26', 'am')).toBe('Congé le matin')
    expect(absenceDe(absences, 'Arnaud', '2026-10-26', 'pm')).toBe(null)
    expect(absenceDe(absences, 'Arnaud', '2026-10-27', 'pm')).toBe('Maladie')
    expect(absenceDe(absences, 'Guillaume', '2026-10-27', 'pm')).toBe(null)
  })
  it('dit la place libre et le dépassement, seulement si le contrat est connu', () => {
    const b = [{ minutes: 60 }, { minutes: 90 }]
    expect(demiJournee({ blocs: b, parJour: 8.4 })).toMatchObject({ libre: 102, trop: false })
    expect(demiJournee({ blocs: [{ minutes: 240 }, { minutes: 60 }], parJour: 8.4 }).trop).toBe(true)
    expect(demiJournee({ blocs: b, parJour: 0 })).toMatchObject({ libre: null, trop: false })
  })
  it('une absence ne propose rien ; une demi-journée vide propose la semaine type', () => {
    expect(demiJournee({ absence: 'Férié', defaut: 'admin' })).toMatchObject({ absence: 'Férié', defaut: null })
    expect(demiJournee({ defaut: 'admin', parJour: 8.4 })).toMatchObject({ defaut: 'admin', libre: null })
  })
  it('range les blocs en trois familles et les résume', () => {
    expect(familleBloc('montage')).toBe('dehors')
    expect(familleBloc('production')).toBe('atelier')
    expect(familleBloc('inconnu')).toBe('bureau')
    expect(libelleBloc({ type: 'demontage', projects: { numero: 123, name: 'Folklor' } })).toEqual({ type: 'Démontage', numero: 123, quoi: 'Folklor' })
    expect(resumeSemaine([
      { type: 'trajet', user_name: 'A', date: 'd', demi: 'am' },
      { type: 'montage', user_name: 'A', date: 'd', demi: 'am' },
      { type: 'production', user_name: 'A', date: 'd', demi: 'pm' },
    ])).toEqual({ blocs: 3, dehors: 1 })
    expect(duree(150)).toBe('2 h 30')
  })
})

const PROJETS = [
  { id: 1, numero: 123, name: 'Folklor', status: 'active', deadline: '2026-10-20', quote_data: { status: 'accepte' } },
  { id: 2, numero: 124, name: 'Rooftop', status: 'active', deadline: '2026-10-27', quote_data: { status: 'brouillon' } },
  { id: 3, numero: 99, name: 'Ancien', status: 'archived', deadline: '2026-01-01' },
]
const TACHES = [
  { id: 1, title: 'Fichiers', status: 'active', project_id: 1, execution_date: '2026-10-21' },
  { id: 2, title: 'Vis', status: 'active', project_id: 1, category: 'commande', category_data: { expected_date: '2026-10-30' } },
  { id: 3, title: 'Plexi', status: 'active', project_id: 2, category: 'sous_traitance', category_data: { ready_at: '2026-10-22' } },
  { id: 4, title: 'Laquage', status: 'active', project_id: 2, category: 'sous_traitance', category_data: {} },
  { id: 5, title: 'Montage', status: 'active', project_id: 1, execution_date: '2026-10-01', category_data: { source_logistics_uid: 'x' } },
  { id: 6, title: 'Faite', status: 'completed', project_id: 1, execution_date: '2026-10-01' },
  { id: 7, title: 'Poser', status: 'active', project_id: 2, execution_date: '2026-10-28' },
]

describe('réunion', () => {
  const b = briefReunion({ projets: PROJETS, taches: TACHES, aujourdhui: AUJ })
  it('les retards : livraisons dépassées et tâches, sans les dates sur place', () => {
    expect(b.retards.projets.map(p => p.id)).toEqual([1])
    expect(b.retards.taches.map(t => t.id)).toEqual([1])
  })
  it('ce qu’on attend de l’extérieur', () => {
    expect(b.commandes.map(t => t.id)).toEqual([2])
    expect(b.sousTraitances.pretes.map(t => t.id)).toEqual([3])
    expect(b.sousTraitances.chez.map(t => t.id)).toEqual([4])
  })
  it('les projets actifs à leur statut, et les chiffres', () => {
    expect(b.statuts.map(g => [g.cle, g.projets.map(p => p.id)])).toEqual([['preparation', [2]], ['preproduction', [1]]])
    expect(b.chiffres).toEqual({ actifs: 2, livraisons: 1, retard: 2, commandes: 1, sousTraitances: 2 })
  })
  it('résume les tâches ouvertes de chaque projet', () => {
    expect(tachesParProjet(TACHES, AUJ)['2']).toEqual({ ouvertes: 3, retard: 0, prochaine: { date: '2026-10-28', titre: 'Poser' } })
    expect(tachesParProjet(TACHES, AUJ)['1'].retard).toBe(2)
  })
})
