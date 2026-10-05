// Les listes administrables de l'économat : unités (§5), délais (§10) et
// emplacements (§2.1). Les fournisseurs ont leur propre route, plus ancienne.
//
// Une route pour trois tables, parce qu'elles se gèrent exactement pareil :
// ajouter, renommer, archiver. Le nom de la liste passe par une liste blanche
// (`LISTES`) — jamais un nom de table venu du navigateur.
//
// Pas de DELETE : on ARCHIVE. Une unité supprimée laisserait des quantités
// sans unité (« 1000 » quoi ?), un emplacement supprimé des articles qu'on ne
// retrouve plus. Une entrée archivée disparaît des listes de choix mais reste
// lisible sur les articles qui la portent encore.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { LISTES, validerEntreeListe } from '../../../lib/economat'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return

  const liste = String(req.body?.liste || req.query?.liste || '')
  const def = Object.prototype.hasOwnProperty.call(LISTES, liste) ? LISTES[liste] : null
  if (!def) return res.status(400).json({ error: 'Liste inconnue' })

  if (req.method === 'POST') {
    const { ok, erreur, valeur } = validerEntreeListe(liste, req.body)
    if (!ok) return res.status(400).json({ error: erreur })
    const { data, error } = await supabase.from(def.table).insert(valeur).select(def.champs).single()
    if (error) {
      // 23505 : la contrainte d'unicité sur le nom — c'est tout l'intérêt
      // d'une liste contrôlée, et le message brut de Postgres parlerait d'index.
      if (error.code === '23505') return res.status(409).json({ error: 'Ce nom est déjà dans la liste.' })
      return erreurApi(req, res, 'internal', error, { route: 'economat/listes' })
    }
    return res.status(201).json(data)
  }

  if (req.method === 'PUT') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const { ok, erreur, valeur } = validerEntreeListe(liste, req.body, { partiel: true })
    if (!ok) return res.status(400).json({ error: erreur })
    const { data, error } = await supabase.from(def.table)
      .update({ ...valeur, updated_at: new Date().toISOString() })
      .eq('id', id).select(def.champs).maybeSingle()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ce nom est déjà dans la liste.' })
      return erreurApi(req, res, 'internal', error, { route: 'economat/listes' })
    }
    if (!data) return res.status(404).json({ error: 'Entrée introuvable' })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
