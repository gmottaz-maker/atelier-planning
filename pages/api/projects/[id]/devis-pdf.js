// PDF de devis (offre) — rendu identique à la page devis via HTML → PDF (Chromium).
// Un seul format : ce qui apparaît se règle ligne par ligne dans l'éditeur.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { buildDevisHtml } from '../../../../lib/devisHtml'
import { htmlToPdf } from '../../../../lib/htmlToPdf'
import { pdfFilename } from '../../../../lib/pdfFilename'

export const config = { maxDuration: 30 }

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query

  const { data: project, error } = await supabase.from('projects').select('*').eq('id', id).single()
  if (error || !project) return res.status(404).end()

  const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  const company = settings?.value || {}

  try {
    const pdf = await htmlToPdf(buildDevisHtml(project, company))
    res.setHeader('Content-Type', 'application/pdf')
    // `?download=1` : téléchargement plutôt qu'ouverture dans le visualiseur.
    const disposition = req.query.download ? 'attachment' : 'inline'
    res.setHeader('Content-Disposition', `${disposition}; filename="${pdfFilename('devis', project.name)}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(Buffer.from(pdf))
  } catch (e) {
    console.error('devis-pdf:', e)
    res.status(500).json({ error: 'Génération PDF impossible : ' + e.message })
  }
}
