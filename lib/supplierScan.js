// Schéma + consigne d'extraction des factures fournisseurs (OCR Claude).
// Un document scanné peut contenir plusieurs factures : la sortie est toujours une liste.

const invoiceSchema = {
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
    page_from:         { type: ['integer', 'null'], description: 'Première page de cette facture (1 = 1re page du document)' },
    page_to:           { type: ['integer', 'null'], description: 'Dernière page de cette facture (= page_from si une seule page)' },
  },
  required: ['supplier_name', 'invoice_number', 'amount', 'amount_net', 'vat_rate',
             'vat_amount', 'vat_breakdown', 'currency', 'issue_date', 'due_date',
             'payment_reference', 'iban', 'page_from', 'page_to'],
  additionalProperties: false,
}

export const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    invoices: {
      type: 'array',
      description: 'Une entrée par facture trouvée dans le document, dans l\'ordre des pages',
      items: invoiceSchema,
    },
  },
  required: ['invoices'],
  additionalProperties: false,
}

export const SCAN_PROMPT = `Analyse ce document de factures fournisseurs suisses et extrais les infos demandées.

Le document peut contenir PLUSIEURS factures scannées à la suite. Parcours-le en entier
et renvoie UNE entrée par facture dans "invoices" :
- Une nouvelle facture commence à un nouvel en-tête fournisseur (logo / adresse / n° de facture)
  et se termine à son total ou à son QR-bill
- Une même facture peut s'étendre sur plusieurs pages : ne la coupe pas en deux entrées
- Deux factures d'un même fournisseur = deux entrées distinctes
- Renseigne page_from / page_to pour chaque facture (1 = première page du document)
- S'il n'y a qu'une seule facture, renvoie une liste d'un seul élément

Contexte TVA suisse :
- 8.1% (normal, depuis 2024) · 2.6% (alimentaire/livres) · 3.8% (hébergement) · 0% (exempt)
- Si UN SEUL taux : remplis vat_rate + vat_amount, laisse vat_breakdown à null
- Si PLUSIEURS taux différents : remplis vat_breakdown avec une entrée par taux

Contexte QR-bill suisse :
- Le code QR en bas de facture contient une référence de 27 chiffres et un IBAN bénéficiaire
- Extrais les deux dans payment_reference et iban

Si une info n'est pas visible/lisible, mets null. Ne devine pas.`

// Appelle Claude et renvoie la liste des factures détectées.
export async function scanInvoices({ apiKey, image, mimeType }) {
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
  // Avec output_config.format, la sortie est garantie valide — pas de regex/cleanup
  const text = data.content?.find(b => b.type === 'text')?.text?.trim() || '{}'
  const parsed = JSON.parse(text)
  return Array.isArray(parsed.invoices) ? parsed.invoices : []
}
