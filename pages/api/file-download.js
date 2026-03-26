import { supabase } from '../../lib/supabase'

const NAS_HOST = process.env.SYNOLOGY_HOST
const NAS_USER = process.env.SYNOLOGY_USER
const NAS_PASS = process.env.SYNOLOGY_PASS

// Cache sid
let _sid = null
let _sidExpiry = 0

async function getSid() {
  if (_sid && Date.now() < _sidExpiry) return _sid
  const url = `${NAS_HOST}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login` +
    `&account=${encodeURIComponent(NAS_USER)}&passwd=${encodeURIComponent(NAS_PASS)}` +
    `&session=FileStation&format=sid`
  const resp = await fetch(url, { cache: 'no-store' })
  const data = await resp.json()
  if (!data.success) throw new Error('NAS auth failed')
  _sid = data.data.sid
  _sidExpiry = Date.now() + 20 * 60 * 1000
  return _sid
}

export default async function handler(req, res) {
  const { fileId } = req.query
  if (!fileId) return res.status(400).json({ error: 'fileId required' })

  // Récupérer les métadonnées du fichier depuis Supabase
  const { data: file, error } = await supabase
    .from('project_files')
    .select('storage_path, filename, mime_type')
    .eq('id', fileId)
    .single()

  if (error || !file) return res.status(404).json({ error: 'Fichier introuvable' })

  try {
    const sid = await getSid()

    // Téléchargement depuis le NAS
    const downloadUrl = `${NAS_HOST}/webapi/entry.cgi` +
      `?api=SYNO.FileStation.Download&version=2&method=download` +
      `&path=${encodeURIComponent(file.storage_path)}&mode=open` +
      `&_sid=${encodeURIComponent(sid)}`

    const nasResp = await fetch(downloadUrl)
    if (!nasResp.ok) {
      _sid = null
      return res.status(502).json({ error: 'NAS download failed: ' + nasResp.status })
    }

    // Vérifier que c'est bien un fichier (pas une réponse JSON d'erreur)
    const contentType = nasResp.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const errData = await nasResp.json()
      _sid = null
      return res.status(502).json({ error: 'NAS error: ' + JSON.stringify(errData) })
    }

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`)

    const buffer = await nasResp.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (e) {
    console.error('file-download error:', e)
    res.status(500).json({ error: 'Erreur de téléchargement: ' + e.message })
  }
}
