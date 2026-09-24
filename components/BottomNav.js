// La navigation du téléphone.
//
// Elle portait SEPT entrées : 53 px chacune sur un iPhone, sous la cible
// tactile de 44 px une fois les marges comptées, et l'icône « accueil »
// mordait sur son libellé. Elle en porte quatre, plus un « plus ».
//
// Mais le vrai défaut était ailleurs, trouvé en la mesurant : cette barre est
// le SEUL accès sur mobile — la sidebar ne s'affiche qu'au-delà de 768 px.
// Tout ce qui n'y figurait pas était donc INJOIGNABLE depuis un téléphone :
// les heures, l'activité, les outils (donc l'économat et l'annuaire), les
// contacts, le catalogue, le stockage, les offres, les factures, la banque,
// la compta. Dix-huit pages.
//
// Le « plus » ouvre donc la MÊME liste que la sidebar — importée d'elle, pas
// recopiée : deux listes de navigation auraient divergé au premier ajout, et
// c'est exactement comme ça que l'économat est né sans entrée mobile.
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import useIsAdmin from '../lib/useIsAdmin'
import { MAIN_ITEMS, FIN_TOP, FIN_GROUPS } from './Sidebar'

export const BOTTOM_NAV_HEIGHT = 64

// Les quatre qu'on ouvre debout, une main occupée. Le planning et le meeting
// sont des vues de semaine : on les consulte assis, ils passent dans la liste.
const ITEMS = [
  {
    href: '/home',
    label: 'accueil',
    match: (p) => p === '/home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-8 9 8" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      </svg>
    ),
  },
  {
    href: '/',
    label: 'projets',
    match: (p) => p === '/' || p.startsWith('/projects'),
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'tâches',
    match: (p) => p === '/tasks',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: '/schedule',
    label: 'horaires',
    match: (p) => p === '/schedule',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
]

/** Tout ce qui n'est pas dans la barre — la liste de la sidebar, moins ce
 *  qu'elle affiche déjà en bas. */
function reste(isAdmin) {
  const dansLaBarre = new Set(ITEMS.map(i => i.href))
  const groupes = [
    { label: '', items: MAIN_ITEMS.filter(i => !dansLaBarre.has(i.href)) },
    { label: 'COMPTE', items: [{ href: '/settings', label: 'réglages' }] },
  ]
  if (isAdmin) {
    groupes.push({ label: 'GESTION', items: FIN_TOP })
    for (const g of FIN_GROUPS) groupes.push(g)
  }
  return groupes.filter(g => g.items.length)
}

export default function BottomNav() {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [ouvert, setOuvert] = useState(false)

  // Changer de page referme la feuille : sans ça, on revient dessus en
  // arrière et elle est encore là, par-dessus la page qu'on vient d'ouvrir.
  useEffect(() => { setOuvert(false) }, [router.asPath])

  // Le doigt qui feuillette ne doit pas emporter la page DERRIÈRE la feuille.
  useEffect(() => {
    if (!ouvert) return
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = avant }
  }, [ouvert])

  const groupes = reste(isAdmin)

  return (
    <>
    {ouvert && (
      <div
        onClick={() => setOuvert(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 41, background: 'rgba(12,12,12,.45)',
          display: 'flex', alignItems: 'flex-end',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxHeight: '78vh', overflowY: 'auto',
            background: AL.black, color: AL.white, fontFamily: FONT,
            borderTopLeftRadius: R.panel, borderTopRightRadius: R.panel,
            padding: `18px 16px calc(${BOTTOM_NAV_HEIGHT}px + 18px + env(safe-area-inset-bottom))`,
          }}
        >
          {/* La poignée : elle dit « ça se tire vers le bas » sans une ligne
              de texte, et c'est la convention de toutes les feuilles d'iOS. */}
          <div style={{ width: 36, height: 4, borderRadius: R.pill, background: C.dividerOnDark, margin: '0 auto 18px' }} />

          {groupes.map((g, gi) => (
            <div key={g.label || gi} style={{ marginBottom: 18 }}>
              {g.label && (
                <span style={{
                  display: 'block', font: `500 10.5px ${MONO}`, letterSpacing: '.1em',
                  color: C.navInactive, margin: '0 8px 8px',
                }}>{g.label}</span>
              )}
              {g.items.map(it => {
                const actif = it.match ? it.match(router.pathname) : router.pathname === it.href
                return (
                  <Link key={it.href} href={it.href}
                    style={{
                      display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 16px',
                      borderRadius: R.pill, textDecoration: 'none', fontSize: 15.5,
                      fontWeight: actif ? 500 : 400,
                      background: actif ? AL.white : 'transparent',
                      color: actif ? AL.black : AL.white,
                    }}>
                    {it.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )}

    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        // Mêmes jetons que la sidebar : fond noir, pas de bordure — la
        // séparation d'avec le contenu vient de l'inversion de fond.
        background: AL.black,
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
        fontFamily: FONT,
      }}
    >
      {ITEMS.map((item) => {
        const active = item.match(router.pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '8px 4px',
              height: BOTTOM_NAV_HEIGHT,
              color: active ? AL.white : C.navInactive,
              textDecoration: 'none',
              fontSize: 11,
              fontWeight: active ? 500 : 400,
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        )
      })}

      {/* Cinquième case : tout le reste de l'application. */}
      <button
        onClick={() => setOuvert(o => !o)}
        aria-label="Plus"
        aria-expanded={ouvert}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 3, padding: '8px 4px', height: BOTTOM_NAV_HEIGHT,
          background: 'none', border: 'none', cursor: 'pointer',
          color: ouvert ? AL.white : C.navInactive,
          fontFamily: FONT, fontSize: 11, fontWeight: ouvert ? 500 : 400,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span>plus</span>
      </button>
    </nav>
    </>
  )
}
