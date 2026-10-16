import { describe, it, expect } from 'vitest'
import {
  TYPES, typeDe, DEMIS, libelleDemi, lundiDe, semaineOuvree, validerBloc,
  blocsDe, minutesPlacees, placeLibre, typeParDefaut, demiJourneesAtelier,
  parJourEtPersonne, minutesParProjet, prochainJourTravaille, estJourTravaille,
} from '../lib/agenda'

const ACTIVITES = [
  { code: 10, libelle: 'Gestion de projet', actif: true },
  { code: 20, libelle: 'Assemblage', actif: true },
  { code: 29, libelle: 'Ancienne activité', actif: false },
]
const PROJETS = [{ id: 'p1' }, { id: 'p2' }]
const bloc = (o = {}) => ({ date: '2026-11-02', demi: 'am', type: 'production', project_id: 'p1', activite: 20, ...o })

describe('semaine', () => {
  it('ne contient que lundi, mardi, jeudi, vendredi', () => {
    // Le mercredi n'est pas une case grisée : il n'est pas là.
    expect(semaineOuvree('2026-11-04')).toEqual(['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'])
  })

  it('part du lundi quel que soit le jour donné', () => {
    expect(lundiDe('2026-11-06')).toBe('2026-11-02')
    expect(lundiDe('2026-11-02')).toBe('2026-11-02')
    expect(lundiDe('pas une date')).toBeNull()
  })

  it('saute le mercredi et le week-end pour trouver le prochain jour', () => {
    // Un samedi, la semaine en cours est finie : ouvrir l'agenda dessus ne
    // montrerait que des jours passés.
    expect(prochainJourTravaille('2026-10-03')).toBe('2026-10-05')  // samedi → lundi
    expect(prochainJourTravaille('2026-11-04')).toBe('2026-11-05')  // mercredi → jeudi
    expect(prochainJourTravaille('2026-11-05')).toBe('2026-11-05')  // un jeudi reste
    expect(estJourTravaille('2026-11-04')).toBe(false)
    expect(estJourTravaille('2026-11-05')).toBe(true)
  })

  it('nomme les demi-journées en français', () => {
    expect(DEMIS).toEqual(['am', 'pm'])
    expect(libelleDemi('am')).toBe('matin')
    expect(libelleDemi('pm')).toBe('après-midi')
  })
})

describe('validerBloc', () => {
  const ok = (o) => validerBloc(bloc(o), { activites: ACTIVITES, projets: PROJETS })

  it('accepte un bloc de production complet', () => {
    const r = ok()
    expect(r.ok).toBe(true)
    expect(r.valeur).toEqual({
      date: '2026-11-02', demi: 'am', type: 'production', project_id: 'p1', activite: 20,
      minutes: null, titre: null, lieu: null, note: null, fige: false,
    })
  })

  it('exige un projet ET une activité pour la production', () => {
    // Sans projet ni activité, le bloc occupe une demi-journée sans avancer
    // une seule heure vendue : la jauge continuerait de réclamer le travail.
    expect(ok({ project_id: null }).erreur).toMatch(/projet/)
    expect(ok({ activite: null }).erreur).toMatch(/activité/)
  })

  it('laisse l\'administratif et l\'entretien sans projet', () => {
    expect(validerBloc(bloc({ type: 'admin', project_id: null, activite: null }), { activites: ACTIVITES }).ok).toBe(true)
    expect(validerBloc(bloc({ type: 'entretien', project_id: null, activite: null }), { activites: ACTIVITES }).ok).toBe(true)
  })

  it('refuse une date, une demi-journée ou un type inventés', () => {
    expect(ok({ date: '2026-02-31' }).erreur).toBe('Date invalide')
    expect(ok({ demi: 'soir' }).erreur).toMatch(/Demi-journée/)
    expect(ok({ type: 'Montage ext.' }).erreur).toMatch(/Type/)
  })

  it('accepte le passé comme le futur', () => {
    // L'agenda sert autant à prévoir qu'à consigner — c'est la seule
    // différence avec `heures`, qui refuse d'imputer à l'avance.
    expect(ok({ date: '2020-01-06' }).ok).toBe(true)
    expect(ok({ date: '2030-01-07' }).ok).toBe(true)
  })

  it('refuse une activité inconnue ou désactivée', () => {
    expect(ok({ activite: 99 }).erreur).toBe('Activité inconnue')
    expect(ok({ activite: 29 }).erreur).toMatch(/désactivée/)
  })

  it('refuse un projet qui n\'existe pas', () => {
    expect(ok({ project_id: 'fantome' }).erreur).toBe('Projet introuvable')
  })

  it('ne compte les durées que par demi-heures', () => {
    expect(ok({ minutes: 30 }).valeur.minutes).toBe(30)
    expect(ok({ minutes: 240 }).valeur.minutes).toBe(240)
    expect(ok({ minutes: 45 }).erreur).toMatch(/demi-heures/)
    // Vide = toute la demi-journée ; un 0 explicite est une erreur, pas un
    // synonyme — l'accepter poserait 4,2 h là où on n'a rien demandé.
    expect(ok({ minutes: '' }).valeur.minutes).toBeNull()
    expect(ok({ minutes: null }).valeur.minutes).toBeNull()
    expect(ok({ minutes: 0 }).erreur).toMatch(/demi-heures/)
    expect(ok({ minutes: 330 }).erreur).toMatch(/5 h/)
  })

  it('ne recopie AUCUN champ non prévu', () => {
    // Une route qui recopie le corps de la requête laisse écrire n'importe
    // quelle colonne, `user_name` comprise.
    const r = validerBloc(bloc({ user_name: 'Arnaud', id: 7, source: 'planificateur', fige: true }),
      { activites: ACTIVITES, projets: PROJETS })
    expect(r.valeur.user_name).toBeUndefined()
    expect(r.valeur.id).toBeUndefined()
    expect(r.valeur.source).toBeUndefined()
    expect(r.valeur.fige).toBe(true)
  })

  it('coupe les textes trop longs plutôt que de les refuser', () => {
    const r = ok({ titre: 'x'.repeat(400), note: 'y'.repeat(900) })
    expect(r.valeur.titre).toHaveLength(200)
    expect(r.valeur.note).toHaveLength(500)
  })
})

