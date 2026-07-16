// Cron quotidien : le dernier jour d'un trimestre, génère automatiquement les
// factures de stockage (statut « Créée »). Idempotent. Sinon ne fait rien.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { getVerifiedUser } from '../../../lib/requireAdmin'
import { createStorageInvoices, quarterEndOf } from '../../../lib/storageBilling'

const supabase = getSupabaseServer()
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req, res) {
  // Autorisé pour Vercel Cron (secret) ou un admin connecté (déclenchement/test manuel)
  const isCron = !!CRON_SECRET && req.headers.authorization === `Bearer ${CRON_SECRET}`
  if (!isCron && !(await getVerifiedUser(req))) return res.status(401).json({ error: 'Unauthorized' })

  // Test manuel : ?force=1&year=2026&quarter=3 (admin uniquement)
  const forced = req.query.force
    ? { year: parseInt(req.query.year, 10), quarter: parseInt(req.query.quarter, 10) }
    : quarterEndOf(new Date())

  if (!forced || ![1, 2, 3, 4].includes(forced.quarter)) {
    return res.status(200).json({ ran: false, reason: 'Pas le dernier jour d’un trimestre' })
  }

  try {
    const result = await createStorageInvoices(supabase, forced.year, forced.quarter)
    return res.status(200).json({ ran: true, ...result })
  } catch (e) {
    console.error('storage cron:', e)
    return res.status(500).json({ error: e.message })
  }
}
