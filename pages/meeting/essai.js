// Réunion — proposition dans le nouveau style, à côté du brief actuel
// (/meeting). Rien ne se « génère » : la page lit l'état du moment, dans
// l'ordre où l'on en parle autour de la table — ce qui est en retard, ce qui
// arrive cette semaine, ce qu'on attend de l'extérieur, puis chaque projet à
// son statut. Elle s'imprime telle quelle. Le calcul vit dans lib/reunion.js.
import { useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import { useResponsibles } from '../../lib/useResponsibles'
import { STYLE_FICHE } from '../../components/fiche/styles'
import { N } from '../../lib/theme'
import { Commande, SousTraitance } from '../../components/fiche/Flux'
import { briefReunion } from '../../lib/reunion'
import { evenementsParJour, joursDeLaSemaine } from '../../lib/accueil'
import { dateCourte, delai, livraisonEnRetard } from '../../lib/fiche'
import { dateDuJour } from '../../lib/aujourdhui'

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const jourMois = iso => `${Number(iso.slice(8))} ${MOIS[Number(iso.slice(5, 7)) - 1]}`
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`
const GENRE = { livraison: 'Livraison', surplace: 'Sur place', agenda: 'Agenda', tache: 'Tâche' }

function numeroSemaine(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
}

function Projet({ p, resume, aujourdhui }) {
  const dl = p.deadline ? p.deadline.slice(0, 10) : null
  const retard = livraisonEnRetard(p, aujourdhui)
  const r = resume || { ouvertes: 0, retard: 0, prochaine: null }
  return (
    <Link href={`/projects/${p.id}/essai`} className="fx-etabli fx-reu-projet">
      <span className="no n">{p.numero}</span>
      <span className="nom"><b>{p.name}</b><small>{[p.client, p.responsible !== 'non défini' && p.responsible].filter(Boolean).join(' · ')}</small></span>
      <span className={`livraison${retard ? ' rouge' : ''}`}>{dl ? <><b className="n">{dateCourte(dl)}</b><small>{retard ? 'livraison dépassée' : delai(dl, aujourdhui)}</small></> : <small>Pas de date</small>}</span>
      <span className="taches">
        {r.ouvertes ? <b className={r.retard ? 'rouge' : undefined}>{pluriel(r.ouvertes, 'tâche')}{r.retard ? `, ${r.retard} en retard` : ''}</b> : <small>Aucune tâche ouverte</small>}
        {r.prochaine && <small>{dateCourte(r.prochaine.date)} : {r.prochaine.titre}</small>}
      </span>
    </Link>
  )
}

export default function ReunionEssai() {
  const { user } = useAuth()
  const moi = user?.name || ''
  const isAdmin = useIsAdmin()
  const { responsibles } = useResponsibles()
  const aujourdhui = dateDuJour()
  const jours = joursDeLaSemaine(aujourdhui)
  const { data: projetsBruts } = useSWR('/api/projects?light=1')
  const { data: tachesBrutes, mutate } = useSWR('/api/tasks')
  const { data: agendaBrut } = useSWR(`/api/agenda?from=${jours[0]}&to=${jours[6]}`)
  const { data: facturesBrutes } = useSWR(isAdmin ? '/api/customer-invoices' : null)
  const projets = Array.isArray(projetsBruts) ? projetsBruts : []
  const taches = Array.isArray(tachesBrutes) ? tachesBrutes : []
  const agenda = Array.isArray(agendaBrut) ? agendaBrut : []
  const factures = useMemo(() => new Set((Array.isArray(facturesBrutes) ? facturesBrutes : []).map(f => String(f.project_id))), [facturesBrutes])
  const personnes = (Array.isArray(responsibles) ? responsibles : []).filter(r => r && r !== 'non défini' && r !== 'Sous-traitant')
  const [absents, setAbsents] = useState([])
  const presents = personnes.filter(n => !absents.includes(n))

  const b = briefReunion({ projets, taches, factures, aujourdhui })
  const semaine = evenementsParJour({ projets, taches, agenda, debut: aujourdhui, fin: jours[6] })
  const joursSemaine = Object.keys(semaine).sort()
  const parId = Object.fromEntries(projets.map(p => [String(p.id), p]))
  const majLocale = t => mutate(taches.map(x => x.id === t.id ? t : x), false)
  const ajoutLocal = t => mutate([...taches, t], false)
  const retraitLocal = id => mutate(taches.filter(x => x.id !== id), false)
  const nbRetards = b.retards.projets.length + b.retards.taches.length
  const nbExterieur = b.commandes.length + b.sousTraitances.pretes.length + b.sousTraitances.chez.length

  const [y, m, d] = aujourdhui.split('-').map(Number)
  const jourSemaine = JOURS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]

  return (
    <div className="fx fx-reunion">
      <Head><title>Réunion — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <h1>Réunion</h1>
            <p className="fx-resume-liste"><span>{jourSemaine[0].toUpperCase() + jourSemaine.slice(1)} {jourMois(aujourdhui)}</span><span>semaine {numeroSemaine(aujourdhui)}</span><span>{presents.length ? presents.join(', ') : 'Personne'}</span></p>
          </div>
          <div className="fx-actions sans-impression">
            <a className="fx-btn g" href="/meeting" style={{ textDecoration: 'none' }}>Ancienne page</a>
            <button className="fx-btn p" onClick={() => window.print()}>Imprimer</button>
          </div>
        </header>

        <div className="fx-filtres sans-impression">
          <span className="fx-pastilles" role="group" aria-label="Autour de la table">
            {personnes.map(n => (
              <button key={n} aria-pressed={!absents.includes(n)} onClick={() => setAbsents(a => a.includes(n) ? a.filter(x => x !== n) : [...a, n])}>{n}</button>
            ))}
          </span>
        </div>

        {!projetsBruts && <p className="fx-note" style={{ marginTop: 40 }}>Chargement…</p>}

        <div className="fx-offre" style={{ marginTop: 48 }}>
          <div style={{ minWidth: 0 }}>
            {/* ── 1. En retard ── */}
            <section className="fx-sec">
              <div className="fx-sec-t"><h3 className={nbRetards ? 'rouge' : undefined}>En retard</h3><span className="tot n">{nbRetards}</span></div>
              {nbRetards === 0 && <p className="fx-note">Rien n’est en retard.</p>}
              {b.retards.projets.map(p => (
                <Link key={`p${p.id}`} href={`/projects/${p.id}/essai`} className="fx-traiter">
                  <i style={{ background: N.rouge }} />
                  <span className="quoi"><b>Livraison dépassée</b>{p.responsible && p.responsible !== 'non défini' && <small>{p.responsible}</small>}</span>
                  <span className="projet"><span className="no n">{p.numero}</span> {p.name}</span>
                  <span className="n detail">{dateCourte(p.deadline.slice(0, 10))}</span>
                </Link>
              ))}
              {b.retards.taches.map(t => {
                const p = parId[String(t.project_id)]
                return (
                  <Link key={`t${t.id}`} href={p ? `/projects/${p.id}/essai?dossier=taches` : '/tasks/essai'} className="fx-traiter">
                    <i style={{ background: N.rouge }} />
                    <span className="quoi"><b>{t.title}</b>{t.responsible && <small>{t.responsible}</small>}</span>
                    <span className="projet">{p ? <><span className="no n">{p.numero}</span> {p.name}</> : ''}</span>
                    <span className="n detail">{dateCourte(t.execution_date)}</span>
                  </Link>
                )
              })}
            </section>

            {/* ── 2. D'ici dimanche ── */}
            <section className="fx-sec">
              <div className="fx-sec-t"><h3>D’ici dimanche</h3><span className="tot n">{joursSemaine.reduce((s, j) => s + semaine[j].length, 0)}</span></div>
              {joursSemaine.length === 0 && <p className="fx-note">Rien de prévu d’ici la fin de la semaine.</p>}
              {joursSemaine.map(j => (
                <div key={j} className="fx-reu-jour">
                  <p className="quand"><b>{j === aujourdhui ? 'Aujourd’hui' : JOURS[jours.indexOf(j)]}</b><span className="n">{jourMois(j)}</span></p>
                  <ul>
                    {semaine[j].map(e => (
                      <li key={e.cle}>
                        <span className={`genre ${e.genre}`}>{GENRE[e.genre]}</span>
                        <span>{e.genre === 'agenda' ? `${e.titre}${e.demi ? `, ${e.demi === 'pm' ? 'après-midi' : 'matin'}` : ''}` : e.titre}</span>
                        {e.projet && <Link href={`/projects/${e.projet.id}/essai`}><span className="no n">{e.projet.numero}</span> {e.projet.nom}</Link>}
                        {e.qui && <small>{e.qui}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            {/* ── 3. Ce qu'on attend ── */}
            <section className="fx-sec">
              <div className="fx-sec-t"><h3>Ce qu’on attend de l’extérieur</h3><span className="tot n">{nbExterieur}</span></div>
              {nbExterieur === 0 && <p className="fx-note">Aucune commande ni sous-traitance en cours.</p>}
              {b.sousTraitances.pretes.length > 0 && <h4 className="fx-reu-h4">Prêt à récupérer</h4>}
              {b.sousTraitances.pretes.map(t => <SousTraitance key={t.id} t={t} moi={moi} responsables={personnes} onMaj={majLocale} onAjout={ajoutLocal} onRetrait={retraitLocal} />)}
              {b.commandes.length > 0 && <h4 className="fx-reu-h4">Commandes</h4>}
              {b.commandes.map(t => <Commande key={t.id} t={t} moi={moi} responsables={personnes} onMaj={majLocale} onRetrait={retraitLocal} />)}
              {b.sousTraitances.chez.length > 0 && <h4 className="fx-reu-h4">Chez le sous-traitant</h4>}
              {b.sousTraitances.chez.map(t => <SousTraitance key={t.id} t={t} moi={moi} responsables={personnes} onMaj={majLocale} onAjout={ajoutLocal} onRetrait={retraitLocal} />)}
            </section>

            {/* ── 4. Projet par projet ── */}
            <section className="fx-sec">
              <div className="fx-sec-t"><h3>Projet par projet</h3><span className="tot n">{b.chiffres.actifs}</span></div>
              {b.statuts.map(g => (
                <div key={g.cle} className="fx-reu-statut">
                  <h4 className="fx-reu-h4">{g.nom} <span className="n">{g.projets.length}</span></h4>
                  {g.projets.map(p => <Projet key={p.id} p={p} resume={b.parProjet[String(p.id)]} aujourdhui={aujourdhui} />)}
                </div>
              ))}
            </section>
          </div>

          <aside className="fx-recap">
            <p className="label">Le point</p>
            <p className="grand n">{pluriel(b.chiffres.actifs, 'projet')}</p>
            <dl>
              <dt>Livraisons dans 7 jours</dt><dd className="n">{b.chiffres.livraisons}</dd>
              <dt>En retard</dt><dd className={`n${b.chiffres.retard ? ' rouge' : ''}`}>{b.chiffres.retard}</dd>
              <dt>Commandes attendues</dt><dd className="n">{b.chiffres.commandes}</dd>
              <dt>Sous-traitances</dt><dd className="n">{b.chiffres.sousTraitances}</dd>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  )
}
