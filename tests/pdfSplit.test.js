import { describe, it, expect, beforeAll } from 'vitest'
import PDFDocument from 'pdfkit'
import { PDFDocument as PdfLib } from 'pdf-lib'
import { extractPages } from '../lib/pdfSplit'

// PDF de 5 pages, comme un scan groupé de factures fournisseurs.
function makePdf(pages = 5) {
  return new Promise(resolve => {
    const doc = new PDFDocument({ autoFirstPage: false })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    for (let i = 1; i <= pages; i++) { doc.addPage(); doc.fontSize(30).text(`Facture ${i}`, 100, 100) }
    doc.end()
  })
}

const pageCount = async buf => (await PdfLib.load(buf)).getPageCount()

describe('extractPages', () => {
  let src
  beforeAll(async () => { src = await makePdf(5) })

  it('extrait une facture sur une seule page', async () => {
    expect(await pageCount(await extractPages(src, 5, 5))).toBe(1)
  })

  it('extrait une facture à cheval sur plusieurs pages', async () => {
    expect(await pageCount(await extractPages(src, 2, 3))).toBe(2)
  })

  it('tronque une plage qui déborde la fin du document', async () => {
    expect(await pageCount(await extractPages(src, 4, 99))).toBe(2)
  })

  it('renvoie le document entier si la plage le couvre déjà', async () => {
    expect(await extractPages(src, 1, 5)).toBe(src)
  })

  it('renvoie le document entier si la plage est absente', async () => {
    expect(await extractPages(src, null, null)).toBe(src)
  })

  it('renvoie le document entier si la plage est incohérente', async () => {
    expect(await extractPages(src, 4, 2)).toBe(src)
    expect(await extractPages(src, 0, 2)).toBe(src)
  })
})
