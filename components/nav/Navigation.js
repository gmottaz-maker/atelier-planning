// La navigation de bureau : un rail sombre de 88 px, une icône et un mot par
// écran. Les rubriques moins fréquentes (Mon temps, la gestion) et le compte
// s'ouvrent dans un volet à côté du rail. Retenu le 23 octobre 2026 contre une
// colonne blanche et une barre en haut : le plus compact, et la page garde
// presque toute sa largeur sur un 13 pouces.
//
// La liste des écrans vit dans lib/navigation.js, lue aussi par la barre du
// bas du téléphone et par la recherche ⌘K.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../../pages/_app'
import useIsAdmin from '../../lib/useIsAdmin'
import { initials } from '../../lib/theme'
import { VERSION } from '../../lib/version'
import { COMPTE, estActif, lienDe, rubriqueActive, rubriquesVisibles } from '../../lib/navigation'
import Icone from './icones'
import Recherche from './Recherche'
import { STYLE_NAV } from './styles'

function Lien({ item, chemin }) {
  return (
    <Link href={lienDe(item.href)} className="nv-lien" aria-current={estActif(item, chemin) ? 'page' : undefined}>
      <span>{item.nom}</span>
    </Link>
  )
}

export default function Navigation() {
  const router = useRouter()
  const chemin = router.pathname
  const { user, signOut } = useAuth() || {}
  const isAdmin = useIsAdmin()
  const { data: taches } = useSWR('/api/tasks')
  const { data: projetsBruts } = useSWR('/api/projects?light=1')
  const projets = Array.isArray(projetsBruts) ? projetsBruts : []
  const ouvertes = Array.isArray(taches) ? taches.filter(t => t.status === 'active').length : 0
  const [principale, temps, ...gestion] = rubriquesVisibles(isAdmin)
  const active = rubriqueActive(chemin, isAdmin)
  const [volet, setVolet] = useState(null)
  const [recherche, setRecherche] = useState(false)
  const ref = useRef(null)
  const fermer = useCallback(() => setVolet(null), [])

  // ⌘K / Ctrl K ouvre la recherche, de n'importe quelle page.
  useEffect(() => {
    const k = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setRecherche(v => !v) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  // Le volet se ferme au changement de page, au clic dehors et à Échap.
  useEffect(() => { fermer() }, [router.asPath, fermer])
  useEffect(() => {
    if (!volet) return
    const clic = e => { if (ref.current && !ref.current.contains(e.target)) fermer() }
    const esc = e => { if (e.key === 'Escape') fermer() }
    document.addEventListener('mousedown', clic)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', esc) }
  }, [volet, fermer])

  const caseVolet = (cle, nom, contenu, actif) => (
    <button className={`nv-case${actif ? ' actif' : ''}`} aria-expanded={volet === cle} onClick={() => setVolet(v => (v === cle ? null : cle))}>
      {contenu}{nom}
    </button>
  )

  return (
    <nav ref={ref} className="nv nv-rail" aria-label="Navigation principale">
      <style>{STYLE_NAV}</style>
      <Link href={lienDe('/home')} className="logo" aria-label="Accueil">ma<span>z</span>e</Link>
      <button className="nv-case" onClick={() => setRecherche(true)} title="Chercher (⌘K)"><Icone nom="chercher" taille={22} />Chercher</button>
      <span className="sep" />
      {principale.items.map(i => (
        <Link key={i.href} href={lienDe(i.href)} className="nv-case" aria-current={estActif(i, chemin) ? 'page' : undefined}>
          <Icone nom={i.icone} taille={22} />{i.nom}
          {i.compte === 'taches' && ouvertes > 0 && <span className="pastille n">{ouvertes}</span>}
        </Link>
      ))}
      <span className="sep" />
      {caseVolet('temps', 'Temps', <Icone nom="temps" taille={22} />, active === 'temps')}
      {gestion.length > 0 && caseVolet('gestion', 'Gestion', <Icone nom="gestion" taille={22} />, gestion.some(r => r.cle === active))}
      <div className="bas">
        {user && caseVolet('compte', '', <span className="nv-avatar" aria-label="Mon compte">{initials(user.name)}</span>, chemin === '/settings')}
      </div>

      {volet && (
        <div className="nv-volet">
          {volet === 'temps' && <><h3>Mon temps</h3><div>{temps.items.map(i => <Lien key={i.href} item={i} chemin={chemin} />)}</div></>}
          {volet === 'gestion' && <><h3>Gestion</h3>{gestion.map(r => <div key={r.cle}><h4>{r.nom}</h4>{r.items.map(i => <Lien key={i.href} item={i} chemin={chemin} />)}</div>)}</>}
          {volet === 'compte' && (
            <>
              <h3>{user?.name}</h3>
              <div>
                {COMPTE.map(c => (
                  <Link key={c.href} href={c.href} className="nv-lien" target={c.externe ? '_blank' : undefined} rel={c.externe ? 'noopener' : undefined} aria-current={chemin === c.href ? 'page' : undefined}>
                    <Icone nom={c.externe ? 'externe' : 'reglages'} /><span>{c.nom}</span>
                  </Link>
                ))}
                <button className="nv-lien" onClick={signOut}><Icone nom="sortie" /><span>Se déconnecter</span></button>
              </div>
              <p className="nv-version" title="Version déployée : commit et heure du build">{VERSION}</p>
            </>
          )}
        </div>
      )}
      {recherche && <Recherche projets={projets} isAdmin={isAdmin} onFerme={() => setRecherche(false)} />}
    </nav>
  )
}
