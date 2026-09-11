import { describe, it, expect } from 'vitest'
import {
  normaliserHeure, versMinutes, duree, formatDuree, enHeures, validerEntree,
  chevauche, chevauchements, totalPar, lignesExport, versCSV, validerActivite, DUREE_MAX,
  lireTarif, validerMajActivite, prochainCode, FAMILLES,
  complementJour, complements, JOURNEE, CODE_DIVERS, CODE_PAUSE,
} from '../lib/heures'

const ACT = [
  { code: 2, libelle: 'CNC', famille: 'atelier', actif: true },
  { code: 8, libelle: 'Peinture / vernis', famille: 'finitions', actif: true },
  { code: 9, libelle: 'Ancienne', famille: 'finitions', actif: false },
  { code: 21, libelle: 'Administratif', famille: 'interne', actif: true },
]
const AUJ = '2026-09-11'
const ok = (o = {}) => ({ date: '2026-09-10', debut: '09:00', fin: '11:00', activite: 2, ...o })

describe('heures', () => {
  it('normalise les écritures courantes, et le format TIME de la base', () => {
    expect(normaliserHeure('9:00')).toBe('09:00')
    expect(normaliserHeure('09:00')).toBe('09:00')
    expect(normaliserHeure('9h30')).toBe('09:30')
    expect(normaliserHeure('9h')).toBe('09:00')
    expect(normaliserHeure('9.15')).toBe('09:15')
    expect(normaliserHeure('17:45:00')).toBe('17:45')
  })
  it('refuse le reste', () => {
    for (const x of ['', null, '24:00', '9:60', 'neuf', '9', '12:5']) expect(normaliserHeure(x), String(x)).toBe(null)
  })
  it('calcule une durée, jamais négative ni nulle', () => {
    expect(duree('09:00', '11:30')).toBe(150)
    expect(duree('11:00', '09:00')).toBe(null)
    expect(duree('09:00', '09:00')).toBe(null)
    expect(versMinutes('01:05')).toBe(65)
  })
  it('affiche et convertit', () => {
    expect(formatDuree(150)).toBe('2 h 30')
    expect(formatDuree(120)).toBe('2 h')
    expect(formatDuree(45)).toBe('0 h 45')
    expect(enHeures(150)).toBe(2.5)
    expect(enHeures(20)).toBe(0.33)
  })
})

describe('validerEntree', () => {
  it('accepte et normalise une ligne correcte', () => {
    const v = validerEntree(ok({ debut: '9h', note: '  ponçage plateau  ' }), { activites: ACT, aujourdhui: AUJ })
    expect(v.ok).toBe(true)
    expect(v.minutes).toBe(120)
    expect(v.valeur).toEqual({ date: '2026-09-10', debut: '09:00', fin: '11:00', project_id: null, contact_id: null, activite: 2, note: 'ponçage plateau' })
  })
  it('garde le projet quand il y en a un', () => {
    expect(validerEntree(ok({ project_id: 'p1' }), { activites: ACT, aujourdhui: AUJ }).valeur.project_id).toBe('p1')
  })
  it('accepte une heure sans projet', () => {
    expect(validerEntree(ok({ activite: 21 }), { activites: ACT, aujourdhui: AUJ }).ok).toBe(true)
  })
  it('refuse une date invalide ou future', () => {
    expect(validerEntree(ok({ date: '2026-02-30' }), { activites: ACT, aujourdhui: AUJ }).ok).toBe(false)
    expect(validerEntree(ok({ date: '2026-09-12' }), { activites: ACT, aujourdhui: AUJ }).erreur).toMatch(/avance/)
    expect(validerEntree(ok({ date: AUJ }), { activites: ACT, aujourdhui: AUJ }).ok).toBe(true)
  })
  it('refuse des horaires à l\'envers, en expliquant le cas de minuit', () => {
    expect(validerEntree(ok({ debut: '22:00', fin: '02:00' }), { activites: ACT, aujourdhui: AUJ }).erreur).toMatch(/minuit/)
  })
  it('refuse une durée invraisemblable', () => {
    const v = validerEntree(ok({ debut: '05:00', fin: '20:00' }), { activites: ACT, aujourdhui: AUJ })
    expect(v.ok).toBe(false)
    expect(15 * 60).toBeGreaterThan(DUREE_MAX)
  })
  it('refuse une activité inconnue ou désactivée', () => {
    expect(validerEntree(ok({ activite: 99 }), { activites: ACT, aujourdhui: AUJ }).erreur).toBe('Activité inconnue')
    expect(validerEntree(ok({ activite: 'deux' }), { activites: ACT, aujourdhui: AUJ }).erreur).toBe('Activité inconnue')
    expect(validerEntree(ok({ activite: 9 }), { activites: ACT, aujourdhui: AUJ }).erreur).toMatch(/désactivée/)
  })
  // Désactiver une activité ne doit pas rendre ses anciennes heures impossibles
  // à corriger.
  it('laisse corriger une ligne qui porte déjà une activité désactivée', () => {
    expect(validerEntree(ok({ activite: 9 }), { activites: ACT, aujourdhui: AUJ, tolererInactive: 9 }).ok).toBe(true)
  })
  it('ne laisse passer aucun champ inattendu', () => {
    const v = validerEntree(ok({ user_name: 'Pirate', source: 'scan', id: 5 }), { activites: ACT, aujourdhui: AUJ })
    expect(Object.keys(v.valeur).sort()).toEqual(['activite', 'contact_id', 'date', 'debut', 'fin', 'note', 'project_id'])
  })
})

