import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { classerErreurScan } from '../../../../lib/scanErreur'
import { jourLocal } from '../../../../lib/aujourdhui'
import { assemblerMatiere, genererSynthese } from '../../../../lib/synthese'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects').select('synthese, synthese_le, synthese_entrees').eq('id', id).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/synthese' })
    if (!data) return res.status(404).json({ error: 'Projet introuvable' })
    return res.status(200).json(data)
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Synthèse indisponible : ANTHROPIC_API_KEY non configurée' })

  const { data: projet, error: projErr } = await supabase
    .from('projects').select('id, name, client').eq('id', id).maybeSingle()
  if (projErr) return erreurApi(req, res, 'internal', projErr, { route: 'projects/[id]/synthese' })
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

  const { data: updates, error: majErr } = await supabase
    .from('project_updates')
    .select('author, content, url, url_titre, url_extrait, transcription, file_filename, image_filename, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
  if (majErr) return erreurApi(req, res, 'internal', majErr, { route: 'projects/[id]/synthese' })

  const { texte, retenues, ignorees } = assemblerMatiere(updates || [], { jourLocal })

  // Rien à résumer : on efface la synthèse précédente plutôt que de laisser
  // à l'écran le résumé d'un fil qui a été vidé.
  if (retenues === 0) {
    await supabase.from('projects')
      .update({ synthese: null, synthese_le: null, synthese_entrees: 0 }).eq('id', id)
    return res.status(200).json({ synthese: null, synthese_le: null, synthese_entrees: 0 })
  }

  let synthese
  try {
    synthese = await genererSynthese({
      projet: projet.name, client: projet.client, matiere: texte, ignorees, apiKey,
    })
  } catch (e) {
    // Crédit épuisé, clé invalide, surcharge : le message dit quoi faire, et à
    // qui. Le dump lui-même n'est pas affecté.
    const { passager, message } = classerErreurScan(e)
    return res.status(passager ? 503 : 502).json({ error: message, passager })
  }

  const synthese_le = new Date().toISOString()
  const { error: majUpd } = await supabase.from('projects')
    .update({ synthese, synthese_le, synthese_entrees: retenues }).eq('id', id)
  if (majUpd) return erreurApi(req, res, 'internal', majUpd, { route: 'projects/[id]/synthese' })

  return res.status(200).json({ synthese, synthese_le, synthese_entrees: retenues })
}
