import { describe, it, expect } from 'vitest'
import {
  partAbsente, heuresParJour, capacitePersonne, saitFaire, quiSaitFaire,
  resteProjet, verdict, cumuler, enChaine, versDate, parEcheance, fenetre, decaler,
} from '../lib/capacite'

// L'atelier travaille lundi, mardi, jeudi, vendredi. Octobre 2026 :
//   jeu 1, ven 2 | lun 5, mar 6, jeu 8, ven 9 | lun 12, mar 13, jeu 15, ven 16
const REGLAGES = { weekly_hours: 33.6 }   // 8,4 h sur quatre jours

describe('dates', () => {
  it('refuse une date qui n\'existe pas plutôt que de la replier', () => {
    // `new Date('2026-02-31')` donne le 3 mars en silence.
    expect(versDate('2026-02-31')).toBeNull()
    expect(versDate('2026-13-01')).toBeNull()
    expect(versDate('pas une date')).toBeNull()
    expect(enChaine(versDate('2026-10-02'))).toBe('2026-10-02')
  })
})

describe('fenetre', () => {
  const AUJ = '2026-10-03'

  it('commence DEMAIN, pas aujourd\'hui', () => {
    // La journée en cours est entamée : la compter entière promet des heures
    // qu'on n'a plus.
    expect(fenetre({ aujourdhui: AUJ }).du).toBe('2026-10-04')
    expect(fenetre({ aujourdhui: AUJ }).debut).toBe('demain')
  })

  it('accepte un début repoussé — « et à partir du 1er novembre ? »', () => {
    const f = fenetre({ aujourdhui: AUJ, duDemande: '2026-11-01' })
    expect(f.du).toBe('2026-11-01')
    expect(f.debut).toBe('demande')
  })

  it('refuse un début dans le passé', () => {
    // Il rendrait des heures déjà consommées, et la jauge dirait oui à un
    // projet avec du temps qui n'existe plus.
    expect(fenetre({ aujourdhui: AUJ, duDemande: '2026-09-01' }).du).toBe('2026-10-04')
    expect(fenetre({ aujourdhui: AUJ, duDemande: 'pas une date' }).du).toBe('2026-10-04')
  })

  it('va jusqu\'à la dernière échéance quand elle est lointaine', () => {
    const f = fenetre({ aujourdhui: AUJ, echeances: ['2026-11-10', '2027-03-20'] })
    expect(f.au).toBe('2027-03-20')
    expect(f.motif).toBe('echeance')
  })

  it('tient un plancher de huit semaines', () => {
    // Tout livré dans dix jours : sans plancher, il n'y aurait que dix jours à
    // opposer au prochain client, et on refuserait un projet qu'on a tout le
    // temps de faire.
    const f = fenetre({ aujourdhui: AUJ, echeances: ['2026-10-13'] })
    expect(f.au).toBe(decaler('2026-10-04', 56))
    expect(f.motif).toBe('plancher')
  })

  it('ignore une fin demandée AVANT le début', () => {
    // Elle donnerait une capacité nulle, donc un refus, pour une faute de frappe.
    const f = fenetre({ aujourdhui: AUJ, echeances: ['2026-10-13'], auDemande: '2026-09-15' })
    expect(f.motif).toBe('plancher')
    expect(f.au > f.du).toBe(true)
  })

  it('retient une fin demandée valable', () => {
    const f = fenetre({ aujourdhui: AUJ, echeances: ['2027-03-20'], auDemande: '2026-12-24' })
    expect(f.au).toBe('2026-12-24')
    expect(f.motif).toBe('demande')
  })
})

describe('heuresParJour', () => {
  it('divise par les jours TRAVAILLÉS, pas par cinq', () => {
    // Diviser 33,6 par 5 donnerait 6,72 h — le temps d'un jour qui n'existe pas.
    expect(heuresParJour(REGLAGES)).toBe(8.4)
  })

  it('sans réglage, ne devine aucune journée', () => {
    expect(heuresParJour({})).toBe(0)
    expect(heuresParJour(null)).toBe(0)
  })
})

