import { getSupabaseServer } from '../../lib/supabase-server'

const supabase = getSupabaseServer()
import { downloadStream } from '../../lib/kdrive'

export default async function handler(req, res) {
  const { fileId } = req.query
  if (!fileId) return res.status(400).json({ error: 'fileId required' })

  const { data: file, error } = await supabase
    .from('project_files')
    .select('filename, mime_type, kdrive_file_id')
    .eq('id', fileId)
    .single()
  if (error || !file) return res.status(404).json({ error: 'Fichier introuvable' })
  if (!file.kdrive_file_id) return res.status(410).json({ error: 'Fichier non migré sur kDrive' })

  try {
    const r = await downloadStream(file.kdrive_file_id)
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`)
    const buffer = await r.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (e) {
    console.error('file-download error:', e)
    res.status(500).json({ error: 'Erreur kDrive: ' + e.message })
  }
}
