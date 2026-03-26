import { supabase } from '../../lib/supabase'

const ODOO_URL = process.env.ODOO_URL          // ex: https://amazing-lab.odoo.com
const ODOO_DB  = process.env.ODOO_DB           // ex: amazing-lab
const ODOO_KEY = process.env.ODOO_API_KEY      // clé API persistante

// Sécurité : endpoint appelable uniquement avec le bon secret
const CRON_SECRET = process.env.CRON_SECRET

async function odooCall(model, method, args = [], kwargs = {}) {
  const resp = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'call',
      params: {
        model,
        method,
        args,
        kwargs: {
          context: { lang: 'fr_CH' },
          ...kwargs,
        },
      },
    }),
  })
  const data = await resp.json()
  if (data.error) throw new Error('Odoo RPC error: ' + JSON.stringify(data.error))
  return data.result
}

async function authenticate() {
  const resp = await fetch(`${ODOO_URL}/web/session/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'call',
      params: {
        db:       ODOO_DB,
        login:    'guillaume@amazinglab.ch',
        password: ODOO_KEY,
      },
    }),
  })
  const data = await resp.json()
  if (!data.result?.uid) throw new Error('Odoo auth failed: ' + JSON.stringify(data.error || data.result))
  // Récupérer le cookie de session
  const setCookie = resp.headers.get('set-cookie')
  const sessionId = setCookie?.match(/session_id=([^;]+)/)?.[1]
  return { uid: data.result.uid, sessionId }
}

export default async function handler(req, res) {
  // Vérifier le secret (appelé depuis Vercel Cron ou manuellement)
  const auth = req.headers.authorization
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // ── 1. Authentification Odoo ─────────────────────────────────────────────
    const { uid, sessionId } = await authenticate()

    // ── 2. Récupération des partenaires (clients + sociétés) ─────────────────
    const fields = ['id', 'name', 'email', 'phone', 'mobile', 'street', 'city',
                    'zip', 'country_id', 'website', 'is_company', 'active', 'ref']

    // On fetch par lots de 500 pour éviter les timeouts
    const BATCH = 500
    let offset = 0
    let allPartners = []

    while (true) {
      const batch = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId ? { Cookie: `session_id=${sessionId}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method:  'call',
          params: {
            model:  'res.partner',
            method: 'search_read',
            args:   [[['customer_rank', '>', 0]]],
            kwargs: {
              fields,
              limit:  BATCH,
              offset,
              context: { lang: 'fr_CH' },
            },
          },
        }),
      }).then(r => r.json())

      if (batch.error) throw new Error('Odoo fetch error: ' + JSON.stringify(batch.error))
      const records = batch.result || []
      allPartners = allPartners.concat(records)
      if (records.length < BATCH) break
      offset += BATCH
    }

    // ── 3. Transformation ────────────────────────────────────────────────────
    const rows = allPartners.map(p => ({
      id:         p.id,
      name:       p.name,
      email:      p.email || null,
      phone:      p.phone || null,
      mobile:     p.mobile || null,
      street:     p.street || null,
      city:       p.city || null,
      zip:        p.zip || null,
      country:    Array.isArray(p.country_id) ? p.country_id[1] : null,
      website:    p.website || null,
      is_company: p.is_company,
      active:     p.active,
      odoo_ref:   p.ref || null,
      synced_at:  new Date().toISOString(),
    }))

    // ── 4. Upsert dans Supabase ──────────────────────────────────────────────
    // On upsert par lots de 200 pour rester dans les limites Supabase
    const UPSERT_BATCH = 200
    let upserted = 0
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const chunk = rows.slice(i, i + UPSERT_BATCH)
      const { error } = await supabase
        .from('clients')
        .upsert(chunk, { onConflict: 'id' })
      if (error) throw new Error('Supabase upsert error: ' + error.message)
      upserted += chunk.length
    }

    // ── 5. Désactiver les clients qui ne sont plus dans Odoo ─────────────────
    // (marquer active=false plutôt que supprimer)
    if (rows.length > 0) {
      const odooIds = rows.map(r => r.id)
      await supabase
        .from('clients')
        .update({ active: false })
        .not('id', 'in', `(${odooIds.join(',')})`)
        .eq('active', true)
    }

    return res.status(200).json({
      success: true,
      synced:  upserted,
      total:   allPartners.length,
      message: `${upserted} clients synchronisés depuis Odoo`,
    })

  } catch (e) {
    console.error('sync-odoo-clients error:', e)
    return res.status(500).json({ error: e.message })
  }
}
