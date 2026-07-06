import { getSupabaseServer } from '../../../lib/supabase-server'
const supabase = getSupabaseServer()
import { requireUser } from '../../../lib/requireAdmin'

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'POST') return res.status(405).end()

  const { subscription, user } = req.body
  if (!subscription || !user) return res.status(400).json({ error: 'Missing subscription or user' })

  const endpoint = subscription.endpoint

  // Upsert la subscription (remplace si même endpoint)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { endpoint, user_name: user, subscription: JSON.stringify(subscription), updated_at: new Date().toISOString() },
      { onConflict: 'endpoint' }
    )

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
