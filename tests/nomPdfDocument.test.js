import { describe, it, expect } from 'vitest'
import { nomPdfDocument, pdfFilename } from '../lib/pdfFilename'

const LE_23 = new Date('2026-09-23T10:00:00')

describe('nomPdfDocument — le client, puis le numéro', () => {
  it('nomme une facture par son client et son numéro', () => {
    expect(nomPdfDocument('Manor SA', '2026-024')).toBe('Manor SA - 2026-024.pdf')
  })

  it('nomme une offre par son client et son numéro d\'offre', () => {
    expect(nomPdfDocument('Red Bull AG', '2026-A036')).toBe('Red Bull AG - 2026-A036.pdf')
  })

  it('sans numéro — une offre en brouillon — la date prend sa place', () => {
    expect(nomPdfDocument('Manor SA', '', { date: LE_23 })).toBe('Manor SA - 23_09_2026.pdf')
    expect(nomPdfDocument('Manor SA', null, { date: LE_23 })).toBe('Manor SA - 23_09_2026.pdf')
  })

  it('sans client, le nom du projet sert de repli', () => {
    expect(nomPdfDocument('', '2026-024', { repli: 'Vitrine Bern' })).toBe('Vitrine Bern - 2026-024.pdf')
    expect(nomPdfDocument(null, null, { date: LE_23 })).toBe('document - 23_09_2026.pdf')
  })

  it('retire ce qu\'un nom de fichier n\'accepte pas, sans toucher aux accents', () => {
    expect(nomPdfDocument('Café / Bar "Léman"', '2026-024')).toBe('Café Bar Léman - 2026-024.pdf')
    expect(nomPdfDocument('  Manor   SA  ', ' 2026-024 ')).toBe('Manor SA - 2026-024.pdf')
  })

  it('garde la casse : « Manor SA », pas « manor sa »', () => {
    expect(nomPdfDocument('Manor SA', '2026-024')).toContain('Manor SA')
  })

  it('l\'ancien nommage reste pour la présentation client', () => {
    expect(pdfFilename('presentation', 'Event Verbier', LE_23)).toBe('presentation-event verbier-23_09_2026.pdf')
  })
})
