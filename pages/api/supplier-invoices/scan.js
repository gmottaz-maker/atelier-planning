// OCR de factures fournisseurs via Claude.
// Un même PDF peut contenir plusieurs factures scannées à la suite : la réponse
// est toujours une liste { invoices: [...] }, avec la plage de pages de chacune.
// Schéma, consigne et appel : lib/supplierScan.js
import { requireAdmin } from '../../../lib/requireAdmin'
import { scanInvoices } from '../../../lib/supplierScan'
import { erreurApi } from '../../../lib/apiError'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await requireAdmin(req, res))) return

  const { image, mimeType } = req.body
  if (!image) return res.status(400).json({ error: 'image (base64) requise' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' })

  try {
    const invoices = await scanInvoices({ apiKey, image, mimeType })
    return res.status(200).json({ invoices })
  } catch (e) {
    // L'utilisateur a besoin de savoir si c'est l'IA qui n'a pas répondu (il
    // peut réessayer) ou si le document est en cause — mais pas du détail.
    const amont = e.timeout || String(e.message).startsWith('Claude API:')
    return erreurApi(req, res, amont ? 'upstream' : 'internal', e, { route: 'supplier-invoices/scan' },
      amont ? "La lecture automatique n'a pas abouti. Réessaie dans un instant." : undefined)
  }
}
