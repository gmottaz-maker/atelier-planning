import '../styles/globals.css'
import Head from 'next/head'
import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Sidebar, { SIDEBAR_WIDTH } from '../components/Sidebar'
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav'
import useIsMobile from '../lib/useIsMobile'

// ─── Auth context ───────────────────────────────────────────────────────────

export const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

const PUBLIC_ROUTES = ['/login', '/display']
const NO_CHROME_ROUTES = ['/login', '/display', '/projects/[id]/devis']
const PINK = '#111827'

async function fetchProfile(userId) {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).single()
  return data
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App({ Component, pageProps }) {
  const [user, setUser]       = useState(null)   // { id, email, name }
  const [authReady, setAuthReady] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()

  // ─── Service worker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Différé après le chargement pour ne pas concurrencer le premier affichage
    const register = () => navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err)
    })
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  // ─── Auth state ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    // Applique une session SANS attendre un appel réseau : on affiche tout de
    // suite l'app avec le nom issu des métadonnées de session (déjà en local),
    // puis on rafraîchit le nom depuis `profiles` en arrière-plan.
    function applySession(session) {
      if (!session) { setUser(null); return }
      const fallbackName = session.user.user_metadata?.name || session.user.email
      setUser(prev =>
        prev?.id === session.user.id
          ? prev
          : { id: session.user.id, email: session.user.email, name: fallbackName }
      )
      fetchProfile(session.user.id)
        .then(profile => {
          if (cancelled || !profile?.name) return
          setUser(u => (u && u.id === session.user.id ? { ...u, name: profile.name } : u))
        })
        .catch(() => {})
    }

    // Filet de sécurité : ne jamais laisser le splash bloqué si getSession rame
    // (token expiré la nuit, infra froide, conflit de lock multi-onglets/PWA).
    const timer = setTimeout(() => { if (!cancelled) setAuthReady(true) }, 2500)

    // Init session — vérifier si la session est éphémère (sessionOnly sans sessionAlive)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) {
        const sessionOnly = localStorage.getItem('sessionOnly') === 'true'
        const sessionAlive = sessionStorage.getItem('sessionAlive')
        if (sessionOnly && !sessionAlive) {
          // Navigateur rouvert sans "rester connecté" → déconnecter
          localStorage.removeItem('sessionOnly')
          supabase.auth.signOut()
        } else {
          applySession(session)
        }
      }
      setAuthReady(true)
    }).catch((err) => {
      // Supabase Web Lock conflict (multiple tabs) — don't crash, just continue
      console.warn('Auth init error (multi-tab lock?):', err?.message)
      setAuthReady(true)
    }).finally(() => clearTimeout(timer))

    // Watch changes (login, logout, refresh token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (session) applySession(session)
      else setUser(null)
    })

    return () => { cancelled = true; clearTimeout(timer); subscription.unsubscribe() }
  }, [])

  // ─── Redirect logic ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authReady) return
    const isPublic = PUBLIC_ROUTES.includes(router.pathname)
    if (!user && !isPublic) {
      router.replace('/login')
    } else if (user && router.pathname === '/login') {
      router.replace('/')
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

  const showChrome = user && !NO_CHROME_ROUTES.includes(router.pathname)

  return (
    <AuthContext.Provider value={{ user, signOut: () => supabase.auth.signOut() }}>
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Maze Project" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="theme-color" content="#111827" />
      </Head>
      {showChrome ? (
        <>
          {!isMobile && <Sidebar />}
          <div
            style={{
              marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
              minHeight: '100vh',
              paddingBottom: isMobile ? `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` : 0,
            }}
          >
            <Component {...pageProps} />
          </div>
          {isMobile && <BottomNav />}
        </>
      ) : (
        <Component {...pageProps} />
      )}
    </AuthContext.Provider>
  )
}