describe('chevauchements', () => {
  const jour = [
    { id: 1, user_name: 'Arnaud', date: '2026-09-10', debut: '09:00:00', fin: '11:00:00' },
    { id: 2, user_name: 'Arnaud', date: '2026-09-10', debut: '13:00:00', fin: '17:00:00' },
  ]
  it('détecte un recouvrement', () => {
    expect(chevauche({ debut: '10:30', fin: '12:00' }, jour)?.id).toBe(1)
    expect(chevauche({ debut: '08:00', fin: '18:00' }, jour)?.id).toBe(1)
  })
  it('permet deux plages qui se touchent', () => {
    expect(chevauche({ debut: '11:00', fin: '13:00' }, jour)).toBe(null)
  })
  it('ignore la ligne qu\'on est en train de modifier', () => {
    expect(chevauche({ debut: '09:30', fin: '10:30' }, jour, 1)).toBe(null)
  })
  it('liste les paires fautives, par personne et par jour seulement', () => {
    const lot = [
      ...jour,
      { id: 3, user_name: 'Arnaud', date: '2026-09-10', debut: '16:00', fin: '18:00' },
      { id: 4, user_name: 'Gabin',  date: '2026-09-10', debut: '09:00', fin: '11:00' },
      { id: 5, user_name: 'Arnaud', date: '2026-09-09', debut: '09:00', fin: '11:00' },
    ]
    expect(chevauchements(lot).map(([a, b]) => [a.id, b.id])).toEqual([[2, 3]])
  })
})

describe('totaux', () => {
  it('cumule les minutes par clé, en relisant la colonne calculée ou les horaires', () => {
    const t = totalPar([
      { activite: 8, minutes: 90 },
      { activite: 8, debut: '09:00', fin: '09:30' },
      { activite: 2, minutes: 60 },
    ], e => e.activite)
    expect(t).toEqual({ 8: 120, 2: 60 })
  })
})

describe('export', () => {
  const entrees = [
    { user_name: 'Arnaud', date: '2026-09-10', debut: '13:00:00', fin: '15:30:00', minutes: 150, activite: 8, note: null, source: 'scan',
      projects: { numero: 162, name: 'Canapé Margherita', client: 'Coca-Cola HBC Schweiz AG' } },
    { user_name: 'Arnaud', date: '2026-09-10', debut: '09:00:00', fin: '10:00:00', minutes: 60, activite: 21, note: '=HYPERLINK("x")', source: 'saisie', project_id: null },
  ]
  const lignes = lignesExport(entrees, { activites: ACT })

  it('met à plat, trié par date, personne et heure', () => {
    expect(lignes[0]).toMatchObject({ debut: '09:00', activite: 'Administratif', famille: 'interne', projet_numero: '', jour: 'jeu' })
    expect(lignes[1]).toMatchObject({
      debut: '13:00', fin: '15:30', minutes: 150, heures: 2.5, projet_numero: 162,
      projet: 'Canapé Margherita', client: 'Coca-Cola HBC Schweiz AG', activite_code: 8, activite: 'Peinture / vernis',
    })
  })
  it('écrit un CSV qu\'Excel en français ouvre tel quel', () => {
    const csv = versCSV(lignes)
    expect(csv.startsWith('﻿"Date";"Jour";"Personne"')).toBe(true)
    expect(csv).toContain('\r\n')
    expect(csv).toContain(';150;2.5;162;')
  })
  it('neutralise une remarque qu\'Excel prendrait pour une formule', () => {
    expect(versCSV(lignes)).toContain('"\'=HYPERLINK(""x"")"')
  })
  it('rend un fichier vide d\'une seule ligne d\'en-tête', () => {
    expect(versCSV([]).split('\r\n')).toHaveLength(1)
  })
})

