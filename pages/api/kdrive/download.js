// Téléchargement d'un fichier kDrive par identifiant. L'autorisation vit dans
// lib/kdriveAccess.js, partagée avec la route des vignettes.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { downloadStream } from '../../../lib/kdrive'
import { requireUser } from '../../../lib/requireAdmin'
import { authorizeKdriveFile } from '../../../lib/kdriveAccess'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const { fileId } = req.query
  if (!fileId) return res.status(400).end()

  const allowed = await authorizeKdriveFile(supabase, fileId, user)
  if (!allowed) return res.status(404).json({ error: 'Fichier non trouvé' })
  const { filename, mime } = allowed
  try {
    const r = await downloadStream(Number(fileId))
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`)
    const buf = await r.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
