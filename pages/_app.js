import '../styles/globals.css'
import Head from 'next/head'
import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

// ─── Auth context ───────────────────────────────────────────────────────────

export const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

const PUBLIC_ROUTES = ['/login']
const PINK = '#FF4D6D'

async function fetchProfile(userId) {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).single()
  return data
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App({ Component, pageProps }) {
  const [user, setUser]       = useState(null)   // { id, email, name }
  const [authReady, setAuthReady] = useState(false)
  const router = useRouter()

  // ─── Service worker ────────────────────────────────────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('SW registration failed:', err)
      })
    }
  }, [])

  // ─── Auth state ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Init session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const profile = await fetchProfile(session.user.id)
        setUser({ id: session.user.id, email: session.user.email, name: profile?.name || session.user.email })
      }
      setAuthReady(true)
    })

    // Watch changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        const profile = await fetchProfile(session.user.id)
        setUser({ id: session.user.id, email: session.user.email, name: profile?.name || session.user.email })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ─── Redirect logic ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authReady) return
    const isPublic = PUBLIC_ROUTES.includes(router.pathname)
    if (!user && !isPublic) {
      router.replace('/login')
    } else if (user && router.pathname === '/login') {
      router.replace('/tasks')
    }
  }, [user, authReady, router.pathname])

  // ─── Loading splash ──────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafafa' }}>
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none"
          style={{ animation: 'spin 2s linear infinite' }}>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
          <circle cx="20" cy="20" r="3" fill={PINK} />
        </svg>
      </div>
    )
  }

  // Don't render protected pages while redirecting
  if (!user && !PUBLIC_ROUTES.includes(router.pathname)) return null

  return (
    <AuthContext.Provider value={{ user, signOut: () => supabase.auth.signOut() }}>
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="AL Planning" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="theme-color" content="#FF4D6D" />
      </Head>
      <Component {...pageProps} />
    </AuthContext.Provider>
  )
}