describe('partAbsente', () => {
  it('compte une demi-journée pour une demi-journée', () => {
    expect(partAbsente([{ type: 'VACATION_AM' }])).toBe(0.5)
    expect(partAbsente([{ type: 'VACATION_AM' }, { type: 'VACATION_PM' }])).toBe(1)
  })

  it('borne à 1 une saisie incohérente', () => {
    // Un congé entier ET une demi-journée le même jour donneraient 1,5 — et
    // une capacité NÉGATIVE, qui ferait mentir toute la jauge.
    expect(partAbsente([{ type: 'VACATION' }, { type: 'VACATION_AM' }])).toBe(1)
  })

  it('ignore ce qui n\'est pas une absence', () => {
    expect(partAbsente([{ type: 'WORK' }])).toBe(0)
    expect(partAbsente([])).toBe(0)
  })
})

describe('capacitePersonne', () => {
  const sur = (du, au, opts) => capacitePersonne('Arnaud', du, au, { reglages: REGLAGES, ...opts })

  it('ne compte que lundi, mardi, jeudi, vendredi', () => {
    // Du jeudi 1er au vendredi 9 octobre : 1, 2, 5, 6, 8, 9 — six jours.
    // Le mercredi 7 et le week-end des 3-4 ne comptent pas.
    const c = sur('2026-10-01', '2026-10-09')
    expect(c.jours).toBe(6)
    expect(c.heures).toBe(50.4)
  })

  it('retire les congés, entiers et demi', () => {
    const c = sur('2026-10-01', '2026-10-09', {
      absences: [
        { user_name: 'Arnaud', date: '2026-10-05', type: 'VACATION' },
        { user_name: 'Arnaud', date: '2026-10-06', type: 'VACATION_AM' },
      ],
    })
    expect(c.jours).toBe(4.5)
    expect(c.heures).toBe(37.8)
    expect(c.joursAbsents).toBe(1)
  })

  it('ne retire QUE les absences de la bonne personne', () => {
    const c = sur('2026-10-01', '2026-10-09', {
      absences: [{ user_name: 'Guillaume', date: '2026-10-05', type: 'VACATION' }],
    })
    expect(c.jours).toBe(6)
  })

  it('retire les fériés', () => {
    const c = sur('2026-10-01', '2026-10-09', { feries: ['2026-10-05'] })
    expect(c.jours).toBe(5)
    expect(c.joursAbsents).toBe(1)
  })

  it('rend zéro sur une période impossible ou sans contrat', () => {
    expect(sur('2026-10-09', '2026-10-01').heures).toBe(0)
    expect(capacitePersonne('Arnaud', '2026-10-01', '2026-10-09', { reglages: {} }).heures).toBe(0)
  })
})

describe('compétences', () => {
  // Guillaume ne soude pas (6), Arnaud ne fait pas l'électricité (9).
  const COMP = { Arnaud: [5, 6, 7, 8], Guillaume: [5, 7, 8, 9] }
  const GENS = [{ nom: 'Arnaud', heures: 50 }, { nom: 'Guillaume', heures: 20 }]

  it('une personne absente de la table sait tout faire', () => {
    // Au démarrage, rien n'est rempli : mieux vaut une jauge optimiste qu'une
    // jauge qui refuse tout faute d'écran rempli.
    expect(saitFaire('Nouveau', 6, COMP)).toBe(true)
    expect(saitFaire('Arnaud', 6, {})).toBe(true)
  })

  it('dit qui sait faire quoi', () => {
    expect(quiSaitFaire(6, GENS, COMP)).toEqual(['Arnaud'])
    expect(quiSaitFaire(9, GENS, COMP)).toEqual(['Guillaume'])
    expect(quiSaitFaire(5, GENS, COMP)).toEqual(['Arnaud', 'Guillaume'])
  })
})

