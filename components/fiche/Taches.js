// Dossier « Tâches » de la nouvelle fiche : les tâches par catégorie et, en
// tête, les dates sur place.
//
// La logistique n'a plus sa colonne à part. Un montage EST une chose à faire,
// datée : il se lit avec le reste, dans l'ordre où il arrive. Les données ne
// changent pas pour autant — les points restent dans `logistics_data`, et la
// page continue d'en tirer une tâche par personne assignée.
import { useState } from 'react'
import AddressInput, { mapsDirectionsUrl, mapsViewUrl } from '../AddressInput'
import { TASK_CATEGORIES } from '../../lib/taskCategories'
import { genLogUid, parseTimeRange, combineTime, fmtTimeDisplay } from '../../lib/projectHelpers'
import { dateCourte, enRetard, listeNoms } from '../../lib/fiche'

const coche = <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>

function Tache({ t, aujourdhui, onBasculer, onEditer, onSupprimer }) {
  const faite = t.status === 'completed'
  const retard = enRetard(t, aujourdhui)
  return (
    <div className={`fx-tache${faite ? ' faite' : ''}`}>
      <button className="fx-case" aria-label={faite ? 'Rouvrir la tâche' : 'Marquer comme faite'} aria-pressed={faite} onClick={() => onBasculer(t)}>{faite && coche}</button>
      <span style={{ minWidth: 0 }}>
        <button className="titre" onClick={() => onEditer(t)}>{t.title}</button>
        <small>{[t.responsible, t.notes && t.notes.split('\n')[0]].filter(Boolean).join(' · ')}</small>
      </span>
      <span style={{ display: 'grid', justifyItems: 'end', gap: 2 }}>
        {t.execution_date && <span className={`quand n${retard ? ' rouge' : ''}`}>{retard ? `${dateCourte(t.execution_date)}, en retard` : dateCourte(t.execution_date)}</span>}
        <button className="fx-lien" style={{ fontSize: 14, fontWeight: 500, color: '#5f6672' }} onClick={() => onSupprimer(t)}>Supprimer</button>
      </span>
    </div>
  )
}

// ── Un point logistique : lecture, puis formulaire en place ─────────────────

function FormulaireRdv({ point, types, personnes, vehicules, onValider, onAnnuler }) {
  const [p, setP] = useState(point)
  const set = (k, v) => setP(x => ({ ...x, [k]: v }))
  const h = parseTimeRange(p.time || '')
  const assignes = Array.isArray(p.assignees) ? p.assignees : []
  return (
    <div className="fx-form-rdv">
      <div><span className="fx-etiquette">Type</span>
        <div className="fx-puces">{types.map(t => <button key={t.key} aria-pressed={p.type === t.key} onClick={() => set('type', t.key)}>{t.label}</button>)}</div>
      </div>
      <div className="deux">
        <label><span className="fx-etiquette">Date</span><input type="date" className="fx-champ" value={p.date || ''} onChange={e => set('date', e.target.value)} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label><span className="fx-etiquette">De</span><input type="time" className="fx-champ" value={h.start} onChange={e => set('time', combineTime(e.target.value, h.end))} /></label>
          <label><span className="fx-etiquette">À</span><input type="time" className="fx-champ" value={h.end} onChange={e => set('time', combineTime(h.start, e.target.value))} /></label>
        </div>
      </div>
      <label><span className="fx-etiquette">Adresse</span><AddressInput value={p.address || ''} onChange={v => set('address', v)} placeholder="Rue, ville…" className="fx-champ" /></label>
      <div className="deux">
        <label><span className="fx-etiquette">Contact sur place</span><input className="fx-champ" placeholder="Nom et téléphone" value={p.contact || ''} onChange={e => set('contact', e.target.value)} /></label>
        <div><span className="fx-etiquette">Véhicule</span>
          <div className="fx-puces">{vehicules.map(v => <button key={v} aria-pressed={p.vehicle === v} onClick={() => set('vehicle', p.vehicle === v ? '' : v)}>{v}</button>)}</div>
        </div>
      </div>
      <div><span className="fx-etiquette">Personnes</span>
        <div className="fx-puces">{personnes.map(n => (
          <button key={n} aria-pressed={assignes.includes(n)}
            onClick={() => set('assignees', assignes.includes(n) ? assignes.filter(x => x !== n) : [...assignes, n])}>{n}</button>
        ))}</div>
      </div>
      {assignes.includes('Coople') && (
        <div className="deux">
          <label><span className="fx-etiquette">Coople, nom et prénom</span><input className="fx-champ" value={p.coople_contact?.name || ''} onChange={e => set('coople_contact', { ...(p.coople_contact || {}), name: e.target.value })} /></label>
          <label><span className="fx-etiquette">Coople, téléphone</span><input type="tel" className="fx-champ" value={p.coople_contact?.phone || ''} onChange={e => set('coople_contact', { ...(p.coople_contact || {}), phone: e.target.value })} /></label>
        </div>
      )}
      <label><span className="fx-etiquette">Notes</span><textarea className="fx-champ" rows={2} placeholder="Accès, remarques…" value={p.notes || ''} onChange={e => set('notes', e.target.value)} /></label>
      <div className="fx-actions">
        <button className="fx-btn p" onClick={() => onValider(p)}>Enregistrer</button>
        <button className="fx-btn g" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  )
}

