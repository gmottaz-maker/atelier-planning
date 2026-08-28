// OCR de justificatifs (frais / tickets / commandes) via Claude.
// Un même document peut contenir plusieurs reçus : la réponse est toujours une
// liste { receipts: [...] }, avec la plage de pages de chacun.
// Schéma, consigne et appel : lib/receiptScan.js
import { requireUser } from '../../../lib/requireAdmin'
import { scanReceipts } from '../../../lib/receiptScan'
import { PDFDocument } from 'pdf-lib'
import { erreurApi } from '../../../lib/apiError'
import { classerErreurScan } from '../../../lib/scanErreur'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { image, mimeType } = req.body
  if (!image) return res.status(400).json({ error: 'Image requise (base64)' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' })

  // Nombre de pages du PDF : sert au contrôle de couverture multi-tickets côté
  // client (avertir si une page n'a été attribuée à aucun reçu).
  let page_count = null
  if ((mimeType || '').includes('pdf')) {
    try { page_count = (await PDFDocument.load(Buffer.from(image, 'base64'), { ignoreEncryption: true })).getPageCount() } catch {}
  }

  try {
    const receipts = await scanReceipts({ apiKey, image, mimeType })
    return res.status(200).json({ receipts, page_count })
  } catch (e) {
    // Un échec passager mérite « réessaie » ; un crédit épuisé ou une clé
    // refusée demandent une action d'administration. Dire « réessaie » dans ce
    // cas fait tourner l'utilisateur en rond — c'est arrivé le 28 août 2026.
    const { passager, message } = classerErreurScan(e)
    return erreurApi(req, res, passager ? 'upstream' : 'bad_request', e, { route: 'expenses/scan' }, message)
  }
}
