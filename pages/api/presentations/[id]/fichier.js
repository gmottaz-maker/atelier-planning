// Sert un visuel de la présentation à l'écran.
//
// kDrive demande un jeton que le navigateur n'a pas : la route relaie le flux,
// après avoir vérifié que l'identifiant demandé est bien l'un des fichiers de
// CETTE présentation. Sans cette vérification, un identifiant kDrive deviné
// donnerait accès à n'importe quel fichier du drive.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { downloadStream } from '../../../../lib/kdrive'
import { entetesFichier, relayerFlux } from '../../../../lib/fileType'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id, kdrive } = req.query

  const { data, error } = await supabase.from('presentations').select('fichiers').eq('id', id).maybeSingle()
  if (error || !data) return res.status(404).end()

  const fichier = (Array.isArray(data.fichiers) ? data.fichiers : []).find(f => String(f.kdrive_id) === String(kdrive))
  if (!fichier) return res.status(404).end()

  try {
    const r = await downloadStream(fichier.kdrive_id)
    entetesFichier(res, { mime: fichier.mime, filename: fichier.kdrive_nom })
    res.setHeader('Cache-Control', 'private, max-age=300')
    await relayerFlux(r, res)
  } catch (e) {
    console.error('presentation fichier:', e)
    res.status(502).end()
  }
}
