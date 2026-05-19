import { getSupabaseServer } from '../../../../lib/supabase-server'

const supabase = getSupabaseServer()
import { ensureProjectFolder, upload, del } from '../../../../lib/kdrive'

const MAX_SIZE_MB = 20

export const config = { api: { bodyParser: { sizeLimit: '27mb' } } }

export default async function handler(req, res) {
  const { id } = req.query

  // ── GET: liste des fichiers du projet ──────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('project_files')
      .select('id, filename, mime_type, size, created_at, kdrive_file_id')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })

    const files = data.map(f => ({
      ...f,
      url: `/api/file-download?fileId=${f.id}`,
    }))
    return res.status(200).json(files)
  }

  // ── POST: upload fichier ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { filename, mime_type, base64, size } = req.body
    if (!filename || !mime_type || !base64) return res.status(400).json({ error: 'Missing fields' })
    if (size > MAX_SIZE_MB * 1024 * 1024) return res.status(413).json({ error: `Fichier trop grand (max ${MAX_SIZE_MB}MB)` })

    // Récupérer (ou créer) le dossier kDrive du projet
    const { data: project, error: projErr } = await supabase
      .from('projects').select('id, name, client, kdrive_folder_id').eq('id', id).single()
    if (projErr || !project) return res.status(404).json({ error: 'Projet introuvable' })

    let folderId = project.kdrive_folder_id
    if (!folderId) {
      try {
        folderId = await ensureProjectFolder(project.client, project.name)
      } catch (e) {
        return res.status(500).json({ error: 'kDrive folder error: ' + e.message })
      }
      await supabase.from('projects').update({ kdrive_folder_id: folderId }).eq('id', id)
    }

    // Upload sur kDrive
    const buffer = Buffer.from(base64, 'base64')
    let kdriveFile
    try {
      kdriveFile = await upload(folderId, filename, buffer, mime_type)
    } catch (e) {
      return res.status(500).json({ error: 'kDrive upload: ' + e.message })
    }

    // Sauvegarde métadonnées
    const { data: fileRecord, error: dbError } = await supabase
      .from('project_files')
      .insert({
        project_id: id,
        filename: kdriveFile.name,
        mime_type,
        size,
        kdrive_file_id: kdriveFile.id,
      })
      .select()
      .single()
    if (dbError) return res.status(500).json({ error: dbError.message })

    return res.status(200).json({
      ...fileRecord,
      url: `/api/file-download?fileId=${fileRecord.id}`,
    })
  }

  // ── DELETE: supprimer fichier ──────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { fileId } = req.body
    if (!fileId) return res.status(400).json({ error: 'fileId required' })

    const { data: file } = await supabase
      .from('project_files').select('kdrive_file_id').eq('id', fileId).single()

    if (file?.kdrive_file_id) {
      try { await del(file.kdrive_file_id) }
      catch (e) { console.warn('kDrive delete failed:', e.message) }
    }

    const { error } = await supabase.from('project_files').delete().eq('id', fileId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
