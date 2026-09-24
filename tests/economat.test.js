import { describe, it, expect } from 'vitest'
import {
  ETAT_CLES, etatInfo, lienOpo, lienCommande, estOpo, validerArticle, validerCategorie,
  categorieDe, couleurDe, COULEUR_DEFAUT, arbreEconomat, filtrerArticles, compterEtats,
  valeursDistinctes, fournisseursUtiles, nomFournisseur, enRetard, planches, CARTES_PAR_FEUILLE,
} from '../lib/economat'

// Arbre de départ, réduit : une racine colorée, deux filles, une seconde racine.
const CATS = [
  { id: 1, nom: 'Fixation & quincaillerie', parent_id: null, couleur: '#A8C0DC' },
  { id: 2, nom: 'Visserie bois', parent_id: 1, couleur: null },
  { id: 3, nom: 'Chevilles & ancrages', parent_id: 1, couleur: null },
  { id: 4, nom: 'Abrasifs', parent_id: null, couleur: '#D9B48F' },
]

// La liste contrôlée des fournisseurs, telle que la migration la sème.
const FOURS = [
  { id: 10, nom: 'OPO' },
  { id: 11, nom: 'qbendo.ch' },
  { id: 12, nom: 'Galaxus' },
  { id: 13, nom: 'Conrad', archived: true },
]

const art = (p = {}) => ({
  id: 1, code: 'ECO-0001', designation: 'Vis 4x16', categorie_id: 2,
  fournisseur_id: 10, reference: '85.175.4016', url_produit: '', etat: 'ok',
  etat_le: null, delai_jours: null, archived: false, emplacement: '', notes: '', ...p,
})

describe('états', () => {
  it('ne connaît que quatre clés, sans emoji en base', () => {
    expect(ETAT_CLES).toEqual(['ok', 'bas', 'commander', 'commande'])
  })

  it('n\'explose pas sur un état inconnu', () => {
    // Une valeur venue d'une base plus récente ne doit pas casser l'écran.
    expect(etatInfo('zzz').libelle).toBe('zzz')
    expect(etatInfo('zzz').emoji).toBe('')
  })
})

describe('lien fournisseur', () => {
  it('fabrique le lien OPO depuis la seule référence', () => {
    // Vérifié en direct : cette adresse redirige sur la fiche produit.
    expect(lienOpo('85.175.4016')).toBe('https://www.opo.ch/fr/s?searchfield=85.175.4016')
  })

  it('n\'invente rien sans référence', () => {
    expect(lienOpo('')).toBe('')
    expect(lienCommande(art({ reference: '' }), FOURS)).toBe('')
  })

  it('reconnaît OPO quelle que soit la casse', () => {
    expect(estOpo('OPO')).toBe(true)
    expect(estOpo('opo oeschger')).toBe(true)
    expect(estOpo('Galaxus')).toBe(false)
  })

  it('déduit le lien OPO depuis la liste contrôlée', () => {
    expect(lienCommande(art(), FOURS)).toBe('https://www.opo.ch/fr/s?searchfield=85.175.4016')
  })

  it('l\'URL saisie gagne sur le lien déduit', () => {
    // La décision humaine passe avant la déduction — c'est la soupape si la
    // structure d'opo.ch bouge, ou pour une fiche qui ne sort pas de leur
    // recherche.
    expect(lienCommande(art({ url_produit: 'https://exemple.ch/p/1' }), FOURS)).toBe('https://exemple.ch/p/1')
  })

  it('ne devine aucune adresse pour les autres fournisseurs', () => {
    expect(lienCommande(art({ fournisseur_id: 12, reference: 'ABC' }), FOURS)).toBe('')
  })

  it('ne devine rien sans fournisseur', () => {
    expect(lienCommande(art({ fournisseur_id: null }), FOURS)).toBe('')
  })
})

