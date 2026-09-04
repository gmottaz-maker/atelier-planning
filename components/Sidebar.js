import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../pages/_app'
import useIsAdmin from '../lib/useIsAdmin'
import { AL, C, FONT, MONO, R, initials } from '../lib/theme'
import MazeLockup from './MazeLockup'
import { VERSION } from '../lib/version'

export const SIDEBAR_WIDTH = 224

// Items principaux (haut de la sidebar). Libellés en minuscules : règle
// éditoriale du design system, tapée telle quelle et non obtenue par
// text-transform — la casse fait partie du texte, pas de la présentation.
const MAIN_ITEMS = [
  { href: '/home',      label: 'accueil',  match: (p) => p === '/home' },
  { href: '/',          label: 'projets',  match: (p) => p === '/' || p.startsWith('/projects'), count: 'projects' },
  { href: '/tasks',     label: 'tâches',   match: (p) => p === '/tasks', count: 'tasks' },
  { href: '/planning',  label: 'planning', match: (p) => p === '/planning' },
  { href: '/schedule',  label: 'horaires', match: (p) => p === '/schedule' },
  { href: '/meeting',   label: 'meeting',  match: (p) => p === '/meeting' },
  { href: '/activity',  label: 'activité', match: (p) => p === '/activity' },
  { href: '/outils',    label: 'outils',   match: (p) => p.startsWith('/outils') || p === '/peintures' },
]

// Zone finances (admin uniquement) : 4 items transverses + 2 groupes labellisés
const FIN_TOP = [
  { href: '/finances', label: 'tableau de bord' },
  { href: '/clients',  label: 'contacts' },
  { href: '/catalog',  label: 'catalogue' },
  { href: '/stockage', label: 'stockage' },
]
const FIN_GROUPS = [
  { label: 'FINANCES CLIENTS', items: [
    { href: '/offres',          label: 'offres' },
    { href: '/factures-emises', label: 'factures sortantes' },
  ] },
  { label: 'FINANCES INTERNES', items: [
    { href: '/factures-fournisseurs', label: 'factures entrantes' },
    { href: '/justificatifs',         label: 'justificatifs' },
    { href: '/banque',                label: 'transactions bancaires' },
    { href: '/compta',                label: 'compta' },
  ] },
]

// Item de nav. Actif = pill blanche pleine sur le fond noir : c'est l'inversion
// de fond qui porte la hiérarchie, il n'y a ni ombre ni bordure dans ce shell.
function itemStyle(active, { fontSize = 14.5, padding = '10px 16px' } = {}) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding,
    borderRadius: R.pill,
    fontSize,
    fontFamily: FONT,
    fontWeight: active ? 500 : 400,
    color: active ? AL.black : C.navInactive,
    background: active ? AL.white : 'transparent',
    textDecoration: 'none',
    transition: 'background .15s ease, color .15s ease',
  }
}

// Survol : fond + texte ensemble, jamais un simple changement d'opacité.
const hoverIn = (active) => (e) => {
  if (active) return
  e.currentTarget.style.background = C.hoverOnDark
  e.currentTarget.style.color = AL.white
}
const hoverOut = (active) => (e) => {
  if (active) return
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.color = C.navInactive
}

