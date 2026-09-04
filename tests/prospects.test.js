import { describe, it, expect } from 'vitest'
import {
  ETAPES, ETAPES_ACTIVES, CANAUX, SOURCES, etape, canal, source,
  prochaineRelance, dernierEchange, retardJours, enRetard,
  trierProspects, resumeProspects,
} from '../lib/prospects'

const AUJ = '2026-09-04'
const ech = (occurred_on, o = {}) => ({ occurred_on, channel: 'email', ...o })

describe('vocabulaires', () => {
  it('les étapes couvrent le cycle décrit, sans « offre »', () => {
    expect(ETAPES.map(e => e.cle)).toEqual(['a_contacter', 'contacte', 'presentation', 'discussion', 'perdu'])
    // Le démarchage se fait avec une présentation ; l'offre vient après, dans
    // la fiche projet du client.
    expect(ETAPES.map(e => e.cle)).not.toContain('offre')
  })

  it('« perdu » n\'est pas une étape active', () => {
    expect(ETAPES_ACTIVES).not.toContain('perdu')
    expect(ETAPES_ACTIVES).toHaveLength(4)
  })

  it('une clé inconnue retombe sur une valeur sûre', () => {
    expect(etape('zzz').cle).toBe('a_contacter')
    expect(canal('zzz').cle).toBe('autre')
    expect(source('zzz')).toBeNull()
  })

  it('les canaux demandés sont tous là', () => {
    const cles = CANAUX.map(c => c.cle)
    for (const c of ['telephone', 'email', 'linkedin', 'whatsapp', 'visite']) expect(cles).toContain(c)
  })

  it('les sources qui appellent un détail le déclarent', () => {
    expect(source('recommandation').demandeDetail).toBe(true)
    expect(source('salon').demandeDetail).toBe(true)
    expect(source('internet').demandeDetail).toBe(false)
    expect(SOURCES.map(s => s.cle)).toContain('appel_entrant')
  })
})

describe('prochaineRelance', () => {
  it('rend la plus proche, pas la plus récemment saisie', () => {
    const l = [
      ech('2026-08-01', { follow_up_on: '2026-09-20' }),
      ech('2026-08-15', { follow_up_on: '2026-09-08' }),
      ech('2026-08-20', { follow_up_on: '2026-09-30' }),
    ]
    expect(prochaineRelance(l).follow_up_on).toBe('2026-09-08')
  })

  // Deux relances en retard ne se traitent pas en parallèle : c'est celle
  // qu'on aurait dû faire en premier qui doit remonter.
  it('entre deux retards, rend le plus ancien', () => {
    const l = [
      ech('2026-07-01', { follow_up_on: '2026-08-20' }),
      ech('2026-07-10', { follow_up_on: '2026-08-05' }),
    ]
    expect(prochaineRelance(l).follow_up_on).toBe('2026-08-05')
  })

  it('ignore les relances déjà honorées', () => {
    const l = [
      ech('2026-08-01', { follow_up_on: '2026-08-10', follow_up_done: true }),
      ech('2026-08-15', { follow_up_on: '2026-09-20' }),
    ]
    expect(prochaineRelance(l).follow_up_on).toBe('2026-09-20')
  })

  it('rend null quand il n\'y a rien à relancer', () => {
    expect(prochaineRelance([])).toBeNull()
    expect(prochaineRelance(null)).toBeNull()
    expect(prochaineRelance([ech('2026-08-01')])).toBeNull()
    expect(prochaineRelance([ech('2026-08-01', { follow_up_on: '2026-08-10', follow_up_done: true })])).toBeNull()
  })
})

describe('dernierEchange', () => {
  it('rend le plus récent par date d\'échange', () => {
    const l = [ech('2026-07-28'), ech('2026-08-12'), ech('2026-08-05')]
    expect(dernierEchange(l).occurred_on).toBe('2026-08-12')
  })
  it('tolère une liste vide', () => {
    expect(dernierEchange([])).toBeNull()
    expect(dernierEchange(undefined)).toBeNull()
  })
})

