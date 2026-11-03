import { describe, it, expect } from 'vitest'
import { doitAppliquerProjet, offreDuProjet } from '../lib/ficheProjet'

const uid = () => 'i_test'

describe('doitAppliquerProjet', () => {
  it('applique au premier rendu', () => {
    expect(doitAppliquerProjet({ arrivant: { id: 'a' }, courant: null })).toBe(true)
  })

  it('ignore une réponse en erreur', () => {
    expect(doitAppliquerProjet({ arrivant: { error: 'boum' }, courant: null })).toBe(false)
    expect(doitAppliquerProjet({ arrivant: undefined, courant: null })).toBe(false)
  })

  it('applique quand on change de projet', () => {
    const courant  = { id: 'a', updated_at: '2026-11-03T10:00:00Z' }
    const arrivant = { id: 'b', updated_at: '2026-01-01T10:00:00Z' }
    expect(doitAppliquerProjet({ arrivant, courant })).toBe(true)
  })

  it('applique une version plus récente', () => {
    const courant  = { id: 'a', updated_at: '2026-11-03T10:00:00Z' }
    const arrivant = { id: 'a', updated_at: '2026-11-03T10:05:00Z' }
    expect(doitAppliquerProjet({ arrivant, courant })).toBe(true)
  })

  // Le cas qui coûte une offre : on vient d'enregistrer, la revalidation
  // lancée au montage se pose après et rapporte la version d'avant.
  it('ignore une version plus ancienne que ce qui est affiché', () => {
    const courant  = { id: 'a', updated_at: '2026-11-03T10:05:00Z' }
    const arrivant = { id: 'a', updated_at: '2026-11-03T10:00:00Z' }
    expect(doitAppliquerProjet({ arrivant, courant })).toBe(false)
  })

  it('ignore une version de même date — rien à réécrire', () => {
    const p = { id: 'a', updated_at: '2026-11-03T10:00:00Z' }
    expect(doitAppliquerProjet({ arrivant: { ...p }, courant: p })).toBe(false)
  })

  it('garde ce qui est affiché quand la date manque', () => {
    const courant = { id: 'a', updated_at: '2026-11-03T10:00:00Z' }
    expect(doitAppliquerProjet({ arrivant: { id: 'a' }, courant })).toBe(false)
  })
})

describe('offreDuProjet', () => {
  it('renvoie null sans offre', () => {
    expect(offreDuProjet({}, uid)).toBeNull()
    expect(offreDuProjet({ quote_data: null }, uid)).toBeNull()
    expect(offreDuProjet(null, uid)).toBeNull()
  })

  // « Pas d'offre » et « une offre vide » n'autorisent pas la même chose :
  // seul le premier laisse semer le modèle par défaut.
  it('renvoie null pour une offre enregistrée sans aucune ligne', () => {
    expect(offreDuProjet({ quote_data: { items: [], management: [] } }, uid)).toBeNull()
  })

  it('lit le format courant et comble les champs absents', () => {
    const r = offreDuProjet({ quote_data: { items: [{ _uid: 'x' }] } }, uid)
    expect(r.migree).toBe(false)
    expect(r.offre.items).toHaveLength(1)
    expect(r.offre.management).toEqual([])
    expect(r.offre.status).toBe('brouillon')
    expect(r.offre.general_margin).toBe('')
  })

  it('conserve statut, numéro et marge générale', () => {
    const r = offreDuProjet({ quote_data: {
      management: [{ _uid: 'm' }], status: 'accepte', number: 'OF-12', general_margin: '15',
    } }, uid)
    expect(r.offre.status).toBe('accepte')
    expect(r.offre.number).toBe('OF-12')
    expect(r.offre.general_margin).toBe('15')
  })

  it('garde une marge générale à zéro', () => {
    const r = offreDuProjet({ quote_data: { items: [{ _uid: 'x' }], general_margin: 0 } }, uid)
    expect(r.offre.general_margin).toBe(0)
  })

  it('migre l\'ancien format à plat en un item « Général »', () => {
    const r = offreDuProjet({ quote_data: {
      purchases: [{ _uid: 'p' }], labor: [{ _uid: 'l' }], logistics: [{ _uid: 'g' }],
    } }, uid)
    expect(r.migree).toBe(true)
    expect(r.offre.items).toHaveLength(1)
    expect(r.offre.items[0].name).toBe('Général')
    expect(r.offre.items[0].purchases).toHaveLength(1)
    expect(r.offre.items[0].labor).toHaveLength(1)
    expect(r.offre.logistics).toHaveLength(1)
  })

  it('migre une logistique seule sans fabriquer d\'item vide', () => {
    const r = offreDuProjet({ quote_data: { logistics: [{ _uid: 'g' }] } }, uid)
    expect(r.migree).toBe(true)
    expect(r.offre.items).toEqual([])
  })
})
