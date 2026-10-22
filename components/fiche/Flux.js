// Commandes et sous-traitances dans le dossier Tâches de la nouvelle fiche.
//
// Ce ne sont pas des tâches comme les autres : une commande se RÉCEPTIONNE et
// se range, une sous-traitance passe de chez le sous-traitant à « prête » (une
// tâche de récupération naît pour Arnaud) puis à l'atelier. Les corps de
// requête viennent de lib/commandes.js et lib/sousTraitance.js.
import { useState } from 'react'
import AutocompleteInput from '../AutocompleteInput'
import { useSuggestions } from '../../lib/useSuggestions'
import { dateDuJour } from '../../lib/aujourdhui'
import { dateCourte } from '../../lib/fiche'
import { champsCommande, majCommande, nouvelleCommande, receptionCommande, rouvrirCommande, LIEUX_RANGEMENT } from '../../lib/commandes'
import {
  champsSousTraitance, majSousTraitance, nouvelleSousTraitance, etatSousTraitance,
  tacheRecuperation, pretARecuperer, recupere, rouvrirSousTraitance,
} from '../../lib/sousTraitance'

async function appel(moi, url, method, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-actor': moi }, body: body ? JSON.stringify(body) : undefined })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.error) throw new Error(d.error || `erreur ${r.status}`)
  return d
}
const supprimer = (moi, id) => fetch(`/api/tasks/${id}`, { method: 'DELETE', headers: { 'x-actor': moi } })

// Un responsable absent de la liste (ancien collaborateur) laisserait le menu
// vide et le réassignerait en douce : on le garde en tête.
const choixResponsables = (liste, actuel) => (!actuel || liste.includes(actuel) ? liste : [actuel, ...liste])

