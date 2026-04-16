import { getSupabaseServer } from '../../../lib/supabase-server'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

const BUCKET = 'receipts'

export default async function handler(req, res) {
  const supabase = getSupabaseServer()

  // ── GET – liste des frais ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { userName, year } = req.query
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

    // Ajouter l'URL publique du reçu
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const rows = (data || []).map(e => ({
      ...e,
      receipt_url: e.receipt_path
        ? `${url}/storage/v1/object/public/${BUCKET}/${e.receipt_path}`
        : null,
    }))

    return res.status(200).json(rows)
  }

  // ── POST – créer un frais ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      userName, date, amount, currency, category,
      merchant, description, receiptBase64, receiptMimeType,
    } = req.body

    if (!userName || !date) return res.status(400).json({ error: 'userName et date requis' })

    let receipt_path = null

    // Upload du reçu dans Supabase Storage (bucket public)
    if (receiptBase64 && receiptMimeType) {
      try {
        const buffer = Buffer.from(receiptBase64, 'base64')
        const ext    = (receiptMimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        const path   = `${userName}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, buffer, { contentType: receiptMimeType, upsert: false })
        if (!upErr) receipt_path = path
        else console.error('Storage upload:', upErr.message)
      } catch (e) { console.error('Receipt upload error:', e) }
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
        receipt_path,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    return res.status(200).json({
      ...data,
      receipt_url: receipt_path
        ? `${url}/storage/v1/object/public/${BUCKET}/${receipt_path}`
        : null,
    })
  }

  // ── DELETE – supprimer un frais ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id, userName } = req.query
    if (!id || !userName) return res.status(400).json({ error: 'id et userName requis' })

    // Récupérer le chemin du fichier pour le supprimer
    const { data: exp } = await supabase
      .from('expenses')
      .select('receipt_path')
      .eq('id', id)
      .eq('user_name', userName)
      .maybeSingle()

    if (exp?.receipt_path) {
      await supabase.storage.from(BUCKET).remove([exp.receipt_path])
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
