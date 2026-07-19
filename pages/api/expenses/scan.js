// OCR de justificatifs (frais / tickets / commandes) via Claude.
// Un même document peut contenir plusieurs reçus : la réponse est toujours une
// liste { receipts: [...] }, avec la plage de pages de chacun.
// Schéma, consigne et appel : lib/receiptScan.js
import { requireUser } from '../../../lib/requireAdmin'
import { scanReceipts } from '../../../lib/receiptScan'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { image, mimeType } = req.body
  if (!image) return res.status(400).json({ error: 'Image requise (base64)' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' })

  try {
    const receipts = await scanReceipts({ apiKey, image, mimeType })
    return res.status(200).json({ receipts })
  } catch (e) {
    const claude = e.message.startsWith('Claude API:')
    return res.status(claude ? 502 : 500).json({ error: e.message })
  }
}
