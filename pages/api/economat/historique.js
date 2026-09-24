// L'historique des commandes d'un article — complet, jamais purgé.
//
// « On l'a commandé quand, déjà ? » est la première question quand une boîte
// se vide trop vite. Pas de statistiques ni de prévisions en V1 : juste la
// liste, dans l'ordre.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  const id = Number(req.query?.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })

  const { data, error } = await supabase.from('economat_commandes')
    .select('id, article_id, commande_le, recu_le, par, fournisseur, reference, quantite')
    .eq('article_id', id).order('commande_le', { ascending: false }).limit(200)
  if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/historique' })
  return res.status(200).json(data)
}
