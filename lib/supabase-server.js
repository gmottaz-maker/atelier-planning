import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase côté serveur uniquement (API routes).
 * Utilise la service_role key qui bypasse les policies RLS.
 * NE JAMAIS utiliser ce client côté client/browser.
 */
export function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}
