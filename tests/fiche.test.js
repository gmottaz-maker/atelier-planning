import { describe, it, expect } from 'vitest'
import { aVenir, dateCourte, dateLongue, decouperSynthese, delai, enRetard, etapeCourante, groupesParEtape, groupesParLivraison, joursEntre, listeNoms, livraisonEnRetard, parcours, premiereDate } from '../lib/fiche'

describe('étape du projet', () => {
  it('la phase posée à la main passe avant l’offre', () => {
    expect(etapeCourante({ phase: 'termine', statutOffre: 'brouillon' })).toBe('termine')
    expect(etapeCourante({ phase: 'demontage', statutOffre: 'accepte' })).toBe('demontage')
    expect(etapeCourante({ phase: 'en_cours', statutOffre: 'accepte' })).toBe('montage')
  })
  it('sans phase, l’offre décide', () => {
    expect(etapeCourante({ statutOffre: 'accepte' })).toBe('production')
    expect(etapeCourante({ statutOffre: 'envoye' })).toBe('offre')
    expect(etapeCourante({ statutOffre: 'a_corriger' })).toBe('offre')
    expect(etapeCourante({ statutOffre: 'brouillon' })).toBe('preparation')
    expect(etapeCourante({})).toBe('preparation')
  })
})

describe('frise', () => {
  const logistique = [
    { type: 'demontage', date: '2026-12-24' },
    { type: 'montage', date: '2026-12-14' },
    { type: 'livraison', date: '2026-12-10' },
  ]
  it('marque ce qui est fait, l’étape en cours et ce qui reste', () => {
    const f = parcours({ statutOffre: 'accepte', logistique })
    expect(f.map(e => e.etat)).toEqual(['fait', 'fait', 'ici', 'avenir', 'avenir', 'avenir'])
    expect(f[1].detail).toBe('acceptée')
    expect(f[2].detail).toBe('en cours')
  })
  it('date le montage au premier passage sur place, livraison comprise', () => {
    const f = parcours({ statutOffre: 'accepte', logistique })
    expect(f[3].detail).toBe('10 déc.')
    expect(f[4].detail).toBe('24 déc.')
  })
  it('retombe sur la date de démontage du projet sans point logistique', () => {
    expect(parcours({ disassemblyDate: '2026-11-03' })[4].detail).toBe('3 nov.')
  })
  it('un projet terminé a toutes ses étapes faites', () => {
    expect(parcours({ phase: 'termine' }).every(e => e.etat === 'fait')).toBe(true)
  })
  it('ignore une date mal formée', () => {
    expect(premiereDate([{ type: 'montage', date: '14.12.2026' }], ['montage'])).toBe(null)
  })
})

describe('dates', () => {
  it('se lisent en français, sans dépendre du fuseau', () => {
    expect(dateCourte('2026-12-01')).toBe('1 déc.')
    expect(dateLongue('2026-12-01')).toBe('1 déc. 2026')
    expect(dateCourte('2026-12-01T00:00:00+00:00')).toBe('1 déc.')
    expect(dateCourte('')).toBe('')
  })
  it('comptent les jours entre deux dates', () => {
    expect(joursEntre('2026-10-22', '2026-12-01')).toBe(40)
    expect(joursEntre('2026-10-22', '2026-10-20')).toBe(-2)
  })
  it('disent le délai en mots', () => {
    expect(delai('2026-12-01', '2026-10-22')).toBe('dans 40 jours')
    expect(delai('2026-10-23', '2026-10-22')).toBe('demain')
    expect(delai('2026-10-22', '2026-10-22')).toBe('aujourd’hui')
    expect(delai('2026-10-19', '2026-10-22')).toBe('il y a 3 jours')
  })
  it('une tâche ouverte dont la date est passée est en retard, pas une tâche faite', () => {
    expect(enRetard({ status: 'active', execution_date: '2026-10-20' }, '2026-10-22')).toBe(true)
    expect(enRetard({ status: 'active', execution_date: '2026-10-22' }, '2026-10-22')).toBe(false)
    expect(enRetard({ status: 'completed', execution_date: '2026-10-01' }, '2026-10-22')).toBe(false)
    expect(enRetard({ status: 'active' }, '2026-10-22')).toBe(false)
  })
})

