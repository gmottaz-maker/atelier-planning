// La navigation de bureau, en trois essais à comparer :
//
//   A. Colonne — une colonne blanche à gauche, les rubriques repliables.
//      Tout est lisible d'un coup d'œil ; la colonne coûte 248 px.
//   B. Barre  — une barre en haut : les six écrans du quotidien en clair, le
//      reste dans deux menus. La page récupère toute sa largeur.
//   C. Rail   — un rail sombre de 88 px, une icône et un mot par écran ; les
//      rubriques s'ouvrent dans un volet. Le plus compact.
//
// Les trois lisent la même liste (lib/navigation.js) et partagent la
// recherche ⌘K. Le choix se fait avec le sélecteur en bas à droite, et il est
// retenu dans le navigateur. Une fois l'essai tranché, les deux autres partent.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../../pages/_app'
import useIsAdmin from '../../lib/useIsAdmin'
import { initials } from '../../lib/theme'
import { VERSION } from '../../lib/version'
import { COMPTE, estActif, lienDe, rubriqueActive, rubriquesVisibles } from '../../lib/navigation'
import MazeLockup from '../MazeLockup'
import { N } from '../../lib/theme'
import Icone from './icones'
import Recherche from './Recherche'
import { STYLE_NAV } from './styles'

export const ESSAIS = [['colonne', 'Colonne'], ['barre', 'Barre en haut'], ['rail', 'Rail']]
const CLE = 'navEssai'
const lire = (cle, defaut) => { try { return localStorage.getItem(cle) || defaut } catch { return defaut } }
const ecrire = (cle, v) => { try { localStorage.setItem(cle, v) } catch { /* navigation privée */ } }

/** Ce que les trois essais partagent : page ouverte, droits, comptes, recherche. */
function useNav() {
  const router = useRouter()
  const { user, signOut } = useAuth() || {}
  const isAdmin = useIsAdmin()
  const { data: taches } = useSWR('/api/tasks')
  const { data: projets } = useSWR('/api/projects?light=1')
  const listeProjets = Array.isArray(projets) ? projets : []
  const comptes = {
    projets: listeProjets.filter(p => p.status === 'active').length,
    taches: Array.isArray(taches) ? taches.filter(t => t.status === 'active').length : 0,
  }
  const [recherche, setRecherche] = useState(false)
  useEffect(() => {
    const k = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setRecherche(v => !v) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return { chemin: router.pathname, asPath: router.asPath, user, signOut, isAdmin, comptes, projets: listeProjets, recherche, setRecherche }
}

/** Ferme un menu au clic dehors, à Échap et au changement de page. */
function useFermeture(ouvert, fermer, asPath) {
  const ref = useRef(null)
  useEffect(() => { fermer() }, [asPath]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ouvert) return
    const clic = e => { if (ref.current && !ref.current.contains(e.target)) fermer() }
    const esc = e => { if (e.key === 'Escape') fermer() }
    document.addEventListener('mousedown', clic)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', esc) }
  }, [ouvert, fermer])
  return ref
}

function Lien({ item, chemin, comptes, avecIcone = true }) {
  const actif = estActif(item, chemin)
  const n = item.compte ? comptes[item.compte] : null
  return (
    <Link href={lienDe(item.href)} className="nv-lien" aria-current={actif ? 'page' : undefined}>
      {avecIcone && item.icone && <Icone nom={item.icone} />}
      <span>{item.nom}</span>
      {n > 0 && <span className="compte n">{n}</span>}
    </Link>
  )
}

function BoutonRecherche({ setRecherche, court }) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <button className="nv-chercher" onClick={() => setRecherche(true)}>
      <Icone nom="chercher" taille={18} />{!court && <span>Chercher</span>}<kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}

function LiensCompte({ chemin, signOut }) {
  return (
    <>
      {COMPTE.map(c => (
        <Link key={c.href} href={c.href} className="nv-lien" target={c.externe ? '_blank' : undefined} rel={c.externe ? 'noopener' : undefined} aria-current={chemin === c.href ? 'page' : undefined}>
          <Icone nom={c.externe ? 'externe' : 'reglages'} /><span>{c.nom}</span>
        </Link>
      ))}
      <button className="nv-lien" onClick={signOut}><Icone nom="sortie" /><span>Se déconnecter</span></button>
    </>
  )
}

