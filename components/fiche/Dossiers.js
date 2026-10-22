// Les dossiers Présentation, Rentabilité et Fichiers de la nouvelle fiche.
//
// La visite sur site n'y est pas : son formulaire sera refait à part. Les coûts
// réels de la rentabilité restent dans la fiche actuelle, vers laquelle le
// dossier renvoie.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { apiFetch } from '../../lib/api'
import { heuresParActivite } from '../../lib/rentabilite'
import { dateCourte } from '../../lib/fiche'
import { jourLocal } from '../../lib/aujourdhui'

const KDRIVE_DRIVE_ID = 1936508

export function Presentations({ projetId }) {
  const { data: liste, mutate } = useSWR(`/api/projects/${projetId}/presentations`)
  const [creation, setCreation] = useState(false)
  async function creer() {
    setCreation(true)
    try {
      const p = await apiFetch(`/api/projects/${projetId}/presentations`, { method: 'POST', json: {} })
      mutate()
      window.location.href = `/presentations/${p.id}`
    } finally { setCreation(false) }
  }
  async function supprimer(p) {
    if (!confirm(`Supprimer « ${p.titre || 'cette présentation'} » ? Le PDF déjà déposé sur kDrive reste dans le dossier.`)) return
    await apiFetch(`/api/presentations/${p.id}`, { method: 'DELETE' })
    mutate()
  }
  const items = Array.isArray(liste) ? liste : []
  return (
    <div className="fx-panneau">
      {items.length === 0 ? (
        <div className="fx-vide">
          <h3>Pas encore de présentation</h3>
          <p>Elle part du gabarit de la maison, déjà rempli avec le client, le numéro d’offre, le budget et la date de livraison. Il reste à raconter le brief.</p>
          <button className="fx-btn p" onClick={creer} disabled={creation}>{creation ? 'Création…' : 'Créer la présentation'}</button>
        </div>
      ) : (
        <>
          <div className="fx-taches" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              {items.map(p => (
                <div key={p.id} className="fx-tache" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                  <Link href={`/presentations/${p.id}`} className="titre" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>{p.titre || 'Présentation'}</Link>
                  <small className="n">{p.envoyee_le ? `déposée le ${dateCourte(jourLocal(p.envoyee_le))}` : 'brouillon'}</small>
                  <button className="fx-lien" style={{ color: '#5f6672', fontWeight: 500 }} onClick={() => supprimer(p)}>Supprimer</button>
                </div>
              ))}
            </div>
          </div>
          <div className="fx-ajouts"><button className="fx-lien" onClick={creer} disabled={creation}>{creation ? 'Création…' : '+ Nouvelle présentation'}</button></div>
        </>
      )}
    </div>
  )
}