describe('occupation', () => {
  const b = (o) => ({ user_name: 'Arnaud', date: '2026-11-02', demi: 'am', ...o })

  it('un bloc sans durée prend toute la demi-journée, au prorata du contrat', () => {
    // À 33,6 h sur quatre jours, une demi-journée fait 4,2 h — pas 4.
    expect(minutesPlacees([b({})], 8.4)).toBe(252)
    expect(minutesPlacees([b({ minutes: 60 })], 8.4)).toBe(60)
  })

  it('dit ce qui reste de libre, sans jamais passer sous zéro', () => {
    expect(placeLibre([b({ minutes: 60 })], 8.4)).toBe(192)
    expect(placeLibre([b({ minutes: 240 }), b({ minutes: 120 })], 8.4)).toBe(0)
  })

  it('isole les blocs d\'une personne et d\'une demi-journée', () => {
    const tous = [b({}), b({ demi: 'pm' }), b({ user_name: 'Guillaume' })]
    expect(blocsDe(tous, 'Arnaud', '2026-11-02', 'am')).toHaveLength(1)
    expect(blocsDe(tous, 'Guillaume', '2026-11-02', 'am')).toHaveLength(1)
    expect(blocsDe(tous, 'Arnaud', '2026-11-03', 'am')).toHaveLength(0)
  })

  it('groupe par jour puis par personne', () => {
    const g = parJourEtPersonne([b({}), b({ demi: 'pm' }), b({ user_name: 'Guillaume', date: '2026-11-03' })])
    expect(g['2026-11-02'].Arnaud.am).toHaveLength(1)
    expect(g['2026-11-02'].Arnaud.pm).toHaveLength(1)
    expect(g['2026-11-03'].Guillaume.am).toHaveLength(1)
  })

  it('totalise les minutes par projet', () => {
    const m = minutesParProjet([b({ project_id: 'p1', minutes: 60 }), b({ project_id: 'p1', minutes: 30 }), b({ project_id: null })], 8.4)
    expect(m).toEqual({ p1: 90 })
  })
})

describe('semaine type', () => {
  const ST = { Guillaume: { 1: ['admin', 'production'], 4: ['production', 'production'] } }

  it('donne le couple matin / après-midi du jour', () => {
    expect(typeParDefaut(ST, 'Guillaume', '2026-11-02')).toEqual(['admin', 'production'])  // un lundi
    expect(typeParDefaut(ST, 'Guillaume', '2026-11-05')).toEqual(['production', 'production'])  // un jeudi
  })

  it('ne dit rien de qui n\'a pas de semaine type', () => {
    expect(typeParDefaut(ST, 'Arnaud', '2026-11-02')).toEqual([null, null])
    expect(typeParDefaut(ST, 'Guillaume', '2026-11-03')).toEqual([null, null])
    expect(demiJourneesAtelier(ST, 'Arnaud')).toBeNull()
  })

  it('compte les demi-journées d\'atelier, l\'administratif à part', () => {
    // Lundi : une demi-journée d'atelier (l'autre est admin). Jeudi : deux.
    expect(demiJourneesAtelier(ST, 'Guillaume')).toBe(3)
  })
})

describe('types', () => {
  it('forme une liste fermée, chaque clé connue', () => {
    expect(TYPES.map(t => t.key)).toEqual(
      ['production', 'montage', 'demontage', 'trajet', 'meeting', 'admin', 'entretien', 'autre'])
    expect(typeDe('production').atelier).toBe(true)
    expect(typeDe('montage').atelier).toBe(false)
    expect(typeDe('Montage')).toBeNull()
  })
})
