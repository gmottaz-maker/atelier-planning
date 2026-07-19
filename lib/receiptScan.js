// Schéma + consigne d'extraction des justificatifs (frais / tickets / commandes).
// Un document scanné peut contenir plusieurs reçus : la sortie est toujours une liste.

const CATEGORIES = ['Repas', 'Transport', 'Hébergement', 'Fournitures', 'Matériel', 'Autre']

const receiptSchema = {
  type: 'object',
  properties: {
    date:          { type: ['string', 'null'], description: 'Date du ticket YYYY-MM-DD' },
    amount:        { type: ['number', 'null'], description: 'Total TTC en décimal' },
    amount_net:    { type: ['number', 'null'], description: 'Montant HT en décimal' },
    vat_rate:      { type: ['number', 'null'], description: 'Taux TVA % (8.1, 2.6, 3.8, 0)' },
    vat_amount:    { type: ['number', 'null'], description: 'Montant TVA en CHF' },
    vat_breakdown: {
      type: ['array', 'null'],
      description: 'Liste si plusieurs taux TVA, sinon null',
      items: {
        type: 'object',
        properties: { rate: { type: 'number' }, net: { type: 'number' }, vat: { type: 'number' } },
        required: ['rate', 'net', 'vat'],
        additionalProperties: false,
      },
    },
    currency:    { type: 'string', enum: ['CHF', 'EUR', 'USD'] },
    merchant:    { type: ['string', 'null'], description: 'Nom du commerçant' },
    category:    { type: 'string', enum: CATEGORIES },
    description: { type: ['string', 'null'], description: 'Court descriptif' },
    page_from:   { type: ['integer', 'null'], description: 'Première page de ce reçu (1 = 1re page du document)' },
    page_to:     { type: ['integer', 'null'], description: 'Dernière page de ce reçu (= page_from si une seule page)' },
  },
  required: ['date', 'amount', 'amount_net', 'vat_rate', 'vat_amount', 'vat_breakdown',
             'currency', 'merchant', 'category', 'description', 'page_from', 'page_to'],
  additionalProperties: false,
}

export const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    receipts: {
      type: 'array',
      description: 'Une entrée par reçu / ticket trouvé dans le document, dans l\'ordre des pages',
      items: receiptSchema,
    },
  },
  required: ['receipts'],
  additionalProperties: false,
}

export const SCAN_PROMPT = `Analyse ce document de justificatifs suisses (tickets de caisse, reçus, confirmations de commande en ligne) et extrais les infos demandées.

Le document peut contenir PLUSIEURS reçus scannés à la suite. Parcours-le en entier
et renvoie UNE entrée par reçu dans "receipts" :
- Un nouveau reçu commence à un nouvel en-tête commerçant et se termine à son total
- Un même reçu peut s'étendre sur plusieurs pages (confirmation de commande détaillée) : ne le coupe pas en deux entrées
- Deux tickets d'un même commerçant = deux entrées distinctes
- Renseigne page_from / page_to pour chaque reçu (1 = première page du document)
- S'il n'y a qu'un seul reçu, renvoie une liste d'un seul élément

Contexte TVA suisse :
- 8.1% (normal, depuis 2024) · 2.6% (alimentaire/livres) · 3.8% (hébergement) · 0% (exempt)
- Si UN SEUL taux : remplis vat_rate + vat_amount, laisse vat_breakdown à null
- Très fréquent sur tickets supermarché : PLUSIEURS taux (alimentaire 2.6% + non-alimentaire 8.1%). Dans ce cas remplis vat_breakdown avec une entrée par taux.

Catégorie : choisis la plus pertinente parmi ${CATEGORIES.join(', ')}.

Si une info n'est pas visible/lisible, mets null. Ne devine pas.`

// Appelle Claude et renvoie la liste des reçus détectés.
export async function scanReceipts({ apiKey, image, mimeType }) {
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
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      output_config: { format: { type: 'json_schema', schema: SCAN_SCHEMA } },
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: SCAN_PROMPT }] }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API: ${err.substring(0, 200)}`)
  }
  const data = await response.json()
  const text = data.content?.find(b => b.type === 'text')?.text?.trim() || '{}'
  const parsed = JSON.parse(text)
  return Array.isArray(parsed.receipts) ? parsed.receipts : []
}
