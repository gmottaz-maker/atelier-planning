// OCR d'une facture fournisseur via Claude Haiku
import { requireAdmin } from '../../../lib/requireAdmin'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!requireAdmin(req, res)) return

  const { image, mimeType } = req.body
  if (!image) return res.status(400).json({ error: 'image (base64) requise' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' })

  try {
    const isPdf = (mimeType || '').includes('pdf')
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
      : { type: 'image',    source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Analyse cette facture fournisseur et extrais ces infos.
Réponds UNIQUEMENT avec un JSON valide (pas de markdown) :
{
  "supplier_name": "nom du vendeur / société émettrice",
  "invoice_number": "numéro de facture ou null",
  "amount": nombre total TTC à payer (décimal) ou null,
  "amount_net": montant HT (hors taxes) si visible, sinon null,
  "vat_rate": taux de TVA en % (ex: 8.1, 2.6, 0) ou null,
  "vat_amount": montant de TVA en CHF ou null,
  "vat_breakdown": [{"rate": 8.1, "net": 100, "vat": 8.10}, ...] ou null (UNIQUEMENT si plusieurs taux différents),
  "currency": "CHF" | "EUR" | "USD" (défaut CHF),
  "issue_date": "YYYY-MM-DD" ou null,
  "due_date": "YYYY-MM-DD" ou null,
  "payment_reference": "référence QR/ESR/IBAN reference ou null (27 chiffres pour QR-bill suisse)",
  "iban": "IBAN du fournisseur ou null"
}
- Si UN SEUL taux : vat_breakdown = null, remplis vat_rate/vat_amount.
- Si PLUSIEURS taux : vat_breakdown = liste (1 entrée par taux). vat_rate/vat_amount peuvent rester null ou prendre le taux dominant.
- Si seul le total TTC est visible, laisse amount_net/vat_rate/vat_amount à null.
- Taux TVA suisses : 8.1% (normal depuis 2024), 2.6% (réduit), 3.8% (hébergement).
- Si le QR-bill suisse est en bas de la facture, extrais la référence (27 chiffres) et l'IBAN du bénéficiaire.`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(502).json({ error: `Claude API: ${err.substring(0, 200)}` })
    }
    const data = await response.json()
    const text = data.content?.[0]?.text?.trim() || '{}'
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim()
    let parsed
    try { parsed = JSON.parse(cleaned) } catch { return res.status(502).json({ error: 'Réponse JSON invalide', raw: text }) }
    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
