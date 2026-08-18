import { getSupabaseServer } from '../../../../lib/supabase-server'

const supabase = getSupabaseServer()
import { ensureProjectFolder, upload, del } from '../../../../lib/kdrive'
import { validerFichier, nomSur } from '../../../../lib/fileType'
import { requireUser } from '../../../../lib/requireAdmin'

const MAX_IMAGE_MB = 10

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('project_updates')
      .select('id, author, content, image_kdrive_id, image_filename, image_mime_type, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── POST ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { author, content, image } = req.body || {}
    if (!author || !content) return res.status(400).json({ error: 'author et content requis' })

    let image_kdrive_id = null
    let image_filename  = null
    let image_mime_type = null

    let check = null
    if (image && image.base64 && image.filename) {
      // Type et taille déduits du contenu, pas de ce qu'annonce le navigateur.
      const buffer = Buffer.from(image.base64, 'base64')
      check = validerFichier(buffer, { maxOctets: MAX_IMAGE_MB * 1024 * 1024 })
      if (!check.ok) return res.status(check.status).json({ error: check.error })

      // Récupérer / créer le dossier kDrive du projet
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

      try {
        const kfile = await upload(folderId, nomSur(image.filename, check.mime), buffer, check.mime)
        image_kdrive_id = kfile.id
        image_filename  = kfile.name
        image_mime_type = check.mime
      } catch (e) {
        return res.status(500).json({ error: 'kDrive upload: ' + e.message })
      }
    }

    const { data: row, error: insErr } = await supabase
      .from('project_updates')
      .insert({ project_id: id, author, content, image_kdrive_id, image_filename, image_mime_type })
      .select()
      .single()
    if (insErr) return res.status(500).json({ error: insErr.message })

    return res.status(200).json(row)
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { updateId } = req.body || {}
    if (!updateId) return res.status(400).json({ error: 'updateId requis' })

    const { data: row } = await supabase
      .from('project_updates').select('image_kdrive_id').eq('id', updateId).single()

    if (row?.image_kdrive_id) {
      try { await del(row.image_kdrive_id) }
      catch (e) { console.warn('kDrive delete failed:', e.message) }
    }

    const { error } = await supabase.from('project_updates').delete().eq('id', updateId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
