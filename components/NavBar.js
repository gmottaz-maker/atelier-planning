import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../pages/_app'

const PINK = '#FF4D6D'

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
      <circle cx="20" cy="20" r="3" fill={PINK} />
    </svg>
  )
}

const NAV_ITEMS = [
  { href: '/',         icon: '🗂',  title: 'Projets'     },
  { href: '/tasks',    icon: '✅',  title: 'Tâches'      },
  { href: '/schedule', icon: '🗓',  title: 'Horaires'    },
  { href: '/activity', icon: '📊',  title: 'Activité'    },
  { href: '/display',  icon: '📺',  title: 'Atelier', newTab: true },
  { href: '/settings', icon: '⚙️', title: 'Paramètres'  },
]

// Bottom tab items for mobile
const BOTTOM_TABS = [
  { href: '/',         icon: '🗂',  title: 'Projets'  },
  { href: '/tasks',    icon: '✅',  title: 'Tâches'   },
  { href: '/schedule', icon: '🗓',  title: 'Horaires' },
  { href: '/activity', icon: '📊',  title: 'Activité' },
]

/**
 * NavBar partagée pour toutes les pages.
 * Props:
 *   title    – nom de la page (ex: "projets", "horaires")
 *   children – boutons d'action supplémentaires à droite
 */
export default function NavBar({ title, children }) {
  const router  = useRouter()
  const { user } = useAuth() || {}

  return (
    <>
      <style>{`
        .nav-bottom-bar { display: none; }
        @media (max-width: 640px) {
          .nav-desktop-items { display: none; }
          .nav-bottom-bar {
            display: flex;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            z-index: 50;
            background: white;
            border-top: 1px solid #f0f0f0;
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }
          body { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>

      <header
        className="sticky top-0 z-20 bg-white border-b"
        style={{ borderColor: '#f0f0f0', fontFamily: 'Inter, sans-serif' }}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Gauche : logo + titre */}
          <div className="flex items-center gap-2.5">
            <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
              <Logo />
            </Link>
            {title && (
              <span className="font-bold text-gray-900 text-sm">{title}</span>
            )}
          </div>

          {/* Droite : icônes de nav + actions (hidden on mobile) */}
          <div className="nav-desktop-items flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const isActive = router.pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.title}
                  target={item.newTab ? '_blank' : undefined}
                  rel={item.newTab ? 'noopener' : undefined}
                  className="w-8 h-8 flex items-center justify-center rounded-full border transition-colors text-base"
                  style={{
                    borderColor:  isActive ? PINK : '#e5e7eb',
                    background:   isActive ? `${PINK}14` : 'white',
                    color:        isActive ? PINK : '#9ca3af',
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </Link>
              )
            })}

            {/* Séparateur + actions contextuelles */}
            {children && (
              <>
                <div className="mx-1.5 h-5 w-px" style={{ background: '#e5e7eb' }} />
                {children}
              </>
            )}
          </div>

          {/* Mobile: show only children actions (right side) */}
          {children && (
            <div className="sm:hidden flex items-center gap-1">
              {children}
            </div>
          )}
        </div>
      </header>

      {/* ── Bottom tab bar (mobile only) ── */}
      <nav className="nav-bottom-bar" style={{ fontFamily: 'Inter, sans-serif' }}>
        {BOTTOM_TABS.map(item => {
          const isActive = router.pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5"
              style={{
                color: isActive ? PINK : '#9ca3af',
                textDecoration: 'none',
                minHeight: 56,
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{item.title}</span>
              {isActive && (
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: PINK, marginTop: 1 }} />
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
