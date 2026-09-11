// Écran mural /display : route PUBLIQUE (la TV de l'atelier n'a pas de session).
//
// Elle ne renvoie donc QUE les champs affichés à l'écran. `/api/projects` faisait
// auparavant un `select('*')` sans authentification : notes internes, adresses,
// contacts, données de visite, identifiants kDrive et surtout `quote_data`
// (prix d'achat et marges) étaient lisibles par quiconque connaissait l'URL.
import { getSupabaseServer } from '../../lib/supabase-server'

// Liste blanche stricte. Toute colonne ajoutée ici devient publique : à ne
// modifier qu'en connaissance de cause.
export const PUBLIC_FIELDS = [
  'id', 'name', 'client', 'deadline', 'responsible',
  'delivery_type', 'short_description', 'status', 'color_override',
  // Le numéro qu'on reporte sur la feuille d'heures : l'atelier le lit sur
  // l'écran. Un simple compteur, sans prix ni donnée client.
  'numero',
]

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('projects')
    .select(PUBLIC_FIELDS.join(', '))
    .eq('status', 'active')
    // L'écran de l'atelier ne montre que ce qu'on fabrique vraiment : une
    // offre ACCEPTÉE, et un projet qui n'est pas en pause. Une offre en
    // brouillon ou envoyée n'est pas du travail — l'afficher, c'est préparer
    // l'atelier à un projet qui n'aura peut-être jamais lieu.
    //
    // Filtré ICI plutôt que dans la page : sinon il faudrait publier le statut
    // de l'offre et `suspended` sur la seule route sans authentification. Le
    // filtre porte sur `quote_data`, mais n'en renvoie rien.
    .eq('quote_data->>status', 'accepte')
    // `not is true` et non `eq false` : une ligne antérieure à la colonne
    // vaut NULL, et elle doit rester affichée.
    .not('suspended', 'is', true)
    .order('deadline', { ascending: true })

  if (error) {
    console.error('display-projects:', error.message)
    return res.status(500).json({ error: 'Lecture impossible' })
  }

  // Pas de cache partagé : la réponse reste courte à vivre et propre à l'écran.
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return res.status(200).json(data)
}