describe('retardJours', () => {
  it('compte les jours écoulés depuis la relance', () => {
    expect(retardJours('2026-08-26', AUJ)).toBe(9)
    expect(retardJours('2026-09-01', AUJ)).toBe(3)
  })

  // Le jour même n'est pas un retard : la relance est encore à faire.
  it('vaut 0 le jour même, et n\'est pas « en retard »', () => {
    expect(retardJours(AUJ, AUJ)).toBe(0)
    expect(enRetard(AUJ, AUJ)).toBe(false)
  })

  it('est négatif pour une relance à venir', () => {
    expect(retardJours('2026-09-16', AUJ)).toBe(-12)
    expect(enRetard('2026-09-16', AUJ)).toBe(false)
  })

  it('sans date, ni retard ni valeur', () => {
    expect(retardJours(null, AUJ)).toBeNull()
    expect(enRetard(null, AUJ)).toBe(false)
  })

  // Le piège des fuseaux, déjà rencontré sur les factures : `new Date('…')`
  // est du UTC et ferait basculer une relance dès la veille au soir.
  it('ne dépend pas du fuseau', () => {
    expect(retardJours('2026-03-29', '2026-03-30')).toBe(1)   // passage à l'heure d'été
    expect(retardJours('2026-10-24', '2026-10-26')).toBe(2)   // retour à l'heure d'hiver
  })
})

describe('trierProspects — ordre de travail', () => {
  const J = {
    a: [ech('2026-08-12', { follow_up_on: '2026-08-26' })],   // retard 9 j
    b: [ech('2026-08-18', { follow_up_on: '2026-09-01' })],   // retard 3 j
    c: [ech('2026-08-29', { follow_up_on: '2026-09-08' })],   // à venir
    d: [],                                                     // jamais contacté
    e: [ech('2026-07-04', { follow_up_on: '2026-07-20', follow_up_done: true })], // relance faite
  }
  const prospects = [
    { id: 'd', name: 'Théâtre' }, { id: 'c', name: 'Bodmer' },
    { id: 'b', name: 'Beau-Rivage' }, { id: 'e', name: 'Bongénie' }, { id: 'a', name: 'Galeries' },
  ]
  const ordre = trierProspects(prospects, p => J[p.id], AUJ).map(p => p.id)

  it('les retards d\'abord, du plus ancien au plus récent', () => {
    expect(ordre.slice(0, 2)).toEqual(['a', 'b'])
  })

  it('puis les relances à venir', () => {
    expect(ordre[2]).toBe('c')
  })

  it('et ce qui n\'a aucune relance ferme la marche, par ordre alphabétique', () => {
    expect(ordre.slice(3)).toEqual(['e', 'd'])   // Bongénie, Théâtre
  })

  it('ne modifie pas la liste d\'origine', () => {
    const src = [{ id: 'z', name: 'Z' }, { id: 'a', name: 'A' }]
    trierProspects(src, () => [], AUJ)
    expect(src.map(p => p.id)).toEqual(['z', 'a'])
  })
})

describe('resumeProspects', () => {
  const J = { a: [ech('2026-08-12', { follow_up_on: '2026-08-26' })], b: [ech('2026-08-29', { follow_up_on: '2026-09-08' })], c: [] }
  it('compte les actifs, les retards et les relances à venir', () => {
    const r = resumeProspects([
      { id: 'a', stage: 'presentation' },
      { id: 'b', stage: 'discussion' },
      { id: 'c', stage: 'a_contacter' },
    ], p => J[p.id], AUJ)
    expect(r).toEqual({ actifs: 3, retard: 1, aVenir: 1 })
  })

  it('exclut les perdus des actifs, et les convertis de tout', () => {
    const r = resumeProspects([
      { id: 'c', stage: 'perdu' },
      { id: 'c', stage: 'discussion', converted_to_contact_id: 12 },
    ], () => [], AUJ)
    expect(r.actifs).toBe(0)
  })
})