export function Rentabilite({ projetId, quote, versAncienne }) {
  const { data: heures } = useSWR(`/api/heures?project=${projetId}`)
  const { data: activites } = useSWR('/api/activites')
  const { lignes, prevuSansCode } = heuresParActivite(quote, Array.isArray(heures) ? heures : [], Array.isArray(activites) ? activites : [])
  const h = n => `${String(Math.round(n * 10) / 10).replace('.', ',')} h`
  return (
    <div className="fx-panneau">
      <table className="fx-table" style={{ maxWidth: 1100 }}>
        <colgroup><col style={{ width: 260 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col /></colgroup>
        <thead><tr><th>Activité</th><th className="r">Offert</th><th className="r">Passé</th><th style={{ paddingLeft: 32 }}>Avancement</th></tr></thead>
        <tbody className="n">
          {lignes.map(l => (
            <tr key={l.code}>
              <td><span style={{ color: '#c4152b', fontWeight: 600, marginRight: 6 }}>{l.code}</span>{l.libelle}</td>
              <td className="r">{h(l.prevu)}</td>
              <td className="r" style={l.prevu && l.reel > l.prevu ? { color: '#c4152b', fontWeight: 600 } : undefined}>{h(l.reel)}</td>
              <td style={{ paddingLeft: 32, paddingTop: 20 }}>
                <div style={{ height: 8, borderRadius: 4, background: '#f4f5f7', overflow: 'hidden' }}>
                  <i style={{ display: 'block', height: '100%', width: `${l.prevu ? Math.min(100, l.reel / l.prevu * 100) : (l.reel ? 100 : 0)}%`, background: l.prevu && l.reel > l.prevu ? '#c4152b' : '#1f2de6' }} />
                </div>
              </td>
            </tr>
          ))}
          {prevuSansCode > 0 && (
            <tr><td style={{ color: '#c4152b', fontWeight: 600 }}>Sans activité</td><td className="r">{h(prevuSansCode)}</td><td className="r">–</td><td style={{ paddingLeft: 32, color: '#5f6672' }}>À coder dans l’offre pour être suivi</td></tr>
          )}
          {lignes.length === 0 && !prevuSansCode && <tr><td colSpan={4} style={{ color: '#5f6672' }}>Ni heures offertes, ni heures passées pour l’instant.</td></tr>}
        </tbody>
      </table>
      <div className="fx-ajouts" style={{ marginTop: 24 }}>
        <a className="fx-lien" href={versAncienne}>Coûts réels et marge dans la fiche actuelle →</a>
      </div>
    </div>
  )
}

function taille(b) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} Ko`
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}
const extension = nom => (String(nom || '').split('.').pop() || '').slice(0, 4).toUpperCase()

export function Fichiers({ projetId, dossierId, onCreerDossier, creationDossier }) {
  const [chemin, setChemin] = useState([])            // [{ name, token }]
  const [items, setItems] = useState([])
  const [etat, setEtat] = useState('')
  const jeton = chemin.length ? chemin[chemin.length - 1].token : null

  useEffect(() => {
    if (!dossierId) return
    let annule = false
    setEtat('chargement')
    const url = jeton ? `/api/projects/${projetId}/kdrive-listing?folderToken=${encodeURIComponent(jeton)}` : `/api/projects/${projetId}/kdrive-listing`
    fetch(url).then(r => r.json()).then(d => {
      if (annule) return
      if (d.error) { setEtat(d.error); setItems([]); return }
      setItems(d.items || []); setEtat('')
    }).catch(() => { if (!annule) { setEtat('kDrive ne répond pas.'); setItems([]) } })
    return () => { annule = true }
  }, [projetId, dossierId, jeton])

  if (!dossierId) {
    return (
      <div className="fx-panneau fx-vide">
        <h3>Ce projet n’a pas de dossier kDrive</h3>
        <p>C’est permis : une intervention d’une heure n’a pas de fichier. Tant qu’il n’y en a pas, on ne peut simplement rien y déposer.</p>
        <button className="fx-btn p" onClick={onCreerDossier} disabled={creationDossier}>{creationDossier ? 'Création…' : 'Créer le dossier'}</button>
      </div>
    )
  }

  return (
    <div className="fx-panneau">
      <div className="fx-chemin">
        <button onClick={() => setChemin([])}>Dossier du projet</button>
        {chemin.map((c, i) => <span key={i}>/ <button onClick={() => setChemin(chemin.slice(0, i + 1))}>{c.name}</button></span>)}
        <a className="fx-lien" style={{ marginLeft: 'auto' }} target="_blank" rel="noopener noreferrer"
          href={`https://kdrive.infomaniak.com/app/drive/${KDRIVE_DRIVE_ID}/files/${dossierId}`}>Ouvrir sur kDrive ↗</a>
      </div>
      {etat === 'chargement' ? <p style={{ color: '#5f6672' }}>Chargement…</p>
        : etat ? <p style={{ color: '#c4152b' }}>{etat}</p>
        : items.length === 0 ? <p style={{ color: '#5f6672' }}>Dossier vide.</p>
        : (
          <ul className="fx-fichiers">
            {items.map(f => f.type === 'dir' ? (
              <li key={f.id}>
                <span className="ico"><svg className="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg></span>
                <button className="nom" onClick={() => setChemin([...chemin, { name: f.name, token: f.token }])}><b>{f.name}</b><small>Dossier</small></button>
              </li>
            ) : (
              <li key={f.id}>
                <span className="ico">{f.has_thumbnail
                  ? <img src={`/api/kdrive/thumbnail?fileId=${f.id}&token=${encodeURIComponent(f.token || '')}`} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />
                  : extension(f.name)}</span>
                <a className="nom" href={`https://kdrive.infomaniak.com/app/drive/${KDRIVE_DRIVE_ID}/preview/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                  <b>{f.name}</b><small>{taille(f.size)}</small>
                </a>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
