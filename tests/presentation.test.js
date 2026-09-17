import { describe, it, expect } from 'vitest'
import {
  budgetDepuisDevis, amorcerPresentation, validerMajPresentation, jourCourt,
  emplacementImage, poserImage, imagesDuDeck, hydraterImages, TVA_DEFAUT,
} from '../lib/presentation'
import { validerSortie, extraireJson, promptGeneration, resoudreFichier, pourLeModele } from '../lib/deckRedaction'
import { CONDITIONS_FIXES } from '../lib/deckGabarit'
import { totauxDevis } from '../lib/quoteLines'
import { typeReel, typeDictee, validerFichier, TYPES_AUDIO, TYPES_DICTEE } from '../lib/fileType'

const projet = {
  id: 'p1', numero: 142, name: 'Vitrine Manor', client: 'Moët & Chandon', deadline: '2026-12-17',
  quote_data: {
    number: '2026-09-042', vat_rate: 8.1,
    items: [
      { name: 'Comptoir', labor: [{ rate: 100, quantity: 10 }] },
      { name: 'Vitrine', purchases: [{ unit_price: 200, quantity: 2, margin: 0 }] },
    ],
    management: [{ rate: 120, quantity: 3 }],
    logistics: [{ rate: 3, quantity: 120 }],
  },
}

describe('budgetDepuisDevis — le récapitulatif ne contredit pas l\'offre', () => {
  const budget = budgetDepuisDevis(projet)

  it('retombe exactement sur le total de l\'offre', () => {
    expect(budget.sousTotal).toBe(totauxDevis(projet.quote_data).total)
    expect(budget.total).toBe(Math.round(budget.sousTotal * (100 + TVA_DEFAUT)) / 100)
  })

  it('donne une ligne par pièce, puis les postes groupés', () => {
    expect(budget.lignes.map(l => l.libelle)).toEqual([
      'comptoir', 'vitrine', 'gestion de projet', 'livraison, montage et transport',
    ])
  })

  it('n\'imprime pas un poste à zéro', () => {
    const sansLogistique = budgetDepuisDevis({ quote_data: { items: [], management: [{ rate: 100, quantity: 1 }] } })
    expect(sansLogistique.lignes.map(l => l.libelle)).toEqual(['gestion de projet'])
  })

  it('suit le taux de TVA de l\'offre quand il est forcé', () => {
    const exonere = budgetDepuisDevis({ quote_data: { ...projet.quote_data, vat_rate: 0 } })
    expect(exonere.tva).toBe(0)
    expect(exonere.total).toBe(exonere.sousTotal)
    expect(exonere.libelleTva).toBe('tva 0 %')
  })
})

describe('amorcerPresentation', () => {
  const deck = amorcerPresentation(projet, { pieces: 2, aujourdhui: '2026-09-15' })

  it('reprend le client, le numéro d\'offre et la date, en minuscules', () => {
    expect(deck.couverture.titre).toBe('moët & chandon × [lieu]')
    expect(deck.couverture.sousTitre).toBe('vitrine manor')
    expect(deck.couverture.numero).toBe('offre 2026-09-042')
    expect(deck.couverture.date).toBe('15.09.2026')
  })

  it('pose la date de livraison sur le jalon du planning', () => {
    expect(deck.planning.etapes[3]).toEqual({ date: '17.12.2026', texte: 'livraison et montage' })
  })

  it('garde le gabarit quand l\'offre est vide, plutôt qu\'un budget à zéro', () => {
    const nu = amorcerPresentation({ name: 'x', client: 'y' })
    expect(nu.budget.lignes).toEqual([{ libelle: '[poste]', montant: 0 }])
  })

  it('jourCourt refuse ce qui n\'est pas une date', () => {
    expect(jourCourt('')).toBe('')
    expect(jourCourt('demain')).toBe('')
    expect(jourCourt('2026-01-02T10:00:00Z')).toBe('02.01.2026')
  })
})

describe('validerMajPresentation — le corps n\'est jamais recopié en bloc', () => {
  it('ne retient que le titre et le contenu', () => {
    const { maj } = validerMajPresentation({
      titre: 'Offre Manor', contenu: { a: 1 },
      project_id: 'autre-projet', kdrive_id: 'x', envoyee_le: '2020-01-01', created_by: 'pirate',
    })
    expect(Object.keys(maj).sort()).toEqual(['contenu', 'titre', 'updated_at'])
  })

  it('refuse un contenu qui n\'est pas un document', () => {
    expect(validerMajPresentation({ contenu: 'texte' }).error).toBeTruthy()
    expect(validerMajPresentation({ contenu: [1, 2] }).error).toBeTruthy()
    expect(validerMajPresentation({ titre: '  ' }).error).toBeTruthy()
    expect(validerMajPresentation({}).error).toBeTruthy()
  })
})

