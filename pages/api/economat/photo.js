// La photo d'un article, déposée dans un bucket PUBLIC.
//
// Pas kDrive, et c'est un arbitrage : la photo doit s'afficher dans une page
// ouverte au téléphone après un scan ET dans un PDF rendu par Chromium, qui
// n'a aucun jeton kDrive — c'est exactement ce qui a obligé la présentation
// client à tout passer en base64. Une URL publique se charge directement, par
// les deux.
//
// Contrepartie assumée : qui possède l'URL voit la photo d'une boîte de vis.
// L'adresse est un chemin aléatoire, jamais devinable depuis le code article.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

// La photo vient d'un téléphone : le client la réduit avant l'envoi, mais on
// garde de la marge. Vercel plafonne le corps d'une requête bien avant ça.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

const supabase = getSupabaseServer()
export const BUCKET = 'economat-photos'

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { image } = req.body || {}
  if (!image) return res.status(400).json({ error: 'image requise' })

  const m = String(image).match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/i)
  if (!m) return res.status(400).json({ error: 'Image JPEG, PNG ou WebP attendue' })
  const contentType = m[1].toLowerCase()
  const buffer = Buffer.from(m[2], 'base64')
  if (!buffer.length) return res.status(400).json({ error: 'Image vide' })

  const ext = contentType.split('/')[1].replace('jpeg', 'jpg')
  const chemin = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, buffer, { contentType, upsert: false })
  if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/photo' })
  return res.status(200).json({ path: chemin })
}
