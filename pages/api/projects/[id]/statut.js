// Statut d'avancement d'un projet (nouvelle fiche).
//
// Une route à part plutôt que le PUT du projet : celui-ci réécrit presque
// toutes les colonnes à chaque appel, et changer un statut ne doit jamais
// risquer d'effacer une échéance. Ici, une seule colonne, une liste fermée.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { statutStockable } from '../../../../lib/fiche'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Méthode non autorisée' })
  const { id } = req.query

  const statut = req.body?.statut ?? null
  if (!statutStockable(statut)) return res.status(400).json({ error: 'Statut inconnu' })

  const { data, error } = await supabase
    .from('projects')
    .update({ statut, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, statut')
    .maybeSingle()
  // Colonne absente : la migration n'est pas jouée. On le dit, plutôt qu'une
  // « erreur interne » qui ne désigne rien.
  if (error?.code === '42703') return res.status(503).json({ error: 'Statuts indisponibles : la migration schema-projet-statut.sql n’est pas encore jouée.' })
  if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/statut' })
  if (!data) return res.status(404).json({ error: 'Projet introuvable' })
  return res.status(200).json(data)
}
