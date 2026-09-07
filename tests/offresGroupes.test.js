import { describe, it, expect } from 'vitest'
import { grouperParClient } from '../lib/offres'

const o = (client, name, total = 0, status = 'envoye') => ({ p: { client, name }, total, status })

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

  // Deux totaux, parce que ce sont deux questions : ce qui est acquis, et ce
  // qui est encore en jeu. Les additionner donnait un chiffre qui ne répondait
  // à ni l'une ni l'autre.
  it('sépare l\'accepté de ce qui est encore en circulation', () => {
    const g = grouperParClient([
      o('X', 'a', 1000, 'accepte'),
      o('X', 'b', 500, 'envoye'),
      o('X', 'c', 300, 'brouillon'),
      o('X', 'd', 200, 'a_corriger'),
    ])
    expect(g[0].valide).toBe(1000)
    expect(g[0].enAttente).toBe(1000)   // envoyé + brouillon + à corriger
  })

  // Une offre refusée n'est ni acquise ni en jeu : elle ne doit gonfler aucun
  // des deux chiffres.
  it('exclut le refusé des deux totaux', () => {
    const g = grouperParClient([
      o('X', 'a', 1000, 'accepte'),
      o('X', 'b', 500, 'envoye'),
      o('X', 'perdue', 9999, 'refuse'),
    ])
    expect(g[0].valide).toBe(1000)
    expect(g[0].enAttente).toBe(500)
    expect(g[0].refuse).toBe(9999)
  })

  // Le refusé est compté à part et non ignoré : sans lui, la somme des lignes
  // affichées ne correspondrait à rien de visible dans le bandeau.
  it('les trois totaux couvrent toutes les lignes du groupe', () => {
    const offres = [
      o('X', 'a', 100, 'accepte'), o('X', 'b', 200, 'envoye'),
      o('X', 'c', 300, 'brouillon'), o('X', 'd', 400, 'refuse'),
      o('X', 'e', 500, 'a_corriger'),
    ]
    const g = grouperParClient(offres)[0]
    expect(g.valide + g.enAttente + g.refuse).toBe(1500)
  })

  it('un statut inconnu compte comme en attente, jamais comme acquis', () => {
    const g = grouperParClient([o('X', 'a', 700, 'zzz'), o('X', 'b', 100, undefined)])
    expect(g[0].valide).toBe(0)
    expect(g[0].enAttente).toBe(800)
  })

  it('un groupe sans montant rend trois zéros', () => {
    const g = grouperParClient([o('X', 'a')])
    expect([g[0].valide, g[0].enAttente, g[0].refuse]).toEqual([0, 0, 0])
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
