import { describe, it, expect } from 'vitest'
import {
  normaliserSite, estLienValide, validerEntree, validerCategorie,
  descendantes, categoriesDe, arbreAnnuaire, filtrerEntrees,
} from '../lib/annuaire'

// Sous-traitance ─ Tôlerie ─ Thermolaquage ; Atelier ─ CNC ─ Fraises
const CATS = [
  { id: 1, nom: 'Sous-traitance', parent_id: null },
  { id: 2, nom: 'Tôlerie', parent_id: 1 },
  { id: 3, nom: 'Thermolaquage', parent_id: 1 },
  { id: 4, nom: 'Atelier et achats', parent_id: null },
  { id: 5, nom: 'CNC', parent_id: 4 },
  { id: 6, nom: 'Fraises', parent_id: 5 },
]
const ENTREES = [
  { id: 10, nom: 'Métaux Dupont', quoi: 'découpe et pliage', ville: 'Bussigny' },
  { id: 11, nom: 'Laquage Vaudois', quoi: 'poudre époxy', ville: 'Genève' },
  { id: 12, nom: 'OutilPro', quoi: 'outils coupants', site: 'https://outilpro.ch' },
  { id: 13, nom: 'Vieux fournisseur', archived: true },
]
const LIENS = [
  { entree_id: 10, categorie_id: 2 },
  { entree_id: 11, categorie_id: 3 },
  { entree_id: 12, categorie_id: 6 },
]

describe('normaliserSite', () => {
  it('pose le préfixe manquant plutôt que de refuser l\'adresse', () => {
    expect(normaliserSite('ruco.ch')).toBe('https://ruco.ch')
    expect(normaliserSite('www.ruco.ch/produits')).toBe('https://www.ruco.ch/produits')
    expect(normaliserSite('https://ruco.ch')).toBe('https://ruco.ch')
    expect(normaliserSite('  http://ruco.ch  ')).toBe('http://ruco.ch')
  })

  it('garde tel quel ce qui n\'est pas une adresse, et ne le donne pas pour un lien', () => {
    expect(normaliserSite('demander à Arnaud')).toBe('demander à Arnaud')
    expect(estLienValide(normaliserSite('demander à Arnaud'))).toBe(false)
    expect(estLienValide(normaliserSite('ruco.ch'))).toBe(true)
    expect(normaliserSite('')).toBe('')
  })
})

describe('validerEntree — un nom suffit', () => {
  it('accepte une entrée qui n\'a qu\'un nom', () => {
    const r = validerEntree({ nom: 'Thermolaquage Riviera' })
    expect(r.ok).toBe(true)
    expect(r.valeur.nom).toBe('Thermolaquage Riviera')
    expect(r.valeur.site).toBe('')
  })

  it('refuse une entrée sans nom, et une adresse e-mail fantaisiste', () => {
    expect(validerEntree({ quoi: 'thermolaquage' }).ok).toBe(false)
    expect(validerEntree({ nom: '   ' }).ok).toBe(false)
    expect(validerEntree({ nom: 'X', email: 'pas-une-adresse' }).ok).toBe(false)
    expect(validerEntree({ nom: 'X', email: 'info@laquage.ch' }).ok).toBe(true)
  })

  it('ne retient que les champs prévus', () => {
    const r = validerEntree({ nom: 'X', id: 99, archived: true, created_by: 'pirate', inconnu: 'x' })
    expect(Object.keys(r.valeur).sort()).toEqual(
      ['adresse', 'archived', 'contact_nom', 'email', 'nom', 'notes', 'quoi', 'site', 'telephone', 'ville'])
    expect(r.valeur.created_by).toBeUndefined()
  })

  it('nettoie la liste des catégories : entiers, sans doublon', () => {
    const r = validerEntree({ nom: 'X', categories: [2, 2, '3', 0, -1, 'abc', null] })
    expect(r.categories).toEqual([2, 3])
  })

  it('en modification partielle, seuls les champs envoyés comptent', () => {
    const r = validerEntree({ quoi: 'nouvelle description' }, { partiel: true })
    expect(r.ok).toBe(true)
    expect(Object.keys(r.valeur)).toEqual(['quoi'])
  })
})

