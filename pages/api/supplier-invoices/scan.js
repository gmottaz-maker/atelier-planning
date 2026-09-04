// OCR de factures fournisseurs via Claude.
// Un même PDF peut contenir plusieurs factures scannées à la suite : la réponse
// est toujours une liste { invoices: [...] }, avec la plage de pages de chacune.
// Schéma, consigne et appel : lib/supplierScan.js
import { requireAdmin } from '../../../lib/requireAdmin'
import { scanInvoices } from '../../../lib/supplierScan'
import { erreurApi } from '../../../lib/apiError'
import { classerErreurScan } from '../../../lib/scanErreur'

// Vercel refuse tout corps de requête au-delà de 4,5 Mo, AVANT que cette
// fonction démarre : `sizeLimit` ne peut qu'abaisser ce plafond, jamais le
// relever. Annoncer 15 Mo ici promettait donc quelque chose d'impossible, et
// le refus arrivait en texte brut — d'où un « Unexpected token 'R' » à l'écran.
// La valeur est alignée sur la réalité pour que le développement local échoue
// au même endroit que la production. Voir lib/uploadLimit.js.
export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } }

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
    // Un échec passager mérite « réessaie » ; un crédit épuisé ou une clé
    // refusée demandent une action d'administration. Dire « réessaie » dans ce
    // cas fait tourner l'utilisateur en rond — c'est arrivé le 28 août 2026.
    const { passager, message } = classerErreurScan(e)
    return erreurApi(req, res, passager ? 'upstream' : 'bad_request', e, { route: 'supplier-invoices/scan' }, message)
  }
}