export default function Sidebar() {
  const router = useRouter()
  const { user, signOut } = useAuth() || {}
  const isAdmin = useIsAdmin()
  const p = router.pathname

  // Compteurs live (SWR dédupliqué avec les pages qui chargent déjà ces données)
  const { data: tasks = [] } = useSWR('/api/tasks')
  const { data: projects = [] } = useSWR('/api/projects?light=1')
  const counts = {
    tasks: Array.isArray(tasks) ? tasks.filter(t => t.status === 'active').length : 0,
    projects: Array.isArray(projects) ? projects.filter(pr => pr.status === 'active').length : 0,
  }

  const finLink = (item) => {
    const active = p === item.href
    return (
      <Link key={item.href} href={item.href}
        style={{ ...itemStyle(active, { fontSize: 13.5, padding: '9px 16px' }), color: active ? AL.black : 'rgba(255,255,255,.6)' }}
        onMouseEnter={hoverIn(active)}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.6)' } }}>
        {item.label}
      </Link>
    )
  }

  const divider = (key) => (
    <div key={key} style={{ height: 1, background: C.dividerOnDark, margin: '14px 16px' }} />
  )

  return (
    <aside
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: SIDEBAR_WIDTH,
        background: AL.black,
        display: 'flex', flexDirection: 'column',
        padding: '28px 16px 20px', gap: 2,
        boxSizing: 'border-box', overflowY: 'auto',
        zIndex: 30, fontFamily: FONT,
      }}
    >
      {/* En-tête : lockup « maze / project ». Pas de bordure droite sur l'aside :
          la séparation d'avec le contenu vient de l'inversion de fond. */}
      <Link href="/home" style={{ padding: '0 16px 32px', textDecoration: 'none' }}>
        <MazeLockup size={24} />
      </Link>

      {/* Items principaux */}
      {MAIN_ITEMS.map(item => {
        const active = item.match(p)
        const n = item.count ? counts[item.count] : null
        return (
          <Link key={item.href} href={item.href} style={itemStyle(active)}
            onMouseEnter={hoverIn(active)} onMouseLeave={hoverOut(active)}>
            <span style={{ flex: 1 }}>{item.label}</span>
            {n != null && n > 0 && (
              // Sur la pill active, le compteur est NOIR : le corail sous 24px
              // sur blanc mesure 3.2:1, le système l'interdit.
              <span style={{ font: `11px ${MONO}`, color: active ? AL.black : C.muted }}>{n}</span>
            )}
          </Link>
        )
      })}

      {divider('sep-main')}

      {/* Finances (admin) */}
      {isAdmin && (
        <>
          {FIN_TOP.map(finLink)}
          {FIN_GROUPS.flatMap(g => [
            <div key={g.label} style={{ font: `700 9.5px ${MONO}`, letterSpacing: '.16em', color: C.muted, textTransform: 'uppercase', padding: '22px 16px 8px' }}>{g.label}</div>,
            ...g.items.map(finLink),
          ])}
        </>
      )}

      {divider('sep-fin')}

      {/* Atelier (lien externe) */}
      <Link href="/display" target="_blank" rel="noopener" style={itemStyle(false, { fontSize: 14 })}
        onMouseEnter={hoverIn(false)} onMouseLeave={hoverOut(false)}>
        <span style={{ flex: 1 }}>atelier</span>
        <span style={{ color: C.muted, fontSize: 12 }}>↗</span>
      </Link>

      {/* Réglages */}
      <Link href="/settings" style={itemStyle(p === '/settings', { fontSize: 14 })}
        onMouseEnter={hoverIn(p === '/settings')} onMouseLeave={hoverOut(p === '/settings')}>
        réglages
      </Link>

      <div style={{ flex: 1 }} />

      {/* Pied : avatar + nom + déconnexion */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 16px 0', borderTop: `1px solid ${C.dividerOnDark}` }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: AL.white, color: AL.black, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>
            {initials(user.name)}
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: AL.white, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</span>
            <button onClick={signOut}
              style={{ font: `9.5px ${MONO}`, color: C.muted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', letterSpacing: '.1em' }}
              onMouseEnter={e => { e.currentTarget.style.color = C.accent }}
              onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
              DÉCONNEXION
            </button>
          </div>
        </div>
      )}

      {/* Version déployée. Figée au build, donc elle change EXACTEMENT quand un
          déploiement passe : le SHA se compare au dernier commit sur GitHub, et
          l'heure tranche quand deux déploiements portent le même commit. */}
      <div title="Version déployée — commit et heure du build"
        style={{ font: `9.5px ${MONO}`, color: C.muted, letterSpacing: '.06em',
          padding: '14px 16px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {VERSION}
      </div>
    </aside>
  )
}
