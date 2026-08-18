// Cron quotidien : le dernier jour d'un trimestre, génère automatiquement les
// factures de stockage (statut « Créée »). Idempotent. Sinon ne fait rien.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireCronOrAdmin } from '../../../lib/requireAdmin'
import { createStorageInvoices, quarterEndOf } from '../../../lib/storageBilling'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  // Vercel Cron (secret, comparé à temps constant) ou ADMIN connecté pour un
  // déclenchement manuel. Le contrôle acceptait auparavant n'importe quel
  // utilisateur vérifié : un membre pouvait déclencher la facturation.
  if (!(await requireCronOrAdmin(req, res))) return

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
    return erreurApi(req, res, 'internal', e, { route: 'storage-invoices/cron' })
  }
}
