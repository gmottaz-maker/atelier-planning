import { getSupabaseServer } from '../../../lib/supabase-server'
const supabase = getSupabaseServer()
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

export default async function handler(req, res) {
  const me = await requireUser(req, res)
  if (!me) return
  if (req.method !== 'POST') return res.status(405).end()

  // L'identité vient du JWT, jamais du corps de la requête : le champ `user`
  // envoyé par le navigateur permettait d'enregistrer son propre appareil sous
  // le nom d'un collègue, et donc de recevoir ses notifications.
  const { subscription } = req.body || {}
  const endpoint = subscription?.endpoint
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) ||
      typeof subscription?.keys?.p256dh !== 'string' || typeof subscription?.keys?.auth !== 'string') {
    return res.status(400).json({ error: 'Abonnement push invalide' })
  }

  // Upsert la subscription (remplace si même endpoint)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { endpoint, user_name: me.name, subscription: JSON.stringify(subscription), updated_at: new Date().toISOString() },
      { onConflict: 'endpoint' }
    )

  if (error) return erreurApi(req, res, 'internal', error, { route: 'push/subscribe' })
  return res.status(200).json({ ok: true })
}
