import { describe, it, expect } from 'vitest'
import {
  coutKm, coutsKmFlotte, normaliserTransport, normaliserCouts, lignesTransport, margeTransport, ligneForfait, nombre, transportPrevu,
} from '../lib/transport'
import { lignesDevis, totauxDevis } from '../lib/quoteLines'

// Les chiffres réels donnés le 11 septembre 2026.
const COUTS = normaliserCouts({
  prix_diesel: 2.26,
  vehicules: {
    master: { leasing_mensuel: 479, taxe: 700, assurance: 2300, vignette: 40, pneus: 400, service: 800, tcs: 107, km_annuels: 10000, conso: 10 },
    vito: { taxe: 700, assurance: 1000, vignette: 40, pneus: 400, service: 800, tcs: 107, km_annuels: 10000, conso: 9.3 },
  },
})

describe('coût au km', () => {
  it('Master : leasing compris, environ 1,24 CHF/km', () => {
    const c = coutKm(COUTS.vehicules.master, 2.26)
    expect(c.fixeAnnuel).toBe(10095)
    expect(c.fixeKm).toBeCloseTo(1.01, 2)
    expect(c.carburantKm).toBeCloseTo(0.226, 3)
    expect(c.totalKm).toBeCloseTo(1.236, 2)
  })
  it('Vito : sans leasing, environ 0,51 CHF/km', () => {
    const c = coutKm(COUTS.vehicules.vito, 2.26)
    expect(c.fixeAnnuel).toBe(3047)
    expect(c.totalKm).toBeCloseTo(0.515, 2)
  })
  it('flotte : moyenne pondérée par les km', () => {
    expect(coutsKmFlotte(COUTS).moyenne).toBeCloseTo(0.875, 2)
  })
  // Un coût au km inventé serait pire que pas de coût.
  it('rend null quand il manque les km, la consommation ou le diesel', () => {
    expect(coutKm({ ...COUTS.vehicules.master, km_annuels: null }, 2.26).totalKm).toBe(null)
    expect(coutKm({ ...COUTS.vehicules.master, conso: null }, 2.26).totalKm).toBe(null)
    expect(coutKm(COUTS.vehicules.master, null).totalKm).toBe(null)
  })
  it('lit les nombres tels qu\'on les tape', () => {
    expect(nombre('2,26')).toBe(2.26)
    expect(nombre("10'000")).toBe(10000)
    expect(nombre('')).toBe(null)
    expect(nombre('-3')).toBe(null)
  })
})

describe('réglages', () => {
  it('donne un identifiant à un véhicule ou un forfait qui n\'en a pas', () => {
    const t = normaliserTransport({ vehicules: [{ nom: 'Renault Master' }], forfaits: [{ nom: 'Genève', prix: '360', km: '120' }] })
    expect(t.vehicules[0]).toEqual({ id: 'renault-master', nom: 'Renault Master' })
    expect(t.forfaits[0]).toEqual({ id: 'geneve', nom: 'Genève', prix: 360, km: 120, duree: null })
  })
  it('écarte les entrées sans nom, supporte un réglage absent', () => {
    expect(normaliserTransport({ vehicules: [{ nom: '' }] }).vehicules).toEqual([])
    expect(normaliserTransport(null)).toEqual({ vehicules: [], forfaits: [] })
    expect(normaliserCouts(null)).toEqual({ prix_diesel: null, vitesse_moyenne: null, vehicules: {} })
  })
})

describe('lignes de transport d\'une offre', () => {
  const offre = {
    logistics: [
      { trajet: 'Trajet', rate: 3, quantity: 58, unit: 'km', vehicule: 'master' },
      { ...ligneForfait({ id: 'zurich', nom: 'Zurich', prix: 850, km: 455 }), vehicule: 'vito' },
      { trajet: 'Montage', rate: 100, quantity: 6, unit: 'heure(s)' },
      { trajet: 'Livraison', rate: 300, quantity: 1, unit: 'pce' },
    ],
  }
  const lignes = lignesTransport(offre)

  it('garde les km et les forfaits, pas les heures ni les autres lignes', () => {
    expect(lignes.map(l => [l.type, l.km, l.recette, l.vehicule])).toEqual([
      ['km', 58, 174, 'master'],
      ['forfait', 455, 850, 'vito'],
    ])
  })
  // La distance est copiée à l'insertion : changer le forfait dans les
  // réglages ne réécrit pas les offres déjà faites.
  it('lit la distance copiée dans la ligne de forfait', () => {
    expect(ligneForfait({ id: 'geneve', nom: 'Genève', prix: 360, km: 120 })).toMatchObject({ km: 120, forfait: 'geneve', unit: 'pce', rate: '360' })
  })
  it('ne change rien au document ni au total : le véhicule est une donnée interne', () => {
    const titres = lignesDevis(offre).filter(l => l.kind === 'line').map(l => l.title)
    expect(titres).toEqual(['Trajet', 'Forfait Zurich', 'Montage', 'Livraison'])
    expect(totauxDevis(offre).total).toBe(174 + 850 + 600 + 300)
  })
})

