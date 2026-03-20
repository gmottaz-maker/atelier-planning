export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { visitData, projectName } = req.body
  if (!visitData) return res.status(400).json({ error: 'visitData required' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' })

  // Build a readable description of the visit data
  const lines = []

  if (visitData.date)         lines.push(`Date de visite : ${visitData.date}`)
  if (visitData.participants?.length) lines.push(`Participants : ${visitData.participants.join(', ')}`)
  if (visitData.address)      lines.push(`Adresse : ${visitData.address}`)
  if (visitData.surface)      lines.push(`Surface : ${visitData.surface} m²`)
  if (visitData.ceiling_height) lines.push(`Hauteur sous plafond : ${visitData.ceiling_height} m`)
  if (visitData.floor_type)   lines.push(`Type de sol : ${visitData.floor_type}`)
  if (visitData.access_notes) lines.push(`Accès livraison : ${visitData.access_notes}`)
  if (visitData.access_hours) lines.push(`Horaires d'accès : ${visitData.access_hours}`)
  if (visitData.electricity)  lines.push(`Électricité : ${visitData.electricity}`)
  if (visitData.lighting)     lines.push(`Éclairage : ${visitData.lighting}`)
  if (visitData.wifi)         lines.push(`Réseau/Wifi : ${visitData.wifi}`)
  if (visitData.contacts)     lines.push(`Contact sur place : ${visitData.contacts}`)
  if (visitData.constraints)  lines.push(`Contraintes particulières : ${visitData.constraints}`)
  if (visitData.observations) lines.push(`Observations générales : ${visitData.observations}`)

  const visitText = lines.join('\n')

  const prompt = `Tu es un assistant pour une équipe de création et installation d'expositions et d'événements (Amazing Lab). \
Tu reçois les notes brutes d'une visite sur site pour le projet "${projectName}". \
Transforme ces données en un briefing clair et utile pour l'équipe, en français. \
Mets en avant les informations critiques (contraintes, accès, dimensions, contacts). \
Sois concis mais complet. Utilise des sections courtes avec des émojis en début de ligne pour la lisibilité. \
Ne reformule pas bêtement les données, apporte une vraie valeur ajoutée : \
identifie les points d'attention, les risques potentiels, et ce que l'équipe doit préparer.

Données de la visite :
${visitText}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      return res.status(500).json({ error: err.error?.message || 'Erreur API Anthropic' })
    }

    const data = await response.json()
    const summary = data.content?.[0]?.text || ''
    res.json({ summary })
  } catch (err) {
    console.error('site-visit-summary error:', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
