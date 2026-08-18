// Sonde de santé : appelée par la supervision et par le cron de réveil.
//
// Ne révèle rien — ni version, ni variables, ni schéma, ni compte de lignes —
// et ne contourne aucune autorisation. Elle se contente de dire si la base
// répond, ce qui est la seule dépendance sans laquelle rien ne fonctionne.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requestId, logErreur } from '../../lib/apiError'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const rid = requestId(req)
  const debut = Date.now()

  let base = 'ok'
  try {
    const { error } = await getSupabaseServer().from('profiles').select('id').limit(1)
    if (error) throw error
  } catch (e) {
    base = 'ko'
    logErreur(rid, 'health', e)
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(base === 'ok' ? 200 : 503).json({
    status: base === 'ok' ? 'ok' : 'degraded',
    database: base,
    latency_ms: Date.now() - debut,
  })
}
