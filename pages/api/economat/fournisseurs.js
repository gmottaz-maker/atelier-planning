// La liste contrôlée des fournisseurs de l'économat.
//
// Pas du texte libre sur l'article : le fournisseur est un FILTRE métier —
// « montre-moi ce qui est 🟠 et 🔴 chez OPO pendant leur promo » — et une
// colonne libre produit « OPO », « opo » et « OPO Oeschger » dans la même
// liste déroulante au bout de six mois.
//
// `annuaire_id` existe mais n'est pas exploité en V1 : l'annuaire ne porte
// aucun de ces fournisseurs, et exiger une fiche d'annuaire avant de pouvoir
// commander des vis serait absurde.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()
const CHAMPS = 'id, nom, annuaire_id, archived'

const nomValide = v => String(v || '').trim().slice(0, 120)

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return

  if (req.method === 'POST') {
    const nom = nomValide(req.body?.nom)
    if (!nom) return res.status(400).json({ error: 'Un nom est requis' })
    const { data, error } = await supabase.from('economat_fournisseurs').insert({ nom }).select(CHAMPS).single()
    if (error) {
      // 23505 : la contrainte d'unicité sur le nom. C'est tout l'intérêt de la
      // table — le message brut de Postgres parlerait d'index.
      if (error.code === '23505') return res.status(409).json({ error: `« ${nom} » est déjà dans la liste.` })
      return erreurApi(req, res, 'internal', error, { route: 'economat/fournisseurs' })
    }
    return res.status(201).json(data)
  }

  if (req.method === 'PUT') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const p = { updated_at: new Date().toISOString() }
    if (req.body?.nom !== undefined) {
      p.nom = nomValide(req.body.nom)
      if (!p.nom) return res.status(400).json({ error: 'Un nom est requis' })
    }
    if (req.body?.archived !== undefined) p.archived = req.body.archived === true
    const { data, error } = await supabase.from('economat_fournisseurs')
      .update(p).eq('id', id).select(CHAMPS).maybeSingle()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `« ${p.nom} » est déjà dans la liste.` })
      return erreurApi(req, res, 'internal', error, { route: 'economat/fournisseurs' })
    }
    if (!data) return res.status(404).json({ error: 'Fournisseur introuvable' })
    return res.status(200).json(data)
  }

  // Pas de DELETE : on ARCHIVE. Supprimer une ligne détacherait les articles
  // (ON DELETE SET NULL) sans rien dire, et l'historique des commandes garde
  // de toute façon le nom, pas la clé.
  return res.status(405).json({ error: 'Méthode non autorisée' })
}