describe('margeTransport', () => {
  const flotte = coutsKmFlotte(COUTS)

  it('retranche le véhicule choisi et le temps de conduite', () => {
    const m = margeTransport({
      lignes: [{ km: 455, recette: 850, vehicule: 'master' }],
      flotte, coutConduite: 665,
    })
    expect(m.coutVehicules).toBeCloseTo(455 * 1.236, 0)
    expect(m.marge).toBeCloseTo(850 - 562 - 665, 0)
    expect(m.marge).toBeLessThan(0)
  })
  it('compte une ligne sans véhicule au coût moyen, et le signale', () => {
    const m = margeTransport({ lignes: [{ km: 100, recette: 300, vehicule: null }], flotte })
    expect(m.kmSansVehicule).toBe(100)
    expect(m.coutVehicules).toBeCloseTo(87.5, 0)
    expect(m.parVehicule.moyenne.km).toBe(100)
  })
  it('écarte et signale les km dont aucun coût n\'est connu', () => {
    const m = margeTransport({ lignes: [{ km: 50, recette: 150, vehicule: 'camion' }], flotte: { par: {}, moyenne: null } })
    expect(m).toMatchObject({ kmSansCout: 50, coutVehicules: 0, marge: 150 })
  })
  it('donne la marge par km', () => {
    expect(margeTransport({ lignes: [{ km: 100, recette: 300, vehicule: 'vito' }], flotte }).parKm).toBeCloseTo(2.49, 1)
  })
})

// Les forfaits du 11 septembre : Lausanne 85.–, Genève 370.–, Zurich 1 000.–.
describe('transportPrevu — 1 ou 2 personnes dans la voiture', () => {
  const flotte = coutsKmFlotte(COUTS)
  const zurich = personnes => ({ ...ligneForfait({ id: 'zurich', nom: 'Zurich', prix: 1000, km: 455, duree: 285 }), vehicule: 'master', personnes })
  const prevu = personnes => transportPrevu({ lignes: lignesTransport({ logistics: [zurich(personnes)] }), flotte, vitesse: 70, coutHoraire: 70 })

  it('le forfait copie aussi sa durée, et part pour une personne', () => {
    expect(ligneForfait({ id: 'z', nom: 'Z', prix: 1, km: 1, duree: 285 })).toMatchObject({ duree: 285, personnes: 1 })
  })
  it('à deux, chaque minute de route coûte deux fois', () => {
    expect(prevu(2).coutTemps).toBeCloseTo(2 * 285 / 60 * 70, 0)
    expect(prevu(1).coutTemps).toBeCloseTo(285 / 60 * 70, 0)
  })
  it('dit si le trajet gagne de l\'argent', () => {
    expect(prevu(1).marge).toBeGreaterThan(0)    // 1000 − 562 − 333
    expect(prevu(2).marge).toBeLessThan(0)       // 1000 − 562 − 665
  })
  it('estime le temps d\'une ligne au km à la vitesse moyenne', () => {
    const l = lignesTransport({ logistics: [{ trajet: 'Trajet', rate: 3, quantity: 140, unit: 'km', vehicule: 'vito', personnes: 2 }] })
    const p = transportPrevu({ lignes: l, flotte, vitesse: 70, coutHoraire: 70 })
    expect(p.lignes[0]).toMatchObject({ minutes: 120, personnes: 2, coutTemps: 280 })
  })
  // Sans coût horaire de conduite, le temps n'est pas compté zéro : il manque.
  it('signale un coût manquant plutôt que de le compter zéro', () => {
    const p = transportPrevu({ lignes: lignesTransport({ logistics: [zurich(2)] }), flotte, vitesse: 70, coutHoraire: null })
    expect(p.complet).toBe(false)
    expect(p.lignes[0].coutTemps).toBe(null)
  })
  it('part d\'une personne quand rien n\'est dit', () => {
    expect(lignesTransport({ logistics: [{ unit: 'km', quantity: 10, rate: 3 }] })[0].personnes).toBe(1)
  })
})
