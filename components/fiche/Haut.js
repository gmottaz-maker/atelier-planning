// Le haut de la nouvelle fiche projet : qui, où on en est, ce qui arrive.
//
// Tout le calcul vit dans lib/fiche.js ; ces composants ne font qu'afficher et
// remonter les gestes à la page, qui seule parle à l'API.
import { useEffect, useRef, useState } from 'react'
import Dictee from '../Dictee'
import { TYPES_LIVRAISON } from '../../lib/projectHelpers'
import { PROJECT_PHASES } from '../../lib/projectPhase'
import { verifierTailleFichier } from '../../lib/uploadLimit'
import { estAudio, estImage, libelleEntree, messageTranscription, nomLisible } from '../../lib/dump'
import { dateCourte, dateLongue, decouperSynthese, delai } from '../../lib/fiche'

export const Icone = {
  trombone: <svg className="i" viewBox="0 0 24 24"><path d="M21 11.5 12.6 20a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.6 7"/></svg>,
  micro: <svg className="i" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>,
  fermer: <svg className="i" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><path d="M6 6l12 12M18 6 6 18"/></svg>,
}

// ── En-tête ─────────────────────────────────────────────────────────────────

export function Entete({ projet, responsables, onEnregistrer, onDupliquer, duplication, versAncienne }) {
  const [form, setForm] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const champ = (cle, v) => setForm(f => ({ ...f, [cle]: v }))

  function ouvrir() {
    setForm({
      name: projet.name || '', client: projet.client || '', deadline: projet.deadline || '',
      delivery_type: projet.delivery_type || '', responsible: projet.responsible || 'non défini',
      reference: projet.reference || '', phase: projet.phase || '', status: projet.status || 'active',
      suspended: !!projet.suspended, description: projet.description || '',
    })
  }
  async function enregistrer() {
    if (!form.name.trim()) return
    setEnCours(true)
    const ok = await onEnregistrer(form)
    setEnCours(false)
    if (ok) setForm(null)
  }

  const jours = projet.deadline ? delai(projet.deadline) : ''
  const passe = jours.startsWith('il y a')

  if (form) {
    return (
      <header className="fx-entete">
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1><span className="no n">{projet.numero}</span>{form.name || 'Sans nom'}</h1>
          <div className="fx-edition">
            <label><span className="fx-etiquette">Nom du projet</span>
              <input className="fx-champ" value={form.name} onChange={e => champ('name', e.target.value)} /></label>
            <label><span className="fx-etiquette">Client</span>
              <input className="fx-champ" value={form.client} onChange={e => champ('client', e.target.value)} /></label>
            <label><span className="fx-etiquette">Livraison</span>
              <input type="date" className="fx-champ" value={form.deadline} onChange={e => champ('deadline', e.target.value)} /></label>
            <label><span className="fx-etiquette">Mode</span>
              <select className="fx-champ" value={form.delivery_type} onChange={e => champ('delivery_type', e.target.value)}>
                <option value="">—</option>
                {TYPES_LIVRAISON.map(t => <option key={t} value={t}>{t}</option>)}
              </select></label>
            <label><span className="fx-etiquette">Responsable</span>
              <select className="fx-champ" value={form.responsible} onChange={e => champ('responsible', e.target.value)}>
                {responsables.map(r => <option key={r} value={r}>{r}</option>)}
              </select></label>
            <label><span className="fx-etiquette">Phase</span>
              <select className="fx-champ" value={form.phase} onChange={e => champ('phase', e.target.value)}>
                <option value="">En préparation</option>
                {PROJECT_PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select></label>
            <label><span className="fx-etiquette">Référence client</span>
              <input className="fx-champ" value={form.reference} onChange={e => champ('reference', e.target.value)} /></label>
            <label><span className="fx-etiquette">Statut</span>
              <select className="fx-champ" value={form.status} onChange={e => champ('status', e.target.value)}>
                <option value="active">Actif</option>
                <option value="archived">Archivé</option>
              </select></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'end', minHeight: 42 }}>
              <input type="checkbox" checked={form.suspended} onChange={e => champ('suspended', e.target.checked)} />
              En pause
            </label>
            <label style={{ gridColumn: '1 / -1' }}><span className="fx-etiquette">Résumé</span>
              <textarea className="fx-champ" rows={3} value={form.description} onChange={e => champ('description', e.target.value)} /></label>
          </div>
          <div className="fx-actions" style={{ marginTop: 20 }}>
            <button className="fx-btn p" onClick={enregistrer} disabled={enCours || !form.name.trim()}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
            <button className="fx-btn g" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="fx-entete">
      <div style={{ minWidth: 0 }}>
        <h1>{projet.numero != null && <span className="no n">{projet.numero}</span>}{projet.name}</h1>
        {projet.client && <p className="fx-client">{projet.client}</p>}
        <div className="fx-faits">
          {projet.deadline && (
            <span className={passe ? 'rouge' : ''}>Livraison <b>{dateLongue(projet.deadline)}</b>{jours && <>, <b>{jours}</b></>}</span>
          )}
          {projet.delivery_type && <span>{projet.delivery_type}</span>}
          <span>Responsable <b>{projet.responsible || 'non défini'}</b></span>
          {projet.reference && <span>Réf. client <b>{projet.reference}</b></span>}
          {projet.suspended && <span><b>En pause</b></span>}
          {projet.status === 'archived' && <span><b>Archivé</b></span>}
        </div>
        {projet.description && <p className="fx-resume-projet">{projet.description}</p>}
      </div>
      <div className="fx-actions">
        <button className="fx-btn g" onClick={ouvrir}>Modifier</button>
        <button className="fx-btn g" onClick={onDupliquer} disabled={duplication}
          title="Le même chantier, six mois plus tard : tout est repris sauf le numéro et le nom">
          {duplication ? 'Duplication…' : 'Dupliquer'}
        </button>
        <a className="fx-btn g" href={versAncienne} style={{ textDecoration: 'none' }}>Ancienne fiche</a>
      </div>
    </header>
  )
}

