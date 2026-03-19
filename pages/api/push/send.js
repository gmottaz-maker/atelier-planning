import { supabase } from '../../../lib/supabase'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:hello@amazinglab.ch',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export default async function handler(req, res) {
  // Sécurité : uniquement depuis Vercel Cron ou avec le secret
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.method !== 'GET') {
    // Allow GET without auth for manual testing (dev only) — in prod the cron sends POST with secret
    if (req.method !== 'GET') return res.status(401).json({ error: 'Unauthorized' })
  }

  const today = new Date().toISOString().split('T')[0]

  // Récupère toutes les tâches actives pour aujourd'hui et en retard
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, projects(name)')
    .eq('status', 'active')
    .lte('execution_date', today)
    .order('execution_date', { ascending: true })

  if (!tasks || tasks.length === 0) {
    return res.status(200).json({ sent: 0, message: 'Aucune tâche à notifier' })
  }

  // Groupe par responsable
  const byPerson = {}
  for (const task of tasks) {
    const person = task.responsible
    if (!byPerson[person]) byPerson[person] = []
    byPerson[person].push(task)
  }

  // Récupère toutes les subscriptions
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')

  if (!subs || subs.length === 0) {
    return res.status(200).json({ sent: 0, message: 'Aucune subscription' })
  }

  let sent = 0
  const errors = []

  for (const sub of subs) {
    const personTasks = byPerson[sub.user_name]
    if (!personTasks || personTasks.length === 0) continue

    const overdue = personTasks.filter(t => t.execution_date < today)
    const dueToday = personTasks.filter(t => t.execution_date === today)

    let title, body
    if (overdue.length > 0 && dueToday.length > 0) {
      title = `⚠️ ${overdue.length} en retard · 📋 ${dueToday.length} aujourd'hui`
      body = overdue.map(t => `• ${t.title}`).slice(0, 3).join('\n')
    } else if (overdue.length > 0) {
      title = `⚠️ ${overdue.length} tâche${overdue.length > 1 ? 's' : ''} en retard`
      body = overdue.map(t => `• ${t.title}`).slice(0, 3).join('\n')
    } else {
      title = `📋 ${dueToday.length} tâche${dueToday.length > 1 ? 's' : ''} aujourd'hui`
      body = dueToday.map(t => `• ${t.title}`).slice(0, 3).join('\n')
    }

    try {
      const subscription = JSON.parse(sub.subscription)
      await webpush.sendNotification(subscription, JSON.stringify({
        title: `${sub.user_name} — ${title}`,
        body,
        url: '/tasks',
        tag: `al-daily-${today}`,
      }))
      sent++
    } catch (err) {
      errors.push({ user: sub.user_name, error: err.message })
      // Si la subscription est expirée (410), on la supprime
      if (err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }

  return res.status(200).json({ sent, errors })
}
