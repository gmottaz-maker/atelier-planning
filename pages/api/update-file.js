import { getSupabaseServer } from '../../lib/supabase-server'

const supabase = getSupabaseServer()
import { downloadStream } from '../../lib/kdrive'
import { requireUser } from '../../lib/requireAdmin'
import { entetesFichier, relayerFlux } from '../../lib/fileType'

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { updateId } = req.query
  if (!updateId) return res.status(400).json({ error: 'updateId requis' })

  // `image_*` est l'ancien nom des trois mêmes colonnes ; la migration les
  // recopie, ce repli couvre les déploiements faits avant qu'elle soit jouée.
  const { data: row, error } = await supabase
    .from('project_updates')
    .select('file_kdrive_id, file_filename, file_mime_type, image_kdrive_id, image_filename, image_mime_type')
    .eq('id', updateId)
    .single()
  if (error || !row) return res.status(404).end()

  const kid  = row.file_kdrive_id || row.image_kdrive_id
  const nom  = row.file_filename  || row.image_filename
  const mime = row.file_mime_type || row.image_mime_type
  if (!kid) return res.status(404).end()

  try {
    const r = await downloadStream(kid)
    entetesFichier(res, { mime, filename: nom })
    res.setHeader('Cache-Control', 'private, max-age=300')
    await relayerFlux(r, res)
  } catch (e) {
    console.error('update-file error:', e)
    res.status(500).json({ error: 'kDrive: ' + e.message })
  }
}
