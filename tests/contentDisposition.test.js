import { describe, it, expect } from 'vitest'
import { contentDisposition, versAscii } from '../lib/contentDisposition'
import { pdfFilename } from '../lib/pdfFilename'

// Les accents des noms de PDF arrivaient en « ? » chez l'utilisateur :
// « devis-arche végétale.pdf » devenait « devis-arche v?g?tale.pdf ».
// Un en-tête HTTP ne transporte que de l'ASCII (RFC 7230) ; le nom accentué
// doit passer par `filename*=UTF-8''…` (RFC 6266).

describe('versAscii — le repli lisible', () => {
  it('translittère les accents plutôt que de les perdre', () => {
    expect(versAscii('arche végétale')).toBe('arche vegetale')
    expect(versAscii('Café Zürich')).toBe('Cafe Zurich')
    expect(versAscii('Rémy-Cointreau')).toBe('Remy-Cointreau')
  })

  it('retire ce qui casserait l’en-tête', () => {
    expect(versAscii('a"b\\c')).toBe('abc')
    expect(versAscii('emoji 🎉 fin')).toBe('emoji  fin')
  })

  it('ne rend jamais une chaîne vide', () => {
    for (const x of ['', null, undefined, '🎉', '   ']) expect(versAscii(x)).toBe('fichier')
  })
})

describe('contentDisposition', () => {
  it('porte les deux formes : ASCII et UTF-8 encodé', () => {
    const v = contentDisposition('devis-arche végétale-13_07_2026.pdf')
    expect(v).toContain('attachment;')
    expect(v).toContain('filename="devis-arche vegetale-13_07_2026.pdf"')
    expect(v).toContain("filename*=UTF-8''devis-arche%20v%C3%A9g%C3%A9tale-13_07_2026.pdf")
  })

  it('respecte inline quand c’est demandé', () => {
    expect(contentDisposition('a.pdf', 'inline').startsWith('inline;')).toBe(true)
  })

  it('ne contient plus AUCUN caractère non-ASCII', () => {
    // C'est là tout le sujet : ce qui part dans l'en-tête doit être ASCII pur.
    for (const nom of ['facture-café-01_01_2026.pdf', 'devis-Rémy & Cointreau.pdf', 'reçu 100 % coton.pdf']) {
      // eslint-disable-next-line no-control-regex
      expect(contentDisposition(nom)).toMatch(/^[\x20-\x7E]*$/)
    }
  })

  it('neutralise un retour à la ligne — injection d’en-tête', () => {
    const v = contentDisposition('a\r\nX-Evil: 1.pdf')
    expect(v).not.toMatch(/[\r\n]/)
  })

  it('se marie avec pdfFilename, qui produit des noms accentués', () => {
    const nom = pdfFilename('devis', 'Arche Végétale', new Date('2026-07-13'))
    expect(nom).toBe('devis-arche végétale-13_07_2026.pdf')
    const v = contentDisposition(nom)
    expect(v).toContain('filename="devis-arche vegetale-13_07_2026.pdf"')
    expect(v).toMatch(/^[\x20-\x7E]*$/)
  })
})
