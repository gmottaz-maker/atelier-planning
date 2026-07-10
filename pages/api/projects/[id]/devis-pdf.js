// PDF de devis (offre) — rendu identique à la page devis via HTML → PDF (Chromium).
// ?mode=detail (défaut) | summary.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { buildDevisHtml } from '../../../../lib/devisHtml'
import { htmlToPdf } from '../../../../lib/htmlToPdf'

export const config = { maxDuration: 30 }

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query
  const mode = req.query.mode === 'summary' ? 'summary' : 'detail'

  const { data: project, error } = await supabase.from('projects').select('*').eq('id', id).single()
  if (error || !project) return res.status(404).end()

  const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  const company = settings?.value || {}

  const rawQ = project.quote_data || {}
  const ref = rawQ.number || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(project.id).slice(-4).toUpperCase()}`

  try {
    const pdf = await htmlToPdf(buildDevisHtml(project, company, mode))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="devis-${ref}.pdf"`)
    res.send(Buffer.from(pdf))
  } catch (e) {
    console.error('devis-pdf:', e)
    res.status(500).json({ error: 'Génération PDF impossible : ' + e.message })
  }
}