describe('validerActivite', () => {
  it('accepte une activité nouvelle', () => {
    expect(validerActivite({ code: 16, libelle: ' Gravure ', famille: 'atelier', tarif_vente: '120,50' }, ACT))
      .toEqual({ ok: true, valeur: { code: 16, libelle: 'Gravure', famille: 'atelier', tarif_vente: 120.5, cout_revient: null, facturee_heure: true } })
  })
  it('ne réattribue jamais un code, même désactivé', () => {
    expect(validerActivite({ code: 9, libelle: 'Autre', famille: 'atelier' }, ACT).erreur).toMatch(/jamais réattribué/)
  })
  it('refuse un code hors plage, un libellé vide ou une famille inconnue', () => {
    expect(validerActivite({ code: 100, libelle: 'x', famille: 'atelier' }, ACT).ok).toBe(false)
    expect(validerActivite({ code: 17, libelle: '  ', famille: 'atelier' }, ACT).ok).toBe(false)
    expect(validerActivite({ code: 17, libelle: 'x', famille: 'cuisine' }, ACT).ok).toBe(false)
  })
})

describe('tarifs des activités', () => {
  it('lit un tarif tel qu\'on le tape', () => {
    expect(lireTarif('120')).toEqual({ ok: true, valeur: 120 })
    expect(lireTarif('120,50')).toEqual({ ok: true, valeur: 120.5 })
    expect(lireTarif("1'200")).toEqual({ ok: true, valeur: 1200 })
    expect(lireTarif(0)).toEqual({ ok: true, valeur: 0 })
  })
  // Un coût inconnu compté à zéro gonflerait la marge en silence.
  it('rend null pour un champ vide, jamais zéro', () => {
    expect(lireTarif('')).toEqual({ ok: true, valeur: null })
    expect(lireTarif(null)).toEqual({ ok: true, valeur: null })
  })
  it('refuse un tarif négatif ou illisible', () => {
    for (const v of ['-5', 'abc', '99999']) expect(lireTarif(v).ok, v).toBe(false)
  })
})

describe('validerMajActivite', () => {
  it('ne renvoie que les champs présents', () => {
    expect(validerMajActivite({ cout_revient: '72.5' })).toEqual({ ok: true, valeur: { cout_revient: 72.5 } })
    expect(validerMajActivite({ libelle: ' Peinture ', famille: 'finitions' }))
      .toEqual({ ok: true, valeur: { libelle: 'Peinture', famille: 'finitions' } })
  })
  it('laisse effacer un tarif', () => {
    expect(validerMajActivite({ tarif_vente: '' }).valeur).toEqual({ tarif_vente: null })
  })
  it('ne touche jamais au code', () => {
    const v = validerMajActivite({ code: 5, code_nouveau: 7, actif: false })
    expect(v.valeur).toEqual({ actif: false })
  })
  it('refuse un libellé vide, une famille inconnue, un tarif invalide, ou rien', () => {
    expect(validerMajActivite({ libelle: ' ' }).ok).toBe(false)
    expect(validerMajActivite({ famille: 'cuisine' }).ok).toBe(false)
    expect(validerMajActivite({ cout_revient: '-1' }).erreur).toMatch(/Coût de revient/)
    expect(validerMajActivite({}).ok).toBe(false)
  })
})

describe('facturée à l\'heure', () => {
  it('par défaut oui, sauf si on dit non', () => {
    expect(validerActivite({ code: 30, libelle: 'x', famille: 'atelier' }, []).valeur.facturee_heure).toBe(true)
    expect(validerActivite({ code: 30, libelle: 'x', famille: 'logistique', facturee_heure: false }, []).valeur.facturee_heure).toBe(false)
  })
  it('se modifie, et seul un vrai booléen vaut « oui »', () => {
    expect(validerMajActivite({ facturee_heure: false }).valeur).toEqual({ facturee_heure: false })
    expect(validerMajActivite({ facturee_heure: 'false' }).valeur).toEqual({ facturee_heure: false })
  })
})