describe('resteProjet', () => {
  const ACTIVITES = [
    { code: 6, libelle: 'Soudure', famille: 'atelier', facturee_heure: true },
    { code: 8, libelle: 'Peinture / vernis', famille: 'finitions', facturee_heure: true },
  ]
  const projet = { quote_data: { items: [{ name: 'Bar', purchases: [], labor: [
    { description: 'Soudure', activite: 6, rate: 95, quantity: 10, unit: 'heure(s)' },
    { description: 'Peinture', activite: 8, rate: 95, quantity: 6, unit: 'heure(s)' },
  ] }] } }

  it('soustrait les heures déjà imputées', () => {
    const r = resteProjet(projet, [{ activite: 6, minutes: 240 }], ACTIVITES)
    expect(r.parActivite).toEqual([
      { code: 6, libelle: 'Soudure', prevu: 10, reel: 4, reste: 6 },
      { code: 8, libelle: 'Peinture / vernis', prevu: 6, reel: 0, reste: 6 },
    ])
    expect(r.total).toBe(12)
  })

  it('une activité dépassée est FINIE, elle ne rend pas du temps', () => {
    // Sans la borne à zéro, douze heures de dépassement en soudure
    // financeraient douze heures de peinture.
    const r = resteProjet(projet, [{ activite: 6, minutes: 60 * 22 }], ACTIVITES)
    expect(r.parActivite.map(l => l.code)).toEqual([8])
    expect(r.total).toBe(6)
  })

  it('garde à part les heures qu\'aucun code ne ventile', () => {
    // Les offres d'avant les codes tombent entièrement là. Elles ne peuvent
    // être attribuées à personne : l'écran doit le dire, pas les diluer.
    const vieux = { quote_data: { items: [{ name: 'x', purchases: [], labor: [
      { description: 'Main d\'œuvre', rate: 95, quantity: 14, unit: 'heure(s)' },
    ] }] } }
    const r = resteProjet(vieux, [], ACTIVITES)
    expect(r.sansCode).toBe(14)
    expect(r.total).toBe(0)
  })
})

describe('cumuler', () => {
  it('additionne la même activité à travers les projets', () => {
    const c = cumuler([
      { parActivite: [{ code: 6, libelle: 'Soudure', reste: 6 }], sansCode: 2, total: 6 },
      { parActivite: [{ code: 6, libelle: 'Soudure', reste: 4 }, { code: 8, libelle: 'Peinture', reste: 5 }], sansCode: 0, total: 9 },
    ])
    expect(c.parActivite).toEqual([
      { code: 6, libelle: 'Soudure', reste: 10 },
      { code: 8, libelle: 'Peinture', reste: 5 },
    ])
    expect(c.sansCode).toBe(2)
    expect(c.total).toBe(15)
  })
})

describe('verdict', () => {
  const COMP = { Arnaud: [5, 6, 7, 8], Guillaume: [5, 7, 8, 9] }
  const GENS = (a, g) => [{ nom: 'Arnaud', heures: a }, { nom: 'Guillaume', heures: g }]

  it('ça tient quand le total rentre et que personne ne déborde', () => {
    const v = verdict([{ code: 5, reste: 20 }], GENS(50, 20), COMP)
    expect(v.tient).toBe(true)
    expect(v.manque).toBe(0)
    expect(v.commun).toBe(20)
  })

  it('ça ne tient pas quand le total déborde', () => {
    const v = verdict([{ code: 5, reste: 100 }], GENS(50, 20), COMP)
    expect(v.tient).toBe(false)
    expect(v.manque).toBe(30)
  })

  it('voit le GOULOT qu\'un total large cacherait', () => {
    // 200 h de capacité, 60 h demandées : un total dirait « large ». Mais 50 h
    // d'électricité ne peuvent aller que chez Guillaume, qui n'en a que 20.
    const v = verdict([{ code: 9, reste: 50 }, { code: 5, reste: 10 }], GENS(180, 20), COMP)
    expect(v.tient).toBe(false)
    expect(v.goulots.map(g => g.nom)).toEqual(['Guillaume'])
    expect(v.goulots[0].manque).toBe(30)
  })

  it('impose à la bonne personne ce qu\'elle seule sait faire', () => {
    const v = verdict([{ code: 6, reste: 12 }, { code: 9, reste: 8 }], GENS(50, 20), COMP)
    const arnaud = v.parPersonne.find(p => p.nom === 'Arnaud')
    const guillaume = v.parPersonne.find(p => p.nom === 'Guillaume')
    expect(arnaud.impose).toBe(12)
    expect(guillaume.impose).toBe(8)
    expect(arnaud.libre).toBe(38)
    expect(v.commun).toBe(0)
    expect(v.tient).toBe(true)
  })

  it('signale une activité que PERSONNE ne sait faire', () => {
    const v = verdict([{ code: 42, reste: 5 }], GENS(50, 20), { Arnaud: [5], Guillaume: [5] })
    expect(v.orphelines.map(o => o.code)).toEqual([42])
    // Elle ne gonfle pas la demande : on ne peut pas la confier, on la montre.
    expect(v.demande).toBe(0)
  })

  it('sans table de compétences, tout le monde peut tout', () => {
    const v = verdict([{ code: 6, reste: 60 }], GENS(50, 20), {})
    expect(v.commun).toBe(60)
    expect(v.tient).toBe(true)
  })
})

