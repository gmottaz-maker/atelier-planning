// Génère les factures de stockage d'un trimestre (déclenchement manuel).
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { createStorageInvoices } from '../../../lib/storageBilling'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const year = parseInt(req.body?.year, 10)
  const q = parseInt(req.body?.quarter, 10)
  const dry = !!req.body?.dry
  if (!year || ![1, 2, 3, 4].includes(q)) return res.status(400).json({ error: 'year et quarter (1-4) requis' })

  try {
    const result = await createStorageInvoices(supabase, year, q, { dry })
    return res.status(200).json(result)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