describe('validation d\'un article', () => {
  it('exige une désignation, et rien d\'autre', () => {
    expect(validerArticle({ designation: '' }).ok).toBe(false)
    const { ok, valeur } = validerArticle({ designation: 'Toile abrasive P120' })
    expect(ok).toBe(true)
    expect(valeur.designation).toBe('Toile abrasive P120')
    // Tous les seuils restent vides plutôt que de recevoir une valeur inventée.
    expect(valeur.seuil_bas).toBe('')
    expect(valeur.stock_cible).toBe('')
  })

  it('garde les seuils humains tels quels', () => {
    const { valeur } = validerArticle({ designation: 'Ruban', seuil_bas: '½ rouleau', seuil_commander: '~20 % restant' })
    expect(valeur.seuil_bas).toBe('½ rouleau')
    expect(valeur.seuil_commander).toBe('~20 % restant')
  })

  it('refuse un fournisseur qui n\'est pas un identifiant', () => {
    expect(validerArticle({ designation: 'x', fournisseur_id: 'OPO' }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', fournisseur_id: '' }).valeur.fournisseur_id).toBeNull()
    expect(validerArticle({ designation: 'x', fournisseur_id: '10' }).valeur.fournisseur_id).toBe(10)
  })

  it('n\'accepte ni code, ni jeton, ni état — ils ne viennent jamais du navigateur', () => {
    const { valeur } = validerArticle({ designation: 'x', code: 'ECO-9999', jeton: 'pirate', etat: 'commande' })
    expect(valeur.code).toBeUndefined()
    expect(valeur.jeton).toBeUndefined()
    expect(valeur.etat).toBeUndefined()
  })

  it('refuse une URL qui ne mènerait nulle part', () => {
    expect(validerArticle({ designation: 'x', url_produit: 'opo.ch' }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', url_produit: 'https://opo.ch' }).ok).toBe(true)
  })

  it('borne le délai en jours, et accepte son absence', () => {
    expect(validerArticle({ designation: 'x', delai_jours: '' }).valeur.delai_jours).toBeNull()
    expect(validerArticle({ designation: 'x', delai_jours: '3' }).valeur.delai_jours).toBe(3)
    expect(validerArticle({ designation: 'x', delai_jours: '400' }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', delai_jours: '1.5' }).ok).toBe(false)
  })

  it('en partiel, ne réécrit que ce qui est envoyé', () => {
    const { valeur } = validerArticle({ id: 1, emplacement: 'Rayon B' }, { partiel: true })
    expect(valeur).toEqual({ emplacement: 'Rayon B' })
  })
})

describe('catégories', () => {
  it('refuse une couleur qui n\'est pas #RRGGBB', () => {
    expect(validerCategorie({ nom: 'x', couleur: 'rouge' }, CATS).ok).toBe(false)
    expect(validerCategorie({ nom: 'x', couleur: '#A8C0DC' }, CATS).valeur.couleur).toBe('#A8C0DC')
  })

  it('n\'accorde de couleur qu\'au premier niveau', () => {
    // Une sous-catégorie hérite : cinquante teintes seraient cinquante teintes
    // indiscernables sur le bandeau d'une carte.
    const { valeur } = validerCategorie({ nom: 'Vis inox', parent_id: 1, couleur: '#123456' }, CATS)
    expect(valeur.couleur).toBeNull()
  })

  it('refuse qu\'une catégorie descende d\'elle-même', () => {
    expect(validerCategorie({ nom: 'Fixation', parent_id: 2 }, CATS, { id: 1 }).ok).toBe(false)
  })
})

describe('rangement', () => {
  it('remonte jusqu\'à la racine pour trouver la couleur', () => {
    expect(couleurDe(art({ categorie_id: 2 }), CATS)).toBe('#A8C0DC')
    expect(categorieDe(art({ categorie_id: 2 }), CATS).racine.nom).toBe('Fixation & quincaillerie')
  })

  it('un article sans catégorie s\'imprime quand même', () => {
    expect(couleurDe(art({ categorie_id: null }), CATS)).toBe(COULEUR_DEFAUT)
  })

  it('compte les articles des sous-catégories dans la mère', () => {
    // Sans cette remontée, « Fixation » afficherait zéro alors que tout est
    // rangé dans ses filles.
    const arbre = arbreEconomat(CATS, [art({ id: 1, categorie_id: 2 }), art({ id: 2, categorie_id: 3 })])
    const fixation = arbre.find(c => c.id === 1)
    expect(fixation.nb).toBe(2)
    expect(fixation.enfants.map(e => e.nb)).toEqual([1, 1])
  })

  it('n\'y compte pas les archivés', () => {
    const arbre = arbreEconomat(CATS, [art({ id: 1, categorie_id: 2 }), art({ id: 2, categorie_id: 2, archived: true })])
    expect(arbre.find(c => c.id === 1).nb).toBe(1)
  })
})

describe('filtrage', () => {
  const stock = [
    art({ id: 1, designation: 'Vis 4x16', categorie_id: 2, reference: '85.175.4016', etat: 'ok' }),
    art({ id: 2, designation: 'Cheville nylon 8', categorie_id: 3, reference: '11.222.3', etat: 'commander' }),
    art({ id: 3, designation: 'Disque P80', categorie_id: 4, fournisseur_id: 12, reference: 'GX1', etat: 'bas' }),
    art({ id: 4, designation: 'Vis oubliée', categorie_id: 2, etat: 'ok', archived: true }),
  ]

  it('choisir une catégorie inclut ses sous-catégories', () => {
    expect(filtrerArticles(stock, { categorie: 1, categories: CATS }).map(a => a.id)).toEqual([2, 1])
  })

  it('cherche aussi dans la référence — c\'est elle qui fait foi', () => {
    expect(filtrerArticles(stock, { recherche: '85.175.4016', categories: CATS }).map(a => a.id)).toEqual([1])
  })

  it('cherche dans le nom des catégories', () => {
    // « abrasifs » n'est écrit dans aucune fiche.
    expect(filtrerArticles(stock, { recherche: 'abrasifs', categories: CATS }).map(a => a.id)).toEqual([3])
  })

  it('cherche dans le nom du fournisseur, qui n\'est plus sur la ligne', () => {
    // Le fournisseur vit dans sa propre table : sans le passer, on ne le
    // trouverait plus — c'est le piège de la liste contrôlée.
    expect(filtrerArticles(stock, { recherche: 'galaxus', categories: CATS, fournisseurs: FOURS }).map(a => a.id)).toEqual([3])
  })

  it('exige TOUS les mots, sans se soucier des accents', () => {
    expect(filtrerArticles(stock, { recherche: 'cheville NYLON', categories: CATS }).map(a => a.id)).toEqual([2])
    expect(filtrerArticles(stock, { recherche: 'cheville disque', categories: CATS })).toEqual([])
  })

  it('écarte les archivés sauf demande explicite', () => {
    expect(filtrerArticles(stock, { categories: CATS }).some(a => a.id === 4)).toBe(false)
    expect(filtrerArticles(stock, { categories: CATS, archives: true }).some(a => a.id === 4)).toBe(true)
  })

  it('croise l\'état et le fournisseur — le cas d\'usage d\'une promo OPO', () => {
    expect(filtrerArticles(stock, { fournisseur: 10, etat: 'commander', categories: CATS }).map(a => a.id)).toEqual([2])
  })

  it('compte les états sans les archivés', () => {
    expect(compterEtats(stock)).toEqual({ tout: 3, ok: 1, bas: 1, commander: 1, commande: 0 })
  })

  it('ne propose en filtre que les emplacements réellement saisis', () => {
    expect(valeursDistinctes(stock, 'emplacement')).toEqual([])
    expect(valeursDistinctes([...stock, art({ id: 5, emplacement: 'Rayon B' })], 'emplacement')).toEqual(['Rayon B'])
  })
})

describe('liste contrôlée des fournisseurs', () => {
  it('résout un nom, et ne renvoie rien pour une clé absente', () => {
    expect(nomFournisseur(10, FOURS)).toBe('OPO')
    expect(nomFournisseur(null, FOURS)).toBe('')
    expect(nomFournisseur(99, FOURS)).toBe('')
  })

  it('propose les actifs, plus les archivés encore utilisés', () => {
    // Sans ça, archiver Conrad ferait disparaître du filtre les articles
    // qu'on lui achète encore — et donc les articles eux-mêmes.
    const sansConrad = fournisseursUtiles(FOURS, [art({ fournisseur_id: 10 })])
    expect(sansConrad.map(f => f.nom)).toEqual(['Galaxus', 'OPO', 'qbendo.ch'])

    const avecConrad = fournisseursUtiles(FOURS, [art({ fournisseur_id: 13 })])
    expect(avecConrad.map(f => f.nom)).toContain('Conrad')
  })

  it('ignore les articles archivés pour décider ce qui reste utile', () => {
    const liste = fournisseursUtiles(FOURS, [art({ fournisseur_id: 13, archived: true })])
    expect(liste.map(f => f.nom)).not.toContain('Conrad')
  })
})

describe('retard d\'une commande', () => {
  const ilYA = j => new Date(Date.now() - j * 86400000).toISOString()

  it('ne signale rien sans délai en jours', () => {
    // « Le lendemain si avant: 17h » ne se compare pas à une date, et inventer
    // un délai par défaut ferait clignoter la moitié de l'écran.
    expect(enRetard(art({ etat: 'commande', etat_le: ilYA(30), delai_jours: null }))).toBe(false)
  })

  it('signale un 🔵 au-delà de son délai, et lui seul', () => {
    expect(enRetard(art({ etat: 'commande', etat_le: ilYA(5), delai_jours: 2 }))).toBe(true)
    expect(enRetard(art({ etat: 'commande', etat_le: ilYA(1), delai_jours: 2 }))).toBe(false)
    expect(enRetard(art({ etat: 'commander', etat_le: ilYA(99), delai_jours: 2 }))).toBe(false)
  })
})

describe('planches de cartes', () => {
  const lot = n => Array.from({ length: n }, (_, i) => art({ id: i + 1 }))

  it('quatre cartes par feuille A4', () => {
    expect(CARTES_PAR_FEUILLE).toBe(4)
    expect(planches(lot(8))).toHaveLength(2)
  })

  it('une dernière feuille incomplète laisse des cases VIDES', () => {
    // On ne recompose pas une planche pour la remplir : les cartes doivent
    // sortir dans l'ordre du catalogue, pas dans celui du papier.
    const feuilles = planches(lot(5))
    expect(feuilles).toHaveLength(2)
    expect(feuilles[1].filter(Boolean)).toHaveLength(1)
    expect(feuilles[1]).toHaveLength(4)
  })

  it('« depart » décale pour réimprimer sur une feuille déjà entamée', () => {
    const [feuille] = planches(lot(1), { depart: 2 })
    expect(feuille[0]).toBeNull()
    expect(feuille[1]).toBeNull()
    expect(feuille[2].id).toBe(1)
    expect(feuille[3]).toBeNull()
  })

  it('un départ aberrant ne casse pas la planche', () => {
    expect(planches(lot(1), { depart: 9 })[0]).toHaveLength(4)
    expect(planches(lot(1), { depart: -3 })[0][0].id).toBe(1)
  })
})
