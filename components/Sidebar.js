import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../pages/_app'
import useIsAdmin from '../lib/useIsAdmin'
import { C, FONT, MONO, RingLogo, initials } from '../lib/theme'

export const SIDEBAR_WIDTH = 200

// Items principaux (haut de la sidebar)
const MAIN_ITEMS = [
  { href: '/home',      label: 'Accueil',  match: (p) => p === '/home' },
  { href: '/',          label: 'Projets',  match: (p) => p === '/' || p.startsWith('/projects'), count: 'projects' },
  { href: '/tasks',     label: 'Tâches',   match: (p) => p === '/tasks', count: 'tasks' },
  { href: '/planning',  label: 'Planning', match: (p) => p === '/planning' },
  { href: '/schedule',  label: 'Horaires', match: (p) => p === '/schedule' },
  { href: '/meeting',   label: 'Meeting',  match: (p) => p === '/meeting' },
  { href: '/activity',  label: 'Activité', match: (p) => p === '/activity' },
]

// Sous-menu Banque (accordéon, admin uniquement)
const BANK_ITEMS = [
  { href: '/finances',              label: 'Tableau de bord' },
  { href: '/clients',               label: 'Clients & fourn.' },
  { href: '/offres',                label: 'Offres' },
  { href: '/factures-fournisseurs', label: 'Fact. fournisseurs' },
  { href: '/factures-emises',       label: 'Fact. émises' },
  { href: '/justificatifs',         label: 'Justificatifs' },
  { href: '/banque',                label: 'Banque' },
  { href: '/compta',                label: 'Compta' },
]

function itemStyle(active) {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: active ? 600 : 400,
    color: active ? '#fff' : C.inkSecondary,
    background: active ? C.ink : 'transparent',
    textDecoration: 'none',
    transition: 'background .15s ease, color .15s ease',
  }
}

export default function Sidebar() {
  const router = useRouter()
  const { user, signOut } = useAuth() || {}
  const isAdmin = useIsAdmin()
  const p = router.pathname

  // Compteurs live (SWR dédupliqué avec les pages qui chargent déjà ces données)
  const { data: tasks = [] } = useSWR('/api/tasks')
  const { data: projects = [] } = useSWR('/api/projects')
  const counts = {
    tasks: Array.isArray(tasks) ? tasks.filter(t => t.status === 'active').length : 0,
    projects: Array.isArray(projects) ? projects.filter(pr => pr.status === 'active').length : 0,
  }

  const bankActive = BANK_ITEMS.some(i => p === i.href)
  const [bankOpen, setBankOpen] = useState(bankActive)

  return (
    <aside
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: SIDEBAR_WIDTH,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        padding: '16px 10px', gap: 3,
        zIndex: 30, fontFamily: FONT,
      }}
    >
      {/* En-tête : logo + MAZE */}
      <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 16px', textDecoration: 'none', color: C.ink }}>
        <RingLogo size={24} />
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-.2px' }}>MAZE</span>
      </Link>

      {/* Items principaux */}
      {MAIN_ITEMS.map(item => {
        const active = item.match(p)
        const n = item.count ? counts[item.count] : null
        return (
          <Link key={item.href} href={item.href} style={itemStyle(active)}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.divider }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
            {item.label}
            {n != null && n > 0 && (
              <span style={{ marginLeft: 'auto', font: `10px ${MONO}`, color: active ? C.accentOnDark : C.muted }}>{n}</span>
            )}
          </Link>
        )
      })}

      <div style={{ height: 1, background: C.divider, margin: '8px 4px' }} />

      {/* Banque — accordéon (admin) */}
      {isAdmin && (
        <>
          <button
            onClick={() => setBankOpen(o => !o)}
            style={{ ...itemStyle(false), fontWeight: 600, border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', background: 'transparent' }}
          >
            Banque
            <span style={{ marginLeft: 'auto', color: C.faintChevron, fontSize: 11, transition: 'transform .15s ease', transform: bankOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
          </button>
          {bankOpen && BANK_ITEMS.map(item => {
            const active = p === item.href
            return (
              <Link key={item.href} href={item.href}
                style={{ ...itemStyle(active), paddingLeft: 22, fontSize: 12.5 }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.divider }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                {item.label}
              </Link>
            )
          })}
        </>
      )}

      {/* Atelier (lien externe) */}
      <Link href="/display" target="_blank" rel="noopener" style={itemStyle(false)}
        onMouseEnter={e => { e.currentTarget.style.background = C.divider }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
        Atelier
        <span style={{ marginLeft: 'auto', color: C.faintChevron, fontSize: 12 }}>↗</span>
      </Link>

      {/* Réglages */}
      <Link href="/settings" style={itemStyle(p === '/settings')}
        onMouseEnter={e => { if (p !== '/settings') e.currentTarget.style.background = C.divider }}
        onMouseLeave={e => { if (p !== '/settings') e.currentTarget.style.background = 'transparent' }}>
        Réglages
      </Link>

      <div style={{ flex: 1 }} />

      {/* Pied : avatar + nom + déconnexion */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 10px 0', borderTop: `1px solid ${C.divider}` }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.ink, color: C.accentOnDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flex: 'none' }}>
            {initials(user.name)}
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</span>
            <button onClick={signOut}
              style={{ font: `10px ${MONO}`, color: C.muted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', letterSpacing: '.05em' }}
              onMouseEnter={e => { e.currentTarget.style.color = C.accent }}
              onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
              DÉCONNEXION
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
