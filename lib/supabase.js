import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variables Supabase manquantes dans .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Disable Web Lock API to prevent crashes when multiple tabs/PWA instances
    // are open simultaneously. Small team app — no concurrent token refresh issues.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
})