// ── A. Colonne ──────────────────────────────────────────────────────────────
function Colonne({ nav }) {
  const { chemin, isAdmin, comptes, user, signOut } = nav
  const [principale, ...rubriques] = rubriquesVisibles(isAdmin)
  const active = rubriqueActive(chemin, isAdmin)
  const [ouvertes, setOuvertes] = useState(() => new Set(['temps']))
  useEffect(() => { try { setOuvertes(new Set(JSON.parse(lire('navOuvertes', '["temps"]')))) } catch { /* valeur illisible */ } }, [])
  const basculer = cle => setOuvertes(s => {
    const n = new Set(s); n.has(cle) ? n.delete(cle) : n.add(cle)
    ecrire('navOuvertes', JSON.stringify([...n])); return n
  })
  return (
    <>
      <Link href={lienDe('/home')} className="logo" aria-label="Accueil"><MazeLockup size={22} color={N.encre} /></Link>
      <BoutonRecherche setRecherche={nav.setRecherche} />
      {principale.items.map(i => <Lien key={i.href} item={i} chemin={chemin} comptes={comptes} />)}
      {rubriques.map(r => {
        const ouverte = ouvertes.has(r.cle) || active === r.cle
        return (
          <div key={r.cle} className="nv-rubrique">
            <button aria-expanded={ouverte} onClick={() => basculer(r.cle)}>{r.nom}<Icone nom="chevron" taille={16} /></button>
            {ouverte && r.items.map(i => <Lien key={i.href} item={i} chemin={chemin} comptes={comptes} avecIcone={false} />)}
          </div>
        )
      })}
      <div className="nv-compte">
        {user && (
          <div className="nv-moi">
            <span className="nv-avatar">{initials(user.name)}</span><b>{user.name}</b>
            <span className="outils">
              <Link href="/settings" title="Réglages" aria-label="Réglages" aria-current={chemin === '/settings' ? 'page' : undefined}><Icone nom="reglages" taille={18} /></Link>
              <Link href="/display" target="_blank" rel="noopener" title="Écran de l’atelier" aria-label="Écran de l’atelier"><Icone nom="externe" taille={18} /></Link>
              <button onClick={signOut} title="Se déconnecter" aria-label="Se déconnecter"><Icone nom="sortie" taille={18} /></button>
            </span>
          </div>
        )}
        <p className="nv-version" title="Version déployée : commit et heure du build">{VERSION}</p>
      </div>
    </>
  )
}

// ── B. Barre en haut ────────────────────────────────────────────────────────
function Menu({ titre, icone, actif, droite, asPath, colonnes = 1, children }) {
  const [ouvert, setOuvert] = useState(false)
  const ref = useFermeture(ouvert, () => setOuvert(false), asPath)
  return (
    <div className="nv-menu" ref={ref}>
      <button aria-expanded={ouvert} aria-haspopup="true" className={actif ? 'actif' : undefined} onClick={() => setOuvert(v => !v)}>
        {icone}{titre}<Icone nom="chevron" taille={16} />
      </button>
      {ouvert && <div className={`nv-deroule${droite ? ' droite' : ''}`} style={{ '--cols': colonnes }}>{children}</div>}
    </div>
  )
}

function Barre({ nav }) {
  const { chemin, asPath, isAdmin, comptes, user, signOut } = nav
  const [principale, temps, ...gestion] = rubriquesVisibles(isAdmin)
  const active = rubriqueActive(chemin, isAdmin)
  return (
    <>
      <Link href={lienDe('/home')} className="logo" aria-label="Accueil"><MazeLockup size={18} color={N.encre} /></Link>
      {principale.items.map(i => <Lien key={i.href} item={i} chemin={chemin} comptes={comptes} avecIcone={false} />)}
      <Menu titre={temps.nom} actif={active === 'temps'} asPath={asPath}>
        <div>{temps.items.map(i => <Lien key={i.href} item={i} chemin={chemin} comptes={comptes} avecIcone={false} />)}</div>
      </Menu>
      {gestion.length > 0 && (
        <Menu titre="Gestion" colonnes={2} actif={gestion.some(r => r.cle === active)} asPath={asPath}>
          {gestion.map(r => <div key={r.cle}><h4>{r.nom}</h4>{r.items.map(i => <Lien key={i.href} item={i} chemin={chemin} comptes={comptes} avecIcone={false} />)}</div>)}
        </Menu>
      )}
      <span className="espace" />
      <BoutonRecherche setRecherche={nav.setRecherche} />
      {user && (
        <Menu titre={<span className="nv-avatar">{initials(user.name)}</span>} droite asPath={asPath}>
          <div><div className="nv-moi"><b>{user.name}</b></div><LiensCompte chemin={chemin} signOut={signOut} /><p className="nv-version">{VERSION}</p></div>
        </Menu>
      )}
    </>
  )
}

