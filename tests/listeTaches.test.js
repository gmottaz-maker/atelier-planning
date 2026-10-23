import { describe, it, expect } from 'vitest'
import { compterParPersonne, faitesRecemment, filtrer, groupesParCategorie, groupesParDate, groupesParProjet, sectionDate } from '../lib/listeTaches'

const AUJ = '2026-10-23'   // vendredi

describe('section d’une tâche', () => {
  it('se range d’après sa date d’exécution', () => {
    const s = d => sectionDate({ execution_date: d }, AUJ)
    expect(s('2026-10-20')).toBe('retard')
    expect(s(AUJ)).toBe('jour')
    expect(s('2026-10-24')).toBe('demain')
    expect(s('2026-10-25')).toBe('semaine')
    expect(s('2026-10-26')).toBe('suivante')
    expect(s('2026-11-01')).toBe('suivante')
    expect(s('2026-11-02')).toBe('tard')
    expect(s(null)).toBe('sans')
  })
})

const PROJETS = [{ id: 1, numero: 137, name: 'EOY 2026', client: 'Moët' }, { id: 2, numero: 148, name: 'Rooftop 42', client: 'Red Bull' }]
const T = [
  { id: 1, title: 'Commander plexi', status: 'active', responsible: 'Arnaud', execution_date: '2026-10-20', project_id: 1, category: 'commande' },
  { id: 2, title: 'Appeler José', status: 'active', responsible: 'Guillaume', execution_date: AUJ, project_id: 2 },
  { id: 3, title: 'Fichiers', status: 'active', responsible: 'Arnaud', project_id: 1, category: 'fichiers_production' },
  { id: 4, title: 'Admin', status: 'active', responsible: 'Guillaume' },
  { id: 5, title: 'Faite hier', status: 'completed', responsible: 'Arnaud', completed_at: '2026-10-22T10:00:00Z' },
  { id: 6, title: 'Faite il y a longtemps', status: 'completed', responsible: 'Arnaud', completed_at: '2026-08-01T10:00:00Z' },
]

describe('filtre', () => {
  it('ne garde que les tâches ouvertes', () => {
    expect(filtrer(T).map(t => t.id)).toEqual([1, 2, 3, 4])
  })
  it('par personne', () => {
    expect(filtrer(T, { qui: 'Arnaud' }).map(t => t.id)).toEqual([1, 3])
  })
  it('cherche aussi dans le numéro et le nom du projet', () => {
    expect(filtrer(T, { recherche: '137', projets: PROJETS }).map(t => t.id)).toEqual([1, 3])
    expect(filtrer(T, { recherche: 'red bull', projets: PROJETS }).map(t => t.id)).toEqual([2])
    expect(filtrer(T, { recherche: 'josé' }).map(t => t.id)).toEqual([2])
  })
})

describe('rangements', () => {
  const ouvertes = filtrer(T)
  it('par date, sans section vide', () => {
    expect(groupesParDate(ouvertes, AUJ).map(g => [g.cle, g.taches.map(t => t.id)])).toEqual([['retard', [1]], ['jour', [2]], ['sans', [4, 3]]])
  })
  it('par projet, le plus pressé d’abord, sans projet à la fin', () => {
    expect(groupesParProjet(ouvertes, PROJETS).map(g => [g.numero, g.taches.map(t => t.id)])).toEqual([[137, [1, 3]], [148, [2]], [null, [4]]])
  })
  it('par catégorie, une tâche sans catégorie au bureau', () => {
    expect(groupesParCategorie(ouvertes).map(g => [g.cle, g.taches.map(t => t.id)])).toEqual([['bureau', [2, 4]], ['fichiers_production', [3]], ['commande', [1]]])
  })
})

describe('faites et comptes', () => {
  it('liste les tâches faites des 30 derniers jours, les plus récentes d’abord', () => {
    expect(faitesRecemment(T, { aujourdhui: AUJ }).map(t => t.id)).toEqual([5])
  })
  it('compte les tâches ouvertes par personne', () => {
    expect(compterParPersonne(T)).toEqual({ Arnaud: 2, Guillaume: 2 })
  })
})