// ── Frise ───────────────────────────────────────────────────────────────────

export function Frise({ etapes }) {
  return (
    <ol className="fx-frise" aria-label="Avancement du projet">
      {etapes.map(e => (
        <li key={e.cle} className={e.etat === 'avenir' ? '' : e.etat} aria-current={e.etat === 'ici' ? 'step' : undefined}>
          {e.nom}{e.detail && <small className="n">{e.detail}</small>}
        </li>
      ))}
    </ol>
  )
}

// ── Synthèse, mises à jour, dépôt ───────────────────────────────────────────

function PieceJointe({ u }) {
  const src = `/api/update-file?updateId=${u.id}`
  if (u.url) {
    return <a className="fx-lien" href={u.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 6 }}>{u.url_titre || u.url}</a>
  }
  if (!u.file_kdrive_id) return null
  if (estImage(u.file_mime_type)) {
    return <a href={src} target="_blank" rel="noopener"><img src={src} alt={nomLisible(u.file_filename)} style={{ maxHeight: 260, maxWidth: '100%', borderRadius: 10, marginTop: 10 }} /></a>
  }
  if (estAudio(u.file_mime_type)) {
    const souci = messageTranscription(u.transcription_etat)
    return (
      <div style={{ marginTop: 10 }}>
        <audio controls preload="none" src={src} style={{ width: '100%', maxWidth: 420 }} />
        {u.transcription && <p style={{ marginTop: 8 }}>{u.transcription}</p>}
        {souci && <p style={{ marginTop: 6, fontSize: 14 }}>{souci}</p>}
      </div>
    )
  }
  return <a className="fx-lien" href={src} target="_blank" rel="noopener" style={{ marginTop: 6 }}>{nomLisible(u.file_filename) || 'Pièce jointe'}</a>
}

function quand(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const j = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return dateCourte(j)
}

