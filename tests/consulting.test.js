import { describe, it, expect } from 'vitest'
import {
  compensationDevis, compensationConsommee, soldeConsulting, soldesParClient, ligneCompensation, CODE_CONSULTING,
} from '../lib/consulting'
import { lignesDevis, totauxDevis } from '../lib/quoteLines'

const compensation = h => ({ item: 'Compensation consulting', rate: 160, quantity: String(h), unit: 'heure(s)', hidden: true, compensation: true })

describe('compensationDevis', () => {
  it('lit les heures des lignes marquées, et seulement elles', () => {
    const q = { management: [compensation(1.5), { item: 'Projet', rate: 140, quantity: '3', unit: 'heure(s)' }] }
    expect(compensationDevis(q)).toBe(90)
  })
  it('accepte la virgule et une ligne sans unité, ignore une quantité vide', () => {
    expect(compensationDevis({ management: [{ compensation: true, quantity: '0,5' }, { compensation: true, quantity: '' }] })).toBe(30)
  })
  it('ignore une compensation saisie en jours', () => {
    expect(compensationDevis({ management: [{ compensation: true, quantity: '1', unit: 'jour(s)' }] })).toBe(0)
  })
  it('une offre refusée rend ses heures', () => {
    expect(compensationConsommee({ status: 'refuse', management: [compensation(2)] })).toBe(0)
    expect(compensationConsommee({ status: 'envoye', management: [compensation(2)] })).toBe(120)
  })
})

describe('soldeConsulting', () => {
  const heures = [
    { activite: CODE_CONSULTING, minutes: 90, project_id: null },
    { activite: CODE_CONSULTING, minutes: 30, project_id: null },
    { activite: 13, minutes: 60, project_id: null },        // relation client : ne se récupère pas
  ]
  const projets = [
    { id: 'a', numero: 150, name: 'Stand', quote_data: { status: 'accepte', management: [compensation(1)] } },
    { id: 'b', numero: 151, name: 'Vitrine', quote_data: { status: 'brouillon', management: [compensation(0.5)] } },
    { id: 'c', numero: 152, name: 'Refusé', quote_data: { status: 'refuse', management: [compensation(2)] } },
  ]

  it('retranche toute offre non refusée, envoyée ou en brouillon', () => {
    expect(soldeConsulting({ heures, projets })).toMatchObject({ consulte: 120, compense: 90, solde: 30 })
  })
  it('ne compte pas la relation client', () => {
    expect(soldeConsulting({ heures: [heures[2]] }).consulte).toBe(0)
  })
  it('laisse de côté le projet à l\'écran, lu à part sur sa version non enregistrée', () => {
    expect(soldeConsulting({ heures, projets, exclure: 'a' })).toMatchObject({ compense: 30, solde: 90 })
  })
  it('détaille ce qui a été compensé, projet par projet', () => {
    expect(soldeConsulting({ heures, projets }).parProjet.map(p => [p.numero, p.minutes])).toEqual([[150, 60], [151, 30]])
  })
  it('peut devenir négatif quand on a compensé plus que noté', () => {
    expect(soldeConsulting({ heures: [], projets }).solde).toBe(-90)
  })
})

describe('soldesParClient', () => {
  it('regroupe par fiche client, le plus gros solde d\'abord', () => {
    const s = soldesParClient({
      heures: [
        { contact_id: 3, activite: CODE_CONSULTING, minutes: 90 },
        { contact_id: 9, activite: CODE_CONSULTING, minutes: 240 },
      ],
      projets: [{ id: 'p', client_contact_id: 3, quote_data: { status: 'envoye', management: [compensation(1)] } }],
    })
    expect(s.map(x => [x.contact_id, x.solde])).toEqual([[9, 240], [3, 30]])
  })
})

describe('ligneCompensation', () => {
  const ligne = ligneCompensation({ minutes: 90, tarif: 160 })

  it('est une ligne de Gestion masquée, marquée, au tarif du consulting', () => {
    expect(ligne).toMatchObject({ quantity: '1.5', rate: '160', unit: 'heure(s)', hidden: true, compensation: true, activite: 14 })
  })
  // Le cœur de la demande : invisible sur le document, comprise dans le prix.
  it('disparaît du document mais pas du total', () => {
    const q = { management: [{ item: 'Projet', rate: 140, quantity: '2', unit: 'heure(s)' }, ligne] }
    expect(lignesDevis(q).filter(l => l.kind === 'line').map(l => l.title)).toEqual(['Projet'])
    expect(totauxDevis(q).total).toBe(280 + 240)
  })
  it('se relit comme une compensation', () => {
    expect(compensationDevis({ management: [ligne] })).toBe(90)
  })
})