describe('emplacements d\'image — le chemin vient du navigateur', () => {
  const deck = () => ({ pieces: [{ images: [{ attente: 'a' }, { attente: 'b' }] }], budget: { total: 100 } })

  it('accepte un emplacement existant', () => {
    expect(emplacementImage(deck(), 'pieces.0.images.1')).toEqual({ attente: 'b' })
  })

  it('refuse la pollution de prototype, les chemins absents et les valeurs', () => {
    expect(emplacementImage(deck(), 'pieces.0.__proto__')).toBeNull()
    expect(emplacementImage(deck(), 'constructor')).toBeNull()
    expect(emplacementImage(deck(), 'pieces.9.images.0')).toBeNull()
    expect(emplacementImage(deck(), 'budget.total')).toBeNull()
    expect(emplacementImage(deck(), '')).toBeNull()
    expect(emplacementImage(deck(), 'a.b.c.d.e.f.g')).toBeNull()
  })

  it('poserImage refuse un chemin qui ment', () => {
    const d = deck()
    expect(poserImage(d, 'pieces.0.images.9', { kdrive_id: '1' })).toBe(false)
    expect(poserImage(d, 'pieces.0.images.0', { kdrive_id: '1', kdrive_nom: 'a.jpg', mime: 'image/jpeg' })).toBe(true)
    expect(imagesDuDeck(d)).toHaveLength(1)
  })

  it('hydraterImages embarque les visuels et survit à un fichier illisible', async () => {
    const d = deck()
    poserImage(d, 'pieces.0.images.0', { kdrive_id: 'ok', kdrive_nom: 'a.jpg', mime: 'image/jpeg' })
    poserImage(d, 'pieces.0.images.1', { kdrive_id: 'ko', kdrive_nom: 'b.jpg', mime: 'image/jpeg' })
    const out = await hydraterImages(d, async id => {
      if (id === 'ko') throw new Error('kDrive 404')
      return { base64: 'AAA', mime: 'image/jpeg' }
    })
    expect(out.pieces[0].images[0].src).toBe('data:image/jpeg;base64,AAA')
    expect(out.pieces[0].images[1].src).toBeUndefined()
    // La source ne fuit pas dans le document enregistré.
    expect(d.pieces[0].images[0].src).toBeUndefined()
  })
})

