// Activités d'imputation des heures (CNC, peinture, montage…).
//
// Lecture pour tous : chacun en a besoin pour saisir ses heures. Création et
// modification réservées à l'admin. Le CODE ne se modifie jamais et ne se
// supprime pas : une feuille scannée des années plus tôt doit garder son sens.
// Une activité qui ne sert plus se désactive.
//
// Le COÛT DE REVIENT n'est jamais envoyé à un membre : la colonne n'est pas
// sélectionnée. Masquer le champ dans la page ne protégerait rien.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'
import { validerActivite, validerMajActivite } from '../../lib/heures'

export const CHAMPS_MEMBRE = 'code, libelle, famille, actif, tarif_vente, facturee_heure'
export const CHAMPS_ADMIN = `${CHAMPS_MEMBRE}, cout_revient`

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const admin = isAdminUser(user)
  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('activites').select(admin ? CHAMPS_ADMIN : CHAMPS_MEMBRE).order('code')
    if (error) return erreurApi(req, res, 'internal', error, { route: 'activites' })
    return res.status(200).json(data)
  }

  if (!admin) return res.status(403).json({ error: 'Réservé à l\'admin' })

  if (req.method === 'POST') {
    const { data: existantes, error: errEx } = await supabase.from('activites').select('code')
    if (errEx) return erreurApi(req, res, 'internal', errEx, { route: 'activites' })
    const v = validerActivite(req.body, existantes || [])
    if (!v.ok) return res.status(400).json({ error: v.erreur })
    const { data, error } = await supabase.from('activites').insert(v.valeur).select(CHAMPS_ADMIN).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'activites' })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const code = Number(req.body?.code)
    if (!Number.isInteger(code)) return res.status(400).json({ error: 'code requis' })
    const v = validerMajActivite(req.body)
    if (!v.ok) return res.status(400).json({ error: v.erreur })
    const { data, error } = await supabase
      .from('activites').update(v.valeur).eq('code', code).select(CHAMPS_ADMIN).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'activites' })
    if (!data) return res.status(404).json({ error: 'Activité introuvable' })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
