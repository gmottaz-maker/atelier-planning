import { getSupabaseServer } from '../../lib/supabase-server'

const supabase = getSupabaseServer()
import { downloadStream } from '../../lib/kdrive'
import { requireUser } from '../../lib/requireAdmin'
import { entetesFichier, relayerFlux } from '../../lib/fileType'

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { updateId } = req.query
  if (!updateId) return res.status(400).json({ error: 'updateId requis' })

  const { data: row, error } = await supabase
    .from('project_updates')
    .select('image_kdrive_id, image_filename, image_mime_type')
    .eq('id', updateId)
    .single()
  if (error || !row || !row.image_kdrive_id) return res.status(404).end()

  try {
    const r = await downloadStream(row.image_kdrive_id)
    entetesFichier(res, { mime: row.image_mime_type, filename: row.image_filename })
    res.setHeader('Cache-Control', 'private, max-age=300')
    await relayerFlux(r, res)
  } catch (e) {
    console.error('update-image error:', e)
    res.status(500).json({ error: 'kDrive: ' + e.message })
  }
}
