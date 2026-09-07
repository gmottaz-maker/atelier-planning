import { describe, it, expect } from 'vitest'
import {
  SANS_CATEGORIE, construireArbre, nbSansCategorie,
  articlesDe, cheminDe, impactSuppression,
} from '../lib/catalogCategories'

const CATS = [
  { id: 1, name: 'Bois', parent_id: null },
  { id: 2, name: 'Panneaux', parent_id: 1 },
  { id: 3, name: 'Massif', parent_id: 1 },
  { id: 4, name: 'Quincaillerie', parent_id: null },
  { id: 5, name: 'Éclairage', parent_id: null },
  { id: 9, name: 'Vide', parent_id: null },
]
const a = (id, category_id, usage_count = 0) => ({ id, category_id, usage_count, name: `art${id}` })

describe('construireArbre — l\'ordre suit l\'usage', () => {
  // « Quincaillerie » sert tous les jours et n'a aucune raison d'attendre en
  // bas de liste sous prétexte que son nom commence par Q.
  it('classe les racines par usage décroissant', () => {
    const arbre = construireArbre(CATS, [a(1, 4, 50), a(2, 5, 10), a(3, 2, 3)])
    expect(arbre.map(c => c.name)).toEqual(['Quincaillerie', 'Éclairage', 'Bois'])
  })

  // C'est le comportement qui rend le classement utilisable dès le premier
  // jour : aucun réglage à faire, il se construit tout seul ensuite.
  it('retombe sur l\'alphabet tant que rien n\'a servi', () => {
    const arbre = construireArbre(CATS, [a(1, 1), a(2, 4), a(3, 5)])
    expect(arbre.map(c => c.name)).toEqual(['Bois', 'Éclairage', 'Quincaillerie'])
  })

  // Sans la remontée, une catégorie dont tout le contenu est rangé en
  // sous-catégories afficherait zéro et tomberait en bas — alors qu'elle est
  // la plus sollicitée.
  it('fait remonter l\'usage des sous-catégories au parent', () => {
    const arbre = construireArbre(CATS, [a(1, 2, 40), a(2, 3, 30), a(3, 4, 20)])
    expect(arbre[0].name).toBe('Bois')
    expect(arbre[0].usage).toBe(70)
  })

  it('compte les articles du parent et de ses enfants', () => {
    const arbre = construireArbre(CATS, [a(1, 1), a(2, 2), a(3, 2), a(4, 3)])
    expect(arbre.find(c => c.name === 'Bois').nb).toBe(4)
  })

  it('ordonne aussi les sous-catégories par usage', () => {
    const arbre = construireArbre(CATS, [a(1, 2, 5), a(2, 3, 90)])
    expect(arbre[0].enfants.map(e => e.name)).toEqual(['Massif', 'Panneaux'])
  })

  // C'est ce qui évite d'avoir à typer les catégories : en regardant les
  // heures, « Bois » n'a rien à faire dans l'arbre.
  it('masque les catégories vides pour le filtre courant', () => {
    const arbre = construireArbre(CATS, [a(1, 4)])
    expect(arbre.map(c => c.name)).toEqual(['Quincaillerie'])
  })

  it('peut tout montrer quand on le demande', () => {
    const arbre = construireArbre(CATS, [], { masquerVides: false })
    expect(arbre.map(c => c.name)).toContain('Vide')
  })

  it('tolère des listes vides ou absentes', () => {
    expect(construireArbre(null, null)).toEqual([])
    expect(construireArbre([], [])).toEqual([])
  })
})

describe('articlesDe', () => {
  const ARTS = [a(1, 1), a(2, 2), a(3, 3), a(4, 4), a(5, null)]

  // On clique sur « Bois » pour voir TOUT le bois, pas pour voir les seuls
  // articles qu'on aurait oublié de ranger plus finement.
  it('une catégorie parente montre le contenu de ses sous-catégories', () => {
    expect(articlesDe(1, ARTS, CATS).map(x => x.id).sort()).toEqual([1, 2, 3])
  })

  it('une sous-catégorie ne montre qu\'elle-même', () => {
    expect(articlesDe(2, ARTS, CATS).map(x => x.id)).toEqual([2])
  })

  it('« sans catégorie » isole les articles non rangés', () => {
    expect(articlesDe(SANS_CATEGORIE, ARTS, CATS).map(x => x.id)).toEqual([5])
  })

  it('aucune sélection rend tout', () => {
    expect(articlesDe(null, ARTS, CATS)).toHaveLength(5)
  })

  it('compte les articles sans catégorie', () => {
    expect(nbSansCategorie(ARTS)).toBe(1)
    expect(nbSansCategorie([])).toBe(0)
  })
})

describe('cheminDe', () => {
  it('affiche le parent devant l\'enfant', () => {
    expect(cheminDe(2, CATS)).toBe('Bois · Panneaux')
  })
  it('une racine n\'a pas de préfixe', () => {
    expect(cheminDe(1, CATS)).toBe('Bois')
  })
  it('une catégorie disparue ne casse rien', () => {
    expect(cheminDe(999, CATS)).toBeNull()
    expect(cheminDe(null, CATS)).toBeNull()
  })
})

// La suppression emporte les articles : c'est le comportement demandé, et le
// plus destructeur des trois possibles. Ces nombres servent à ce que la
// confirmation dise ce qui disparaît, au lieu de « êtes-vous sûr ? ».
describe('impactSuppression', () => {
  const ARTS = [a(1, 1), a(2, 2), a(3, 3), a(4, 4)]

  it('compte les sous-catégories ET les articles emportés', () => {
    expect(impactSuppression(1, CATS, ARTS)).toEqual({ sousCategories: 2, articles: 3 })
  })

  it('une catégorie sans enfant ne compte que ses propres articles', () => {
    expect(impactSuppression(4, CATS, ARTS)).toEqual({ sousCategories: 0, articles: 1 })
  })

  it('une catégorie vide n\'emporte rien', () => {
    expect(impactSuppression(9, CATS, ARTS)).toEqual({ sousCategories: 0, articles: 0 })
  })

  it('n\'attribue jamais les articles sans catégorie à une suppression', () => {
    expect(impactSuppression(1, CATS, [a(9, null)]).articles).toBe(0)
  })
})