function Rangement({ onValider, onAnnuler, enCours }) {
  const suggestions = useSuggestions('storage')
  const [libre, setLibre] = useState('')
  const autres = suggestions.filter(s => !LIEUX_RANGEMENT.includes(s))
  return (
    <div className="fx-form-rdv">
      <span className="fx-etiquette">Rangé où ?</span>
      <div className="fx-puces">
        {[...LIEUX_RANGEMENT, ...autres].map(l => <button key={l} disabled={enCours} onClick={() => onValider(l)}>{l}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="fx-champ" style={{ maxWidth: 280 }} placeholder="Autre lieu" value={libre} onChange={e => setLibre(e.target.value)} />
        <button className="fx-btn p" disabled={enCours || !libre.trim()} onClick={() => onValider(libre.trim())}>Valider</button>
        <button className="fx-btn g" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  )
}

// ── Commandes ───────────────────────────────────────────────────────────────

export function FormCommande({ tache, projetId, moi, responsables, onFait, onAnnuler }) {
  const [f, setF] = useState(() => tache ? champsCommande(tache) : { article: '', quantity: '', vendor: '', order_date: '', expected_date: '', responsible: moi || 'non défini' })
  const [enCours, setEnCours] = useState(false)
  const vendeurs = useSuggestions('vendor')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  async function valider() {
    if (!f.article.trim()) return
    setEnCours(true)
    try {
      const d = tache
        ? await appel(moi, `/api/tasks/${tache.id}`, 'PUT', { prev_status: tache.status, ...majCommande(tache, f) })
        : await appel(moi, '/api/tasks', 'POST', nouvelleCommande(f, projetId))
      onFait(d)
    } catch (e) { alert(`Enregistrement impossible : ${e.message}`) } finally { setEnCours(false) }
  }
  return (
    <div className="fx-form-rdv">
      <label><span className="fx-etiquette">Article</span><input autoFocus className="fx-champ" placeholder="Vis M6 inox" value={f.article} onChange={e => set('article', e.target.value)} /></label>
      <div className="deux">
        <label><span className="fx-etiquette">Quantité</span><input className="fx-champ" value={f.quantity} onChange={e => set('quantity', e.target.value)} /></label>
        <label><span className="fx-etiquette">Fournisseur</span><AutocompleteInput value={f.vendor} onChange={v => set('vendor', v)} suggestions={vendeurs} className="fx-champ" /></label>
      </div>
      <div className="deux">
        <label><span className="fx-etiquette">Commandé le</span><input type="date" className="fx-champ" value={f.order_date} onChange={e => set('order_date', e.target.value)} /></label>
        <label><span className="fx-etiquette">Réception prévue</span><input type="date" className="fx-champ" value={f.expected_date} onChange={e => set('expected_date', e.target.value)} /></label>
      </div>
      <label><span className="fx-etiquette">Responsable</span>
        <select className="fx-champ" value={f.responsible} onChange={e => set('responsible', e.target.value)}>
          {choixResponsables(responsables, f.responsible).map(r => <option key={r} value={r}>{r}</option>)}
        </select></label>
      <div className="fx-actions">
        <button className="fx-btn p" onClick={valider} disabled={enCours || !f.article.trim()}>{enCours ? 'Enregistrement…' : tache ? 'Enregistrer' : 'Ajouter la commande'}</button>
        <button className="fx-btn g" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  )
}

export function Commande({ t, moi, responsables, onMaj, onRetrait }) {
  const d = t.category_data || {}
  const recue = t.status === 'completed' || !!d.received_at
  const [mode, setMode] = useState(null)        // 'modifier' | 'ranger'
  const [enCours, setEnCours] = useState(false)
  async function faire(corps) {
    setEnCours(true)
    try { onMaj(await appel(moi, `/api/tasks/${t.id}`, 'PUT', corps)); setMode(null) }
    catch (e) { alert(`Impossible : ${e.message}`) } finally { setEnCours(false) }
  }
  async function retirer() {
    if (!confirm(`Supprimer la commande « ${t.title} » ?`)) return
    await supprimer(moi, t.id); onRetrait(t.id)
  }
  if (mode === 'modifier') return <FormCommande tache={t} moi={moi} responsables={responsables} onFait={x => { onMaj(x); setMode(null) }} onAnnuler={() => setMode(null)} />
  const details = [
    d.quantity, d.vendor,
    d.order_date && `commandé le ${dateCourte(d.order_date)}`,
    !recue && d.expected_date && `attendu le ${dateCourte(d.expected_date)}`,
    recue && d.received_at && `reçu le ${dateCourte(d.received_at)}${d.received_by ? ` par ${d.received_by}` : ''}`,
    recue && d.storage_location && `rangé : ${d.storage_location}`,
  ].filter(Boolean).join(' · ')
  return (
    <>
      <div className={`fx-tache${recue ? ' faite' : ''}`}>
        <span className="fx-etat-pt" style={{ background: recue ? '#1b8a5a' : '#c3c7cf' }} />
        <span style={{ minWidth: 0 }}>
          <button className="titre" onClick={() => setMode('modifier')}>{t.title}</button>
          <small>{details || t.responsible}</small>
        </span>
        <span className="fx-gestes">
          {recue
            ? <button className="fx-lien" onClick={() => faire(rouvrirCommande(t))} disabled={enCours}>Annuler la réception</button>
            : <button className="fx-btn p petit" onClick={() => setMode('ranger')} disabled={enCours}>Réceptionnée</button>}
          <button className="fx-lien gris" onClick={retirer}>Supprimer</button>
        </span>
      </div>
      {mode === 'ranger' && <Rangement enCours={enCours} onAnnuler={() => setMode(null)}
        onValider={lieu => faire(receptionCommande(t, { lieu, qui: moi, jour: dateDuJour() }))} />}
    </>
  )
}

// ── Sous-traitance ──────────────────────────────────────────────────────────

export function FormSousTraitance({ tache, projetId, moi, responsables, onFait, onAnnuler }) {
  const [f, setF] = useState(() => tache ? champsSousTraitance(tache) : { title: '', subcontractor: '', drop_date: '', expected_pickup_date: '', responsible: moi || 'non défini' })
  const [enCours, setEnCours] = useState(false)
  const sousTraitants = useSuggestions('subcontractor')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  async function valider() {
    if (!f.title.trim()) return
    setEnCours(true)
    try {
      const d = tache
        ? await appel(moi, `/api/tasks/${tache.id}`, 'PUT', { prev_status: tache.status, ...majSousTraitance(tache, f) })
        : await appel(moi, '/api/tasks', 'POST', nouvelleSousTraitance(f, projetId))
      onFait(d)
    } catch (e) { alert(`Enregistrement impossible : ${e.message}`) } finally { setEnCours(false) }
  }
  return (
    <div className="fx-form-rdv">
      <label><span className="fx-etiquette">Que sous-traiter ?</span><input autoFocus className="fx-champ" placeholder="Découpe panneaux" value={f.title} onChange={e => set('title', e.target.value)} /></label>
      <label><span className="fx-etiquette">Sous-traitant</span><AutocompleteInput value={f.subcontractor} onChange={v => set('subcontractor', v)} suggestions={sousTraitants} className="fx-champ" /></label>
      <div className="deux">
        <label><span className="fx-etiquette">Dépose</span><input type="date" className="fx-champ" value={f.drop_date} onChange={e => set('drop_date', e.target.value)} /></label>
        <label><span className="fx-etiquette">Récupération prévue</span><input type="date" className="fx-champ" value={f.expected_pickup_date} onChange={e => set('expected_pickup_date', e.target.value)} /></label>
      </div>
      <label><span className="fx-etiquette">Responsable</span>
        <select className="fx-champ" value={f.responsible} onChange={e => set('responsible', e.target.value)}>
          {choixResponsables(responsables, f.responsible).map(r => <option key={r} value={r}>{r}</option>)}
        </select></label>
      <div className="fx-actions">
        <button className="fx-btn p" onClick={valider} disabled={enCours || !f.title.trim()}>{enCours ? 'Enregistrement…' : tache ? 'Enregistrer' : 'Ajouter la sous-traitance'}</button>
        <button className="fx-btn g" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  )
}

const ETATS = { chez: { mot: 'Chez le sous-traitant', couleur: '#c3c7cf' }, pret: { mot: 'Prête à récupérer', couleur: '#c47a00' }, atelier: { mot: 'À l’atelier', couleur: '#1b8a5a' } }

export function SousTraitance({ t, moi, responsables, onMaj, onAjout, onRetrait }) {
  const d = t.category_data || {}
  const etat = etatSousTraitance(t)
  const [mode, setMode] = useState(null)
  const [enCours, setEnCours] = useState(false)

  async function prete() {
    setEnCours(true)
    try {
      const recup = await appel(moi, '/api/tasks', 'POST', tacheRecuperation(t, dateDuJour()))
      onMaj(await appel(moi, `/api/tasks/${t.id}`, 'PUT', pretARecuperer(t, { qui: moi, jour: dateDuJour(), recuperationId: recup?.id })))
      if (recup?.id) onAjout(recup)
    } catch (e) { alert(`Impossible : ${e.message}`) } finally { setEnCours(false) }
  }
  async function aLAtelier(lieu) {
    setEnCours(true)
    try {
      onMaj(await appel(moi, `/api/tasks/${t.id}`, 'PUT', recupere(t, { lieu, qui: moi, jour: dateDuJour() })))
      // La tâche de récupération liée est faite, elle aussi. Supprimée entre-
      // temps, elle n'empêche rien.
      if (d.pickup_task_id) {
        try { onMaj(await appel(moi, `/api/tasks/${d.pickup_task_id}`, 'PUT', { status: 'completed', prev_status: 'active' })) } catch { /* non bloquant */ }
      }
      setMode(null)
    } catch (e) { alert(`Impossible : ${e.message}`) } finally { setEnCours(false) }
  }
  async function rouvrir() {
    setEnCours(true)
    try {
      if (d.pickup_task_id) { await supprimer(moi, d.pickup_task_id).catch(() => {}); onRetrait(d.pickup_task_id) }
      onMaj(await appel(moi, `/api/tasks/${t.id}`, 'PUT', rouvrirSousTraitance(t)))
    } catch (e) { alert(`Impossible : ${e.message}`) } finally { setEnCours(false) }
  }
  async function retirer() {
    if (!confirm(`Supprimer la sous-traitance « ${t.title} » ?`)) return
    if (d.pickup_task_id) { await supprimer(moi, d.pickup_task_id).catch(() => {}); onRetrait(d.pickup_task_id) }
    await supprimer(moi, t.id); onRetrait(t.id)
  }

  if (mode === 'modifier') return <FormSousTraitance tache={t} moi={moi} responsables={responsables} onFait={x => { onMaj(x); setMode(null) }} onAnnuler={() => setMode(null)} />
  const details = [
    ETATS[etat].mot, d.subcontractor,
    d.drop_date && `déposé le ${dateCourte(d.drop_date)}`,
    etat === 'chez' && d.expected_pickup_date && `récupération prévue le ${dateCourte(d.expected_pickup_date)}`,
    etat === 'pret' && d.ready_at && `prête depuis le ${dateCourte(d.ready_at)}`,
    etat === 'atelier' && d.picked_up_at && `à l’atelier le ${dateCourte(d.picked_up_at)}${d.picked_up_by ? ` (${d.picked_up_by})` : ''}`,
    etat === 'atelier' && d.storage_location && `rangée : ${d.storage_location}`,
  ].filter(Boolean).join(' · ')
  return (
    <>
      <div className={`fx-tache${etat === 'atelier' ? ' faite' : ''}`}>
        <span className="fx-etat-pt" style={{ background: ETATS[etat].couleur }} />
        <span style={{ minWidth: 0 }}>
          <button className="titre" onClick={() => setMode('modifier')}>{t.title}</button>
          <small>{details}</small>
        </span>
        <span className="fx-gestes">
          {etat === 'chez' && <button className="fx-btn p petit" onClick={prete} disabled={enCours}>{enCours ? '…' : 'Prête à récupérer'}</button>}
          {etat === 'pret' && <button className="fx-btn p petit" onClick={() => setMode('ranger')} disabled={enCours}>À l’atelier</button>}
          {etat === 'atelier' && <button className="fx-lien" onClick={rouvrir} disabled={enCours}>Annuler</button>}
          <button className="fx-lien gris" onClick={retirer}>Supprimer</button>
        </span>
      </div>
      {mode === 'ranger' && <Rangement enCours={enCours} onAnnuler={() => setMode(null)} onValider={aLAtelier} />}
    </>
  )
}
