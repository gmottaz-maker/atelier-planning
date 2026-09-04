import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectiveStatus, correspondAuFiltre } from '../lib/customerStatus'

const AUJ = '2026-09-04'

describe('effectiveStatus — facture cliente', () => {
  it('respecte les états définitifs', () => {
    expect(effectiveStatus({ status: 'paid', due_date: '2020-01-01' }, AUJ)).toBe('paid')
    expect(effectiveStatus({ status: 'cancelled', due_date: '2020-01-01' }, AUJ)).toBe('cancelled')
  })

  it('une facture seulement créée n\'est jamais en retard', () => {
    expect(effectiveStatus({ status: 'created', due_date: '2020-01-01' }, AUJ)).toBe('created')
  })

  it('bascule en retard une envoyée ou une en attente échue', () => {
    expect(effectiveStatus({ status: 'sent', due_date: '2026-08-01' }, AUJ)).toBe('overdue')
    expect(effectiveStatus({ status: 'pending', due_date: '2026-08-01' }, AUJ)).toBe('overdue')
  })

  it('une échéance FIXÉE AU JOUR MÊME n\'est pas en retard', () => {
    expect(effectiveStatus({ status: 'sent', due_date: AUJ }, AUJ)).toBe('sent')
  })

  it('une échéance au lendemain non plus', () => {
    expect(effectiveStatus({ status: 'sent', due_date: '2026-09-05' }, AUJ)).toBe('sent')
  })

  it('sans échéance, l\'état stocké est conservé', () => {
    expect(effectiveStatus({ status: 'sent', due_date: null }, AUJ)).toBe('sent')
    expect(effectiveStatus({ status: 'pending' }, AUJ)).toBe('pending')
  })

  it('tolère une facture absente', () => {
    expect(effectiveStatus(null, AUJ)).toBe('created')
  })
})

describe('correspondAuFiltre — filtres de la liste', () => {
  const envoyeeEnRetard = { status: 'sent',      due_date: '2026-08-01' }
  const envoyee         = { status: 'sent',      due_date: '2026-12-01' }
  const attenteEnRetard = { status: 'pending',   due_date: '2026-08-01' }
  const creee           = { status: 'created',   due_date: '2026-08-01' }
  const payee           = { status: 'paid',      due_date: '2026-08-01' }
  const annulee         = { status: 'cancelled', due_date: '2026-08-01' }
  const toutes  = [envoyeeEnRetard, envoyee, attenteEnRetard, creee, payee, annulee]
  const gardees = f => toutes.filter(i => correspondAuFiltre(i, f, AUJ))

  // Le défaut corrigé : l'égalité stricte sur le statut CALCULÉ sortait les
  // factures échues du filtre où on les cherche.
  it('« Envoyée » garde ses factures même échues', () => {
    expect(gardees('sent')).toEqual([envoyeeEnRetard, envoyee])
  })

  it('« En attente » garde les siennes même échues', () => {
    expect(gardees('pending')).toEqual([attenteEnRetard])
  })

  it('« En retard » les rassemble, quel que soit leur état stocké', () => {
    expect(gardees('overdue')).toEqual([envoyeeEnRetard, attenteEnRetard])
  })

  it('les états définitifs restent des égalités', () => {
    expect(gardees('paid')).toEqual([payee])
    expect(gardees('cancelled')).toEqual([annulee])
    expect(gardees('created')).toEqual([creee])
  })

  it('« Toutes » ne retire rien, un filtre inconnu n\'ampute pas la liste', () => {
    expect(gardees('all')).toEqual(toutes)
    expect(gardees(null)).toEqual(toutes)
  })

  // Une facture créée mais pas envoyée n'est ni en retard, ni « à encaisser » :
  // rien n'est encore parti au client.
  it('une créée échue ne tombe pas dans « En retard »', () => {
    expect(correspondAuFiltre(creee, 'overdue', AUJ)).toBe(false)
  })
})

// Le second défaut de cette page vivait dans l'HORLOGE, pas dans une date
// injectée : `new Date('2026-09-04')` est un instant UTC, comparé à `new Date()`
// en heure locale. Avec une date injectée les deux implémentations donnent le
// même résultat — il faut figer l'horloge pour le mettre en évidence.
//
// La fenêtre du bug : en Suisse d'été (UTC+2), minuit UTC du jour d'échéance
// tombe à 02h00 locales. À partir de 02h00 le jour MÊME de l'échéance, la
// variante naïve déclarait donc la facture en retard — alors qu'elle est due
// ce jour-là et pas encore dépassée. C'est le deuxième test ci-dessous qui
// l'attrape ; les deux autres bornent l'intervalle.
describe('effectiveStatus — pas de bascule prématurée', () => {
  afterEach(() => vi.useRealTimers())
  const instant = (iso) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }

  it('la veille au soir, pas en retard', () => {
    instant('2026-09-03T20:30:00Z')   // 22h30 à Zurich, le 3
    expect(effectiveStatus({ status: 'sent', due_date: '2026-09-04' })).toBe('sent')
  })

  it('le jour même après 02h locales, toujours pas en retard', () => {
    instant('2026-09-04T00:30:00Z')   // 02h30 à Zurich, le 4 — la fenêtre du bug
    expect(effectiveStatus({ status: 'sent', due_date: '2026-09-04' })).toBe('sent')
  })

  it('le lendemain, en retard', () => {
    instant('2026-09-05T08:00:00Z')
    expect(effectiveStatus({ status: 'sent', due_date: '2026-09-04' })).toBe('overdue')
  })
})
