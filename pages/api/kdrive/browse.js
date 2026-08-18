// Sélecteur de dossier kDrive (rattachement d'un projet).
//
// `parentId` était pris tel quel : la route permettait de parcourir tout le
// drive, dossiers comptables compris. La descente se fait maintenant par jeton
// signé, à partir de la racine « 02. Projets ».
import { listDir } from '../../../lib/kdrive'
import { requireUser } from '../../../lib/requireAdmin'
import { signRef, verifyRef } from '../../../lib/signedRef'

// id du dossier "02. Projets" — racine par défaut, seul point d'entrée
const PROJECTS_ROOT_ID = 11480

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return

  let parentId = PROJECTS_ROOT_ID
  if (req.query.parentToken) {
    const ref = verifyRef(req.query.parentToken)
    if (!ref || ref.kind !== 'browse') return res.status(404).json({ error: 'Dossier introuvable' })
    parentId = ref.folderId
  }

  try {
    const items = await listDir(parentId, 1, 200)
    const folders = items
      .filter(f => f.type === 'dir')
      .map(f => ({ id: f.id, name: f.name, token: signRef({ kind: 'browse', folderId: f.id }) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return res.status(200).json({ root_id: PROJECTS_ROOT_ID, parent_id: parentId, folders })
  } catch (e) {
    console.error('kdrive browse:', e.message)
    return res.status(500).json({ error: 'Lecture kDrive impossible' })
  }
}