export function Synthese({ projet, entrees, peutSupprimer, enCours, erreur, onRefaire, onDeposer, onSupprimer, largeurChamp }) {
  const { resume, reste } = decouperSynthese(projet.synthese)
  const [suite, setSuite] = useState(false)
  const [fil, setFil] = useState(false)

  return (
    <section className="fx-synth">
      <h2>Où on en est</h2>
      {resume
        ? <p className="texte">{resume}</p>
        : <p className="vide">{enCours ? 'Synthèse en cours…' : entrees.length ? 'La synthèse n’a pas encore été faite.' : 'Rien de déposé. Les appels, mails, photos et vocaux du projet se déposent ici ; la synthèse se fait toute seule.'}</p>}
      {erreur && <p style={{ color: '#c4152b', marginTop: 8 }}>{erreur}</p>}

      <div className="liens">
        {reste.length > 0 && <button className="fx-lien" aria-expanded={suite} onClick={() => setSuite(s => !s)}>{suite ? 'Replier la synthèse' : 'Lire toute la synthèse'}</button>}
        {entrees.length > 0 && <button className="fx-lien" aria-expanded={fil} onClick={() => setFil(f => !f)}>{fil ? 'Replier les mises à jour' : `Lire les ${entrees.length} mise${entrees.length > 1 ? 's' : ''} à jour`}</button>}
        {!enCours && <button className="fx-lien" onClick={onRefaire}>Refaire la synthèse</button>}
      </div>

      {suite && (
        <div className="fx-rubriques">
          {reste.map((r, i) => (
            <div key={i}>
              {r.titre && <h3>{r.titre}</h3>}
              <ul style={{ marginTop: 6, display: 'grid', gap: 4 }}>{r.lignes.map((l, j) => <li key={j}>{l}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      {fil && (
        <ol className="fx-maj">
          {entrees.map(u => (
            <li key={u.id}>
              <div className="qui">
                <span>{u.author}, {quand(u.created_at)}{libelleEntree(u) !== 'note' ? ` · ${libelleEntree(u)}` : ''}</span>
                {peutSupprimer && <button onClick={() => onSupprimer(u.id)}>Supprimer</button>}
              </div>
              {u.content && !u.url && <p>{u.content}</p>}
              <PieceJointe u={u} />
            </li>
          ))}
        </ol>
      )}

      <Depot onDeposer={onDeposer} largeur={largeurChamp} />
    </section>
  )
}

function Depot({ onDeposer, largeur }) {
  const [texte, setTexte] = useState('')
  const [fichier, setFichier] = useState(null)
  const [dicter, setDicter] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState(null)
  const [glisse, setGlisse] = useState(false)
  const zone = useRef(null)

  // La zone grandit avec le texte : un appel raconté tient rarement sur une ligne.
  useEffect(() => {
    const z = zone.current
    if (!z) return
    z.style.height = 'auto'
    z.style.height = `${Math.min(z.scrollHeight, 320)}px`
  }, [texte])

  async function choisir(f) {
    if (!f) return
    const taille = verifierTailleFichier(f)
    if (!taille.ok) { setMessage({ rouge: true, texte: taille.message }); return }
    setMessage(null)
    const dataUrl = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = e => ok(e.target.result); r.onerror = ko; r.readAsDataURL(f) })
    setFichier({
      base64: dataUrl.split(',')[1], mime_type: f.type,
      filename: `dump_${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, nom: f.name,
    })
  }

  async function envoyer() {
    if (!texte.trim() && !fichier) return
    setEnvoi(true); setMessage(null)
    const r = await onDeposer({ texte: texte.trim(), fichier })
    setEnvoi(false)
    if (r?.error) { setMessage({ rouge: true, texte: r.error }); return }
    setTexte(''); setFichier(null); setDicter(false)
    if (r?.avertissement) setMessage({ rouge: false, texte: r.avertissement })
  }

  return (
    <div className={`fx-composer${glisse ? ' glisse' : ''}`} style={largeur ? { '--jusqua-fichiers': `${largeur}px` } : undefined}
      onDragOver={e => { e.preventDefault(); setGlisse(true) }}
      onDragLeave={() => setGlisse(false)}
      onDrop={e => { e.preventDefault(); setGlisse(false); choisir(e.dataTransfer.files?.[0]) }}>
      <div className="ligne">
        <textarea ref={zone} rows={1} value={texte} onChange={e => setTexte(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) envoyer() }}
          placeholder="Ajouter une nouvelle : appel, mail, photo, PDF…" aria-label="Ajouter une nouvelle au projet" />
        <label className="fx-icone" title="Joindre un fichier" style={{ cursor: 'pointer' }}>
          {Icone.trombone}
          <input type="file" accept="image/*,application/pdf,audio/*" style={{ display: 'none' }}
            onChange={e => { choisir(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <button className="fx-icone" aria-pressed={dicter} aria-label="Dicter" onClick={() => setDicter(d => !d)}>{Icone.micro}</button>
      </div>
      {(dicter || fichier || texte.trim() || message) && (
        <div className="pied">
          {dicter && <div className="dictee"><Dictee onTexte={t => setTexte(v => (v.trim() ? `${v.trim()}\n\n${t}` : t))} /></div>}
          {fichier && <span className="piece">{fichier.nom}<button className="fx-icone" style={{ width: 24, height: 24 }} aria-label="Retirer la pièce" onClick={() => setFichier(null)}>{Icone.fermer}</button></span>}
          {message && <span className={`msg${message.rouge ? ' rouge' : ''}`}>{message.texte}</span>}
          {(texte.trim() || fichier) && <button className="fx-btn p envoyer" onClick={envoyer} disabled={envoi}>{envoi ? 'Dépôt…' : 'Déposer'}</button>}
        </div>
      )}
    </div>
  )
}

// ── À venir ─────────────────────────────────────────────────────────────────

export function AVenir({ items }) {
  return (
    <aside className="fx-avenir">
      <h2>À venir</h2>
      {items.length === 0
        ? <p className="rien">Aucune date posée.</p>
        : (
          <ol>
            {items.map(i => (
              <li key={i.cle}>
                <span className="q n">{dateCourte(i.date)}</span>
                <span>{i.titre}{i.detail && <small>{i.detail}</small>}</span>
              </li>
            ))}
          </ol>
        )}
    </aside>
  )
}
