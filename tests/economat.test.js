import { describe, it, expect } from 'vitest'
import {
  ETAT_CLES, etatInfo, lienOpo, lienCommande, estOpo, validerArticle, validerCategorie,
  categorieDe, couleurDe, COULEUR_DEFAUT, arbreEconomat, filtrerArticles, compterEtats,
  fournisseursUtiles, nomFournisseur, enRetard, planches, CARTES_PAR_FEUILLE,
  niveau, estConfigure, fraction, formatQuantite, formatCommande, choixQuantites, stockApres,
  manquants, validerStock, validerCorrection, validerEntreeListe, entreesUtiles, LISTES,
  etatCalcule, niveauxApprox, libelleNiveau, messageGeste, quand, libellePriseEnCharge, actionAppro,
  libelleMouvement, validerGeste, messageRefus,
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
  it('en modification, n\'exige que la désignation — les articles repris de V1 sont incomplets (§26)', () => {
    expect(validerArticle({ designation: '' }).ok).toBe(false)
    const { ok, valeur } = validerArticle({ designation: 'Toile abrasive P120' })
    expect(ok).toBe(true)
    expect(valeur.designation).toBe('Toile abrasive P120')
    expect(valeur.type).toBe('stocke')
  })

  it('à la création, exige la catégorie, et l\'emplacement pour un article stocké (§2.1)', () => {
    expect(validerArticle({ designation: 'x' }, { creation: true }).erreur).toMatch(/catégorie/i)
    expect(validerArticle({ designation: 'x', categorie_id: 2 }, { creation: true }).erreur).toMatch(/emplacement/i)
    expect(validerArticle({ designation: 'x', categorie_id: 2, emplacement_id: 1 }, { creation: true }).ok).toBe(true)
    // Une référence n'a pas de stock, donc pas d'emplacement de stock.
    expect(validerArticle({ designation: 'Pince à verre', type: 'reference', categorie_id: 2 }, { creation: true }).ok).toBe(true)
  })

  it('n\'écrit plus les anciennes colonnes texte de V1', () => {
    const { valeur } = validerArticle({ designation: 'Ruban', seuil_bas: '½ rouleau', seuil_commander: '~20 %', delai: 'demain' })
    expect(valeur.seuil_bas).toBeUndefined()
    expect(valeur.seuil_commander).toBeUndefined()
    expect(valeur.delai).toBeUndefined()
  })

  it('refuse un type ou un mode d\'approvisionnement inconnus', () => {
    expect(validerArticle({ designation: 'x', type: 'consommable' }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', mode_appro: 'pigeon' }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', mode_appro: 'magasin' }).valeur.mode_appro).toBe('magasin')
  })

  it('la quantité habituelle et son unité vont ensemble (§5, §23.8)', () => {
    expect(validerArticle({ designation: 'x', quantite_cmd: '1000' }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', unite_cmd_id: 1 }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', quantite_cmd: '0', unite_cmd_id: 1 }).ok).toBe(false)
    expect(validerArticle({ designation: 'x', quantite_cmd: '2.5', unite_cmd_id: 1 }).ok).toBe(false)
    const { valeur } = validerArticle({ designation: 'x', quantite_cmd: '1000', unite_cmd_id: '1' })
    expect(valeur).toMatchObject({ quantite_cmd: 1000, unite_cmd_id: 1 })
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

  it('en partiel, ne réécrit que ce qui est envoyé', () => {
    const { valeur } = validerArticle({ id: 1, emplacement_id: '3' }, { partiel: true })
    expect(valeur).toEqual({ emplacement_id: 3 })
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

  it('filtre par emplacement contrôlé, et cherche dans son nom', () => {
    const lieux = [{ id: 1, nom: 'Atelier peinture' }]
    const avec = [...stock, art({ id: 5, designation: 'Godet', emplacement_id: 1 })]
    expect(filtrerArticles(avec, { emplacement: 1, categories: CATS }).map(a => a.id)).toEqual([5])
    expect(filtrerArticles(avec, { recherche: 'peinture', categories: CATS, emplacements: lieux }).map(a => a.id)).toEqual([5])
  })

  it('isole les articles à compléter', () => {
    const complet = art({ id: 6, emplacement_id: 1, suivi: 'entier', decoupage: 1, unite_stock_id: 2, cible: 2, seuil_rouge: 0, stock: 2 })
    expect(filtrerArticles([...stock, complet], { aCompleter: true, categories: CATS }).map(a => a.id)).not.toContain(6)
    expect(filtrerArticles([...stock, complet], { aCompleter: true, categories: CATS }).length).toBe(3)
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

// ── V2 : le modèle Article / Stock ───────────────────────────────────────────
// Les profils du §30 du brief V2, ramenés à ce que l'étape 1 sait calculer.

const UNITES = [
  { id: 1, nom: 'Pièce',   pluriel: 'Pièces',   feminin: true },
  { id: 2, nom: 'Paquet',  pluriel: 'Paquets',  feminin: false },
  { id: 3, nom: 'Boîte',   pluriel: 'Boîtes',   feminin: true },
  { id: 5, nom: 'Bobine',  pluriel: 'Bobines',  feminin: true },
  { id: 12, nom: 'Bouteille', pluriel: 'Bouteilles', feminin: true },
]

// A. Buses 3M : entier, paquet, cible 2, orange 1, rouge 0.
const BUSES = { type: 'stocke', suivi: 'entier', decoupage: 1, unite_stock_id: 2, cible: 2, seuil_orange: 1, seuil_rouge: 0, stock: 2 }
// B. Vis 4×16 : approximative en tiers, boîte, cible 1 (= 3 parts), orange ⅓, rouge vide.
const VIS = { type: 'stocke', suivi: 'approx', decoupage: 3, unite_stock_id: 3, cible: 3, seuil_orange: 1, seuil_rouge: 0, stock: 3, quantite_cmd: 1000, unite_cmd_id: 1 }
// C. PLA noir : entier, bobine, cible 3, orange 2, rouge 1.
const PLA = { type: 'stocke', suivi: 'entier', decoupage: 1, unite_stock_id: 5, cible: 3, seuil_orange: 2, seuil_rouge: 1, stock: 3 }
// D. Disques Ø150 : approximative en quarts, paquet, cible 1 (= 4 parts), orange ½, rouge ¼.
const DISQUES = { type: 'stocke', suivi: 'approx', decoupage: 4, unite_stock_id: 2, cible: 4, seuil_orange: 2, seuil_rouge: 1, stock: 4 }
// G. Sans seuil orange : vert puis directement rouge.
const SANS_ORANGE = { ...BUSES, seuil_orange: null }

describe('V2 — la couleur est calculée (§6)', () => {
  it('PLA : 3 vert, 2 orange, 1 et 0 rouge — l\'exemple exact du brief', () => {
    expect([3, 2, 1, 0].map(stock => niveau({ ...PLA, stock }))).toEqual(['vert', 'orange', 'rouge', 'rouge'])
  })
  it('buses : 2 vert, 1 orange, 0 rouge', () => {
    expect([2, 1, 0].map(stock => niveau({ ...BUSES, stock }))).toEqual(['vert', 'orange', 'rouge'])
  })
  it('vis en tiers : pleine et ⅔ vert, ⅓ orange, vide rouge', () => {
    expect([3, 2, 1, 0].map(stock => niveau({ ...VIS, stock }))).toEqual(['vert', 'vert', 'orange', 'rouge'])
  })
  it('disques en quarts : ¾ vert, ½ orange, ¼ rouge', () => {
    expect([3, 2, 1].map(stock => niveau({ ...DISQUES, stock }))).toEqual(['vert', 'orange', 'rouge'])
  })
  it('sans seuil orange, on passe directement du vert au rouge', () => {
    expect([2, 1, 0].map(stock => niveau({ ...SANS_ORANGE, stock }))).toEqual(['vert', 'vert', 'rouge'])
  })
  it('un stock au-dessus de la cible reste vert (achat exceptionnel)', () => {
    expect(niveau({ ...BUSES, stock: 5 })).toBe('vert')
  })
  it('ne devine rien pour un article non configuré ni pour une référence', () => {
    expect(niveau({ type: 'stocke', suivi: null, etat: 'commander' })).toBeNull()
    expect(niveau({ ...BUSES, type: 'reference' })).toBeNull()
    expect(estConfigure(BUSES)).toBe(true)
    expect(estConfigure({ ...BUSES, stock: null })).toBe(false)
  })
  it('les champs vides d\'un formulaire ne comptent pas comme zéro', () => {
    expect(niveau({ ...SANS_ORANGE, seuil_orange: '', stock: '1' })).toBe('vert')
  })
})

describe('V2 — affichage des quantités', () => {
  it('écrit les fractions simples, jamais 0,33', () => {
    expect(fraction(1, 3)).toBe('⅓')
    expect(fraction(2, 3)).toBe('⅔')
    expect(fraction(2, 4)).toBe('½')
    expect(fraction(3, 4)).toBe('¾')
    expect(fraction(5, 3)).toBe('1 ⅔')
    expect(fraction(3, 1)).toBe('3')
    expect(fraction(0, 4)).toBe('0')
  })
  it('accorde l\'unité : « 0 paquet », « 1 boîte », « 3 bobines »', () => {
    expect(formatQuantite(0, BUSES, UNITES)).toBe('0 paquet')
    expect(formatQuantite(3, PLA, UNITES)).toBe('3 bobines')
    expect(formatQuantite(3, VIS, UNITES)).toBe('1 boîte')
    expect(formatQuantite(1, VIS, UNITES)).toBe('⅓ boîte')
  })
  it('une quantité approximative à zéro s\'écrit « Vide » (§23.7)', () => {
    expect(formatQuantite(0, VIS, UNITES)).toBe('Vide')
  })
  it('la quantité habituelle reste dans l\'unité de COMMANDE (§23.8)', () => {
    expect(formatCommande(VIS, UNITES)).toBe('1000 pièces')
    expect(formatCommande({ quantite_cmd: 1, unite_cmd_id: 12 }, UNITES)).toBe('1 bouteille')
    expect(formatCommande({ quantite_cmd: null }, UNITES)).toBe('')
  })
  it('propose les seuils comme des choix, du vide jusque sous la cible', () => {
    expect(choixQuantites(VIS, UNITES, { jusqua: 2 }).map(c => c.libelle)).toEqual(['Vide', '⅓ boîte', '⅔ boîte'])
    expect(choixQuantites(BUSES, UNITES, { jusqua: 1 }).map(c => c.parts)).toEqual([0, 1])
  })
})

describe('V2 — validation du bloc Stock', () => {
  const brut = { type: 'stocke', suivi: 'approx', decoupage: '3', unite_stock_id: '3', cible: '3', seuil_orange: '1', seuil_rouge: '0' }

  it('pose le stock à la cible à la première configuration (§4.2)', () => {
    const { ok, valeur } = validerStock(brut, {})
    expect(ok).toBe(true)
    expect(valeur).toMatchObject({ suivi: 'approx', decoupage: 3, unite_stock_id: 3, cible: 3, seuil_orange: 1, seuil_rouge: 0, stock: 3 })
  })
  it('garde le stock courant quand on retouche un seuil', () => {
    expect(validerStock({ ...brut, seuil_orange: '2' }, { ...VIS, stock: 1 }).valeur.stock).toBe(1)
  })
  it('ré-échelonne le stock si le découpage change : ⅔ en tiers devient ¾ en quarts', () => {
    expect(stockApres({ suivi: 'approx', decoupage: 3, stock: 2 }, { suivi: 'approx', decoupage: 4, cible: 4 })).toBe(3)
    expect(stockApres({ suivi: 'approx', decoupage: 3, stock: 0 }, { suivi: 'approx', decoupage: 4, cible: 4 })).toBe(0)
  })
  it('un mode entier a toujours un découpage de 1', () => {
    expect(validerStock({ suivi: 'entier', decoupage: '4', unite_stock_id: 2, cible: 2, seuil_rouge: 0 }).valeur.decoupage).toBe(1)
  })
  it('empêche un seuil orange sous le rouge — ou à son niveau (§6)', () => {
    expect(validerStock({ ...brut, seuil_orange: '0', seuil_rouge: '1' }).ok).toBe(false)
    expect(validerStock({ ...brut, seuil_orange: '1', seuil_rouge: '1' }).ok).toBe(false)
  })
  it('exige une cible au-dessus des seuils', () => {
    const pla = { suivi: 'entier', unite_stock_id: 5, cible: '2', seuil_orange: '2', seuil_rouge: '1' }
    expect(validerStock(pla).ok).toBe(false)
    expect(validerStock({ ...pla, seuil_orange: '' }).ok).toBe(true)
    expect(validerStock({ ...pla, cible: '0', seuil_orange: '', seuil_rouge: '0' }).ok).toBe(false)
  })
  it('une quantité approximative suit UN seul contenant : la cible est une boîte pleine', () => {
    // Même si le navigateur envoie « 2 boîtes », la cible reste 1 boîte = 3 parts en tiers.
    expect(validerStock({ ...brut, cible: '6' }).valeur.cible).toBe(3)
    expect(validerStock({ ...brut, decoupage: '4', seuil_orange: '2', seuil_rouge: '1' }).valeur.cible).toBe(4)
  })
  it('exige l\'unité, le découpage d\'une quantité approximative et le seuil rouge', () => {
    expect(validerStock({ ...brut, unite_stock_id: '' }).ok).toBe(false)
    expect(validerStock({ ...brut, decoupage: '' }).ok).toBe(false)
    expect(validerStock({ ...brut, decoupage: '7' }).ok).toBe(false)
    expect(validerStock({ ...brut, seuil_rouge: '' }).ok).toBe(false)
    expect(validerStock({ ...brut, suivi: 'au pif' }).ok).toBe(false)
  })
  it('refuse les parts non entières : personne ne saisit 0,33', () => {
    expect(validerStock({ ...brut, seuil_orange: '0.33' }).ok).toBe(false)
  })
  it('un suivi vide ou une référence effacent tout le bloc', () => {
    expect(validerStock({ ...brut, suivi: '' }).valeur).toEqual({ suivi: null, unite_stock_id: null, decoupage: null, cible: null, seuil_orange: null, seuil_rouge: null, stock: null })
    expect(validerStock({ ...brut, type: 'reference' }).valeur.stock).toBeNull()
  })
  it('la correction manuelle est un entier positif, et peut dépasser la cible', () => {
    expect(validerCorrection('5', BUSES)).toEqual({ ok: true, valeur: 5 })
    expect(validerCorrection('-1', BUSES).ok).toBe(false)
    expect(validerCorrection('', BUSES).ok).toBe(false)
    expect(validerCorrection('1', { suivi: null }).ok).toBe(false)
  })
})

describe('V2 — articles à compléter (§26)', () => {
  it('liste ce qui manque à un article repris de V1', () => {
    expect(manquants(art({ categorie_id: 2 }))).toEqual(['emplacement', 'stock et seuils'])
  })
  it('un article complet ne manque de rien', () => {
    expect(manquants({ ...BUSES, designation: 'Buses', categorie_id: 2, emplacement_id: 1 })).toEqual([])
  })
  it('une référence n\'a besoin ni d\'emplacement ni de stock', () => {
    expect(manquants({ type: 'reference', designation: 'Pince à verre', categorie_id: 2 })).toEqual([])
  })
})

describe('V2 — listes administrables', () => {
  it('ne connaît que trois listes, par une liste blanche', () => {
    expect(Object.keys(LISTES).sort()).toEqual(['delais', 'emplacements', 'unites'])
  })
  it('exige un nom ; une unité reçoit son pluriel', () => {
    expect(validerEntreeListe('emplacements', { nom: ' ' }).ok).toBe(false)
    expect(validerEntreeListe('unites', { nom: 'Sac' }).valeur).toMatchObject({ nom: 'Sac', pluriel: 'Sac' })
    expect(validerEntreeListe('unites', { nom: 'Sac', pluriel: 'Sacs', feminin: false }).valeur.pluriel).toBe('Sacs')
  })
  it('un délai porte ses jours ouvrables, ou rien (« Sur commande »)', () => {
    expect(validerEntreeListe('delais', { libelle: '1 semaine', jours_ouvrables: '5' }).valeur.jours_ouvrables).toBe(5)
    expect(validerEntreeListe('delais', { libelle: 'Sur commande', jours_ouvrables: '' }).valeur.jours_ouvrables).toBeNull()
    expect(validerEntreeListe('delais', { libelle: 'x', jours_ouvrables: '-2' }).ok).toBe(false)
  })
  it('en modification, archive sans exiger le nom', () => {
    expect(validerEntreeListe('unites', { archived: true }, { partiel: true }).valeur).toEqual({ archived: true })
  })
  it('propose les entrées actives, plus l\'archivée que l\'article porte encore', () => {
    const lieux = [{ id: 1, nom: 'Économat' }, { id: 2, nom: 'Bus', archived: true }]
    expect(entreesUtiles(lieux).map(e => e.id)).toEqual([1])
    expect(entreesUtiles(lieux, '2').map(e => e.id)).toEqual([1, 2])
  })
})

// ── V2 étape 2 : les gestes ──────────────────────────────────────────────────

describe('V2 — état recalculé, même règle que la base', () => {
  it('suit le niveau, et la prise en charge passe devant', () => {
    expect(etatCalcule({ ...PLA, stock: 3 })).toBe('ok')
    expect(etatCalcule({ ...PLA, stock: 2 })).toBe('bas')
    expect(etatCalcule({ ...PLA, stock: 0 })).toBe('commander')
    expect(etatCalcule({ ...PLA, stock: 0, reappro_le: '2026-09-28T06:12:00Z' })).toBe('commande')
  })
  it('ne calcule rien pour un article non configuré', () => {
    expect(etatCalcule({ type: 'stocke', suivi: null })).toBeNull()
  })
})

describe('V2 — le QR (§12, §13)', () => {
  it('propose « Pleine | ⅔ | ⅓ | Vide » pour une boîte en tiers', () => {
    expect(niveauxApprox(VIS, UNITES).map(n => n.libelle)).toEqual(['Pleine', '⅔', '⅓', 'Vide'])
  })
  it('« Plein » pour un paquet, en quarts', () => {
    expect(niveauxApprox(DISQUES, UNITES).map(n => n.libelle)).toEqual(['Plein', '¾', '½', '¼', 'Vide'])
  })
  it('rien pour une quantité entière', () => {
    expect(niveauxApprox(PLA, UNITES)).toEqual([])
  })
  it('« Stock passé de 3 à 2 » en entier, par niveaux en approximatif', () => {
    expect(messageGeste(3, 2, PLA, UNITES)).toBe('Stock passé de 3 à 2')
    expect(messageGeste(3, 1, VIS, UNITES)).toBe('Stock passé de Pleine à ⅓')
    expect(libelleNiveau(0, VIS, UNITES)).toBe('Vide')
  })
})

describe('V2 — prise en charge et approvisionnement (§17, §18)', () => {
  it('dit qui et quand, à l\'heure de l\'atelier', () => {
    // 06:12 UTC le 28 septembre = 08:12 à Zurich (heure d'été).
    expect(quand('2026-09-28T06:12:00Z')).toBe('28.09 à 08:12')
    expect(libellePriseEnCharge({ reappro_par: 'Arnaud', reappro_le: '2026-09-28T06:12:00Z' }))
      .toBe('Pris en charge par Arnaud · 28.09 à 08:12')
    expect(libellePriseEnCharge({ reappro_le: null })).toBe('')
  })
  it('en ligne : « Commander chez OPO » et le lien déduit', () => {
    const a = actionAppro({ mode_appro: 'en_ligne', fournisseur_id: 10, reference: '83.236.16' }, FOURS)
    expect(a).toMatchObject({ magasin: false, libelle: 'Commander chez OPO' })
    expect(a.lien).toContain('83.236.16')
  })
  it('en magasin : « À acheter chez Ruco », avec la note', () => {
    const a = actionAppro({ mode_appro: 'magasin', fournisseur_id: 20, note_appro: 'Ramener la bouteille vide' }, [{ id: 20, nom: 'Ruco' }])
    expect(a).toEqual({ magasin: true, libelle: 'À acheter chez Ruco', lien: '', note: 'Ramener la bouteille vide' })
  })
})

describe('V2 — historique (§20)', () => {
  it('relit un mouvement avec le découpage DU MOMENT', () => {
    // La ligne date d'un suivi en tiers ; l'article est passé en quarts depuis.
    const m = { type: 'niveau', avant: 3, apres: 1, decoupage: 3 }
    expect(libelleMouvement(m, { ...VIS, decoupage: 4, cible: 4 }, UNITES)).toBe('Niveau constaté · 1 → ⅓')
  })
  it('écrit les gestes sans quantité', () => {
    expect(libelleMouvement({ type: 'prise_en_charge' }, PLA, UNITES)).toBe('Pris en charge')
    expect(libelleMouvement({ type: 'mouvement', avant: 3, apres: 2, decoupage: 1 }, PLA, UNITES)).toBe('Stock · 3 → 2')
  })
})

describe('V2 — validation d\'un geste', () => {
  it('−1 / +2 : un entier non nul', () => {
    expect(validerGeste({ type: 'mouvement', delta: -1 }).valeur).toEqual({ type: 'mouvement', delta: -1, valeur: null })
    expect(validerGeste({ type: 'ajustement', delta: 0 }).ok).toBe(false)
    expect(validerGeste({ type: 'mouvement', delta: 0.5 }).ok).toBe(false)
  })
  it('niveau et correction : une valeur positive', () => {
    expect(validerGeste({ type: 'niveau', valeur: 1 }).valeur).toEqual({ type: 'niveau', delta: null, valeur: 1 })
    expect(validerGeste({ type: 'correction', valeur: -1 }).ok).toBe(false)
  })
  it('le réapprovisionnement n\'attend rien ; un geste inconnu est refusé', () => {
    expect(validerGeste({ type: 'reappro' }).ok).toBe(true)
    expect(validerGeste({ type: 'vider_tout' }).ok).toBe(false)
  })
  it('traduit les refus de la base, en nommant qui a déjà pris en charge', () => {
    expect(messageRefus({ raison: 'deja_pris', par: 'Arnaud', le: '2026-09-28T06:12:00Z' }))
      .toBe('Déjà pris en charge par Arnaud · 28.09 à 08:12.')
    expect(messageRefus({ raison: 'stock_change' })).toMatch(/bougé/)
  })
})
