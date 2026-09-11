// Solde de consulting par client : heures de conseil notées contre lui, moins
// ce qui a déjà été compensé dans ses offres non refusées (lib/consulting.js).
//
// Réservé à l'admin : la compensation est glissée dans les offres de façon
// invisible pour le client, et la route lit les offres en entier.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'
import { soldeConsulting, soldesParClient, CODE_CONSULTING } from '../../lib/consulting'

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })
  const supabase = getSupabaseServer()

  const contact = req.query.contact != null ? Number(req.query.contact) : null
  if (req.query.contact != null && !Number.isInteger(contact)) return res.status(400).json({ error: 'contact invalide' })

  let qh = supabase
    .from('heures')
    .select('id, user_name, date, minutes, note, activite, project_id, contact_id')
    .eq('activite', CODE_CONSULTING)
    .is('project_id', null)
    .not('contact_id', 'is', null)
  let qp = supabase
    .from('projects')
    .select('id, numero, name, client_contact_id, quote_data')
    .not('client_contact_id', 'is', null)
  if (contact != null) {
    qh = qh.eq('contact_id', contact)
    qp = qp.eq('client_contact_id', contact)
  }

  const [{ data: heures, error: e1 }, { data: projets, error: e2 }] = await Promise.all([qh, qp])
  if (e1 || e2) return erreurApi(req, res, 'internal', e1 || e2, { route: 'consulting' })

  res.setHeader('Cache-Control', 'private, no-store')
  if (contact == null) return res.status(200).json(soldesParClient({ heures: heures || [], projets: projets || [] }))

  const detail = [...(heures || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return res.status(200).json({
    contact_id: contact,
    ...soldeConsulting({ heures: heures || [], projets: projets || [], exclure: req.query.exclure || null }),
    heures: detail.map(({ id, user_name, date, minutes, note }) => ({ id, user_name, date, minutes, note })),
  })
}
