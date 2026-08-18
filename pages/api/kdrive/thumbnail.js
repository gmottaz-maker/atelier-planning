// Vignette d'un fichier kDrive. Même contrôle d'accès que le téléchargement :
// la route acceptait auparavant n'importe quel `fileId`, ce qui permettait de
// parcourir tout le drive — dossiers comptables compris — avec le token
// privilégié du serveur.
import { thumbnailStream } from '../../../lib/kdrive'
import { requireUser } from '../../../lib/requireAdmin'
import { getSupabaseServer } from '../../../lib/supabase-server'
import { authorizeKdriveFile } from '../../../lib/kdriveAccess'
import { verifyRef } from '../../../lib/signedRef'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const { fileId } = req.query
  if (!fileId) return res.status(400).end()

  // Soit le fichier est référencé en base et l'utilisateur y a droit, soit il
  // présente un jeton que le serveur a signé en le lui listant.
  const ref = verifyRef(req.query.token)
  const parJeton = ref?.kind === 'file' && String(ref.fileId) === String(fileId)
  if (!parJeton) {
    const allowed = await authorizeKdriveFile(supabase, fileId, user)
    if (!allowed) return res.status(404).json({ error: 'Fichier non trouvé' })
  }

  try {
    const r = await thumbnailStream(fileId)
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const buf = await r.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).end()
  }
}
