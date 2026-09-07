import { describe, it, expect } from 'vitest'
import { grouperParClient } from '../lib/offres'

const o = (client, name, total = 0) => ({ p: { client, name }, total })

describe('grouperParClient', () => {
  it('rassemble les offres d\'un même client', () => {
    const g = grouperParClient([
      o('Manor SA', 'Pop up', 1000),
      o('Nespresso', 'Vitrine', 500),
      o('Manor SA', 'Corner', 2000),
    ])
    expect(g.map(x => x.client)).toEqual(['Manor SA', 'Nespresso'])
    expect(g[0].items.map(x => x.p.name)).toEqual(['Pop up', 'Corner'])
  })

  // L'ordre à l'intérieur d'un groupe est celui reçu — la page trie déjà par
  // échéance croissante, et c'est le bon ordre de travail une fois qu'on sait
  // de qui on parle.
  it('conserve l\'ordre reçu à l\'intérieur d\'un groupe', () => {
    const g = grouperParClient([o('X', 'premier'), o('X', 'deuxième'), o('X', 'troisième')])
    expect(g[0].items.map(x => x.p.name)).toEqual(['premier', 'deuxième', 'troisième'])
  })

  it('additionne le montant du groupe', () => {
    const g = grouperParClient([o('X', 'a', 1200.5), o('X', 'b', 800), o('Y', 'c', 99)])
    expect(g.find(x => x.client === 'X').total).toBe(2000.5)
    expect(g.find(x => x.client === 'Y').total).toBe(99)
  })

  it('classe les clients par ordre alphabétique', () => {
    const g = grouperParClient([o('Zurich Events', 'z'), o('Éclair SA', 'e'), o('Manor SA', 'm')])
    // Accent en tête : le tri français place « É » avec les « E ».
    expect(g.map(x => x.client)).toEqual(['Éclair SA', 'Manor SA', 'Zurich Events'])
  })

  // Une offre sans client est une anomalie à corriger, pas une catégorie qu'on
  // consulte : elle ferme la marche quoi qu'il arrive.
  it('renvoie « Sans client » en dernier, même alphabétiquement premier', () => {
    const g = grouperParClient([o('', 'orphelin'), o('Alpha', 'a'), o(null, 'autre'), o('  ', 'espaces')])
    expect(g.map(x => x.client)).toEqual(['Alpha', 'Sans client'])
    expect(g[1].items).toHaveLength(3)
  })

  it('tolère une liste vide ou absente', () => {
    expect(grouperParClient([])).toEqual([])
    expect(grouperParClient(null)).toEqual([])
    expect(grouperParClient(undefined)).toEqual([])
  })

  it('ne perd aucune offre', () => {
    const offres = [o('A', '1'), o('B', '2'), o('A', '3'), o('', '4'), o('C', '5')]
    const g = grouperParClient(offres)
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(offres.length)
  })

  // Un client saisi avec une espace en trop ne doit pas créer un second groupe.
  it('ignore les espaces autour du nom', () => {
    const g = grouperParClient([o('Manor SA', 'a'), o('  Manor SA  ', 'b')])
    expect(g).toHaveLength(1)
    expect(g[0].items).toHaveLength(2)
  })
})
