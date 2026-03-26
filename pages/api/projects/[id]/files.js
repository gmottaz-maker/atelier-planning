import { supabase } from '../../../../lib/supabase'

const MAX_SIZE_MB = 10
const NAS_HOST   = process.env.SYNOLOGY_HOST  // ex: https://amazinglabserver.de7.quickconnect.to
const NAS_USER   = process.env.SYNOLOGY_USER  // atelier-api
const NAS_PASS   = process.env.SYNOLOGY_PASS  // mot de passe généré
const NAS_FOLDER = '/project-files'

// Cache sid en mémoire (warm lambda)
let _sid = null
let _sidExpiry = 0

async function getSid() {
  if (_sid && Date.now() < _sidExpiry) return _sid
  const url = `${NAS_HOST}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login` +
    `&account=${encodeURIComponent(NAS_USER)}&passwd=${encodeURIComponent(NAS_PASS)}` +
    `&session=FileStation&format=sid`
  const resp = await fetch(url, { cache: 'no-store' })
  const data = await resp.json()
  if (!data.success) throw new Error('NAS auth failed: ' + JSON.stringify(data.error))
  _sid = data.data.sid
  _sidExpiry = Date.now() + 20 * 60 * 1000 // 20 min
  return _sid
}

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  const { id } = req.query

  // ── GET: liste des fichiers du projet ────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('project_files')
      .select('id, filename, mime_type, storage_path, size, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })

    // URLs proxy via notre propre API (évite d'exposer le NAS)
    const files = data.map(f => ({
      ...f,
      url: `/api/file-download?fileId=${f.id}`,
    }))
    return res.status(200).json(files)
  }

  // ── POST: upload fichier ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { filename, mime_type, base64, size } = req.body
    if (!filename || !mime_type || !base64) return res.status(400).json({ error: 'Missing fields' })
    if (size > MAX_SIZE_MB * 1024 * 1024) return res.status(413).json({ error: `Fichier trop grand (max ${MAX_SIZE_MB}MB)` })

    const buffer      = Buffer.from(base64, 'base64')
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const folderPath  = `${NAS_FOLDER}/${id}`
    const storagePath = `${folderPath}/${Date.now()}_${safeFilename}`

    try {
      const sid = await getSid()

      // Upload via SYNO.FileStation.Upload (multipart)
      const blob = new Blob([buffer], { type: mime_type })
      const form = new FormData()
      form.append('api',            'SYNO.FileStation.Upload')
      form.append('version',        '2')
      form.append('method',         'upload')
      form.append('path',           folderPath)
      form.append('create_parents', 'true')
      form.append('overwrite',      'true')
      form.append('_sid',           sid)
      form.append('file',           blob, safeFilename)

      const uploadResp = await fetch(`${NAS_HOST}/webapi/entry.cgi`, {
        method: 'POST',
        body: form,
      })
      const uploadData = await uploadResp.json()
      if (!uploadData.success) {
        _sid = null // reset cache si erreur auth
        return res.status(500).json({ error: 'Upload NAS échoué: ' + JSON.stringify(uploadData.error || uploadData) })
      }
    } catch (e) {
      return res.status(500).json({ error: 'NAS error: ' + e.message })
    }

    // Sauvegarde métadonnées en DB (Supabase)
    const { data: fileRecord, error: dbError } = await supabase
      .from('project_files')
      .insert({ project_id: id, filename, mime_type, storage_path: storagePath, size })
      .select()
      .single()
    if (dbError) return res.status(500).json({ error: dbError.message })

    return res.status(200).json({
      ...fileRecord,
      url: `/api/file-download?fileId=${fileRecord.id}`,
    })
  }

  // ── DELETE: supprimer fichier ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { fileId, storagePath } = req.body
    if (!fileId) return res.status(400).json({ error: 'fileId required' })

    if (storagePath) {
      try {
        const sid = await getSid()
        // Lancer la suppression sur le NAS
        const delUrl = `${NAS_HOST}/webapi/entry.cgi` +
          `?api=SYNO.FileStation.Delete&version=2&method=start` +
          `&path=${encodeURIComponent(storagePath)}&_sid=${encodeURIComponent(sid)}`
        await fetch(delUrl)
      } catch (e) {
        console.error('NAS delete error:', e)
        // On continue quand même pour supprimer l'entrée DB
      }
    }

    const { error } = await supabase.from('project_files').delete().eq('id', fileId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
