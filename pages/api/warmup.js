import { getSupabaseServer } from '../../lib/supabase-server'

// Endpoint léger appelé par un cron Vercel le matin pour "réveiller" les
// fonctions serverless et la connexion Supabase avant l'arrivée de l'équipe.
// Évite le démarrage à froid (1-3 s) sur le premier vrai chargement de la journée.
export default async function handler(req, res) {
  try {
    const supabase = getSupabaseServer()
    await supabase.from('projects').select('id').limit(1)
  } catch (_) {
    // peu importe le résultat : le but est juste de chauffer l'infra
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ warm: true, at: new Date().toISOString() })
}