describe('validerSortie — le modèle compose, le serveur borne', () => {
  const fichiers = [
    { nom: 'vitrine_3d.png', kdrive_id: 'k1', mime: 'image/png' },
    { nom: 'vitrine_ia.png', kdrive_id: 'k2', mime: 'image/png' },
    { nom: 'stand_3d.png', kdrive_id: 'k3', mime: 'image/png' },
  ]
  const budget = { lignes: [{ libelle: 'fabrication', montant: 300 }], sousTotal: 300, tva: 24.3, total: 324.3 }

  const sortieType = {
    couverture: { titre: 'client × lieu' },
    pieces: [
      { nom: 'vitrine', images: [{ fichier: 'vitrine_3d.png', legende: 'construction 3d' }, { fichier: 'vitrine_ia.png' }],
        detail: { texte: 'une vitrine', specs: [{ label: 'emprise', valeur: '2.4 m' }] } },
      { nom: 'stand', images: [{ fichier: 'stand_3d.png' }], detail: { texte: 'un stand' } },
    ],
  }

  it('rattache les visuels par leur nom, et laisse un trou visible sinon', () => {
    const deck = validerSortie({
      pieces: [{ nom: 'a', images: [{ fichier: 'vitrine_3d.png' }, { fichier: 'inexistant.png' }] }],
    }, { fichiers, budget })
    expect(deck.pieces[0].images[0]).toMatchObject({ kdrive_id: 'k1', mime: 'image/png' })
    expect(deck.pieces[0].images[1].kdrive_id).toBeUndefined()
    expect(deck.pieces[0].images[1].attente).toBe('inexistant.png')
  })

  it('tolère l\'extension oubliée, la casse et les accents', () => {
    expect(resoudreFichier('VITRINE_3D.PNG', fichiers)?.kdrive_id).toBe('k1')
    expect(resoudreFichier('vitrine 3d', fichiers)?.kdrive_id).toBe('k1')
    expect(resoudreFichier('', fichiers)).toBeNull()
    expect(resoudreFichier('autre', fichiers)).toBeNull()
  })

  it('impose le budget de l\'offre, quoi que le modèle renvoie', () => {
    const deck = validerSortie({ ...sortieType, budget: { lignes: [{ libelle: 'x', montant: 99 }], total: 1 } }, { fichiers, budget })
    expect(deck.budget).toBe(budget)
  })

  it('laisse le projet décider du nombre de pièces', () => {
    const douze = Array.from({ length: 12 }, (_, i) => ({ nom: `pièce ${i + 1}`, images: [{ fichier: 'stand_3d.png' }] }))
    expect(validerSortie({ pieces: douze }, { fichiers, budget }).pieces).toHaveLength(12)
  })

  it('saute l\'aperçu au-delà de six pièces — la page ne tient pas douze colonnes', () => {
    const sept = Array.from({ length: 7 }, (_, i) => ({ nom: `p${i}` }))
    expect(validerSortie({ pieces: sept, apercu: { titre: 'x' } }, { fichiers, budget }).apercu).toBeNull()
    expect(validerSortie({ pieces: [{ nom: 'a' }], apercu: { titre: 'x' } }, { fichiers, budget }).apercu).toBeTruthy()
  })

  it('borne les listes à ce que chaque page sait afficher', () => {
    const trop = {
      contexte: { paragraphes: ['a', 'b', 'c', 'd'], chiffres: [1, 2, 3].map(n => ({ valeur: String(n) })) },
      pourquoi: { atouts: [1, 2, 3, 4, 5, 6].map(n => ({ titre: `t${n}`, texte: 'x' })) },
      planning: { etapes: [1, 2, 3, 4, 5, 6, 7].map(n => ({ date: `d${n}`, texte: 'x' })) },
      pieces: [{ nom: 'a', detail: { specs: Array.from({ length: 9 }, (_, i) => ({ label: `l${i}`, valeur: 'v' })) } }],
    }
    const deck = validerSortie(trop, { fichiers, budget })
    expect(deck.contexte.paragraphes).toHaveLength(3)
    expect(deck.contexte.chiffres).toHaveLength(2)
    expect(deck.pourquoi.atouts).toHaveLength(4)
    expect(deck.planning.etapes).toHaveLength(5)
    expect(deck.pieces[0].detail.specs).toHaveLength(6)
  })

  it('garde les deux conditions de la maison en tête, sans doublon', () => {
    const deck = validerSortie({
      conditions: { items: [
        { label: 'paiement', texte: 'tout à la fin' },
        { label: 'accès', texte: 'créneau de nuit' },
      ] },
    }, { fichiers, budget })
    expect(deck.conditions.items.slice(0, 2)).toEqual(CONDITIONS_FIXES)
    expect(deck.conditions.items.filter(i => i.label === 'paiement')).toHaveLength(1)
    expect(deck.conditions.items.map(i => i.label)).toContain('accès')
  })

  it('n\'accepte pas une couleur de matériau inventée', () => {
    const deck = validerSortie({ materiaux: { items: [
      { nom: 'chêne', couleur: 'brun clair', description: 'x' },
      { nom: 'laque', couleur: '#8C3A3A', description: 'x' },
    ] } }, { fichiers, budget })
    expect(deck.materiaux.items).toHaveLength(1)
    expect(deck.materiaux.items[0].nom).toBe('laque')
  })

  it('illustre la page « comment lire les visuels » avec la paire de la première pièce', () => {
    const deck = validerSortie(sortieType, { fichiers, budget })
    expect(deck.methode.colonnes[0].image.kdrive_id).toBe('k1')
    expect(deck.methode.colonnes[1].image.kdrive_id).toBe('k2')
    expect(deck.methode.intro).toContain('construction 3d')
  })

  it('garde la chute de la maison et retire les emoji', () => {
    const deck = validerSortie({
      cloture: { ligne: 'à bientôt', contact: 'guillaume 🚀' },
      pieces: [{ nom: '  une   vitrine  ' }],
    }, { fichiers, budget, contact: 'defaut' })
    expect(deck.cloture.ligne).toBe('parlons de votre projet !')
    expect(deck.cloture.contact).toBe('guillaume')
    expect(deck.pieces[0].nom).toBe('une vitrine')
  })

  it('jette ce qui n\'est pas prévu', () => {
    const deck = validerSortie({ section_inventee: { titre: 'x' }, couverture: { titre: 'a', inconnu: 'b' } }, { fichiers, budget })
    expect(deck.section_inventee).toBeUndefined()
    expect(deck.couverture.inconnu).toBeUndefined()
    expect(deck.langue).toBe('fr')
  })

  it('extraireJson survit aux clôtures Markdown et au bavardage', () => {
    expect(extraireJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extraireJson('Voici :\n{"a":1}\nvoilà.')).toEqual({ a: 1 })
    expect(extraireJson('pas de json')).toBeNull()
    expect(extraireJson('{cassé')).toBeNull()
  })

  it('le prompt cite les fichiers, interdit d\'inventer et impose les minuscules', () => {
    const p = promptGeneration({ consignes: 'un bar en chêne', fichiers, budget, projet: { client: 'x' } })
    expect(p).toContain('N\'INVENTE AUCUN FAIT')
    expect(p).toContain('TOUT en minuscules')
    expect(p).toContain('vitrine_3d.png')
    expect(p).toContain('un bar en chêne')
    expect(p).toContain('AUTANT QUE LE PROJET EN COMPTE')
  })

  it('une correction repart du document en place', () => {
    const p = promptGeneration({ consignes: 'récit', deckActuel: { couverture: { titre: 'a' } }, correction: 'inverse les pièces' })
    expect(p).toContain('CORRECTION DEMANDÉE')
    expect(p).toContain('inverse les pièces')
    expect(p).toContain('doit rester mot pour mot')
  })
})

