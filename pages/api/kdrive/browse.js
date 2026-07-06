import { listDir } from '../../../lib/kdrive'
import { requireUser } from '../../../lib/requireAdmin'

// id du dossier "02. Projets" — racine par défaut
const PROJECTS_ROOT_ID = 11480

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const parentId = req.query.parentId ? Number(req.query.parentId) : PROJECTS_ROOT_ID
  try {
    const items = await listDir(parentId, 1, 200)
    const folders = items
      .filter(f => f.type === 'dir')
      .map(f => ({ id: f.id, name: f.name, parent_id: f.parent_id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return res.status(200).json({ root_id: PROJECTS_ROOT_ID, parent_id: parentId, folders })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
