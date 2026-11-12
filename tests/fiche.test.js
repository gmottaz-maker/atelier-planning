import { describe, it, expect } from 'vitest'
import { aVenir, dateCourte, dateLongue, decouperSynthese, delai, enRetard, groupesParLivraison, groupesParStatut, joursEntre, listeNoms, livraisonEnRetard, parcours, premiereDate, statutCourant, statutStockable } from '../lib/fiche'

describe('statut du projet', () => {
  it('se déduit de l’offre tant que rien n’est posé', () => {
    expect(statutCourant({})).toBe('preparation')
    expect(statutCourant({ statutOffre: 'envoye' })).toBe('preparation')
    expect(statutCourant({ statutOffre: 'accepte' })).toBe('preproduction')
  })
  it('le statut posé à la main a le dernier mot', () => {
    expect(statutCourant({ statut: 'production', statutOffre: 'accepte' })).toBe('production')
    expect(statutCourant({ statut: 'production_terminee' })).toBe('production_terminee')
    expect(statutCourant({ statut: 'exploitation' })).toBe('exploitation')
  })
  it('relit l’ancienne phase d’un projet d’avant les statuts', () => {
    expect(statutCourant({ phase: 'en_cours', statutOffre: 'accepte' })).toBe('exploitation')
    expect(statutCourant({ phase: 'demontage' })).toBe('exploitation')
    expect(statutCourant({ phase: 'termine' })).toBe('termine')
    expect(statutCourant({ statut: 'production', phase: 'termine' })).toBe('production')
  })
  it('un projet terminé passe en facturé dès qu’une facture existe, pas avant d’être terminé', () => {
    expect(statutCourant({ statut: 'termine', facture: true })).toBe('facture')
    expect(statutCourant({ statut: 'production', facture: true })).toBe('production')
  })
  it('la route n’écrit qu’un statut manuel, ou rien', () => {
    expect(statutStockable(null)).toBe(true)
    expect(statutStockable('termine')).toBe(true)
    expect(statutStockable('facture')).toBe(false)
    expect(statutStockable('preproduction')).toBe(false)
    expect(statutStockable('n’importe quoi')).toBe(false)
  })
})

describe('frise', () => {
  const logistique = [
    { type: 'demontage', date: '2026-12-24' },
    { type: 'montage', date: '2026-12-14' },
    { type: 'livraison', date: '2026-12-10' },
  ]
  it('marque ce qui est fait, le statut en cours et ce qui reste', () => {
    const f = parcours({ statut: 'production', statutOffre: 'accepte', logistique })
    expect(f.map(e => e.etat)).toEqual(['fait', 'fait', 'ici', 'avenir', 'avenir', 'avenir', 'avenir'])
    expect(f[0].detail).toBe('offre acceptée')
  })
  it('dit l’état de l’offre sous « préparation »', () => {
    expect(parcours({ statutOffre: 'envoye' })[0].detail).toBe('offre envoyée')
    expect(parcours({})[0].detail).toBe('offre à faire')
  })
  it('date le montage sous « en exploitation » et le démontage sous « terminé »', () => {
    const f = parcours({ statutOffre: 'accepte', logistique })
    expect(f[4].detail).toBe('montage 10 déc.')
    expect(f[5].detail).toBe('démontage 24 déc.')
    expect(parcours({ disassemblyDate: '2026-11-03' })[5].detail).toBe('démontage 3 nov.')
  })
  it('un projet facturé a toutes ses étapes faites', () => {
    const f = parcours({ statut: 'termine', facture: true })
    expect(f.slice(0, -1).every(e => e.etat === 'fait')).toBe(true)
    expect(f[6].etat).toBe('ici')
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
    { id: 5, numero: 105, deadline: '2026-10-10', statut: 'production', quote_data: { status: 'accepte' } },
    { id: 6, numero: 106, deadline: '2026-12-01', suspended: true, quote_data: { status: 'accepte' } },
    { id: 7, numero: 107, deadline: '2026-09-01', statut: 'termine', quote_data: { status: 'accepte' } },
  ]
  it('range chaque projet à son statut, dans l’ordre de la frise, la pause à part', () => {
    expect(groupesParStatut(P, { factures: new Set(['7']) }).map(g => [g.cle, g.projets.map(p => p.id)])).toEqual([
      ['preparation', [3, 2]], ['preproduction', [1]], ['production', [5]], ['exploitation', [4]], ['facture', [7]], ['pause', [6]],
    ])
  })
  it('sort aussi les statuts vides pour les colonnes d’un kanban', () => {
    expect(groupesParStatut(P, { vides: true }).map(g => g.cle)).toEqual(['preparation', 'preproduction', 'production', 'production_terminee', 'exploitation', 'termine', 'facture', 'pause'])
  })
  it('range par livraison ; un projet livré sort du retard', () => {
    expect(groupesParLivraison(P, '2026-10-22').map(g => [g.cle, g.projets.map(p => p.id)])).toEqual([
      ['retard', [5]], ['semaine', [3]], ['mois', [1]], ['tard', [7, 4, 6]], ['sans', [2]],
    ])
  })
  it('dit si une livraison est en retard', () => {
    expect(livraisonEnRetard(P[4], '2026-10-22')).toBe(true)
    expect(livraisonEnRetard(P[3], '2026-10-22')).toBe(false)
    expect(livraisonEnRetard(P[6], '2026-10-22')).toBe(false)
    expect(livraisonEnRetard(P[1], '2026-10-22')).toBe(false)
  })
})
