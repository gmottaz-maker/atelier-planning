// Listing du dossier kDrive d'un projet.
//
// `folderId` était pris tel quel dans la requête : n'importe quel utilisateur
// connecté pouvait donc lister n'importe quel dossier du drive — y compris
// « 00. Admin / Claude Finance ». La navigation se fait maintenant par jeton
// signé : on ne peut descendre que dans un dossier que le serveur a lui-même
// renvoyé, à partir de la racine du projet.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { listDir } from '../../../../lib/kdrive'
import { requireUser } from '../../../../lib/requireAdmin'
import { signRef, verifyRef } from '../../../../lib/signedRef'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id, folderToken } = req.query

  let targetFolder
  if (folderToken) {
    const ref = verifyRef(folderToken)
    if (!ref || ref.kind !== 'dir' || String(ref.projectId) !== String(id)) {
      return res.status(404).json({ error: 'Dossier introuvable' })
    }
    targetFolder = ref.folderId
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
      // Jeton d'accès borné : descendre dans un dossier, ou lire la vignette
      // d'un fichier que le serveur vient de désigner.
      token: f.type === 'dir'
        ? signRef({ kind: 'dir', folderId: f.id, projectId: String(id) })
        : signRef({ kind: 'file', fileId: f.id, projectId: String(id) }),
    })).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'fr')
    })
    return res.status(200).json({ folder_id: targetFolder, items: cleaned })
  } catch (e) {
    console.error('kdrive-listing:', e.message)
    return res.status(500).json({ error: 'Lecture kDrive impossible' })
  }
}
