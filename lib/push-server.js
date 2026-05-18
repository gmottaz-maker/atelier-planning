import webpush from 'web-push'
import { getSupabaseServer } from './supabase-server'

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:hello@amazinglab.ch',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

/**
 * Envoie une notification push à tous les abonnés sauf l'utilisateur exclu.
 * Silencieux en cas d'erreur — on ne casse pas la requête principale.
 */
export async function notifyTeam({ title, body, url = '/', tag, excludeUser } = {}) {
  if (!process.env.VAPID_PRIVATE_KEY) return
  try {
    const supabase = getSupabaseServer()
    const { data: subs } = await supabase.from('push_subscriptions').select('*')
    if (!subs || subs.length === 0) return

    const payload = JSON.stringify({ title, body, url, tag })

    await Promise.all(subs.map(async sub => {
      if (excludeUser && sub.user_name === excludeUser) return
      try {
        const subscription = JSON.parse(sub.subscription)
        await webpush.sendNotification(subscription, payload)
      } catch (err) {
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }))
  } catch (err) {
    console.warn('notifyTeam failed:', err?.message)
  }
}
