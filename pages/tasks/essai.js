// Tâches — proposition dans le nouveau style, à côté de la page actuelle
// (/tasks). Mêmes routes, mêmes données.
//
// On vient ici pour ce qui RESTE à faire : toutes les tâches ouvertes d'un
// coup, sans choisir d'horizon, rangées par date, par projet ou par catégorie.
// Les tâches faites ont leur liste à part, à la demande. Le calcul vit dans
// lib/listeTaches.js.
import { useEffect, useState, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { useRafraichirCompteurs } from '../../lib/swr'
import { useAuth } from '../_app'
import { useResponsibles } from '../../lib/useResponsibles'
import { STYLE_FICHE } from '../../components/fiche/styles'
import TaskFormDrawer from '../../components/TaskFormDrawer'
import { Commande, SousTraitance } from '../../components/fiche/Flux'
import { compterParPersonne, faitesRecemment, filtrer, groupesParCategorie, groupesParDate, groupesParProjet } from '../../lib/listeTaches'
import { dateCourte } from '../../lib/fiche'
import { getCategory } from '../../lib/taskCategories'
import { dateDuJour } from '../../lib/aujourdhui'

const coche = <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>

function memoire(cle, defaut) { try { return localStorage.getItem(cle) || defaut } catch { return defaut } }
function retenir(cle, v) { try { localStorage.setItem(cle, v) } catch { /* navigation privée */ } }

export default function TachesEssai() {
  const { user } = useAuth()
  const moi = user?.name || ''
  const { responsibles } = useResponsibles()
  const aujourdhui = dateDuJour()
  const { data: brutes, mutate: rechargerTaches } = useSWR('/api/tasks')
  // Les badges du rail ne se déduisent plus des listes : une page qui crée,
  // termine ou supprime doit le dire (cf. CLAUDE.md, « la barre latérale
  // compte »). On l'enveloppe une fois plutôt qu'à chacun des appels.
  const rafraichirCompteurs = useRafraichirCompteurs()
  const mutate = useCallback((...a) => { rafraichirCompteurs(); return rechargerTaches(...a) },
    [rechargerTaches, rafraichirCompteurs])
  const { data: projetsBruts } = useSWR('/api/projects?light=1')
  const taches = Array.isArray(brutes) ? brutes : []
  const projets = Array.isArray(projetsBruts) ? projetsBruts : []
  const parId = Object.fromEntries(projets.map(p => [String(p.id), p]))

  const [qui, setQui] = useState(null)              // null tant que l'utilisateur n'est pas connu
  const [rangement, setRangement] = useState('date')
  const [recherche, setRecherche] = useState('')
  const [faites, setFaites] = useState(false)
  const [tiroir, setTiroir] = useState(null)        // { task } ou { categorie }
  useEffect(() => { if (moi && qui === null) setQui(memoire('tachesEssaiQui', moi)) }, [moi, qui])
  useEffect(() => { setRangement(memoire('tachesEssaiRangement', 'date')) }, [])
  const choisirQui = v => { setQui(v); retenir('tachesEssaiQui', v) }
  const choisirRangement = v => { setRangement(v); retenir('tachesEssaiRangement', v) }

  const filtre = qui && qui !== 'tous' ? qui : null
  const ouvertes = filtrer(taches, { qui: filtre, recherche, projets })
  const comptes = compterParPersonne(taches)
  const toutes = Object.values(comptes).reduce((a, b) => a + b, 0)
  const groupes = rangement === 'projet' ? groupesParProjet(ouvertes, projets)
    : rangement === 'categorie' ? groupesParCategorie(ouvertes)
    : groupesParDate(ouvertes, aujourdhui)
  const retards = ouvertes.filter(t => t.execution_date && t.execution_date < aujourdhui).length
  const historique = faitesRecemment(taches, { qui: filtre, aujourdhui })
  const personnes = [...new Set([...responsibles.filter(r => r !== 'non défini'), ...Object.keys(comptes)])]

  const majLocale = t => mutate(taches.map(x => x.id === t.id ? t : x), false)
  const ajoutLocal = t => mutate([...taches, t], false)
  const retraitLocal = id => mutate(taches.filter(x => x.id !== id), false)

  async function basculer(t) {
    const statut = t.status === 'completed' ? 'active' : 'completed'
    const now = new Date().toISOString()
    majLocale({ ...t, status: statut, completed_at: statut === 'completed' ? now : null })
    try {
      const { projects: _p, ...donnees } = t
      await fetch(`/api/tasks/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
        body: JSON.stringify({ ...donnees, status: statut, prev_status: t.status, completed_at: statut === 'completed' ? now : null }) })
    } finally { mutate() }
  }
  async function supprimer(t) {
    if (!confirm(`Supprimer la tâche « ${t.title} » ?`)) return
    retraitLocal(t.id)
    await fetch(`/api/tasks/${t.id}`, { method: 'DELETE', headers: { 'x-actor': moi } })
    mutate()
  }
  async function enregistrer(body, id) {
    const r = await fetch(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
      body: JSON.stringify(id ? { ...tiroir.task, ...body } : body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) { alert(`Enregistrement impossible : ${d.error || `erreur ${r.status}`}`); return }
    setTiroir(null); mutate()
  }

  // Une ligne. Commandes et sous-traitances gardent leurs gestes propres
  // (réceptionner, prête, à l'atelier) — les mêmes que dans la fiche projet.
  function Ligne({ t, groupe = true }) {
    if (t.category === 'commande' && t.status !== 'completed') return <Commande t={t} moi={moi} responsables={responsibles} onMaj={majLocale} onRetrait={retraitLocal} />
    if (t.category === 'sous_traitance' && t.status !== 'completed') return <SousTraitance t={t} moi={moi} responsables={responsibles} onMaj={majLocale} onAjout={ajoutLocal} onRetrait={retraitLocal} />
    const p = parId[String(t.project_id)]
    const montrerProjet = p && !(groupe && rangement === 'projet')
    const faite = t.status === 'completed'
    const retard = !faite && t.execution_date && t.execution_date < aujourdhui
    const echeance = t.due_date && t.due_date !== t.execution_date ? t.due_date : null
    const details = [
      !(groupe && rangement === 'categorie') && t.category ? getCategory(t.category).label : null,
      !filtre && t.responsible ? t.responsible : null,
    ].filter(Boolean).join(' · ')
    return (
      <div className={`fx-tache fx-tache-liste${faite ? ' faite' : ''}`}>
        <button className="fx-case" aria-label={faite ? 'Rouvrir la tâche' : 'Marquer comme faite'} aria-pressed={faite} onClick={() => basculer(t)}>{faite && coche}</button>
        <span style={{ minWidth: 0 }}>
          <button className="titre" onClick={() => setTiroir({ task: t })}>{t.title}</button>
          <small>
            {montrerProjet && <Link href={`/projects/${p.id}/essai`} className="lien-projet"><span className="n">{p.numero}</span> {p.name}</Link>}
            {montrerProjet && details && ' · '}
            {details}
          </small>
        </span>
        <span className="droite">
          {t.execution_date && <span className={`quand n${retard ? ' rouge' : ''}`}>{retard ? `${dateCourte(t.execution_date)}, en retard` : dateCourte(t.execution_date)}</span>}
          {echeance && <small className="n">échéance {dateCourte(echeance)}</small>}
          <button className="fx-lien gris" onClick={() => supprimer(t)}>Supprimer</button>
        </span>
      </div>
    )
  }

  const resume = [
    `${ouvertes.length} ouverte${ouvertes.length > 1 ? 's' : ''}${filtre ? ` pour ${filtre === moi ? 'toi' : filtre}` : ''}`,
    retards ? `${retards} en retard` : null,
    `${historique.length} faite${historique.length > 1 ? 's' : ''} ces 30 jours`,
  ].filter(Boolean)

  return (
    <div className="fx">
      <Head><title>Tâches — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <h1>Tâches</h1>
            <p className="fx-resume-liste">{resume.map((r, i) => <span key={i} className={i === 1 && retards ? 'rouge' : undefined}>{r}</span>)}</p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/tasks" style={{ textDecoration: 'none' }}>Ancienne page</a>
            <button className="fx-btn p" onClick={() => setTiroir({ categorie: null })}>Nouvelle tâche</button>
          </div>
        </header>

        <div className="fx-filtres">
          <label className="fx-cherche">
            <svg className="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Tâche ou projet…" aria-label="Chercher une tâche" />
          </label>
          <span className="fx-pastilles" role="group" aria-label="Pour qui">
            <button aria-pressed={qui === 'tous'} onClick={() => choisirQui('tous')}>Toute l’équipe <span className="n">{toutes}</span></button>
            {personnes.map(n => (
              <button key={n} aria-pressed={qui === n} onClick={() => choisirQui(n)}>{n === moi ? `${n} (moi)` : n} <span className="n">{comptes[n] || 0}</span></button>
            ))}
          </span>
          <span className="fx-seg" role="group" aria-label="Ranger par">
            <button aria-pressed={rangement === 'date'} onClick={() => choisirRangement('date')}>Par date</button>
            <button aria-pressed={rangement === 'projet'} onClick={() => choisirRangement('projet')}>Par projet</button>
            <button aria-pressed={rangement === 'categorie'} onClick={() => choisirRangement('categorie')}>Par catégorie</button>
          </span>
        </div>

        {!brutes && <p className="fx-note" style={{ marginTop: 40 }}>Chargement…</p>}
        {brutes && ouvertes.length === 0 && (
          <div className="fx-vide" style={{ marginTop: 48 }}>
            <h3>{recherche ? `Aucune tâche ouverte ne répond à « ${recherche} ».` : filtre ? `Rien à faire pour ${filtre === moi ? 'toi' : filtre}.` : 'Rien à faire pour l’équipe.'}</h3>
            {filtre && toutes > 0 && <p>{toutes} tâche{toutes > 1 ? 's' : ''} ouverte{toutes > 1 ? 's' : ''} dans l’équipe. <button className="fx-lien" onClick={() => choisirQui('tous')}>Voir toute l’équipe</button></p>}
          </div>
        )}

        <div className="fx-liste-taches">
          {groupes.map(g => (
            <section key={g.cle} className="fx-groupe-liste">
              <h2 className={g.cle === 'retard' ? 'rouge' : undefined}>
                {g.numero != null ? <><span className="no n">{g.numero}</span> {g.projetId ? <Link href={`/projects/${g.projetId}/essai`} style={{ color: 'inherit' }}>{g.nom}</Link> : g.nom}</> : g.nom}
                <span className="n">{g.taches.length}</span>
              </h2>
              {g.taches.map(t => <Ligne key={t.id} t={t} />)}
            </section>
          ))}

          <section className="fx-groupe-liste">
            <div className="fx-ajouts">
              <button className="fx-lien" onClick={() => setFaites(v => !v)}>{faites ? 'Masquer les tâches faites' : `Voir les tâches faites ces 30 jours (${historique.length})`}</button>
            </div>
            {faites && historique.map(t => <Ligne key={t.id} t={t} groupe={false} />)}
          </section>
        </div>
      </div>

      {tiroir && <TaskFormDrawer task={tiroir.task} currentUser={moi} projects={projets.filter(p => p.status === 'active')} defaultCategory={tiroir.categorie}
        onSave={enregistrer} onClose={() => setTiroir(null)} />}
    </div>
  )
}
