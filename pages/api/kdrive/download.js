// Téléchargement générique d'un fichier kDrive par id.
// Pour la sécurité minimum, on vérifie que le fichier id est référencé quelque part en DB.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { downloadStream } from '../../../lib/kdrive'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const { fileId } = req.query
  if (!fileId) return res.status(400).end()
  const id = Number(fileId)

  // Vérifier que ce fichier est référencé dans une table du projet
  const checks = await Promise.all([
    supabase.from('project_files').select('id, filename, mime_type').eq('kdrive_file_id', id).limit(1).maybeSingle(),
    supabase.from('supplier_invoices').select('id, kdrive_filename').eq('kdrive_file_id', id).limit(1).maybeSingle(),
    supabase.from('customer_invoices').select('id, invoice_number').eq('pdf_kdrive_id', id).limit(1).maybeSingle(),
    supabase.from('project_updates').select('id, image_filename, image_mime_type').eq('image_kdrive_id', id).limit(1).maybeSingle(),
  ])
  const found = checks.find(c => c.data)
  if (!found) return res.status(404).json({ error: 'Fichier non trouvé' })

  const filename = found.data.filename || found.data.kdrive_filename || found.data.image_filename || `facture-${found.data.invoice_number || id}.pdf`
  const mime     = found.data.mime_type || found.data.image_mime_type || 'application/pdf'

  try {
    const r = await downloadStream(id)
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`)
    const buf = await r.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