// ── C. Rail ─────────────────────────────────────────────────────────────────
function Rail({ nav }) {
  const { chemin, asPath, isAdmin, comptes, user, signOut } = nav
  const [principale, temps, ...gestion] = rubriquesVisibles(isAdmin)
  const active = rubriqueActive(chemin, isAdmin)
  const [volet, setVolet] = useState(null)
  const ref = useFermeture(!!volet, () => setVolet(null), asPath)
  const caseVolet = (cle, nom, icone, actif) => (
    <button className={`nv-case${actif ? ' actif' : ''}`} aria-expanded={volet === cle} onClick={() => setVolet(v => (v === cle ? null : cle))}>
      <Icone nom={icone} taille={22} />{nom}
    </button>
  )
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <Link href={lienDe('/home')} className="logo" aria-label="Accueil">ma<span>z</span>e</Link>
      <button className="nv-case" onClick={() => nav.setRecherche(true)}><Icone nom="chercher" taille={22} />Chercher</button>
      <span className="sep" />
      {principale.items.map(i => {
        const n = i.compte ? comptes[i.compte] : null
        return (
          <Link key={i.href} href={lienDe(i.href)} className="nv-case" aria-current={estActif(i, chemin) ? 'page' : undefined}>
            <Icone nom={i.icone} taille={22} />{i.nom}
            {i.compte === 'taches' && n > 0 && <span className="pastille n">{n}</span>}
          </Link>
        )
      })}
      <span className="sep" />
      {caseVolet('temps', 'Temps', 'temps', active === 'temps')}
      {gestion.length > 0 && caseVolet('gestion', 'Gestion', 'gestion', gestion.some(r => r.cle === active))}
      <div className="bas">
        {user && <button className="nv-case" aria-expanded={volet === 'compte'} onClick={() => setVolet(v => (v === 'compte' ? null : 'compte'))} aria-label="Mon compte"><span className="nv-avatar">{initials(user.name)}</span></button>}
      </div>
      {volet && (
        <div className="nv-volet">
          {volet === 'temps' && <><h3>Mon temps</h3><div>{temps.items.map(i => <Lien key={i.href} item={i} chemin={chemin} comptes={comptes} avecIcone={false} />)}</div></>}
          {volet === 'gestion' && <><h3>Gestion</h3>{gestion.map(r => <div key={r.cle}><h4>{r.nom}</h4>{r.items.map(i => <Lien key={i.href} item={i} chemin={chemin} comptes={comptes} avecIcone={false} />)}</div>)}</>}
          {volet === 'compte' && <><h3>{user?.name}</h3><div><LiensCompte chemin={chemin} signOut={signOut} /></div><p className="nv-version">{VERSION}</p></>}
        </div>
      )}
    </div>
  )
}

export default function Navigation() {
  const nav = useNav()
  const [essai, setEssai] = useState('colonne')
  useEffect(() => { const v = lire(CLE, 'colonne'); if (ESSAIS.some(([k]) => k === v)) setEssai(v) }, [])
  const choisir = v => { setEssai(v); ecrire(CLE, v) }
  const Vue = essai === 'barre' ? Barre : essai === 'rail' ? Rail : Colonne
  // Ce nœud doit rester le DERNIER avant le contenu : la feuille décale le
  // contenu avec `.nv-<essai> + div`.
  return (
    <nav className={`nv nv-${essai}`} aria-label="Navigation principale">
      <style>{STYLE_NAV}</style>
      <Vue nav={nav} />
      <div className="nv-essai" role="group" aria-label="Essai de navigation">
        <span>Navigation</span>
        {ESSAIS.map(([k, nom]) => <button key={k} aria-pressed={essai === k} onClick={() => choisir(k)}>{nom}</button>)}
      </div>
      {nav.recherche && <Recherche projets={nav.projets} isAdmin={nav.isAdmin} onFerme={() => nav.setRecherche(false)} />}
    </nav>
  )
}