describe('à venir', () => {
  const taches = [
    { id: 1, title: 'Commander plexiglas', status: 'active', execution_date: '2026-11-07', responsible: 'Arnaud' },
    { id: 2, title: 'Vieille tâche', status: 'active', execution_date: '2026-10-01' },
    { id: 3, title: 'Faite', status: 'completed', execution_date: '2026-11-08' },
    { id: 4, title: 'Montage — EOY', status: 'active', execution_date: '2026-12-14', category_data: { source_logistics_uid: 'u1' } },
  ]
  const logistique = [{ uid: 'u1', type: 'montage', date: '2026-12-14', vehicle: 'Vito', assignees: ['Arnaud', 'Guillaume'] }]
  const items = aVenir({ taches, logistique, aujourdhui: '2026-10-22', nomsTypes: { montage: 'Montage' } })

  it('mêle tâches et logistique, dans l’ordre des dates', () => {
    expect(items.map(i => i.titre)).toEqual(['Commander plexiglas', 'Montage'])
  })
  it('ne reprend ni le passé, ni le fait, ni les tâches tirées d’un point logistique', () => {
    expect(items.some(i => i.titre === 'Vieille tâche' || i.titre === 'Faite' || i.titre === 'Montage — EOY')).toBe(false)
  })
  it('détaille un passage sur place : véhicule et personnes', () => {
    expect(items[1].detail).toBe('Vito, Arnaud et Guillaume')
  })
  it('se limite au nombre demandé', () => {
    expect(aVenir({ taches, logistique, aujourdhui: '2026-10-22', limite: 1 })).toHaveLength(1)
  })
})

describe('liste de noms', () => {
  it('joint par virgules puis « et »', () => {
    expect(listeNoms(['Arnaud'])).toBe('Arnaud')
    expect(listeNoms(['Arnaud', 'Guillaume'])).toBe('Arnaud et Guillaume')
    expect(listeNoms(['Arnaud', 'Gabin', 'Guillaume'])).toBe('Arnaud, Gabin et Guillaume')
    expect(listeNoms([])).toBe('')
  })
})

describe('synthèse', () => {
  const texte = '**Où on en est**\n\nLe projet avance.\nMeeting le 29.\n\n**Ce qui est décidé**\n\n- Popup du 14 au 24\n- Deux kits Cricut\n\n**En suspens**\n\n- Date de vitrine'
  it('montre la première rubrique en paragraphe', () => {
    expect(decouperSynthese(texte).resume).toBe('Le projet avance. Meeting le 29.')
  })
  it('garde les autres rubriques pour « lire toute la synthèse », sans puces', () => {
    expect(decouperSynthese(texte).reste).toEqual([
      { titre: 'Ce qui est décidé', lignes: ['Popup du 14 au 24', 'Deux kits Cricut'] },
      { titre: 'En suspens', lignes: ['Date de vitrine'] },
    ])
  })
  it('accepte un texte sans rubrique', () => {
    expect(decouperSynthese('Tout va bien.')).toEqual({ resume: 'Tout va bien.', reste: [] })
  })
  it('ne casse pas sur une synthèse absente', () => {
    expect(decouperSynthese(null)).toEqual({ resume: '', reste: [] })
  })
})

describe('liste des projets', () => {
  const P = [
    { id: 1, numero: 101, deadline: '2026-11-20', quote_data: { status: 'accepte' } },
    { id: 2, numero: 102, deadline: null, quote_data: null },
    { id: 3, numero: 103, deadline: '2026-10-25', quote_data: { status: 'envoye' } },
    { id: 4, numero: 104, deadline: '2026-10-01', phase: 'en_cours', quote_data: { status: 'accepte' } },
    { id: 5, numero: 105, deadline: '2026-10-10', quote_data: { status: 'accepte' } },
    { id: 6, numero: 106, deadline: '2026-12-01', suspended: true, quote_data: { status: 'accepte' } },
  ]
  it('range chaque projet à son étape, dans l’ordre de la frise, la pause à part', () => {
    expect(groupesParEtape(P).map(g => [g.cle, g.projets.map(p => p.id)])).toEqual([
      ['preparation', [2]], ['offre', [3]], ['production', [5, 1]], ['montage', [4]], ['pause', [6]],
    ])
  })
  it('range par livraison ; une phase posée sort le projet du retard', () => {
    expect(groupesParLivraison(P, '2026-10-22').map(g => [g.cle, g.projets.map(p => p.id)])).toEqual([
      ['retard', [5]], ['semaine', [3]], ['mois', [1]], ['tard', [4, 6]], ['sans', [2]],
    ])
  })
  it('dit si une livraison est en retard', () => {
    expect(livraisonEnRetard(P[4], '2026-10-22')).toBe(true)
    expect(livraisonEnRetard(P[3], '2026-10-22')).toBe(false)
    expect(livraisonEnRetard(P[1], '2026-10-22')).toBe(false)
  })
})
