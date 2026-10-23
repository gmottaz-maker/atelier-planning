// Outils — proposition dans le nouveau style, à côté de l'index actuel
// (/outils). Deux rubriques : ce qui sert à l'atelier, et la gestion (admin,
// ces écrans portent des coûts). Chaque outil dit ce qu'il a à dire en ce
// moment ; l'économat, ce qu'il faut commander. Le calcul vit dans lib/outils.js.
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import useIsAdmin from '../../lib/useIsAdmin'
import { STYLE_FICHE } from '../../components/fiche/styles'
import { GROUPES, OUTILS, etatsOutils } from '../../lib/outils'

export default function OutilsEssai() {
  const isAdmin = useIsAdmin()
  const { data: economat } = useSWR('/api/economat')
  const { data: annuaire } = useSWR('/api/annuaire')
  const etats = etatsOutils({ economat, annuaire })
  const groupes = GROUPES.filter(g => !g.admin || isAdmin)
    .map(g => ({ ...g, outils: OUTILS.filter(o => o.groupe === g.cle && (!o.admin || isAdmin)) }))
    .filter(g => g.outils.length)
  const nb = groupes.reduce((s, g) => s + g.outils.length, 0)
  const aCommander = etats['/outils/economat']?.alerte

  return (
    <div className="fx">
      <Head><title>Outils — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <h1>Outils</h1>
            <p className="fx-resume-liste">
              <span>{nb} aides au travail, sans lien avec les projets ni la facturation</span>
              {aCommander && <span className="rouge">{etats['/outils/economat'].texte.split(' · ')[0]} à l’économat</span>}
            </p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/outils" style={{ textDecoration: 'none' }}>Ancienne page</a>
          </div>
        </header>

        {groupes.map(g => (
          <section key={g.cle} className="fx-outils">
            <h2>{g.nom}</h2>
            <div className="grille">
              {g.outils.map(o => {
                const e = etats[o.href]
                return (
                  <Link key={o.href} href={o.href} className="fx-outil">
                    <b>{o.nom}</b>
                    <p>{o.resume}</p>
                    {e && <span className={`etat n${e.alerte ? ' rouge' : ''}`}>{e.texte}</span>}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
