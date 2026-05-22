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

    // Schéma JSON garanti valide via output_config.format (Anthropic structured outputs)
    const schema = {
      type: 'object',
      properties: {
        supplier_name:     { type: ['string', 'null'], description: 'Nom du vendeur / société émettrice' },
        invoice_number:    { type: ['string', 'null'], description: 'Numéro de facture' },
        amount:            { type: ['number', 'null'], description: 'Total TTC en décimal' },
        amount_net:        { type: ['number', 'null'], description: 'Montant HT en décimal' },
        vat_rate:          { type: ['number', 'null'], description: 'Taux TVA en % (8.1, 2.6, 3.8, 0)' },
        vat_amount:        { type: ['number', 'null'], description: 'Montant TVA en CHF' },
        vat_breakdown:     {
          type: ['array', 'null'],
          description: 'Liste si plusieurs taux TVA (sinon null)',
          items: {
            type: 'object',
            properties: {
              rate: { type: 'number' },
              net:  { type: 'number' },
              vat:  { type: 'number' },
            },
            required: ['rate', 'net', 'vat'],
            additionalProperties: false,
          },
        },
        currency:          { type: 'string', enum: ['CHF', 'EUR', 'USD'] },
        issue_date:        { type: ['string', 'null'], description: 'Date YYYY-MM-DD' },
        due_date:          { type: ['string', 'null'], description: 'Échéance YYYY-MM-DD' },
        payment_reference: { type: ['string', 'null'], description: '27 chiffres si QR-bill' },
        iban:              { type: ['string', 'null'], description: 'IBAN du fournisseur' },
      },
      required: ['supplier_name', 'invoice_number', 'amount', 'amount_net', 'vat_rate',
                 'vat_amount', 'vat_breakdown', 'currency', 'issue_date', 'due_date',
                 'payment_reference', 'iban'],
      additionalProperties: false,
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        output_config: {
          format: { type: 'json_schema', schema },
        },
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Analyse cette facture fournisseur suisse et extrais les infos demandées.

Contexte TVA suisse :
- 8.1% (normal, depuis 2024) · 2.6% (alimentaire/livres) · 3.8% (hébergement) · 0% (exempt)
- Si UN SEUL taux : remplis vat_rate + vat_amount, laisse vat_breakdown à null
- Si PLUSIEURS taux différents : remplis vat_breakdown avec une entrée par taux

Contexte QR-bill suisse :
- Le code QR en bas de facture contient une référence de 27 chiffres et un IBAN bénéficiaire
- Extrais les deux dans payment_reference et iban

Si une info n'est pas visible/lisible, mets null. Ne devine pas.`,
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
    // Avec output_config.format, la sortie est garantie valide — pas de regex/cleanup
    const text = data.content?.[0]?.text?.trim() || '{}'
    let parsed
    try { parsed = JSON.parse(text) } catch { return res.status(502).json({ error: 'Réponse JSON invalide', raw: text.substring(0, 200) }) }
    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