describe('parEcheance', () => {
  const REG = { Arnaud: { weekly_hours: 33.6 } }
  const p = (id, deadline, reste) => ({ id, deadline, reste: { parActivite: [{ code: 5, libelle: 'Assemblage', reste }], total: reste, sansCode: 0 } })

  it('cumule tout ce qui est dû AVANT chaque échéance', () => {
    const r = parEcheance([p('a', '2026-10-09', 20), p('b', '2026-10-16', 20)],
      { du: '2026-10-01', personnes: ['Arnaud'], reglages: REG })
    expect(r.paliers.map(x => x.date)).toEqual(['2026-10-09', '2026-10-16'])
    expect(r.paliers[0].demande).toBe(20)   // a seul
    expect(r.paliers[1].demande).toBe(40)   // a + b
  })

  it('trouve le MUR — la première date qui ne tient pas', () => {
    // Du 1er au 9 octobre : 6 jours × 8,4 = 50,4 h. Trois chantiers à 20 h
    // le 9 font 60 h : ça casse là, et pas au palier suivant qui est plus large.
    const r = parEcheance([p('a', '2026-10-09', 20), p('b', '2026-10-09', 20), p('c', '2026-10-09', 20)],
      { du: '2026-10-01', personnes: ['Arnaud'], reglages: REG })
    expect(r.mur.date).toBe('2026-10-09')
    expect(r.mur.manque).toBe(9.6)
  })

  it('un total large ne masque pas une semaine impossible', () => {
    // 20 h dues le 9 (capacité 50,4 : large) et 60 h dues le 16 (capacité
    // 84 : large aussi en cumul 80/84). Rien ne casse — c'est le cas témoin
    // du test précédent.
    const r = parEcheance([p('a', '2026-10-09', 20), p('b', '2026-10-16', 60)],
      { du: '2026-10-01', personnes: ['Arnaud'], reglages: REG })
    expect(r.mur).toBeNull()
  })

  it('range à part ce qui n\'a pas d\'échéance', () => {
    const r = parEcheance([p('a', '2026-10-09', 20), p('z', null, 15)],
      { du: '2026-10-01', personnes: ['Arnaud'], reglages: REG })
    expect(r.paliers).toHaveLength(1)
    expect(r.sansEcheance).toEqual({ projets: ['z'], heures: 15 })
  })

  it('ne fait pas un palier d\'une échéance DÉJÀ PASSÉE', () => {
    // Sans ça, le mur désigne toujours la plus vieille date en retard : il n'y
    // a plus une seule heure disponible avant elle, donc elle ne tient jamais.
    // Ce qu'on veut savoir, c'est la prochaine date qui va céder.
    const r = parEcheance([p('tard', '2026-09-20', 39), p('a', '2026-10-16', 20)],
      { du: '2026-10-01', personnes: ['Arnaud'], reglages: REG })
    expect(r.paliers.map(x => x.date)).toEqual(['2026-10-16'])
    expect(r.enRetard).toEqual({ projets: ['tard'], heures: 39 })
  })

  it('un retard continue de peser sur les paliers suivants', () => {
    // 39 h en retard + 20 h dues le 16 octobre, contre 84 h disponibles
    // (10 jours ouvrés) : ça tient, mais le palier doit bien porter 59 h.
    const r = parEcheance([p('tard', '2026-09-20', 39), p('a', '2026-10-16', 20)],
      { du: '2026-10-01', personnes: ['Arnaud'], reglages: REG })
    expect(r.paliers[0].demande).toBe(59)
    expect(r.mur).toBeNull()
  })

  it('tout en retard : aucun palier, aucun mur, mais la dette est dite', () => {
    const r = parEcheance([p('tard', '2026-09-20', 39)],
      { du: '2026-10-01', personnes: ['Arnaud'], reglages: REG })
    expect(r.paliers).toEqual([])
    expect(r.mur).toBeNull()
    expect(r.enRetard.heures).toBe(39)
  })
})
