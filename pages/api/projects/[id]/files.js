import { supabase } from '../../../../lib/supabase'

const MAX_SIZE_MB = 20
const NAS_HOST   = process.env.SYNOLOGY_HOST  // ex: https://amazinglabserver.de7.quickconnect.to
const NAS_USER   = process.env.SYNOLOGY_USER  // atelier-api
const NAS_PASS   = process.env.SYNOLOGY_PASS  // mot de passe généré
const NAS_FOLDER = '/project-files'

// Cache sid en mémoire (warm lambda)
let _sid = null
let _sidExpiry = 0

async function getSid() {
  if (_sid && Date.now() < _sidExpiry) return _sid

  // ── Vérification des variables d'environnement ────────────────────────────
  const missing = []
  if (!NAS_HOST) missing.push('SYNOLOGY_HOST')
  if (!NAS_USER) missing.push('SYNOLOGY_USER')
  if (!NAS_PASS) missing.push('SYNOLOGY_PASS')
  if (missing.length > 0) {
    throw new Error(`NAS: variable(s) Vercel manquante(s): ${missing.join(', ')}`)
  }

  // Supprimer le slash final s'il existe
  const host = NAS_HOST.replace(/\/$/, '')

  const url = `${host}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login` +
    `&account=${encodeURIComponent(NAS_USER)}&passwd=${encodeURIComponent(NAS_PASS)}` +
    `&session=FileStation&format=sid`

  let resp
  try {
    resp = await fetch(url, { cache: 'no-store' })
  } catch (fetchErr) {
    throw new Error(`NAS auth: impossible de joindre ${host} — ${fetchErr.message}. Vérifiez que l'URL est accessible depuis internet (pas seulement en local).`)
  }

  const ct = resp.headers.get('content-type') || ''
  if (!ct.includes('json')) {
    // Lire les premiers caractères pour aider au diagnostic
    let preview = ''
    try { preview = (await resp.text()).substring(0, 120) } catch (_) {}
    throw new Error(
      `NAS auth: réponse non-JSON depuis ${host} (HTTP ${resp.status}, type: "${ct}"). ` +
      `Vérifiez SYNOLOGY_HOST — si c'est une URL QuickConnect, utilisez l'URL directe (DDNS ou IP publique:port). ` +
      `Début réponse: ${preview}`
    )
  }

  const data = await resp.json()
  if (!data.success) {
    const code = data.error?.code
    const msg = {
      400: 'Identifiants incorrects (account/passwd)',
      401: 'Compte invité désactivé',
      402: 'Compte désactivé',
      403: '2FA requis',
      404: 'Permission refusée',
    }[code] || `code ${code}`
    throw new Error(`NAS auth échoué: ${msg}`)
  }

  _sid = data.data.sid
  _sidExpiry = Date.now() + 20 * 60 * 1000 // 20 min
  return _sid
}

// Upload avec retry automatique si la session a expiré (NAS renvoie du HTML)
async function uploadToNAS(buffer, mimeType, folderPath, safeFilename, retry = true) {
  const sid = await getSid()
  const blob = new Blob([buffer], { type: mimeType })
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

  const ct = uploadResp.headers.get('content-type') || ''
  if (!ct.includes('json')) {
    // NAS a renvoyé du HTML → session probablement expirée, on ré-authentifie et on réessaie une fois
    _sid = null
    _sidExpiry = 0
    if (retry) return uploadToNAS(buffer, mimeType, folderPath, safeFilename, false)
    const text = await uploadResp.text()
    throw new Error('NAS upload: réponse non-JSON après retry — ' + text.substring(0, 200))
  }

  const uploadData = await uploadResp.json()
  if (!uploadData.success) {
    _sid = null // reset cache si erreur auth (code 119 = invalid SID)
    throw new Error('Upload NAS échoué: ' + JSON.stringify(uploadData.error || uploadData))
  }
  return uploadData
}

export const config = { api: { bodyParser: { sizeLimit: '27mb' } } }  // buffer pour overhead base64 (~33%)

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
      await uploadToNAS(buffer, mime_type, folderPath, safeFilename)
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
