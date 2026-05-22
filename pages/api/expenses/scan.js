export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

/**
 * POST /api/expenses/scan
 * Body: { image: string (base64), mimeType: string }
 * Returns: { date, amount, currency, merchant, category }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { image, mimeType } = req.body
  if (!image) return res.status(400).json({ error: 'Image requise (base64)' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'Variable ANTHROPIC_API_KEY manquante dans Vercel. Ajoutez-la dans Project Settings → Environment Variables.',
    })
  }

  try {
    // Schéma JSON garanti valide via output_config.format (Anthropic structured outputs)
    const schema = {
      type: 'object',
      properties: {
        date:          { type: ['string', 'null'], description: 'Date YYYY-MM-DD' },
        amount:        { type: ['number', 'null'], description: 'Total TTC en décimal' },
        amount_net:    { type: ['number', 'null'], description: 'Montant HT en décimal' },
        vat_rate:      { type: ['number', 'null'], description: 'Taux TVA % (8.1, 2.6, 3.8, 0)' },
        vat_amount:    { type: ['number', 'null'], description: 'Montant TVA en CHF' },
        vat_breakdown: {
          type: ['array', 'null'],
          description: 'Liste si plusieurs taux TVA, sinon null',
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
        currency:     { type: 'string', enum: ['CHF', 'EUR', 'USD'] },
        merchant:     { type: ['string', 'null'], description: 'Nom du commerçant' },
        category:     { type: 'string', enum: ['Repas', 'Transport', 'Hébergement', 'Fournitures', 'Matériel', 'Autre'] },
        description:  { type: ['string', 'null'], description: 'Court descriptif' },
      },
      required: ['date', 'amount', 'amount_net', 'vat_rate', 'vat_amount', 'vat_breakdown',
                 'currency', 'merchant', 'category', 'description'],
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
            (mimeType || '').includes('pdf')
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
              : { type: 'image',    source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
            {
              type: 'text',
              text: `Analyse ce reçu / ticket de caisse suisse et extrais les infos.

Contexte TVA suisse :
- 8.1% (normal, depuis 2024) · 2.6% (alimentaire/livres) · 3.8% (hébergement) · 0% (exempt)
- Si UN SEUL taux : remplis vat_rate + vat_amount, laisse vat_breakdown à null
- Très fréquent sur tickets supermarché : PLUSIEURS taux (alimentaire 2.6% + boissons alcool 8.1%). Dans ce cas remplis vat_breakdown avec une entrée par taux.

Catégorie : choisis la plus pertinente parmi Repas, Transport, Hébergement, Fournitures, Matériel, Autre.

Si une info n'est pas visible/lisible, mets null. Ne devine pas.`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `API Anthropic erreur ${response.status}: ${errText.slice(0, 200)}` })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text?.trim() || '{}'
    // Avec output_config.format, la sortie est garantie valide — parse direct
    let parsed
    try { parsed = JSON.parse(text) } catch {
      return res.status(200).json({ error: 'Scan IA incomplet — remplis le formulaire manuellement.', raw: text.slice(0, 200) })
    }
    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
