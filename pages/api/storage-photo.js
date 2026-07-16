import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } }

const supabase = getSupabaseServer()
const BUCKET = 'storage-photos'

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { image, ext } = req.body || {}
  if (!image) return res.status(400).json({ error: 'image requise' })

  // Décode le data URL / base64
  const m = String(image).match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i)
  const contentType = m ? m[1] : 'image/jpeg'
  const b64 = m ? m[2] : image
  const buffer = Buffer.from(b64, 'base64')
  const extension = (ext || (contentType.split('/')[1] || 'jpg')).replace(/[^a-z0-9]/gi, '') || 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`

  // Crée le bucket public si absent (idempotent)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ path })
}
