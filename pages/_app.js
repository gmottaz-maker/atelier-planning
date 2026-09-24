import '../styles/globals.css'
import { useState, useEffect, createContext, useContext } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { SWRConfig } from 'swr'
import Sidebar, { SIDEBAR_WIDTH } from '../components/Sidebar'
import BottomNav, { BOTTOM_NAV_HEIGHT } from '../components/BottomNav'
import useIsMobile from '../lib/useIsMobile'
import { swrConfig, purgeCachePersistant } from '../lib/swr'
import { signalerErreur, ApiError } from '../lib/api'
import ApiErrorBanner from '../components/ApiErrorBanner'
import { AL, C, FONT, R } from '../lib/theme'
import { suiteAMemoriser, cheminApresConnexion } from '../lib/suiteConnexion'
import { amazingLogo } from '../lib/amazingLogo'

// ─── Auth context ───────────────────────────────────────────────────────────

export const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

const PUBLIC_ROUTES = ['/login', '/display']
const NO_CHROME_ROUTES = ['/login', '/display', '/projects/[id]/devis', '/e/[jeton]']

// ─── Auth des appels API ─────────────────────────────────────────────────────
// Toutes les routes /api/* vérifient désormais le JWT Supabase côté serveur.
// On injecte le token une seule fois ici (couvre fetch direct, SWR, adminFetch)
// plutôt que de modifier chaque call-site.
// Le cookie sert aux requêtes qui ne passent pas par fetch (<img src>, <a href>
// vers /api/kdrive/thumbnail, /api/update-file, <audio src>, PDF…) : SameSite=Lax bloque
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
    const reponse = await origFetch(input, init)

    // Filet pour les appels qui ne passent pas par lib/api.js : une mutation
    // qui échoue sans être signalée laisse croire que l'action a abouti. Les
    // appels de apiFetch se signalent eux-mêmes et portent un marqueur.
    if (url.startsWith('/api/') && !reponse.ok && !init?.__mazeApi) {
      const methode = (init?.method || 'GET').toUpperCase()
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(methode)) {
        let corps = null
        try { corps = await reponse.clone().json() } catch {}
        signalerErreur(new ApiError(corps?.error || `Erreur ${reponse.status}`, {
          status: reponse.status, code: corps?.code, requestId: corps?.request_id, url,
        }))
      }
    }
    return reponse
  }
}

