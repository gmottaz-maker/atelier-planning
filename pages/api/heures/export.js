// Export des heures imputées, pour le tableur ou l'outil de rentabilité.
//
// Réservé à l'admin : c'est le relevé d'activité de TOUTE l'équipe, minute
// par minute. Chacun voit ses propres heures à l'écran ; l'export croisé
// n'appartient qu'à qui pilote l'entreprise.
//
// `?format=json` rend les mêmes lignes, pour un traitement automatisé.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { lignesExport, versCSV } from '../../../lib/heures'
import { contentDisposition } from '../../../lib/contentDisposition'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })
  const supabase = getSupabaseServer()
  const { from, to, user, project, format } = req.query

  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) {
    return res.status(400).json({ error: 'Dates au format AAAA-MM-JJ' })
  }

  let q = supabase
    .from('heures')
    .select('user_name, date, debut, fin, minutes, project_id, activite, note, source, projects(numero, name, client)')
    .order('date').order('debut')
  if (from) q = q.gte('date', from)
  if (to) q = q.lte('date', to)
  if (user) q = q.eq('user_name', user)
  if (project) q = q.eq('project_id', project)

  const [{ data, error }, { data: activites, error: errAct }] = await Promise.all([
    q, supabase.from('activites').select('code, libelle, famille'),
  ])
  if (error || errAct) return erreurApi(req, res, 'internal', error || errAct, { route: 'heures/export' })

  const lignes = lignesExport(data || [], { activites: activites || [] })
  res.setHeader('Cache-Control', 'private, no-store')
  if (format === 'json') return res.status(200).json(lignes)

  const nom = `heures_${from || 'debut'}_${to || 'fin'}.csv`
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', contentDisposition(nom, 'attachment'))
  return res.status(200).send(versCSV(lignes))
}