describe('codes par dizaine de famille', () => {
  const actuelles = [{ code: 10 }, { code: 11 }, { code: 12 }, { code: 20 }, { code: 21 }, { code: 60 }]

  it('range les familles dans l\'ordre du travail', () => {
    expect(FAMILLES).toEqual(['gestion', 'atelier', 'finitions', 'chantier', 'logistique', 'interne'])
  })
  it('propose le prochain code libre de la dizaine', () => {
    expect(prochainCode('gestion', actuelles)).toBe(13)
    expect(prochainCode('atelier', actuelles)).toBe(22)
    expect(prochainCode('finitions', actuelles)).toBe(30)
    expect(prochainCode('interne', actuelles)).toBe(61)
  })
  it('comble un trou plutôt que d\'aller au bout', () => {
    expect(prochainCode('gestion', [{ code: 10 }, { code: 12 }])).toBe(11)
  })
  it('rend null quand la dizaine est pleine, ou pour une famille inconnue', () => {
    const plein = Array.from({ length: 10 }, (_, i) => ({ code: 20 + i }))
    expect(prochainCode('atelier', plein)).toBe(null)
    expect(prochainCode('cuisine', actuelles)).toBe(null)
  })
})

describe('journée régulière : 8,4 h payées, dont 30 min de pause offerte', () => {
  it('8,4 h, une pause offerte de 30 min, un midi non payé d\'1 h', () => {
    expect(JOURNEE).toEqual({ minutes: 504, pausePayee: 30, pauseMidi: 60 })
  })
  it('complète une journée à moitié notée : pause payée, puis Divers', () => {
    const c = complementJour([{ activite: 31, minutes: 240 }])
    expect(c).toEqual({ travail: 240, pauseNotee: 0, pause: 30, divers: 234, total: 504 })
  })
  it('ne compte pas deux fois une pause déjà notée', () => {
    expect(complementJour([{ activite: 31, minutes: 300 }, { activite: CODE_PAUSE, minutes: 30 }]))
      .toMatchObject({ pause: 0, divers: 174, total: 504 })
  })
  it('ne retranche rien d\'une journée longue : pas de Divers négatif', () => {
    expect(complementJour([{ activite: 23, minutes: 540 }])).toMatchObject({ divers: 0, pause: 30, total: 570 })
  })
})

describe('complements', () => {
  const AUJ = '2026-09-11'   // vendredi
  const lignes = [
    { user_name: 'Arnaud', date: '2026-09-10', activite: 31, minutes: 300 },  // jeudi
    { user_name: 'Arnaud', date: '2026-09-10', activite: 23, minutes: 60 },
    { user_name: 'Gabin',  date: '2026-09-10', activite: 23, minutes: 474 },  // journée pleine
    { user_name: 'Arnaud', date: '2026-09-12', activite: 23, minutes: 120 },  // samedi
    { user_name: 'Arnaud', date: AUJ,          activite: 23, minutes: 60 },   // aujourd'hui
  ]
  const c = complements(lignes, { aujourdhui: AUJ })

  it('complète chaque personne séparément', () => {
    expect(c.filter(x => x.user_name === 'Arnaud').map(x => [x.activite, x.minutes]))
      .toEqual([[CODE_PAUSE, 30], [CODE_DIVERS, 114]])
    expect(c.filter(x => x.user_name === 'Gabin').map(x => [x.activite, x.minutes]))
      .toEqual([[CODE_PAUSE, 30]])
  })
  it('ne complète ni le jour en cours ni le week-end', () => {
    expect(c.some(x => x.date === AUJ)).toBe(false)
    expect(c.some(x => x.date === '2026-09-12')).toBe(false)
  })
  it('ne complète pas un jour sans aucune ligne : oubli ou absence, on ne sait pas', () => {
    expect(complements([], { aujourdhui: AUJ })).toEqual([])
  })
  it('marque ses lignes comme calculées, sans horaire ni projet', () => {
    expect(c[0]).toMatchObject({ source: 'complément', debut: null, fin: null, project_id: null })
  })
})

describe('une heure pour un client plutôt qu\'un projet', () => {
  it('accepte un client seul', () => {
    const v = validerEntree(ok({ contact_id: '3' }), { activites: ACT, aujourdhui: AUJ })
    expect(v.valeur).toMatchObject({ contact_id: 3, project_id: null })
  })
  it('refuse projet et client à la fois', () => {
    expect(validerEntree(ok({ contact_id: 3, project_id: 'p1' }), { activites: ACT, aujourdhui: AUJ }).erreur).toMatch(/OU à un client/)
  })
  it('refuse un identifiant de client illisible', () => {
    expect(validerEntree(ok({ contact_id: 'andros' }), { activites: ACT, aujourdhui: AUJ }).ok).toBe(false)
  })
})
