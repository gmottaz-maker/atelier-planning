#!/usr/bin/env node
// Contrôle de l'état de la base : les migrations attendues sont-elles en place ?
//
// Les fichiers *.sql s'exécutent à la main dans l'éditeur Supabase, sans
// registre de ce qui a été joué. Ce script comble le manque : il interroge la
// base et dit ce qui manque. À lancer après chaque migration, et en cas de
// doute sur la dérive entre l'environnement et le dépôt.
//
//   npm run check:db
//
// N'écrit rien. Ne tourne PAS en CI : il exige les clés de production.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function env() {
  const out = { ...process.env }
  try {
    for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
      if (!l.includes('=') || l.startsWith('#')) continue
      const i = l.indexOf('=')
      out[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}

const e = env()
if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)')
  process.exit(2)
}
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY)

// Chaque contrôle : { nom, fichier de migration, sonde renvoyant true/false }
const CONTROLES = [
  {
    nom: 'profiles.role',
    migration: 'schema-profiles-role.sql',
    sonde: async () => !(await sb.from('profiles').select('role').limit(1)).error,
  },
  {
    nom: 'reconcile_match()',
    migration: 'schema-integrite-financiere.sql',
    sonde: async () => {
      // id inexistant : répond « transaction_absente » sans rien écrire.
      const { error } = await sb.rpc('reconcile_match', {
        p_tx_id: -1, p_type: 'supplier_invoice', p_candidate_id: -1,
        p_paid_at: '2000-01-01', p_matched_by: 'check:db', p_score: 0,
      })
      return !error
    },
  },
  {
    nom: 'invoice_counters',
    migration: 'schema-integrite-financiere.sql',
    sonde: async () => !(await sb.from('invoice_counters').select('year').limit(1)).error,
  },
  {
    nom: 'customer_invoices.storage_billing_key',
    migration: 'schema-integrite-financiere.sql',
    sonde: async () => !(await sb.from('customer_invoices').select('storage_billing_key').limit(1)).error,
  },
]

let manquants = 0
for (const c of CONTROLES) {
  let ok = false
  try { ok = await c.sonde() } catch {}
  console.log(`  ${ok ? '✓' : '✗'} ${c.nom}${ok ? '' : `  → jouer ${c.migration}`}`)
  if (!ok) manquants++
}

// Cohérence : le compteur doit couvrir la plus haute facture de chaque année.
const { data: factures } = await sb.from('customer_invoices').select('invoice_number')
const { data: compteurs } = await sb.from('invoice_counters').select('year, seq')
if (factures && compteurs) {
  const maxi = {}
  for (const f of factures) {
    const m = /^(\d{4})-(\d+)$/.exec(f.invoice_number || '')
    if (m) maxi[m[1]] = Math.max(maxi[m[1]] || 0, +m[2])
  }
  for (const [an, seq] of Object.entries(maxi)) {
    const c = compteurs.find(x => String(x.year) === an)
    if (!c || c.seq < seq) {
      console.log(`  ✗ compteur ${an} = ${c?.seq ?? 'absent'}, plus haute facture ${seq} → prochain numéro en collision`)
      manquants++
    } else console.log(`  ✓ compteur ${an} (${c.seq}) ≥ plus haute facture (${seq})`)
  }
}

console.log(manquants === 0 ? '\n✓ base à jour' : `\n✗ ${manquants} point(s) à corriger`)
process.exit(manquants === 0 ? 0 : 1)
