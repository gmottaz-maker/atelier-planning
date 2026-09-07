import { describe, it, expect } from 'vitest'
import {
  REGLAGES_OFFRE, DEFAUTS_OFFRE, normaliserReglagesOffre, defaultQuote,
  doitSemerOffreVierge,
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

// Cette fonction existe parce que la condition, écrite à la main dans un
// useEffect, a effacé DEUX offres. Chaque cas ci-dessous correspond à un
// moment réel de la vie d'un devis.
describe('doitSemerOffreVierge', () => {
  const cas = (o = {}) => doitSemerOffreVierge({
    tarifsCharges: true, dejaSeme: false, offreEnregistree: false, offreTouchee: false, ...o,
  })

  it('sème sur un projet neuf, une fois les tarifs chargés', () => {
    expect(cas()).toBe(true)
  })

  it('attend les tarifs plutôt que de semer les valeurs du code', () => {
    expect(cas({ tarifsCharges: false })).toBe(false)
  })

  it('n\'écrase jamais une offre déjà enregistrée', () => {
    expect(cas({ offreEnregistree: true })).toBe(false)
  })

  it('n\'écrase jamais ce qui vient d\'être tapé', () => {
    expect(cas({ offreTouchee: true })).toBe(false)
  })

  // LE bug : enregistrer remet « touchée » à faux. Sans `dejaSeme`, l'effet se
  // relançait juste après la sauvegarde, sur un projet toujours considéré
  // comme « sans offre enregistrée », et remplaçait le travail par un vide.
  it('ne sème pas une seconde fois après un enregistrement', () => {
    // L'état exact au retour du serveur : plus rien n'est « touché », le
    // projet n'a pas encore été rechargé, mais on a déjà semé.
    expect(cas({ dejaSeme: true, offreTouchee: false, offreEnregistree: false })).toBe(false)
  })

  it('« déjà semé » l\'emporte sur toutes les autres conditions', () => {
    expect(cas({ dejaSeme: true })).toBe(false)
    expect(cas({ dejaSeme: true, tarifsCharges: false })).toBe(false)
    expect(cas({ dejaSeme: true, offreEnregistree: true })).toBe(false)
  })

  it('reste réessayable tant que les tarifs ne sont pas là', () => {
    // Le drapeau « déjà semé » ne doit être posé qu'au moment où l'on sème
    // vraiment, sinon un premier passage trop tôt condamnerait le suivant.
    expect(cas({ tarifsCharges: false })).toBe(false)
    expect(cas({ tarifsCharges: true })).toBe(true)
  })
})
