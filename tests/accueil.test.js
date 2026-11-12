import { describe, it, expect } from 'vitest'
import { aTraiter, decaler, evenementsParJour, joursDeLaSemaine, mesTaches, surLEtabli } from '../lib/accueil'

const AUJ = '2026-10-23'   // un vendredi

describe('semaine', () => {
  it('va du lundi au dimanche de la semaine en cours', () => {
    expect(joursDeLaSemaine(AUJ)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
  })
  it('se décale d’une semaine, en passant les mois', () => {
    expect(joursDeLaSemaine(AUJ, 1)[0]).toBe('2026-10-26')
    expect(joursDeLaSemaine(AUJ, 1)[6]).toBe('2026-11-01')
    expect(joursDeLaSemaine('2026-10-25')[0]).toBe('2026-10-19')
  })
  it('décale une date sans dépendre du fuseau', () => {
    expect(decaler('2026-10-31', 1)).toBe('2026-11-01')
    expect(decaler('2026-03-29', 1)).toBe('2026-03-30')
  })
})

const PROJETS = [
  { id: 1, numero: 137, name: 'EOY 2026', status: 'active', deadline: '2026-10-21', quote_data: { status: 'accepte' },
    logistics_data: [{ uid: 'u1', type: 'montage', date: '2026-10-24', assignees: ['Arnaud', 'Guillaume'] }] },
  { id: 2, numero: 148, name: 'Rooftop 42', status: 'active', deadline: '2026-11-01', quote_data: null },
  { id: 3, numero: 120, name: 'Ancien', status: 'archived', deadline: '2026-10-22', quote_data: { status: 'accepte' } },
  { id: 4, numero: 150, name: 'Chariot', status: 'active', deadline: '2026-12-01', statut: 'termine', quote_data: { status: 'accepte' } },
  { id: 5, numero: 151, name: 'En pause', status: 'active', suspended: true, deadline: '2026-10-01', quote_data: null },
  { id: 6, numero: 152, name: 'Vitrine', status: 'active', deadline: '2026-11-10', statut: 'production', quote_data: { status: 'accepte' } },
]
const TACHES = [
  { id: 10, title: 'Commander plexi', status: 'active', execution_date: '2026-10-20', responsible: 'Guillaume', project_id: 1 },
  { id: 11, title: 'Appeler José', status: 'active', execution_date: AUJ, responsible: 'Guillaume' },
  { id: 12, title: 'Faite', status: 'completed', execution_date: '2026-10-22', responsible: 'Guillaume' },
  { id: 13, title: 'Montage — EOY', status: 'active', execution_date: '2026-10-24', responsible: 'Arnaud', category_data: { source_logistics_uid: 'u1' } },
  { id: 14, title: 'Peindre', status: 'active', execution_date: '2026-10-28', responsible: 'Arnaud', project_id: 6 },
  { id: 15, title: 'Sans date', status: 'active', responsible: 'Guillaume' },
]

describe('événements de la semaine', () => {
  const ev = evenementsParJour({ projets: PROJETS, taches: TACHES, agenda: [
    { id: 'a1', date: '2026-10-24', demi: 'pm', type: 'montage', user_name: 'Arnaud', project_id: 1 },
    { id: 'a2', date: '2026-10-24', demi: 'am', type: 'trajet', user_name: 'Arnaud', project_id: 1 },
  ], debut: '2026-10-19', fin: '2026-10-25' })

  it('met livraisons, dates sur place, agenda et tâches au bon jour', () => {
    expect(ev['2026-10-21'].map(e => e.genre)).toEqual(['livraison'])
    expect(ev['2026-10-24'].map(e => [e.genre, e.titre])).toEqual([['surplace', 'Montage'], ['agenda', 'trajet'], ['agenda', 'montage']])
    expect(ev[AUJ].map(e => e.titre)).toEqual(['Appeler José'])
  })
  it('laisse de côté les projets archivés, les tâches faites et celles tirées d’un point logistique', () => {
    expect(ev['2026-10-22']).toBeUndefined()
    expect(Object.values(ev).flat().some(e => e.titre === 'Montage — EOY')).toBe(false)
  })
  it('ne sort rien hors de la semaine', () => {
    expect(ev['2026-10-28']).toBeUndefined()
  })
  it('rattache le projet à l’événement', () => {
    expect(ev['2026-10-24'][0].projet).toEqual({ id: 1, numero: 137, nom: 'EOY 2026' })
    expect(ev['2026-10-24'][0].qui).toBe('Arnaud, Guillaume')
  })
})

describe('à traiter', () => {
  it('range les retards d’abord, puis à facturer, puis les offres à faire', () => {
    const a = aTraiter({ projets: PROJETS, taches: TACHES, factures: new Set(), aujourdhui: AUJ })
    expect(a.map(x => [x.genre, x.projet?.numero ?? null, x.titre])).toEqual([
      ['retard', 137, 'Livraison dépassée'],
      ['retard', 137, 'Commander plexi'],
      ['facturer', 150, 'Terminé, à facturer'],
      ['offre', 148, 'Offre à faire'],
    ])
  })
  it('ne propose « à facturer » que si l’on connaît les factures', () => {
    expect(aTraiter({ projets: PROJETS, taches: [], factures: null, aujourdhui: AUJ }).some(x => x.genre === 'facturer')).toBe(false)
    expect(aTraiter({ projets: PROJETS, taches: [], factures: new Set(['4']), aujourdhui: AUJ }).some(x => x.genre === 'facturer')).toBe(false)
  })
  it('ignore les projets en pause et archivés', () => {
    const a = aTraiter({ projets: PROJETS, taches: [], aujourdhui: AUJ })
    expect(a.some(x => [151, 120].includes(x.projet?.numero))).toBe(false)
  })
})

describe('sur l’établi', () => {
  it('garde les projets acceptés et pas terminés, par livraison', () => {
    expect(surLEtabli(PROJETS).map(p => p.numero)).toEqual([137, 152])
  })
})

describe('mes tâches', () => {
  it('sépare retard, aujourd’hui (ou sans date), semaine et plus tard', () => {
    const m = mesTaches(TACHES, 'Guillaume', AUJ)
    expect(m.retard.map(t => t.id)).toEqual([10])
    expect(m.jour.map(t => t.id)).toEqual([11, 15])
    expect(m.semaine).toEqual([])
    expect(mesTaches(TACHES, 'Arnaud', AUJ).plusTard.map(t => t.id)).toEqual([14])
  })
})
