import '../styles/globals.css'
import Head from 'next/head'
import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { SWRConfig } from 'swr'
import Sidebar, { SIDEBAR_WIDTH } from '../components/Sidebar'
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav'
import useIsMobile from '../lib/useIsMobile'
import { swrConfig } from '../lib/swr'

// ─── Auth context ───────────────────────────────────────────────────────────

export const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

const PUBLIC_ROUTES = ['/login', '/display']
const NO_CHROME_ROUTES = ['/login', '/display', '/projects/[id]/devis']
const PINK = '#111827'

// ─── Auth des appels API ─────────────────────────────────────────────────────
// Toutes les routes /api/* vérifient désormais le JWT Supabase côté serveur.
// On injecte le token une seule fois ici (couvre fetch direct, SWR, adminFetch)
// plutôt que de modifier chaque call-site.
// Le cookie sert aux requêtes qui ne passent pas par fetch (<img src>, <a href>
// vers /api/kdrive/thumbnail, /api/update-image, PDF…) : SameSite=Lax bloque
// les POST cross-site, et le token est déjà accessible au JS via localStorage
// donc le cookie n'élargit pas la surface XSS.
function syncAuthCookie(session) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  if (session?.access_token) {
    document.cookie = `sb-access-token=${session.access_token}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`
  } else {
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
  }
}
if (typeof window !== 'undefined' && !window.__mazeAuthFetchInstalled) {
  window.__mazeAuthFetchInstalled = true
  const origFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url || '')
    if (url.startsWith('/api/')) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          init = { ...(init || {}) }
          init.headers = { ...(init.headers || {}), Authorization: `Bearer ${session.access_token}` }
        }
      } catch (_) { /* pas de session → la route répondra 401 */ }
    }
    return origFetch(input, init)
  }
}

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
      syncAuthCookie(session)
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
      else { syncAuthCookie(null); setUser(null) }
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
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
        background: 'radial-gradient(circle at 50% 38%, #ffffff 0%, #f3f4f6 100%)',
      }}>
        <style>{`
          @keyframes maze-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
          @keyframes maze-glow { 0%,100% { opacity: .25 } 50% { opacity: .7 } }
          @keyframes maze-fade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
          @keyframes maze-bar  { 0% { transform: translateX(-120%) } 100% { transform: translateX(330%) } }
        `}</style>
        <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', width: 72, height: 72, borderRadius: '50%',
            background: PINK, filter: 'blur(18px)', opacity: 0.18,
            animation: 'maze-glow 2s ease-in-out infinite',
          }} />
          <svg width="64" height="64" viewBox="0 0 40 40" fill="none"
            style={{ position: 'relative', animation: 'maze-spin 5s linear infinite' }}>
            <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="1.5" fill="none" opacity="0.9" />
            <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="1.5" fill="none" transform="rotate(60 20 20)" opacity="0.9" />
            <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="1.5" fill="none" transform="rotate(120 20 20)" opacity="0.9" />
            <circle cx="38" cy="20" r="2.2" fill={PINK} />
            <circle cx="20" cy="20" r="3.2" fill={PINK} />
          </svg>
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.3em', color: PINK,
          textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif',
          animation: 'maze-fade .7s ease both',
        }}>Maze Project</div>
        <div style={{
          width: 132, height: 3, borderRadius: 99, background: '#e5e7eb',
          overflow: 'hidden', animation: 'maze-fade .7s ease both',
        }}>
          <div style={{ width: '40%', height: '100%', borderRadius: 99, background: PINK, animation: 'maze-bar 1.2s ease-in-out infinite' }} />
        </div>
      </div>
    )
  }

  // Don't render protected pages while redirecting
  if (!user && !PUBLIC_ROUTES.includes(router.pathname)) return null

  const showChrome = user && !NO_CHROME_ROUTES.includes(router.pathname)

  return (
    <AuthContext.Provider value={{ user, signOut: () => supabase.auth.signOut() }}>
      <SWRConfig value={swrConfig}>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Maze Project" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" href="/favicon.svg" sizes="any" />
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
      </SWRConfig>
    </AuthContext.Provider>
  )
}
