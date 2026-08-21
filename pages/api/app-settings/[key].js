import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, requireAdmin } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

const DEFAULTS = {
  responsibles: ['Arnaud', 'Guillaume', 'Gabin', 'non défini'],
  // Repris de lib/paintCalc.js — hypothèses d'atelier, pas des données RUCO.
  paint_coefficients: null,
  company_info: {
    name:    process.env.AMAZING_LAB_NAME    || 'Amazing Lab Sàrl',
    address: process.env.AMAZING_LAB_ADDRESS || "Rue de l'Ecluse 30",
    zip:     process.env.AMAZING_LAB_ZIP    || '1201',
    city:    process.env.AMAZING_LAB_CITY    || 'Genève',
    country: process.env.AMAZING_LAB_COUNTRY || 'CH',
    iban:    process.env.AMAZING_LAB_IBAN    || '',
    email:   process.env.AMAZING_LAB_EMAIL   || 'hello@amazinglab.ch',
    website: process.env.AMAZING_LAB_WEBSITE || 'amazinglab.ch',
    phone:   process.env.AMAZING_LAB_PHONE   || '',
    vat_number: process.env.AMAZING_LAB_VAT  || '',
    payment_terms: 'Paiement à 30 jours net.',
  },
}

// Clés lisibles par un utilisateur connecté : l'interface en a besoin
// (en-têtes de documents, listes déroulantes). Toute autre clé est refusée —
// `app_settings` est un fourre-tout, on ne laisse pas lire une clé arbitraire.
// `paint_coefficients` : coefficients de complexité A0–A4 du chiffrage
// peinture. Partagés volontairement — si quelqu'un les recalibre après des
// essais d'atelier, les chiffrages de toute l'équipe doivent en profiter.
// Lecture pour tous, écriture admin, comme le reste de cette table.
const CLES_LISIBLES = new Set(['company_info', 'responsibles', 'paint_coefficients'])

export default async function handler(req, res) {
  const { key } = req.query
  if (!key) return res.status(400).json({ error: 'key requis' })

  // Écriture réservée à l'admin : cette table porte l'IBAN de l'entreprise, le
  // nom imprimé sur les factures et les conditions de paiement. N'importe quel
  // membre pouvait les modifier, donc détourner les virements des clients.
  if (req.method === 'PUT') {
    if (!(await requireAdmin(req, res))) return
  } else {
    if (!(await requireUser(req, res))) return
    if (!CLES_LISIBLES.has(key)) return res.status(404).json({ error: 'Clé inconnue' })
  }

  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()

    if (error) return erreurApi(req, res, 'internal', error, { route: 'app-settings/[key]' })
    return res.status(200).json({ value: data?.value ?? DEFAULTS[key] ?? null })
  }

  if (req.method === 'PUT') {
    const { value } = req.body || {}
    if (value === undefined) return res.status(400).json({ error: 'value requis' })

    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select('value')
      .single()

    if (error) return erreurApi(req, res, 'internal', error, { route: 'app-settings/[key]' })
    return res.status(200).json({ value: data.value })
  }

  return res.status(405).end()
}