describe('validerCategorie — l\'arbre ne peut pas boucler', () => {
  it('accepte une racine et une sous-catégorie', () => {
    expect(validerCategorie({ nom: 'Sols' }, CATS).valeur).toEqual({ nom: 'Sols', parent_id: null })
    expect(validerCategorie({ nom: 'Moquette', parent_id: 1 }, CATS).valeur.parent_id).toBe(1)
  })

  it('refuse un parent inconnu, soi-même, ou l\'une de ses descendantes', () => {
    expect(validerCategorie({ nom: 'X', parent_id: 999 }, CATS).ok).toBe(false)
    expect(validerCategorie({ nom: 'CNC', parent_id: 5 }, CATS, { id: 5 }).ok).toBe(false)
    // 6 (Fraises) descend de 5 (CNC) : 5 ne peut pas se ranger sous 6.
    expect(validerCategorie({ nom: 'CNC', parent_id: 6 }, CATS, { id: 5 }).ok).toBe(false)
  })
})

describe('arbre et rattachements', () => {
  it('descendantes remonte toute la profondeur', () => {
    expect(descendantes(4, CATS).map(c => c.nom)).toEqual(['CNC', 'Fraises'])
    expect(descendantes(6, CATS)).toEqual([])
  })

  it('compte les entrées des sous-catégories dans leur parente', () => {
    const arbre = arbreAnnuaire(CATS, LIENS)
    const atelier = arbre.find(c => c.nom === 'Atelier et achats')
    expect(atelier.nb).toBe(1)                       // OutilPro, rangé deux niveaux plus bas
    expect(atelier.enfants[0].nom).toBe('CNC')
    expect(atelier.enfants[0].nb).toBe(1)
    expect(arbre.find(c => c.nom === 'Sous-traitance').nb).toBe(2)
  })

  it('ne compte pas deux fois une entrée rangée dans la mère et la fille', () => {
    const liens = [...LIENS, { entree_id: 12, categorie_id: 5 }]
    expect(arbreAnnuaire(CATS, liens).find(c => c.nom === 'Atelier et achats').nb).toBe(1)
  })

  it('categoriesDe rend les catégories d\'une entrée', () => {
    expect(categoriesDe(11, LIENS, CATS).map(c => c.nom)).toEqual(['Thermolaquage'])
  })
})

describe('filtrerEntrees — retrouver sans se souvenir du nom', () => {
  const opts = { liens: LIENS, categories: CATS }

  it('cherche dans le nom, ce qu\'ils font, la ville — sans accent ni casse', () => {
    expect(filtrerEntrees(ENTREES, { ...opts, recherche: 'pliage' }).map(e => e.nom)).toEqual(['Métaux Dupont'])
    expect(filtrerEntrees(ENTREES, { ...opts, recherche: 'METAUX' }).map(e => e.nom)).toEqual(['Métaux Dupont'])
    expect(filtrerEntrees(ENTREES, { ...opts, recherche: 'geneve' }).map(e => e.nom)).toEqual(['Laquage Vaudois'])
  })

  it('trouve par le nom de la CATÉGORIE, même absent de la fiche', () => {
    expect(filtrerEntrees(ENTREES, { ...opts, recherche: 'thermolaquage' }).map(e => e.nom)).toEqual(['Laquage Vaudois'])
    expect(filtrerEntrees(ENTREES, { ...opts, recherche: 'fraises' }).map(e => e.nom)).toEqual(['OutilPro'])
  })

  it('exige tous les mots', () => {
    expect(filtrerEntrees(ENTREES, { ...opts, recherche: 'poudre geneve' })).toHaveLength(1)
    expect(filtrerEntrees(ENTREES, { ...opts, recherche: 'poudre bussigny' })).toHaveLength(0)
  })

  it('une catégorie choisie inclut ses sous-catégories', () => {
    expect(filtrerEntrees(ENTREES, { ...opts, categorie: 5 }).map(e => e.nom)).toEqual(['OutilPro'])
    expect(filtrerEntrees(ENTREES, { ...opts, categorie: 4 }).map(e => e.nom)).toEqual(['OutilPro'])
    expect(filtrerEntrees(ENTREES, { ...opts, categorie: 1 }).map(e => e.nom)).toEqual(['Laquage Vaudois', 'Métaux Dupont'])
  })

  it('laisse les archivées de côté, sauf si on les demande', () => {
    expect(filtrerEntrees(ENTREES, opts).some(e => e.archived)).toBe(false)
    expect(filtrerEntrees(ENTREES, { ...opts, archivees: true })).toHaveLength(4)
  })

  it('range par nom, et supporte des listes absentes', () => {
    expect(filtrerEntrees(ENTREES, opts).map(e => e.nom)).toEqual(['Laquage Vaudois', 'Métaux Dupont', 'OutilPro'])
    expect(filtrerEntrees(undefined, {})).toEqual([])
  })
})