async function fetchProfile(userId) {
  // `role` peut manquer tant que schema-profiles-role.sql n'a pas été joué :
  // on retombe alors sur le nom seul plutôt que de perdre le profil.
  const avecRole = await supabase.from('profiles').select('name, role').eq('id', userId).single()
  if (!avecRole.error) return avecRole.data
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).single()
  return data
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App({ Component, pageProps }) {
  const [user, setUser]       = useState(null)   // { id, email, name, role }
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
      // Nom du profil mis en cache au dernier passage : évite la fenêtre où
      // user.name vaut l'e-mail (le temps de relire `profiles`), fenêtre pendant
      // laquelle une page admin renverrait à l'accueil.
      let cachedName = null, cachedRole = null
      try {
        cachedName = localStorage.getItem('profileName:' + session.user.id)
        cachedRole = localStorage.getItem('profileRole:' + session.user.id)
      } catch {}
      const fallbackName = cachedName || session.user.user_metadata?.name || session.user.email
      setUser(prev =>
        prev?.id === session.user.id
          ? prev
          : { id: session.user.id, email: session.user.email, name: fallbackName, role: cachedRole || null }
      )
      fetchProfile(session.user.id)
        .then(profile => {
          if (cancelled || !profile?.name) return
          try {
            localStorage.setItem('profileName:' + session.user.id, profile.name)
            if (profile.role) localStorage.setItem('profileRole:' + session.user.id, profile.role)
          } catch {}
          setUser(u => (u && u.id === session.user.id
            ? { ...u, name: profile.name, role: profile.role || u.role }
            : u))
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
      // On garde la destination. Un QR d'économat scanné à l'atelier envoie
      // sur /e/<jeton> : sans ça, la connexion atterrissait sur l'accueil et
      // il fallait rescanner la carte, le téléphone déjà à la main.
      // `lib/suiteConnexion.js` filtre ce qui sortirait de Maze.
      const suite = suiteAMemoriser(router.asPath)
      router.replace(suite ? `/login?suite=${encodeURIComponent(suite)}` : '/login')
    } else if (user && router.pathname === '/login') {
      router.replace(cheminApresConnexion(router.query.suite))
    }
  }, [user, authReady, router.pathname, router.asPath, router.query.suite])

  // ─── Écran d'attente ─────────────────────────────────────────────────────
  //
  // Le premier écran de l'application, et le seul qu'on voie avant de savoir
  // qui l'on est. Il reprend la couverture des présentations client : fond
  // noir, le vrai logo en rose clair, le nom en petites capitales. Pas de
  // dégradé, pas de halo flou, pas de logo inventé qui tourne — trois choses
  // que la marque n'emploie nulle part ailleurs.
  //
  // Un seul mouvement, un trait qui va et vient : de quoi dire que ça
  // travaille. Il s'arrête pour qui a demandé moins d'animations à son
  // système, et la barre reste alors visible, à moitié remplie.
  //
  // Le viewport passe par `next/head` et non par `_document`, parce que Next
  // en injecte un par défaut (`width=device-width` seul) dès qu'il n'en trouve
  // pas ici : on se retrouvait avec DEUX balises viewport, dont la première
  // sans `initial-scale` ni `viewport-fit`. En le déclarant, on remplace la
  // sienne au lieu de s'y ajouter.
  //
  // Il est rendu dans les trois branches — y compris l'écran d'attente, qui
  // est TOUT ce que le serveur rend : c'est précisément l'oubli que l'audit a
  // trouvé. Le reste des balises PWA vit dans `_document.js`, où le serveur
  // les écrit quel que soit l'état de la session.
  const viewport = (
    <Head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
  )

  if (!authReady) {
    return (
      <>
      {viewport}
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 28,
        background: AL.black,
      }}>
        <style>{`
          @keyframes maze-va-et-vient { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }
          @keyframes maze-apparait { from { opacity: 0 } to { opacity: 1 } }
          .maze-attente { animation: maze-apparait .5s ease both; }
          .maze-trait   { animation: maze-va-et-vient 1.4s cubic-bezier(.4,0,.2,1) infinite; }
          @media (prefers-reduced-motion: reduce) {
            .maze-attente { animation: none; }
            .maze-trait   { animation: none; transform: translateX(100%); }
          }
        `}</style>
        <div className="maze-attente" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: amazingLogo(56, AL.pink) }} />
          <span style={{
            fontFamily: FONT, fontSize: 11, fontWeight: 500, letterSpacing: '.28em',
            textTransform: 'uppercase', color: C.navInactive,
          }}>maze project</span>
          <div role="status" aria-label="chargement" style={{
            width: 96, height: 2, borderRadius: R.pill, overflow: 'hidden',
            background: C.dividerOnDark,
          }}>
            <div className="maze-trait" style={{ width: '33%', height: '100%', borderRadius: R.pill, background: C.accent }} />
          </div>
        </div>
      </div>
      </>
    )
  }

  // Don't render protected pages while redirecting
  if (!user && !PUBLIC_ROUTES.includes(router.pathname)) return viewport

  const showChrome = user && !NO_CHROME_ROUTES.includes(router.pathname)

  return (
    <AuthContext.Provider value={{ user, signOut: () => { purgeCachePersistant(); return supabase.auth.signOut() } }}>
      <SWRConfig value={swrConfig}>
      {viewport}
      <ApiErrorBanner />
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
