// La navigation du téléphone.
//
// Quatre entrées qu'on ouvre debout, une main occupée — accueil, projets,
// tâches, horaires — et un « Plus » qui ouvre TOUT le reste. Cette barre est le
// seul accès sous 768 px : ce qui n'y figure pas doit être dans la feuille, et
// la feuille lit la MÊME liste que la barre de bureau (lib/navigation.js) —
// une seconde liste divergerait au premier ajout, c'est ainsi que dix-huit
// pages étaient devenues injoignables au doigt.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../pages/_app'
import useIsAdmin from '../lib/useIsAdmin'
import { COMPTE, RUBRIQUES, chercher, estActif, lienDe, rubriquesVisibles } from '../lib/navigation'
import Icone from './nav/icones'
import { STYLE_NAV } from './nav/styles'

export const BOTTOM_NAV_HEIGHT = 64

const DANS_LA_BARRE = ['/home', '/', '/tasks', '/schedule']
const ENTREES = DANS_LA_BARRE.map(h => {
  const i = RUBRIQUES.flatMap(r => r.items).find(x => x.href === h)
  return h === '/schedule' ? { ...i, icone: 'temps' } : i
})

export default function BottomNav() {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const { signOut } = useAuth() || {}
  const [ouvert, setOuvert] = useState(false)
  const [q, setQ] = useState('')
  const { data: projets } = useSWR(ouvert ? '/api/projects?light=1' : null)

  // Changer de page referme la feuille ; ouverte, elle bloque le défilement
  // de la page derrière.
  useEffect(() => { setOuvert(false); setQ('') }, [router.asPath])
  useEffect(() => {
    if (!ouvert) return
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = avant }
  }, [ouvert])

  const rubriques = useMemo(() => rubriquesVisibles(isAdmin)
    .map(r => ({ ...r, items: r.items.filter(i => !DANS_LA_BARRE.includes(i.href)) }))
    .filter(r => r.items.length), [isAdmin])
  const resultats = chercher(q, { projets: Array.isArray(projets) ? projets : [], isAdmin, limite: 10 })

  return (
    <div className="nv">
      <style>{STYLE_NAV}</style>
      {ouvert && (
        <div className="nv-feuille-voile" onClick={() => setOuvert(false)}>
          <div className="nv-feuille" onClick={e => e.stopPropagation()}>
            <span className="poignee" />
            <label className="nv-chercher">
              <Icone nom="chercher" taille={18} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Page ou projet…" aria-label="Chercher une page ou un projet"
                style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'none', font: 'inherit', fontSize: 16, color: 'inherit' }} />
            </label>
            {q ? (
              <div>
                {resultats.length === 0 && <p style={{ color: '#5f6672', margin: '0 12px' }}>Rien ne répond à « {q} ».</p>}
                {resultats.map(r => (
                  <Link key={r.cle} href={r.href} className="nv-lien">
                    {r.numero != null && <span className="n" style={{ color: '#1f2de6', fontWeight: 600 }}>{r.numero}</span>}
                    <span>{r.nom}</span><span className="compte">{r.genre === 'projet' ? r.detail : 'Page'}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <>
                {rubriques.map(r => (
                  <div key={r.cle}>
                    {r.nom && <h4>{r.nom}</h4>}
                    {r.items.map(i => (
                      <Link key={i.href} href={lienDe(i.href)} className="nv-lien" aria-current={estActif(i, router.pathname) ? 'page' : undefined}>
                        {i.icone && <Icone nom={i.icone} />}<span>{i.nom}</span>
                      </Link>
                    ))}
                  </div>
                ))}
                <div>
                  <h4>Compte</h4>
                  {COMPTE.filter(c => !c.externe).map(c => <Link key={c.href} href={c.href} className="nv-lien"><Icone nom="reglages" /><span>{c.nom}</span></Link>)}
                  <button className="nv-lien" onClick={signOut} style={{ width: '100%' }}><Icone nom="sortie" /><span>Se déconnecter</span></button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <nav className="nv-bas" aria-label="Navigation">
        {ENTREES.map(i => (
          <Link key={i.href} href={lienDe(i.href)} aria-current={estActif(i, router.pathname) ? 'page' : undefined}>
            <Icone nom={i.icone} taille={22} /><span>{i.nom}</span>
          </Link>
        ))}
        <button aria-expanded={ouvert} onClick={() => setOuvert(o => !o)}><Icone nom="plus" taille={22} /><span>Plus</span></button>
      </nav>
    </div>
  )
}
