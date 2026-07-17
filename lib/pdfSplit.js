// Extraction d'une plage de pages d'un PDF (scan groupé → une pièce par facture).
import { PDFDocument } from 'pdf-lib'

// Renvoie le PDF réduit aux pages [from..to] (1-indexé, bornes incluses).
// Renvoie le buffer d'origine si la plage est absente, invalide, ou couvre déjà tout le document.
export async function extractPages(buffer, from, to) {
  const a = parseInt(from, 10)
  const b = parseInt(to, 10)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) return buffer

  const src = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const total = src.getPageCount()
  const start = Math.max(1, a)
  const end = Math.min(total, b)
  if (start > total || end < start) return buffer
  if (start === 1 && end === total) return buffer

  const out = await PDFDocument.create()
  const indexes = []
  for (let i = start; i <= end; i++) indexes.push(i - 1)
  const pages = await out.copyPages(src, indexes)
  pages.forEach(p => out.addPage(p))
  return Buffer.from(await out.save())
}