function Rdv({ point, nomType, onModifier, onSupprimer }) {
  const datee = /^\d{4}-\d{2}-\d{2}$/.test(point.date || '')
  const jour = datee ? point.date.slice(8) : null
  const mois = datee ? dateCourte(point.date).split(' ')[1] : ''
  const personnes = Array.isArray(point.assignees) ? point.assignees : []
  const lignes = [
    [point.address, fmtTimeDisplay(point.time)].filter(Boolean).join(', '),
    [point.vehicle, personnes.length ? listeNoms(personnes) : ''].filter(Boolean).join('. '),
    point.contact,
  ].filter(Boolean)
  return (
    <div className="fx-rdv">
      {jour ? <span className="j n">{Number(jour)}<small>{mois}</small></span> : <span className="j sans">Date à fixer</span>}
      <div style={{ minWidth: 0 }}>
        <b>{nomType}</b>
        {lignes.map((l, i) => <p key={i}>{l}</p>)}
        {point.coople_contact?.name && <p>Coople : {point.coople_contact.name}{point.coople_contact.phone ? `, ${point.coople_contact.phone}` : ''}</p>}
        {point.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{point.notes}</p>}
        {point.address && (
          <p style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            <a href={mapsViewUrl(point.address)} target="_blank" rel="noopener">Voir sur Maps</a>
            <a href={mapsDirectionsUrl(point.address)} target="_blank" rel="noopener">Itinéraire</a>
          </p>
        )}
      </div>
      <span style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
        <button className="fx-lien" onClick={onModifier}>Modifier</button>
        <button className="fx-lien" style={{ color: '#5f6672', fontWeight: 500 }} onClick={onSupprimer}>Supprimer</button>
      </span>
    </div>
  )
}

export default function Taches({
  taches, logistique, aujourdhui, types, personnes, vehicules,
  onBasculer, onEditer, onSupprimer, onNouvelle, onLogistique,
}) {
  const [edition, setEdition] = useState(null)   // uid du point ouvert, ou 'nouveau'
  const [voirFaites, setVoirFaites] = useState(false)
  const nomType = cle => types.find(t => t.key === cle)?.label || cle

  // Les tâches tirées d'un point logistique (une par personne) ne se listent
  // pas : le point les représente déjà, plus haut.
  const propres = taches.filter(t => !t.category_data?.source_logistics_uid)
  const faites = propres.filter(t => t.status === 'completed')
  const points = [...logistique].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))

  function valider(p) {
    const existe = logistique.some(x => x.uid === p.uid)
    onLogistique(existe ? logistique.map(x => (x.uid === p.uid ? p : x)) : [...logistique, p])
    setEdition(null)
  }
  function supprimerPoint(p) {
    if (!confirm(`Supprimer « ${nomType(p.type)}${p.date ? ` du ${dateCourte(p.date)}` : ''} » ?`)) return
    onLogistique(logistique.filter(x => x.uid !== p.uid))
  }
  const nouveau = () => ({ uid: genLogUid(), type: 'montage', date: '', address: '', time: '', contact: '', notes: '', assignees: [], coople_contact: { name: '', phone: '' }, vehicle: '' })

  const categories = TASK_CATEGORIES.map(c => ({
    ...c,
    taches: propres.filter(t => t.status !== 'completed' && (t.category === c.key || (!t.category && c.key === 'bureau')))
      .sort((a, b) => (a.execution_date || '9999').localeCompare(b.execution_date || '9999')),
  }))
  const pleines = categories.filter(c => c.taches.length)
  const vides = categories.filter(c => !c.taches.length)

  return (
    <div>
      <div className="fx-taches">
        <div>
          <h3>Dates sur place <span className="cpt">{points.length}</span></h3>
          {points.map(p => edition === p.uid
            ? <FormulaireRdv key={p.uid} point={p} types={types} personnes={personnes} vehicules={vehicules} onValider={valider} onAnnuler={() => setEdition(null)} />
            : <Rdv key={p.uid} point={p} nomType={nomType(p.type)} onModifier={() => setEdition(p.uid)} onSupprimer={() => supprimerPoint(p)} />)}
          {edition === 'nouveau'
            ? <FormulaireRdv point={nouveau()} types={types} personnes={personnes} vehicules={vehicules} onValider={valider} onAnnuler={() => setEdition(null)} />
            : <div className="fx-ajouts"><button className="fx-lien" onClick={() => setEdition('nouveau')}>+ Ajouter une date</button></div>}
        </div>

        {pleines.map(c => (
          <div key={c.key}>
            <h3>{c.label} <span className="cpt">{c.taches.length}</span></h3>
            {c.taches.map(t => <Tache key={t.id} t={t} aujourdhui={aujourdhui} onBasculer={onBasculer} onEditer={onEditer} onSupprimer={onSupprimer} />)}
            <div className="fx-ajouts"><button className="fx-lien" onClick={() => onNouvelle(c.key)}>+ Ajouter une tâche</button></div>
          </div>
        ))}
      </div>

      <div className="fx-ajouts" style={{ marginTop: 40 }}>
        <span style={{ color: '#5f6672' }}>Ajouter dans</span>
        {vides.map(c => <button key={c.key} className="fx-lien" onClick={() => onNouvelle(c.key)}>{c.label}</button>)}
        {faites.length > 0 && (
          <button className="fx-lien" style={{ marginLeft: 'auto' }} onClick={() => setVoirFaites(v => !v)}>
            {voirFaites ? 'Masquer les tâches faites' : `Voir les ${faites.length} tâche${faites.length > 1 ? 's' : ''} faite${faites.length > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
      {voirFaites && (
        <div className="fx-faites">
          {faites.map(t => <Tache key={t.id} t={t} aujourdhui={aujourdhui} onBasculer={onBasculer} onEditer={onEditer} onSupprimer={onSupprimer} />)}
        </div>
      )}
    </div>
  )
}
