import { describe, it, expect } from 'vitest'
import { RUBRIQUES, chercher, estActif, lienDe, rubriqueActive, rubriquesVisibles, PAGES_ESSAI, ESSAIS_DANS_LA_NAV } from '../lib/navigation'

const item = href => RUBRIQUES.flatMap(r => r.items).find(i => i.href === href)

describe('navigation', () => {
  it('reconnaît la page ouverte, ancienne ou en essai', () => {
    expect(estActif(item('/'), '/projects/[id]/essai')).toBe(true)
    expect(estActif(item('/'), '/')).toBe(true)
    expect(estActif(item('/tasks'), '/tasks/essai')).toBe(true)
    expect(estActif(item('/home'), '/tasks')).toBe(false)
    expect(estActif(item('/outils'), '/peintures')).toBe(true)
    expect(estActif(item('/outils'), '/outils/economat')).toBe(true)
  })
  // Décidé le 13 novembre 2026 : le rail mène aux pages ACTUELLES. Le
  // redesign reste déployé et joignable à la main, mais l'éditeur d'offre n'y
  // est pas utilisable, et une navigation qui y menait partout en faisait le
  // défaut sans que personne l'ait décidé.
  it('mène aux pages actuelles, pas aux essais', () => {
    expect(lienDe('/tasks')).toBe('/tasks')
    expect(lienDe('/')).toBe('/')
    expect(lienDe('/heures')).toBe('/heures')
  })
  // La table reste, c'est elle qui fera la bascule le jour venu.
  it('garde la correspondance vers les essais, pour la bascule', () => {
    expect(PAGES_ESSAI['/tasks']).toBe('/tasks/essai')
    expect(ESSAIS_DANS_LA_NAV).toBe(false)
  })
  it('cache la gestion à un membre, et trouve la rubrique ouverte', () => {
    expect(rubriquesVisibles(false).map(r => r.cle)).toEqual(['travail', 'temps'])
    expect(rubriqueActive('/banque', true)).toBe('internes')
    expect(rubriqueActive('/banque', false)).toBe(null)
  })
  it('cherche pages et projets ; un numéro exact passe en tête', () => {
    const projets = [{ id: 1, numero: 147, name: 'Réparation D!', client: 'Red Bull', status: 'active' }, { id: 2, numero: 12, name: 'Factures', status: 'archived' }]
    expect(chercher('147', { projets }).map(r => r.cle)).toEqual(['projet-1'])
    expect(chercher('fact', { projets, isAdmin: true }).map(r => r.cle)).toEqual(['page-/factures-emises', 'page-/factures-fournisseurs', 'projet-2'])
    expect(chercher('fact', { projets }).map(r => r.cle)).toEqual(['projet-2'])
    expect(chercher('red bull', { projets })[0]).toMatchObject({ genre: 'projet', href: '/projects/1/essai' })
    expect(chercher('', { projets })).toEqual([])
  })
})
