import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../pages/_app'

const NAV_ITEMS = [
  { href: '/',                       label: 'Projets'    },
  { href: '/tasks',                  label: 'Tâches'     },
  { href: '/schedule',               label: 'Horaires'   },
  { href: '/meeting',                label: 'Meeting'    },
  { href: '/factures-fournisseurs',  label: 'Fact. fournisseurs', section: 'Banque' },
  { href: '/factures-emises',        label: 'Fact. émises', section: 'Banque' },
  { href: '/banque',                 label: 'Banque',    section: 'Banque' },
  { href: '/compta',                 label: 'Compta',    section: 'Banque' },
  { href: '/activity',               label: 'Activité'   },
  { href: '/display',                label: 'Atelier',   newTab: true },
  { href: '/settings',               label: 'Réglages'   },
]

export const SIDEBAR_WIDTH = 260

export default function Sidebar() {
  const router = useRouter()
  const { user, signOut } = useAuth() || {}

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        background: '#fff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #f3f4f6' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#111827', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
          Maze Project
        </Link>
      </div>

      <nav style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const isActive = router.pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.newTab ? '_blank' : undefined}
              rel={item.newTab ? 'noopener' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#111827' : '#6b7280',
                background: isActive ? '#f3f4f6' : 'transparent',
                textDecoration: 'none',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#111827' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280' } }}
            >
              {item.label}
              {item.newTab && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#9ca3af' }}>↗</span>}
            </Link>
          )
        })}
      </nav>

      {user && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{user.name}</div>
          <button
            onClick={signOut}
            style={{
              marginTop: 6,
              fontSize: 13,
              color: '#9ca3af',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#111827' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af' }}
          >
            Se déconnecter
          </button>
        </div>
      )}
    </aside>
  )
}
