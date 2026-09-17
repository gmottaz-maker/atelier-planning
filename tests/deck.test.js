import { describe, it, expect } from 'vitest'
import { pagesDeck, aDuContenu, trous, PIECES_MAX } from '../lib/deck'
import { deckHtml, pageHtml, montant } from '../lib/deckHtml'
import { gabaritDeck } from '../lib/deckGabarit'

const piece = n => ({ nom: `pièce ${n}`, images: [{ src: 'a.png' }], detail: { texte: 'x' } })


describe('pagesDeck — le récit', () => {
  it('déroule le gabarit dans l\'ordre, une paire par pièce', () => {
    const types = pagesDeck(gabaritDeck({ pieces: 2 })).map(p => p.type)
    expect(types).toEqual([
      'couverture', 'contexte', 'brief', 'pourquoi', 'apercu', 'methode',
      'visuels', 'detail', 'visuels', 'detail',
      'materiaux', 'planning', 'budget', 'conditions', 'cloture',
    ])
  })

  it('saute une section vide plutôt que d\'imprimer un titre au-dessus du vide', () => {
    const types = pagesDeck({ couverture: { titre: 'a' }, materiaux: { items: [] }, planning: {} }).map(p => p.type)
    expect(types).toEqual(['couverture'])
  })

  it('numérote les pièces dans l\'ordre, même si l\'une n\'a pas de visuel', () => {
    const pages = pagesDeck({ pieces: [{ nom: 'a', detail: { texte: 'x' } }, piece(2)] })
    const detail = pages.find(p => p.type === 'detail')
    expect(detail.rang).toBe(1)
    expect(detail.total).toBe(2)
    expect(pages.find(p => p.type === 'visuels').rang).toBe(2)
  })

  it('n\'imprime la page « comment lire les visuels » que s\'il y a des visuels', () => {
    const sans = pagesDeck({ methode: gabaritDeck().methode, pieces: [{ nom: 'a', detail: { texte: 'x' } }] })
    expect(sans.map(p => p.type)).not.toContain('methode')
    const avec = pagesDeck({ methode: gabaritDeck().methode, pieces: [piece(1)] })
    expect(avec.map(p => p.type)).toContain('methode')
  })

  it('suit le nombre de pièces du projet, une paire chacune', () => {
    const pieces = Array.from({ length: 12 }, (_, i) => piece(i + 1))
    const pages = pagesDeck({ pieces })
    expect(pages.filter(p => p.type === 'visuels')).toHaveLength(12)
    expect(pages.filter(p => p.type === 'detail')).toHaveLength(12)
    expect(pages[6].total).toBe(12)
  })

  it('n\'imprime pas une page de détail vide', () => {
    const pages = pagesDeck({ pieces: [{ nom: 'a', images: [{ src: 'x' }], detail: { titre: 'a' } }] })
    expect(pages.map(p => p.type)).toEqual(['visuels'])
  })

  it('borne le nombre de pièces pour qu\'un fichier aberrant ne fasse pas cent pages', () => {
    const pieces = Array.from({ length: 40 }, (_, i) => piece(i + 1))
    expect(pagesDeck({ pieces }).filter(p => p.type === 'visuels')).toHaveLength(PIECES_MAX)
  })

  it('aDuContenu ne se laisse pas avoir par une section absente', () => {
    expect(aDuContenu('budget', undefined)).toBe(false)
    expect(aDuContenu('budget', { lignes: [] })).toBe(false)
    expect(aDuContenu('budget', { lignes: [{ libelle: 'a', montant: 1 }] })).toBe(true)
  })
})

describe('trous — ce qui empêche d\'envoyer', () => {
  it('signale chaque champ resté entre crochets, sans doublon', () => {
    const m = trous({ couverture: { titre: '[marque] × [lieu]' }, pieces: [piece(1)] })
    expect(m).toContain('Champ non rempli : [marque]')
    expect(m).toContain('Champ non rempli : [lieu]')
    expect(m.filter(x => x === 'Champ non rempli : [lieu]')).toHaveLength(1)
  })

  it('signale une pièce sans visuel et un budget absent', () => {
    const m = trous({ pieces: [{ nom: 'comptoir', detail: {} }] })
    expect(m.some(x => x.includes('comptoir') && x.includes('aucun visuel'))).toBe(true)
    expect(m.some(x => x.includes('Budget absent'))).toBe(true)
  })

  it('ne signale rien sur une présentation complète', () => {
    const deck = { pieces: [piece(1)], budget: { lignes: [{ libelle: 'poste', montant: 100 }] } }
    expect(trous(deck)).toEqual([])
  })
})

describe('rendu', () => {
  it('montant : apostrophe des milliers, point des décimales', () => {
    expect(montant(24898.84)).toBe("24'898.84")
    expect(montant(1000000)).toBe("1'000'000.00")
    expect(montant(0)).toBe('0.00')
    expect(montant(null)).toBe('')
  })

  it('le corail ne touche que le × du titre et le ! de la chute', () => {
    const cover = pageHtml({ type: 'couverture', titre: 'moët × manor' })
    expect(cover).toContain('<span style="color:#FF4D6D">×</span>')
    const fin = pageHtml({ type: 'cloture', ligne: 'parlons de votre projet !' })
    expect(fin).toContain('<span style="color:#FF4D6D">!</span>')
    // Un « ! » au milieu d'une phrase reste noir : c'est une chute, pas une emphase.
    expect(pageHtml({ type: 'cloture', ligne: 'bravo ! et à bientôt' })).not.toContain('color:#FF4D6D">!')
  })

  it('échappe le contenu client', () => {
    const html = pageHtml({ type: 'couverture', titre: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('un type de page inconnu ne casse pas le document', () => {
    expect(pageHtml({ type: 'inexistant' })).toBe('')
  })

  it('le document tient la toile de 1920 × 1080', () => {
    const html = deckHtml(gabaritDeck({ pieces: 1 }))
    expect(html).toContain('width: 1920px; height: 1080px')
    expect(html).toContain('@page { size: 508mm 285.75mm; margin: 0; }')
    expect((html.match(/<section/g) || [])).toHaveLength(13)
  })
})
