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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            (mimeType || '').includes('pdf')
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
              : { type: 'image',    source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
            {
              type: 'text',
              text: `Analyse ce reçu / ticket de caisse / facture et extrais les informations.
Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de backticks) avec ces champs:
{
  "date": "YYYY-MM-DD ou null",
  "amount": nombre décimal TTC ou null,
  "amount_net": montant HT (hors taxes) si visible, sinon null,
  "vat_rate": taux de TVA en % (ex: 8.1, 2.6, 0) ou null,
  "vat_amount": montant de TVA en CHF ou null,
  "vat_breakdown": [{"rate": 8.1, "net": 50, "vat": 4.05}, ...] ou null (UNIQUEMENT si plusieurs taux différents apparaissent sur le ticket, ex: alimentaire 2.6% + boissons alcool 8.1%),
  "currency": "CHF" | "EUR" | "USD" (défaut CHF),
  "merchant": "nom du commerçant ou null",
  "category": "Repas" | "Transport" | "Hébergement" | "Fournitures" | "Matériel" | "Autre",
  "description": "court descriptif ou null"
}
- Taux TVA suisses : 8.1% (normal depuis 2024), 2.6% (réduit alimentaire/livres), 3.8% (hébergement).
- Si UN SEUL taux, laisse vat_breakdown à null et remplis vat_rate/vat_amount.
- Si PLUSIEURS taux (très fréquent sur tickets supermarché), remplis vat_breakdown avec une entrée par taux. vat_rate/vat_amount peuvent rester null OU prendre le taux dominant.
- Si seul le total TTC est visible, laisse amount_net/vat_rate/vat_amount/vat_breakdown à null.`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `API Anthropic erreur ${response.status}: ${errText.slice(0, 200)}` })
    }

    const data   = await response.json()
    const text   = data.content?.[0]?.text || ''

    // Parse JSON — try strict first, then extract from text
    const tryParse = (s) => { try { return JSON.parse(s) } catch (_) { return null } }
    let parsed = tryParse(text.trim())
    if (!parsed) {
      const m = text.match(/\{[\s\S]*?\}/)
      if (m) parsed = tryParse(m[0])
    }

    if (!parsed) {
      return res.status(200).json({ error: 'Scan IA incomplet — remplis le formulaire manuellement.', raw: text.slice(0, 300) })
    }

    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
