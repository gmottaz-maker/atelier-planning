// Feuilles d'heures à imprimer : une page A4 par personne et par jour travaillé
// de la période (lib/feuilleHeures.js).
//
// Un membre n'imprime que SA feuille, quoi que dise la requête ; l'admin
// choisit les personnes. `?format=html` rend le même document en HTML, pour
// l'aperçu — tout ce qui vient de la base y est échappé.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { htmlToPdf } from '../../../lib/htmlToPdf'
import { contentDisposition } from '../../../lib/contentDisposition'
import { feuillesHtml, joursAImprimer, MAX_JOURS } from '../../../lib/feuilleHeures'

export const config = { maxDuration: 60 }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PERSONNES = 10

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { from, to } = req.query
  if (!DATE.test(from || '') || !DATE.test(to || '') || from > to) {
    return res.status(400).json({ error: 'Période invalide (AAAA-MM-JJ)' })
  }
  // `tous=1` : mercredis et week-ends compris. Un jour seul sort toujours.
  const jours = joursAImprimer(from, to, { tous: req.query.tous === '1' })
  if (!jours.length) {
    return res.status(400).json({ error: 'Aucun jour travaillé (lun, mar, jeu, ven) dans la période — coche « mercredi et week-end compris »' })
  }
  if (jours.length > MAX_JOURS) return res.status(400).json({ error: `Pas plus de ${MAX_JOURS} jours à la fois` })

  const demandees = String(req.query.users || '').split(',').map(s => s.trim()).filter(Boolean)
  const personnes = isAdminUser(user) && demandees.length ? [...new Set(demandees)] : [user.name]
  if (personnes.length > MAX_PERSONNES) return res.status(400).json({ error: `Pas plus de ${MAX_PERSONNES} personnes à la fois` })

  const supabase = getSupabaseServer()
  const [{ data: projets, error: e1 }, { data: activites, error: e2 }] = await Promise.all([
    supabase.from('projects').select('numero, name, client, status, suspended').eq('status', 'active'),
    supabase.from('activites').select('code, libelle, famille, actif').order('code'),
  ])
  if (e1 || e2) return erreurApi(req, res, 'internal', e1 || e2, { route: 'heures/feuille' })

  const html = feuillesHtml({ personnes, jours, projets: projets || [], activites: activites || [] })

  if (req.query.format === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(html)
  }

  try {
    const pdf = await htmlToPdf(html)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', contentDisposition(`feuilles-heures_${from}_${to}.pdf`, 'inline'))
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (e) {
    return erreurApi(req, res, 'internal', e, { route: 'heures/feuille' })
  }
}
