import { describe, it, expect } from 'vitest'
import {
  REGLAGES_OFFRE, DEFAUTS_OFFRE, normaliserReglagesOffre, defaultQuote,
} from '../lib/quoteDefaults'

describe('normaliserReglagesOffre', () => {
  it('accepte des valeurs valides', () => {
    const r = normaliserReglagesOffre({ ...DEFAUTS_OFFRE, taux_projet: '150', marge_generale: '35' })
    expect(r.taux_projet).toBe('150')
    expect(r.marge_generale).toBe('35')
  })

  // Zéro est un choix, pas une erreur : une marge à 0 % existe, une prestation
  // offerte aussi. C'est la distinction qui compte face aux valeurs illisibles.
  it('accepte zéro', () => {
    const r = normaliserReglagesOffre({ ...DEFAUTS_OFFRE, marge_generale: '0', taux_visite: '0' })
    expect(r.marge_generale).toBe('0')
    expect(r.taux_visite).toBe('0')
  })

  it('retombe sur la valeur d\'origine si absent, vide, illisible ou négatif', () => {
    const r = normaliserReglagesOffre({
      taux_projet: '', taux_visuel: 'abc', taux_visite: null,
      taux_main_oeuvre: undefined, taux_montage: -5, taux_demontage: {}, taux_km: NaN,
    })
    expect(r.taux_projet).toBe('120')
    expect(r.taux_visuel).toBe('140')
    expect(r.taux_visite).toBe('100')
    expect(r.taux_main_oeuvre).toBe('100')
    expect(r.taux_montage).toBe('100')
    expect(r.taux_demontage).toBe('100')
    expect(r.taux_km).toBe('3')
    expect(r.marge_generale).toBe('20')
  })

  it('tolère un réglage totalement absent', () => {
    expect(normaliserReglagesOffre(undefined)).toEqual(DEFAUTS_OFFRE)
    expect(normaliserReglagesOffre(null)).toEqual(DEFAUTS_OFFRE)
    expect(normaliserReglagesOffre({})).toEqual(DEFAUTS_OFFRE)
  })

  it('ignore les clés inconnues plutôt que de les recopier', () => {
    const r = normaliserReglagesOffre({ ...DEFAUTS_OFFRE, taux_inconnu: '999' })
    expect(r.taux_inconnu).toBeUndefined()
    expect(Object.keys(r).sort()).toEqual(REGLAGES_OFFRE.map(x => x.cle).sort())
  })

  it('accepte un nombre autant qu\'une chaîne', () => {
    expect(normaliserReglagesOffre({ taux_km: 4.5 }).taux_km).toBe('4.5')
  })
})

describe('defaultQuote', () => {
  // Le contrat qui compte : ce qui est réglé doit se retrouver dans l'offre.
  it('reporte chaque tarif réglé sur sa ligne', () => {
    const q = defaultQuote({
      taux_projet: '150', taux_visuel: '160', taux_visite: '90',
      taux_main_oeuvre: '110', taux_montage: '95', taux_demontage: '85',
      taux_km: '4', marge_generale: '25',
    })
    expect(q.management.map(l => [l.item, l.rate])).toEqual([
      ['Projet', '150'],
      ['Visuels & développement', '160'],
      ['Visite sur place', '90'],
    ])
    expect(q.logistics.map(l => [l.trajet, l.rate])).toEqual([
      ['Trajet', '4'],
      ['Montage', '95'],
      ['Démontage', '85'],
    ])
    expect(q.general_margin).toBe('25')
  })

  // Sans réglage, l'offre doit être EXACTEMENT celle d'avant l'existence du
  // panneau : sinon la migration change silencieusement les prix de vente.
  it('sans réglage, produit l\'offre historique', () => {
    const q = defaultQuote()
    expect(q.management.map(l => l.rate)).toEqual(['120', '140', '100'])
    expect(q.logistics.map(l => l.rate)).toEqual(['3', '100', '100'])
    expect(q.general_margin).toBe('20')
    expect(q.status).toBe('brouillon')
    expect(q.items).toEqual([])
    expect(q.subcontracting).toEqual([])
  })

  it('donne un identifiant distinct à chaque ligne, et à chaque appel', () => {
    const uids = q => [...q.management, ...q.logistics].map(l => l._uid)
    const a = defaultQuote(), b = defaultQuote()
    const tous = [...uids(a), ...uids(b)]
    expect(new Set(tous).size).toBe(tous.length)
  })

  it('laisse les quantités vides — c\'est le chiffrage qui les pose', () => {
    const q = defaultQuote()
    for (const l of [...q.management, ...q.logistics]) expect(l.quantity).toBe('')
  })
})
