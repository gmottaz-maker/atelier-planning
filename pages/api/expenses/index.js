import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, ADMIN_USER } from '../../../lib/requireAdmin'
import { withSignedReceipts, withSignedReceipt } from '../../../lib/receipts'
import { ensureReceiptFolder, upload, del } from '../../../lib/kdrive'
import { extractPages } from '../../../lib/pdfSplit'
import { quarterOf, receiptFilename } from '../../../lib/receiptFile'
import { reconcileNewExpense } from '../../../lib/reconcileRun'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

const BUCKET = 'receipts'

export default async function handler(req, res) {
  const authUser = await requireUser(req, res)
  if (!authUser) return
  const isAdmin = authUser.name === ADMIN_USER
  // Un non-admin ne peut agir que sur ses propres frais, quel que soit le
  // userName envoyé par le client.
  const ownName = (requested) => {
    if (isAdmin) return requested || authUser.name
    return authUser.name
  }
  const supabase = getSupabaseServer()

  // ── GET – liste des frais ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { year } = req.query
    const userName = ownName(req.query.userName)
    if (!userName) return res.status(400).json({ error: 'userName requis' })
    const y    = year || new Date().getFullYear()
    const from = `${y}-01-01`
    const to   = `${y}-12-31`

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_name', userName)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })

    // URLs signées (bucket privé) au lieu d'URLs publiques devinables
    const rows = await withSignedReceipts(supabase, data)
    return res.status(200).json(rows)
  }

  // ── POST – créer un frais ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      date, amount, amount_net, vat_rate, vat_amount, vat_breakdown,
      currency, category,
      merchant, description, receiptBase64, receiptMimeType, receiptFilename: receiptOrigName,
      page_from, page_to,
      payment_method, force,
    } = req.body
    const userName = ownName(req.body.userName)

    if (!userName || !date) return res.status(400).json({ error: 'userName et date requis' })
    if (amount != null && !Number.isFinite(parseFloat(amount))) {
      return res.status(400).json({ error: 'Montant invalide' })
    }

    // ── Détection de doublon (même date + montant + utilisateur, ±1 jour) ───
    if (!force && amount != null) {
      const amt = parseFloat(amount)
      const d   = new Date(date)
      const dayBefore = new Date(d); dayBefore.setDate(d.getDate() - 1)
      const dayAfter  = new Date(d); dayAfter.setDate(d.getDate() + 1)
      const dStr = (x) => x.toISOString().slice(0, 10)
      const { data: existing } = await supabase
        .from('expenses')
        .select('id, date, amount, merchant, category, payment_method')
        .eq('user_name', userName)
        .eq('amount', amt)
        .gte('date', dStr(dayBefore))
        .lte('date', dStr(dayAfter))
        .limit(1)
      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'duplicate', duplicate_of: existing[0] })
      }
    }

    // Pièce justificative : classée sur kDrive par trimestre, comme les factures
    // fournisseurs. Un scan groupé n'archive que les pages de ce reçu.
    let kdrive_file_id = null
    let kdrive_filename = null
    if (receiptBase64 && receiptMimeType) {
      try {
        const { year, quarter } = quarterOf(date)
        const folderId = await ensureReceiptFolder(year, quarter)
        let buffer = Buffer.from(receiptBase64, 'base64')
        if ((receiptMimeType || '').includes('pdf') && (page_from || page_to)) {
          try { buffer = await extractPages(buffer, page_from, page_to) } catch {}
        }
        const filename = receiptFilename({ merchant, amount, date }, receiptOrigName)
        const kf = await upload(folderId, filename, buffer, receiptMimeType)
        kdrive_file_id = kf.id
        kdrive_filename = kf.name
      } catch (e) {
        return res.status(500).json({ error: 'kDrive upload: ' + e.message })
      }
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_name:   userName,
        date,
        amount:      amount != null ? parseFloat(amount) : null,
        currency:    currency || 'CHF',
        category:    category || 'Autre',
        merchant:    merchant || null,
        description: description || null,
        kdrive_file_id,
        kdrive_filename,
        payment_method: payment_method || 'company',
        amount_net:    amount_net    != null && amount_net    !== '' ? parseFloat(amount_net)  : null,
        vat_rate:      vat_rate      != null && vat_rate      !== '' ? parseFloat(vat_rate)    : null,
        vat_amount:    vat_amount    != null && vat_amount    !== '' ? parseFloat(vat_amount)  : null,
        vat_breakdown: Array.isArray(vat_breakdown) && vat_breakdown.length > 0 ? vat_breakdown : null,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Pré-rapprochement : un frais carte société correspond à un débit du relevé.
    const reconcile = await reconcileNewExpense(supabase, data, authUser.name)

    const withUrl = await withSignedReceipt(supabase, data)
    return res.status(200).json({ ...withUrl, reconcile })
  }

  // ── PATCH – mise à jour partielle (admin: payment_method, etc.) ──────────
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const allowed = ['payment_method', 'category', 'description', 'amount', 'amount_net',
                     'vat_rate', 'vat_amount', 'vat_breakdown', 'merchant', 'date']
    const payload = {}
    for (const k of allowed) if (k in req.body) payload[k] = req.body[k] === '' ? null : req.body[k]
    for (const k of ['amount', 'amount_net', 'vat_rate', 'vat_amount']) {
      if (payload[k] != null) {
        payload[k] = parseFloat(payload[k])
        if (!Number.isFinite(payload[k])) return res.status(400).json({ error: `${k} invalide` })
      }
    }

    let q = supabase.from('expenses').update(payload).eq('id', id)
    // L'admin peut éditer tous les frais ; les autres uniquement les leurs
    if (!isAdmin) q = q.eq('user_name', authUser.name)
    const { data, error } = await q.select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── DELETE – supprimer un frais ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query
    const userName = ownName(req.query.userName)
    if (!id || !userName) return res.status(400).json({ error: 'id et userName requis' })

    // Récupérer les fichiers liés pour les supprimer (Supabase et/ou kDrive)
    const { data: exp } = await supabase
      .from('expenses')
      .select('receipt_path, kdrive_file_id')
      .eq('id', id)
      .eq('user_name', userName)
      .maybeSingle()

    if (exp?.receipt_path) {
      await supabase.storage.from(BUCKET).remove([exp.receipt_path])
    }
    if (exp?.kdrive_file_id) {
      try { await del(exp.kdrive_file_id) } catch (e) { console.error('kDrive del:', e.message) }
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_name', userName)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
