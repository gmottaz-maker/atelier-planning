import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const BUCKET = 'project-files'
const MAX_SIZE_MB = 10

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  const { id } = req.query

  // ── GET: list files for project ──────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('project_files')
      .select('id, filename, mime_type, storage_path, size, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    // Build public URLs
    const files = data.map(f => ({
      ...f,
      url: supabase.storage.from(BUCKET).getPublicUrl(f.storage_path).data.publicUrl,
    }))
    return res.status(200).json(files)
  }

  // ── POST: upload file ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { filename, mime_type, base64, size } = req.body
    if (!filename || !mime_type || !base64) return res.status(400).json({ error: 'Missing fields' })
    if (size > MAX_SIZE_MB * 1024 * 1024) return res.status(413).json({ error: `Fichier trop grand (max ${MAX_SIZE_MB}MB)` })

    // Decode base64 to buffer
    const buffer = Buffer.from(base64, 'base64')
    const ext = filename.split('.').pop().toLowerCase()
    const storagePath = `${id}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mime_type, upsert: false })
    if (uploadError) return res.status(500).json({ error: uploadError.message })

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

    // Save metadata in DB
    const { data: fileRecord, error: dbError } = await supabase
      .from('project_files')
      .insert({ project_id: id, filename, mime_type, storage_path: storagePath, size })
      .select()
      .single()
    if (dbError) return res.status(500).json({ error: dbError.message })

    return res.status(200).json({ ...fileRecord, url: urlData.publicUrl })
  }

  // ── DELETE: remove file ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { fileId, storagePath } = req.body
    if (!fileId) return res.status(400).json({ error: 'fileId required' })

    // Remove from storage
    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath])
    }
    // Remove from DB
    const { error } = await supabase.from('project_files').delete().eq('id', fileId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
