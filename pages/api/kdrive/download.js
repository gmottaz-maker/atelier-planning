// Téléchargement générique d'un fichier kDrive par id.
// Pour la sécurité minimum, on vérifie que le fichier id est référencé quelque part en DB.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { downloadStream } from '../../../lib/kdrive'
import { requireUser } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

const MIME_BY_EXT = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}
function mimeFromName(name) {
  const ext = (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase()
  return MIME_BY_EXT[ext] || 'application/pdf'
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { fileId } = req.query
  if (!fileId) return res.status(400).end()
  const id = Number(fileId)

  // Vérifier que ce fichier est référencé dans une table du projet
  const checks = await Promise.all([
    supabase.from('project_files').select('id, filename, mime_type').eq('kdrive_file_id', id).limit(1).maybeSingle(),
    supabase.from('supplier_invoices').select('id, kdrive_filename').eq('kdrive_file_id', id).limit(1).maybeSingle(),
    supabase.from('customer_invoices').select('id, invoice_number').eq('pdf_kdrive_id', id).limit(1).maybeSingle(),
    supabase.from('project_updates').select('id, image_filename, image_mime_type').eq('image_kdrive_id', id).limit(1).maybeSingle(),
    supabase.from('expenses').select('id, kdrive_filename').eq('kdrive_file_id', id).limit(1).maybeSingle(),
  ])
  const found = checks.find(c => c.data)
  if (!found) return res.status(404).json({ error: 'Fichier non trouvé' })

  const filename = found.data.filename || found.data.kdrive_filename || found.data.image_filename || `facture-${found.data.invoice_number || id}.pdf`
  // Un reçu peut être une image ; on déduit le type de l'extension à défaut de champ dédié.
  const mime     = found.data.mime_type || found.data.image_mime_type || mimeFromName(filename)

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
