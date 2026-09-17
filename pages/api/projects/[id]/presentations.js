// Les présentations client d'un projet : la liste, et la création.
//
// Une présentation neuve n'est jamais vide : elle part du gabarit de la maison
// déjà rempli avec ce que Maze sait (client, numéro d'offre, budget, date de
// livraison). Ce qui reste à écrire est ce que la base ignore.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { dateDuJour } from '../../../../lib/aujourdhui'
import { amorcerPresentation, titrePresentation } from '../../../../lib/presentation'

const supabase = getSupabaseServer()
const CHAMPS = 'id, project_id, titre, kdrive_id, kdrive_nom, envoyee_le, created_by, created_at, updated_at'

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('presentations').select(CHAMPS).eq('project_id', id)
      .order('created_at', { ascending: false })
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/presentations' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { data: projet, error: projErr } = await supabase
      .from('projects').select('id, name, client, deadline, quote_data, numero').eq('id', id).maybeSingle()
    if (projErr) return erreurApi(req, res, 'internal', projErr, { route: 'projects/[id]/presentations' })
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

    const { data, error } = await supabase.from('presentations').insert({
      project_id: id,
      titre: titrePresentation(projet),
      // Le document naît vide : ce sont le récit et les visuels qui lui
      // donneront ses pièces, en nombre libre.
      contenu: amorcerPresentation(projet, { pieces: 0, aujourdhui: dateDuJour() }),
      // L'identité vient du jeton, jamais du corps de la requête.
      created_by: utilisateur.email || null,
    }).select(CHAMPS).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/presentations' })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
