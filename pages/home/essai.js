// Accueil — proposition dans le nouveau style, à côté de l'accueil actuel
// (/home). Plus de Google Agenda : la semaine se lit dans ce que Maze sait
// déjà — livraisons, dates sur place, agenda de l'atelier, tâches datées.
//
// Trois questions, dans l'ordre où on se les pose le matin : que se passe-t-il
// cette semaine, qu'est-ce qui attend quelqu'un, qu'est-ce qui est sur
// l'établi. Le calcul vit dans lib/accueil.js.
import { useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import { STYLE_FICHE } from '../../components/fiche/styles'
import TaskFormDrawer from '../../components/TaskFormDrawer'
import { aTraiter, decaler, evenementsParJour, joursDeLaSemaine, mesTaches, surLEtabli } from '../../lib/accueil'
import { STATUTS, dateCourte, delai, livraisonEnRetard, statutProjet } from '../../lib/fiche'
import { JOURS_TRAVAILLES } from '../../lib/joursOuvres'
import { dateDuJour } from '../../lib/aujourdhui'

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const GENRE = {
  livraison: { mot: 'Livraison', couleur: '#c4152b' },
  surplace: { mot: 'Sur place', couleur: '#1f2de6' },
  agenda: { mot: 'Agenda', couleur: '#111318' },
  tache: { mot: 'Tâche', couleur: '#9aa0a9' },
}
const COULEUR_TRAITER = { retard: '#c4152b', facturer: '#1b8a5a', offre: '#1f2de6' }

function numeroSemaine(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
}
const jourMois = iso => `${Number(iso.slice(8))} ${MOIS[Number(iso.slice(5, 7)) - 1]}`

function Evenement({ e }) {
  const g = GENRE[e.genre]
  const contenu = (
    <>
      <span className="genre"><i style={{ background: g.couleur }} />{e.genre === 'agenda' ? `${e.titre}${e.demi ? `, ${e.demi === 'pm' ? 'après-midi' : 'matin'}` : ''}` : e.titre}</span>
      {e.projet && <b><span className="no n">{e.projet.numero}</span> {e.projet.nom}</b>}
      {e.qui && <small>{e.qui}</small>}
    </>
  )
  return e.projet
    ? <Link href={`/projects/${e.projet.id}/essai`} className={`fx-ev ${e.genre}`}>{contenu}</Link>
    : <div className={`fx-ev ${e.genre}`}>{contenu}</div>
}

const coche = <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>

export default function AccueilEssai() {
  const { user } = useAuth()
  const moi = user?.name || ''
  const isAdmin = useIsAdmin()
  const aujourdhui = dateDuJour()
  const [decalage, setDecalage] = useState(0)
  const [tiroir, setTiroir] = useState(null)
  const [toutesOffres, setToutesOffres] = useState(false)
  const jours = joursDeLaSemaine(aujourdhui, decalage)

  const { data: projetsBruts } = useSWR('/api/projects?light=1')
  const { data: tachesBrutes, mutate: rechargerTaches } = useSWR('/api/tasks')
  const { data: agendaBrut } = useSWR(`/api/agenda?from=${jours[0]}&to=${jours[6]}`)
  const { data: facturesBrutes } = useSWR(isAdmin ? '/api/customer-invoices' : null)
  const projets = Array.isArray(projetsBruts) ? projetsBruts : []
  const taches = Array.isArray(tachesBrutes) ? tachesBrutes : []
  const agenda = Array.isArray(agendaBrut) ? agendaBrut : []
  const factures = useMemo(() => (isAdmin && Array.isArray(facturesBrutes) ? new Set(facturesBrutes.map(f => String(f.project_id))) : null), [isAdmin, facturesBrutes])

  const parJour = evenementsParJour({ projets, taches, agenda, debut: jours[0], fin: jours[6] })
  // Une semaine vide n'est pas une impasse : on dit ce qui vient ensuite (90
  // jours, sans l'agenda, qui n'est chargé que pour la semaine affichée).
  const semaineVide = !Object.keys(parJour).length
  const prochain = useMemo(() => {
    if (!semaineVide) return null
    const plusLoin = evenementsParJour({ projets, taches, agenda: [], debut: decaler(jours[6], 1), fin: decaler(jours[6], 90) })
    const d = Object.keys(plusLoin).sort()[0]
    return d ? { date: d, e: plusLoin[d][0], n: plusLoin[d].length } : null
  }, [semaineVide, projets, taches, jours])
  const allerA = d => {
    const lundiCible = joursDeLaSemaine(d)[0], lundiAuj = joursDeLaSemaine(aujourdhui)[0]
    const [a, b] = [lundiCible, lundiAuj].map(x => Date.UTC(...x.split('-').map((v, i) => (i === 1 ? v - 1 : +v))))
    setDecalage(Math.round((a - b) / (7 * 86400000)))
  }
  const attente = aTraiter({ projets, taches, factures, aujourdhui })
  // Les offres à faire sont souvent nombreuses : les trois premières suffisent
  // pour savoir qu'il y en a, elles ne doivent pas noyer un retard.
  const offres = attente.filter(a => a.genre === 'offre')
  const visibles = toutesOffres ? attente : [...attente.filter(a => a.genre !== 'offre'), ...offres.slice(0, 3)]
  const etabli = surLEtabli(projets, factures || new Set())
  const mes = mesTaches(taches, moi, aujourdhui)
  const nbMes = mes.retard.length + mes.jour.length + mes.semaine.length + mes.plusTard.length

  const [y, m, d] = aujourdhui.split('-').map(Number)
  const jourSemaine = JOURS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]
  const titreSemaine = decalage === 0 ? 'Cette semaine' : decalage === 1 ? 'Semaine prochaine' : decalage === -1 ? 'Semaine passée' : `Semaine ${numeroSemaine(jours[0])}`

  async function basculer(t) {
    const statut = t.status === 'completed' ? 'active' : 'completed'
    const now = new Date().toISOString()
    rechargerTaches(taches.map(x => x.id === t.id ? { ...x, status: statut, completed_at: statut === 'completed' ? now : null } : x), false)
    try {
      const { projects: _p, ...donnees } = t
      await fetch(`/api/tasks/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
        body: JSON.stringify({ ...donnees, status: statut, prev_status: t.status, completed_at: statut === 'completed' ? now : null }) })
    } finally { rechargerTaches() }
  }
  async function creerTache(body) {
    const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-actor': moi }, body: JSON.stringify(body) })
    const d2 = await r.json()
    if (!r.ok || d2.error) { alert(`Création impossible : ${d2.error || `erreur ${r.status}`}`); return }
    setTiroir(null); rechargerTaches()
  }

  const projetDe = t => projets.find(p => String(p.id) === String(t.project_id))
  const Tache = ({ t }) => {
    const p = projetDe(t)
    const retard = t.execution_date && t.execution_date < aujourdhui
    return (
      <div className="fx-tache">
        <button className="fx-case" aria-label="Marquer comme faite" onClick={() => basculer(t)}>{t.status === 'completed' && coche}</button>
        <span style={{ minWidth: 0 }}>
          <span>{t.title}</span>
          {p && <small><Link href={`/projects/${p.id}/essai`} style={{ color: 'inherit' }}>{p.numero} {p.name}</Link></small>}
        </span>
        {t.execution_date && <span className={`quand n${retard ? ' rouge' : ''}`}>{dateCourte(t.execution_date)}</span>}
      </div>
    )
  }
  const GroupeTaches = ({ titre, liste }) => liste.length > 0 && (
    <div className="fx-mes-groupe"><h3>{titre} <span className="n">{liste.length}</span></h3>{liste.map(t => <Tache key={t.id} t={t} />)}</div>
  )

  return (
    <div className="fx">
      <Head><title>Accueil — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <h1>Bonjour{moi ? ` ${moi}` : ''}</h1>
            <p className="fx-resume-liste"><span>{jourSemaine[0].toUpperCase() + jourSemaine.slice(1)} {jourMois(aujourdhui)}</span><span>semaine {numeroSemaine(aujourdhui)}</span></p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/home" style={{ textDecoration: 'none' }}>Ancien accueil</a>
            <Link className="fx-btn g" href="/projects/essai" style={{ textDecoration: 'none' }}>Projets</Link>
            <button className="fx-btn p" onClick={() => setTiroir({})}>Nouvelle tâche</button>
          </div>
        </header>

        {/* ── La semaine ── */}
        <section className="fx-semaine-bloc">
          <div className="fx-sec-t">
            <h2>{titreSemaine} <span className="dates">{jourMois(jours[0])} – {jourMois(jours[6])}</span></h2>
            <span className="fx-seg" role="group" aria-label="Changer de semaine">
              <button aria-label="Semaine précédente" onClick={() => setDecalage(x => x - 1)}>‹</button>
              <button aria-pressed={decalage === 0} onClick={() => setDecalage(0)}>Aujourd’hui</button>
              <button aria-label="Semaine suivante" onClick={() => setDecalage(x => x + 1)}>›</button>
            </span>
          </div>
          <div className="fx-semaine">
            {jours.map((j, i) => {
              const ev = parJour[j] || []
              const travaille = JOURS_TRAVAILLES.includes((i + 1) % 7)
              return (
                <div key={j} className={`fx-jour${j === aujourdhui ? ' auj' : ''}${j < aujourdhui ? ' passe' : ''}${!travaille ? ' ferme' : ''}${ev.length ? '' : ' vide'}`}>
                  <p className="tete"><span>{JOURS[i].slice(0, 3)}.</span><b className="n">{Number(j.slice(8))}</b></p>
                  {!travaille && !ev.length && <p className="rien">{i === 2 ? 'Pas d’atelier' : '—'}</p>}
                  {travaille && !ev.length && <p className="rien">Rien de prévu</p>}
                  {ev.map(e => <Evenement key={e.cle} e={e} />)}
                </div>
              )
            })}
          </div>
          {semaineVide && (
            <p className="fx-prochain">
              {prochain
                ? <>Rien cette semaine. Prochain : <b className="n">{jourMois(prochain.date)}</b>, {prochain.e.titre.toLowerCase()}{prochain.e.projet ? <> de <b>{prochain.e.projet.numero} {prochain.e.projet.nom}</b></> : ''}{prochain.n > 1 ? ` et ${prochain.n - 1} autre${prochain.n > 2 ? 's' : ''}` : ''}. <button className="fx-lien" onClick={() => allerA(prochain.date)}>Voir cette semaine</button></>
                : 'Rien cette semaine, ni dans les trois mois qui viennent.'}
            </p>
          )}
          <p className="fx-legende">
            {Object.values(GENRE).map(g => <span key={g.mot}><i style={{ background: g.couleur }} />{g.mot}</span>)}
          </p>
        </section>

        <div className="fx-offre" style={{ marginTop: 72 }}>
          <div style={{ minWidth: 0 }}>
            {/* ── À traiter ── */}
            <section className="fx-sec">
              <div className="fx-sec-t"><h3>À traiter</h3><span className="tot n">{attente.length}</span></div>
              {attente.length === 0 && <p className="fx-note">Rien n’attend personne.</p>}
              <div>
                {visibles.map(a => (
                  <Link key={a.cle} href={a.projet ? `/projects/${a.projet.id}/essai${a.genre === 'offre' ? '?dossier=offre' : ''}` : '/tasks/essai'} className="fx-traiter">
                    <i style={{ background: COULEUR_TRAITER[a.genre] }} />
                    <span className="quoi"><b>{a.titre}</b>{a.qui && <small>{a.qui}</small>}</span>
                    <span className="projet">{a.projet ? <><span className="no n">{a.projet.numero}</span> {a.projet.nom}</> : ''}</span>
                    <span className="n detail">{a.detail ? (a.genre === 'offre' ? `livraison ${dateCourte(a.detail)}` : dateCourte(a.detail)) : ''}</span>
                  </Link>
                ))}
              </div>
              {offres.length > 3 && (
                <div className="fx-ajouts"><button className="fx-lien" onClick={() => setToutesOffres(v => !v)}>
                  {toutesOffres ? 'Ne montrer que trois offres à faire' : `Voir les ${offres.length - 3} autres offres à faire`}
                </button></div>
              )}
            </section>

            {/* ── Sur l'établi ── */}
            <section className="fx-sec">
              <div className="fx-sec-t"><h3>Sur l’établi</h3><span className="tot n">{etabli.length}</span></div>
              {etabli.length === 0 && <p className="fx-note">Aucun projet accepté en cours.</p>}
              <div>
                {etabli.map(p => {
                  const s = statutProjet(p, factures?.has(String(p.id)))
                  const rang = STATUTS.findIndex(e => e.cle === s)
                  const dl = p.deadline ? p.deadline.slice(0, 10) : null
                  const retard = livraisonEnRetard(p, aujourdhui)
                  return (
                    <Link key={p.id} href={`/projects/${p.id}/essai`} className="fx-etabli">
                      <span className="no n">{p.numero}</span>
                      <span className="nom"><b>{p.name}</b><small>{p.client}</small></span>
                      <span className={`livraison${retard ? ' rouge' : ''}`}>{dl ? <><b className="n">{dateCourte(dl)}</b><small>{retard ? 'en retard' : delai(dl, aujourdhui)}</small></> : <small>Pas de date</small>}</span>
                      <span className="statut">
                        <span className="fx-mini" aria-hidden="true">{STATUTS.map((e, i) => <i key={e.cle} className={i < rang ? 'fait' : i === rang ? 'ici' : ''} />)}</span>
                        <span>{STATUTS[rang]?.nom}</span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          </div>

          {/* ── Mes tâches ── */}
          <aside className="fx-recap fx-mes">
            <div className="fx-sec-t"><h3>Mes tâches</h3><span className="tot n">{nbMes}</span></div>
            {nbMes === 0 && <p className="fx-note">Aucune tâche ouverte à ton nom.</p>}
            <GroupeTaches titre="En retard" liste={mes.retard} />
            <GroupeTaches titre="Aujourd’hui" liste={mes.jour} />
            <GroupeTaches titre="Cette semaine" liste={mes.semaine} />
            <GroupeTaches titre="Plus tard" liste={mes.plusTard} />
            <div className="fx-ajouts"><Link className="fx-lien" href="/tasks/essai">Toutes les tâches →</Link></div>
          </aside>
        </div>
      </div>

      {tiroir && <TaskFormDrawer currentUser={moi} projects={projets.filter(p => p.status === 'active')} onSave={creerTache} onClose={() => setTiroir(null)} />}
    </div>
  )
}