describe('dictée — le type vient du contenu, pas du navigateur', () => {
  it('reconnaît un enregistrement WebM et le laisse passer à la dictée', () => {
    // En-tête EBML + DocType « webm », comme ce que MediaRecorder produit.
    const webm = Buffer.concat([
      Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00]),
      Buffer.from('DocTypewebm'), Buffer.alloc(40),
    ])
    expect(typeReel(webm)).toBe('audio/webm')
    expect(validerFichier(webm, { maxOctets: 1e6, types: TYPES_DICTEE }).ok).toBe(true)
  })

  it('ne fait pas entrer le WebM par la porte du dump', () => {
    expect(TYPES_AUDIO).not.toContain('audio/webm')
    expect(TYPES_DICTEE).toContain('audio/ogg')
  })

  it('refuse un Matroska qui n\'annonce pas WebM', () => {
    const mkv = Buffer.concat([Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), Buffer.from('DocTypematroska'), Buffer.alloc(40)])
    expect(typeReel(mkv)).toBeNull()
  })
})

describe('correction — le document repasse par le modèle sans perdre ses visuels', () => {
  const fichiers = [{ nom: 'vitrine_3d.png', kdrive_id: 'k1', mime: 'image/png' }]

  it('rend les noms de fichiers au modèle, pas les identifiants kDrive', () => {
    const deck = { pieces: [{ nom: 'vitrine', images: [{ kdrive_id: 'k1', kdrive_nom: 'presentation_1_vitrine_3d.png', attente: 'vitrine_3d.png', legende: 'construction 3d' }] }] }
    const vu = pourLeModele(deck)
    expect(vu.pieces[0].images[0]).toEqual({ fichier: 'vitrine_3d.png', legende: 'construction 3d' })
    expect(JSON.stringify(vu)).not.toContain('k1')
  })

  it('retrouve le visuel quand le modèle renvoie le document tel quel', () => {
    // Ce qu'un modèle renvoie souvent sur une correction : l'emplacement
    // recopié sans le champ `fichier`.
    const deck = validerSortie({
      pieces: [{ nom: 'vitrine', images: [{ attente: 'vitrine_3d.png', legende: 'construction 3d' }] }],
    }, { fichiers, budget: null })
    expect(deck.pieces[0].images[0].kdrive_id).toBe('k1')
  })

  it('le prompt de correction ne montre aucun identifiant kDrive', () => {
    const p = promptGeneration({
      deckActuel: { pieces: [{ images: [{ kdrive_id: 'k1', attente: 'vitrine_3d.png' }] }] },
      correction: 'change le titre', fichiers,
    })
    expect(p).not.toContain('kdrive_id')
    expect(p).toContain('vitrine_3d.png')
  })
})

describe('dictée — les formats que produisent vraiment les navigateurs', () => {
  // Boîte ftyp de marque « isom », telle que MediaRecorder l'écrit sous Chrome.
  const mp4 = (piste) => Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x24]), Buffer.from('ftypisom'),
    Buffer.alloc(24), Buffer.from(`moovtrakhdlr${piste}`), Buffer.alloc(64),
  ])

  it('accepte l\'enregistrement mp4 de Chrome et Safari, qui n\'a qu\'une piste son', () => {
    expect(typeDictee(mp4('soun'))).toBe('audio/mp4')
    expect(validerFichier(mp4('soun'), { maxOctets: 1e6, types: TYPES_DICTEE, sniffer: typeDictee }).ok).toBe(true)
  })

  it('refuse un mp4 qui porte une piste vidéo', () => {
    expect(typeDictee(mp4('vide'))).toBeNull()
  })

  it('ne relâche rien pour le dump : typeReel reste strict sur les marques', () => {
    expect(typeReel(mp4('soun'))).toBeNull()
  })
})
