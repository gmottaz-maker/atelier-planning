// Activités d'imputation des heures (CNC, peinture, montage…).
//
// Lecture pour tous : chacun en a besoin pour saisir ses heures. Création et
// modification réservées à l'admin. Le CODE ne se modifie jamais et ne se
// supprime pas : une feuille scannée des années plus tôt doit garder son sens.
// Une activité qui ne sert plus se désactive.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'
import { validerActivite, FAMILLES } from '../../lib/heures'

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('activites').select('code, libelle, famille, actif').order('code')
    if (error) return erreurApi(req, res, 'internal', error, { route: 'activites' })
    return res.status(200).json(data)
  }

  if (!isAdminUser(user)) return res.status(403).json({ error: 'Réservé à l\'admin' })

  if (req.method === 'POST') {
    const { data: existantes, error: errEx } = await supabase.from('activites').select('code')
    if (errEx) return erreurApi(req, res, 'internal', errEx, { route: 'activites' })
    const v = validerActivite(req.body, existantes || [])
    if (!v.ok) return res.status(400).json({ error: v.erreur })
    const { data, error } = await supabase.from('activites').insert(v.valeur).select('code, libelle, famille, actif').single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'activites' })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const b = req.body || {}
    const code = Number(b.code)
    if (!Number.isInteger(code)) return res.status(400).json({ error: 'code requis' })
    const maj = {}
    if ('libelle' in b) {
      const l = String(b.libelle ?? '').trim()
      if (!l) return res.status(400).json({ error: 'Libellé requis' })
      maj.libelle = l.slice(0, 60)
    }
    if ('famille' in b) {
      if (!FAMILLES.includes(b.famille)) return res.status(400).json({ error: 'Famille inconnue' })
      maj.famille = b.famille
    }
    if ('actif' in b) maj.actif = !!b.actif
    if (!Object.keys(maj).length) return res.status(400).json({ error: 'Rien à modifier' })

    const { data, error } = await supabase
      .from('activites').update(maj).eq('code', code).select('code, libelle, famille, actif').maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'activites' })
    if (!data) return res.status(404).json({ error: 'Activité introuvable' })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
