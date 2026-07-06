import { getSupabaseServer } from '../../../../lib/supabase-server'
import { listDir } from '../../../../lib/kdrive'
import { requireUser } from '../../../../lib/requireAdmin'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id, folderId } = req.query

  let targetFolder
  if (folderId) {
    targetFolder = Number(folderId)
  } else {
    const { data: project, error } = await supabase
      .from('projects').select('kdrive_folder_id').eq('id', id).single()
    if (error || !project) return res.status(404).json({ error: 'Projet introuvable' })
    if (!project.kdrive_folder_id) return res.status(200).json({ folder_id: null, items: [] })
    targetFolder = project.kdrive_folder_id
  }

  try {
    const items = await listDir(targetFolder, 1, 200)
    const cleaned = items.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      mime_type: f.mime_type || null,
      size: f.size || 0,
      has_thumbnail: !!f.has_thumbnail,
      last_modified_at: f.last_modified_at,
    })).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'fr')
    })
    return res.status(200).json({ folder_id: targetFolder, items: cleaned })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
