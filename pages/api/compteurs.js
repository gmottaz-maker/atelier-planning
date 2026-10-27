// Les deux compteurs de la barre latérale — et rien d'autre.
//
// La barre latérale affiche deux nombres : les projets actifs et les tâches
// actives. Elle les tirait de `/api/projects?light=1` et `/api/tasks`, qui
// renvoient TOUTES les lignes, jointures comprises, sur CHAQUE page de
// l'application. Deux des requêtes les plus lourdes du logiciel, pour deux
// entiers.
//
// Ici, `head: true` ne transporte aucune ligne : Postgres compte, et c'est
// tout. Les pages qui ont vraiment besoin des listes continuent de les
// charger — SWR dédoublonne, elles ne paient pas cette route deux fois.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'
import { isAdmin } from '../../lib/taskAccess'

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  const supabase = getSupabaseServer()
  const tachesActives = () =>
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'active')

  // Même règle que `canSeeTask` : une tâche privée ne compte que pour l'admin
  // et son responsable. `not.is.true` et non `eq.false`, pour qu'une ligne
  // dont `is_private` serait nul reste visible, comme côté client.
  //
  // Deux requêtes séparées plutôt qu'un `or(...)` : le nom part alors en
  // paramètre, jamais concaténé dans une chaîne de filtre PostgREST.
  const requetes = [
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    isAdmin(user) ? tachesActives() : tachesActives().not('is_private', 'is', true),
  ]
  if (!isAdmin(user)) {
    requetes.push(tachesActives().is('is_private', true).eq('responsible', user.name))
  }

  const reponses = await Promise.all(requetes)
  const souci = reponses.find(r => r.error)
  if (souci) return erreurApi(req, res, 'internal', souci.error, { route: 'compteurs' })

  const [projets, ...taches] = reponses
  return res.status(200).json({
    projets: projets.count || 0,
    taches: taches.reduce((n, r) => n + (r.count || 0), 0),
  })
}
