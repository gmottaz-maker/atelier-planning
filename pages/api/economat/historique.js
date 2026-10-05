// L'historique d'un article — complet, jamais purgé (brief V2, §20).
//
// Deux journaux : les GESTES (chaque mouvement de stock, chaque prise en
// charge) et les COMMANDES (une ligne par prise en charge, fermée au
// réapprovisionnement). « On l'a commandé quand, déjà ? » est la première
// question quand une boîte se vide trop vite. Pas de statistiques ni de
// prévisions : juste les listes, dans l'ordre.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  const id = Number(req.query?.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })

  const [mouvements, commandes] = await Promise.all([
    supabase.from('economat_mouvements')
      .select('id, le, par, type, avant, apres, decoupage, annule_le')
      .eq('article_id', id).order('id', { ascending: false }).limit(200),
    supabase.from('economat_commandes')
      .select('id, article_id, commande_le, recu_le, par, fournisseur, reference, quantite')
      .eq('article_id', id).order('commande_le', { ascending: false }).limit(200),
  ])
  const souci = mouvements.error || commandes.error
  if (souci) return erreurApi(req, res, 'internal', souci, { route: 'economat/historique' })
  return res.status(200).json({ mouvements: mouvements.data, commandes: commandes.data })
}
