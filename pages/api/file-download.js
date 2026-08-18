import { getSupabaseServer } from '../../lib/supabase-server'

const supabase = getSupabaseServer()
import { downloadStream } from '../../lib/kdrive'
import { requireUser } from '../../lib/requireAdmin'
import { entetesFichier } from '../../lib/fileType'

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
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
    // Seules les images vérifiées repartent en inline ; le reste en pièce
    // jointe, avec nosniff — un HTML servi inline s'exécuterait dans l'origine.
    entetesFichier(res, { mime: file.mime_type, filename: file.filename })
    const buffer = await r.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (e) {
    console.error('file-download error:', e)
    res.status(500).json({ error: 'Erreur kDrive: ' + e.message })
  }
}
