// Les dossiers Présentation, Rentabilité et Fichiers de la nouvelle fiche.
//
// La visite sur site n'y est pas : son formulaire sera refait à part. Les coûts
// réels de la rentabilité restent dans la fiche actuelle, vers laquelle le
// dossier renvoie.
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { apiFetch } from '../../lib/api'
import { prevuDevis, reelProjet, comparaison, CATEGORIES_COUT, mainOeuvreReelle, margeReelle, heuresParActivite } from '../../lib/rentabilite'
import { formatDuree } from '../../lib/heures'
import { compensationConsommee, CODE_CONSULTING } from '../../lib/consulting'
import { useTransport } from '../../lib/useTransport'
import { lignesTransport, margeTransport, transportPrevu, coutsKmFlotte, normaliserCouts, CODE_CONDUITE } from '../../lib/transport'
import { totauxDevis } from '../../lib/quoteLines'
import { fmtCHF } from '../../lib/money'
import { dateCourte } from '../../lib/fiche'
import { jourLocal } from '../../lib/aujourdhui'
import { verifierTailleFichier, lireReponse } from '../../lib/uploadLimit'

const KDRIVE_DRIVE_ID = 1936508
const ROUGE = '#c4152b'
const Chf = ({ v }) => <>{fmtCHF(v)}<span className="fx-dev">CHF</span></>

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

export function Rentabilite({ projetId, quote }) {
  const { data: coutsBruts, mutate, error: errCouts } = useSWR(`/api/projects/${projetId}/couts`)
  const { data: heuresBrutes } = useSWR(`/api/heures?project=${projetId}`)
  const { data: activitesBrutes } = useSWR('/api/activites')
  const { data: coutsVehicules } = useSWR('/api/app-settings/couts_vehicules')
  const reglagesTransport = useTransport()
  const [form, setForm] = useState({ categorie: 'materiel', libelle: '', fournisseur: '', montant_ht: '', date: '' })
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const couts = Array.isArray(coutsBruts) ? coutsBruts : []
  const heures = Array.isArray(heuresBrutes) ? heuresBrutes : []
  const activites = Array.isArray(activitesBrutes) ? activitesBrutes : []
  // Mêmes calculs que la fiche actuelle, dans le même ordre : le consulting
  // compensé dans l'offre entre comme des heures de consulting, au coût.
  const compensees = compensationConsommee(quote)
  const heuresProjet = compensees ? [...heures, { activite: CODE_CONSULTING, minutes: compensees }] : heures
  const prevu = prevuDevis(quote)
  const reel = reelProjet(couts, heuresProjet, activites)
  const lignes = comparaison(prevu, reel)
  const parActivite = heuresParActivite(quote, heuresProjet, activites)
  const mo = mainOeuvreReelle(heuresProjet, activites)
  const coutsVeh = normaliserCouts(coutsVehicules?.value)
  const flotte = coutsKmFlotte(coutsVeh)
  const conduite = mo.lignes.find(l => l.code === CODE_CONDUITE)
  const coutHoraireConduite = activites.find(a => Number(a.code) === CODE_CONDUITE)?.cout_revient
  const lignesTr = lignesTransport(quote)
  const prevuTr = transportPrevu({ lignes: lignesTr, flotte, vitesse: coutsVeh.vitesse_moyenne,
    coutHoraire: coutHoraireConduite == null || coutHoraireConduite === '' ? null : Number(coutHoraireConduite) })
  const tr = margeTransport({ lignes: lignesTr, flotte, coutConduite: conduite?.cout || 0 })
  const nomVehicule = id => reglagesTransport.vehicules.find(v => v.id === id)?.nom || (id || 'moyenne de la flotte')
  const resultat = margeReelle(totauxDevis(quote).total, reel, mo.cout, tr.coutVehicules)
  const libelleCat = cle => CATEGORIES_COUT.find(c => c.cle === cle)?.label || cle
  const h = v => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
  const fmt = (v, unite) => unite === 'h' ? h(v) : <Chf v={v} />
  const signe = (v, unite) => <>{v > 0 ? '+' : v < 0 ? '− ' : ''}{unite === 'h' ? h(Math.abs(v)) : <Chf v={Math.abs(v)} />}</>
  const rougeSi = c => (c ? { color: ROUGE, fontWeight: 600 } : undefined)

  async function ajouter(e) {
    e.preventDefault()
    if (envoi) return
    setEnvoi(true); setErreur('')
    try {
      const r = await fetch(`/api/projects/${projetId}/couts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErreur(d.error || `Erreur ${r.status}`); return }
      setForm(f => ({ ...f, libelle: '', fournisseur: '', montant_ht: '' }))
      mutate()
    } finally { setEnvoi(false) }
  }
  async function supprimer(c) {
    if (!confirm(`Supprimer « ${c.libelle} » (${fmtCHF(c.montant_ht)} CHF) ?`)) return
    const r = await fetch(`/api/projects/${projetId}/couts`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coutId: c.id }) })
    if (r.ok) mutate()
  }

  const detailMarge = [
    ['Prix de l’offre HT', resultat.vente, false],
    ['Matériaux payés', -reel.materiel, true],
    ['Sous-traitance payée', -reel.sous_traitance, true],
    ['Autres frais', -reel.autre, true],
    [`Main-d’œuvre au coût (${formatDuree(heuresProjet.reduce((s, x) => s + (Number(x.minutes) || 0), 0))})`, -mo.cout, true],
    ...(tr.km ? [[`Véhicules (${Math.round(tr.km)} km)`, -tr.coutVehicules, true]] : []),
  ]

  return (
    <div className="fx-panneau fx-offre">
      <div style={{ minWidth: 0 }}>
        <section className="fx-sec">
          <div className="fx-sec-t"><h3>Prévu et réel</h3></div>
          <p className="fx-note">Prévu d’après l’offre, au prix de revient, avant marge. Réel d’après les coûts saisis plus bas et les heures imputées. Montants HT.</p>
          <table className="fx-table">
            <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col style={{ width: 190 }} /></colgroup>
            <thead><tr><th /><th className="r">Prévu</th><th className="r">Réel</th><th className="r">Écart</th></tr></thead>
            <tbody className="n">
              {lignes.map(l => (
                <tr key={l.cle}>
                  <td style={{ fontWeight: 500 }}>{l.label}</td>
                  <td className="r">{fmt(l.prevu, l.unite)}</td>
                  <td className="r">{fmt(l.reel, l.unite)}</td>
                  <td className="r" style={rougeSi(l.ecart > 0)}>{signe(l.ecart, l.unite)}{l.pct != null ? ` · ${l.pct > 0 ? '+' : l.pct < 0 ? '−' : ''}${Math.abs(l.pct)} %` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {prevu.lignesNonConverties > 0 && <p className="fx-note">{prevu.lignesNonConverties} ligne(s) de main-d’œuvre en jours ou sans unité ne sont pas comptées dans les heures prévues : une journée ne vaut pas le même nombre d’heures pour tout le monde.</p>}
          {reel.heuresNonFacturees > 0 && <p className="fx-note">{h(reel.heuresNonFacturees)} de conduite ou d’activités non facturées à l’heure ne sont pas comparées aux heures offertes. Elles comptent dans la marge, au coût de revient.</p>}
        </section>

        {(parActivite.lignes.length > 0 || parActivite.prevuSansCode > 0) && (
          <section className="fx-sec">
            <div className="fx-sec-t"><h3>Heures par activité</h3></div>
            <table className="fx-table">
              <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 160 }} /><col style={{ width: '30%' }} /></colgroup>
              <thead><tr><th>Activité</th><th className="r">Offert</th><th className="r">Passé</th><th className="r">Écart</th><th style={{ paddingLeft: 32 }}>Avancement</th></tr></thead>
              <tbody className="n">
                {parActivite.lignes.map(l => (
                  <tr key={l.code}>
                    <td><span style={{ color: ROUGE, fontWeight: 600, marginRight: 6 }}>{l.code}</span>{l.libelle}</td>
                    <td className="r">{l.prevu ? h(l.prevu) : '–'}</td>
                    <td className="r" style={rougeSi(l.prevu && l.reel > l.prevu)}>{l.reel ? h(l.reel) : '–'}</td>
                    <td className="r" style={rougeSi(l.ecart > 0)}>{signe(l.ecart, 'h')}{l.pct != null ? ` · ${l.pct > 0 ? '+' : l.pct < 0 ? '−' : ''}${Math.abs(l.pct)} %` : ''}</td>
                    <td style={{ paddingLeft: 32, paddingTop: 22 }}>
                      <div style={{ height: 8, borderRadius: 4, background: '#f4f5f7', overflow: 'hidden' }}>
                        <i style={{ display: 'block', height: '100%', width: `${l.prevu ? Math.min(100, l.reel / l.prevu * 100) : (l.reel ? 100 : 0)}%`, background: l.prevu && l.reel > l.prevu ? ROUGE : '#1f2de6' }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {parActivite.prevuSansCode > 0 && (
                  <tr><td style={{ color: ROUGE, fontWeight: 600 }}>Sans activité</td><td className="r">{h(parActivite.prevuSansCode)}</td><td className="r">–</td><td /><td style={{ paddingLeft: 32, color: '#5f6672' }}>À coder dans l’offre pour être suivi</td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {mo.lignes.length > 0 && (
          <section className="fx-sec">
            <div className="fx-sec-t"><h3>Heures imputées</h3></div>
            <table className="fx-table">
              <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} /></colgroup>
              <thead><tr><th>Activité</th><th className="r">Heures</th><th className="r">Au coût</th><th className="r">Au tarif</th></tr></thead>
              <tbody className="n">
                {mo.lignes.map(l => (
                  <tr key={l.code}>
                    <td><span style={{ fontWeight: 600, marginRight: 6 }}>{l.code}</span>{l.libelle}</td>
                    <td className="r">{formatDuree(l.minutes)}</td>
                    <td className="r" style={l.cout == null ? { color: '#5f6672' } : undefined}>{l.cout == null ? 'coût ?' : <Chf v={l.cout} />}</td>
                    <td className="r" style={l.vente == null || !l.facturee ? { color: '#5f6672' } : undefined}>{!l.facturee ? 'pas à l’heure' : l.vente == null ? '–' : <Chf v={l.vente} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {lignesTr.length > 0 && (
          <section className="fx-sec">
            <div className="fx-sec-t"><h3>Transport</h3><span className="tot n" style={rougeSi(prevuTr.marge < 0)}>{prevuTr.marge < 0 ? '− ' : ''}<Chf v={Math.abs(prevuTr.marge)} /></span></div>
            <p className="fx-note">Ce que chaque trajet rapporte, moins le véhicule et le temps au volant de chaque personne à bord{prevuTr.parKm != null ? ` : ${prevuTr.parKm < 0 ? '− ' : ''}${fmtCHF(Math.abs(prevuTr.parKm))} CHF par km` : ''}.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="fx-table" style={{ minWidth: 760 }}>
                <colgroup><col /><col style={{ width: 170 }} /><col style={{ width: 70 }} /><col style={{ width: 80 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} /></colgroup>
                <thead><tr><th>Trajet</th><th>Véhicule</th><th className="r">Km</th><th className="r">Route</th><th className="r">Facturé</th><th className="r">Véhicule</th><th className="r">Temps</th><th className="r">Marge</th></tr></thead>
                <tbody className="n">
                  {prevuTr.lignes.map((l, i) => (
                    <tr key={i}>
                      <td>{l.libelle}</td>
                      <td style={l.vehicule ? undefined : { color: ROUGE }}>{l.vehicule ? nomVehicule(l.vehicule) : 'à choisir'}, {l.personnes} p.</td>
                      <td className="r">{Math.round(l.km)}</td>
                      <td className="r">{l.minutes == null ? '–' : formatDuree(l.minutes)}</td>
                      <td className="r">{fmtCHF(l.recette)}</td>
                      <td className="r">{l.coutVehicule == null ? '?' : `− ${fmtCHF(l.coutVehicule)}`}</td>
                      <td className="r">{l.coutTemps == null ? '?' : `− ${fmtCHF(l.coutTemps)}`}</td>
                      <td className="r" style={{ fontWeight: 600, ...(l.marge < 0 ? { color: ROUGE } : {}) }}>{l.marge < 0 ? '− ' : ''}{fmtCHF(Math.abs(l.marge))}</td>
                    </tr>
                  ))}
                  {conduite && (
                    <tr><td colSpan={7} style={{ color: '#5f6672' }}>Réel : {formatDuree(conduite.minutes)} de conduite imputées, véhicules compris</td>
                      <td className="r" style={rougeSi(tr.marge < 0)}>{tr.marge < 0 ? '− ' : ''}{fmtCHF(Math.abs(tr.marge))}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {prevuTr.lignes.some(l => !l.vehicule) && <p className="fx-note rouge">Un trajet sans véhicule est compté au coût moyen de la flotte : choisis le véhicule sur la ligne de l’offre.</p>}
            {prevuTr.lignes.some(l => l.coutTemps == null) && <p className="fx-note rouge">{coutHoraireConduite == null || coutHoraireConduite === '' ? 'La conduite (51) n’a pas de coût de revient : le temps au volant n’est pas retranché. Renseigne-le dans /heures.' : 'Un trajet n’a pas de durée estimable : ajoute la durée au forfait ou la vitesse moyenne dans les réglages Transport.'}</p>}
            {prevuTr.lignes.some(l => l.coutVehicule == null) && <p className="fx-note rouge">Coût des véhicules inconnu : renseigne-les dans les réglages Transport.</p>}
          </section>
        )}

        <section className="fx-sec">
          <div className="fx-sec-t"><h3>Coûts réels</h3><span className="tot n"><Chf v={couts.reduce((s, c) => s + (Number(c.montant_ht) || 0), 0)} /></span></div>
          {errCouts ? <p className="fx-note rouge">Coûts illisibles : la migration schema-project-couts.sql est-elle jouée ?</p> : (
            <table className="fx-table">
              <colgroup><col style={{ width: 100 }} /><col style={{ width: 140 }} /><col /><col style={{ width: 180 }} /><col style={{ width: 140 }} /><col style={{ width: 100 }} /></colgroup>
              <thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Fournisseur</th><th className="r">Montant HT</th><th /></tr></thead>
              <tbody>
                {couts.length === 0 && <tr><td colSpan={6} style={{ color: '#5f6672' }}>Aucun coût saisi pour ce projet.</td></tr>}
                {couts.map(c => (
                  <tr key={c.id}>
                    <td className="n">{c.date ? dateCourte(c.date) : '–'}</td>
                    <td style={{ color: '#5f6672' }}>{libelleCat(c.categorie)}</td>
                    <td>{c.libelle}</td>
                    <td style={{ color: '#5f6672' }}>{c.fournisseur || ''}</td>
                    <td className="r n" style={{ fontWeight: 600 }}><Chf v={Number(c.montant_ht) || 0} /></td>
                    <td className="r"><button className="fx-lien" style={{ color: '#5f6672', fontWeight: 500 }} onClick={() => supprimer(c)}>Supprimer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form onSubmit={ajouter} className="fx-form-cout">
            <label><span className="fx-etiquette">Catégorie</span>
              <select className="fx-champ" value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
                {CATEGORIES_COUT.map(c => <option key={c.cle} value={c.cle}>{c.label}</option>)}
              </select></label>
            <label className="large"><span className="fx-etiquette">Libellé</span>
              <input required maxLength={120} className="fx-champ" value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} /></label>
            <label><span className="fx-etiquette">Fournisseur</span>
              <input maxLength={80} className="fx-champ" value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} /></label>
            <label><span className="fx-etiquette">Montant HT</span>
              <input required inputMode="decimal" className="fx-champ" value={form.montant_ht} onChange={e => setForm(f => ({ ...f, montant_ht: e.target.value }))} /></label>
            <label><span className="fx-etiquette">Date</span>
              <input type="date" className="fx-champ" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></label>
            <button type="submit" className="fx-btn p" disabled={envoi}>{envoi ? 'Ajout…' : 'Ajouter le coût'}</button>
          </form>
          {erreur && <p className="fx-note rouge">{erreur}</p>}
        </section>
      </div>

      <aside className="fx-recap">
        <p className="grand n" style={resultat.marge < 0 ? { color: ROUGE } : undefined}>{resultat.marge < 0 ? '− ' : ''}<Chf v={Math.abs(resultat.marge)} /></p>
        <p className="label">Marge réelle{resultat.pct != null ? `, ${String(resultat.pct).replace('.', ',')} % du prix` : ''}</p>
        <dl className="n">
          {detailMarge.map(([libelle, v, sous]) => (
            <Fragment key={libelle}><dt>{libelle}</dt><dd>{sous && v !== 0 ? '− ' : ''}<Chf v={Math.abs(v)} /></dd></Fragment>
          ))}
        </dl>
        {compensees > 0 && <p className="fx-note">Dont {formatDuree(compensees)} de consulting compensé dans l’offre : du temps passé avant le projet, compté au coût de revient.</p>}
        {mo.minutesSansCout > 0 && <p className="fx-note rouge">{formatDuree(mo.minutesSansCout)} imputées sur des activités sans coût de revient ne sont pas comptées : la marge est surestimée.</p>}
      </aside>
    </div>
  )
}

function taille(b) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} Ko`
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}
const extension = nom => (String(nom || '').split('.').pop() || '').slice(0, 4).toUpperCase()

function DossierKdrive({ projetId, dossierId }) {
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

  return (
    <div>
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

function DeposesMaze({ projetId }) {
  const { data, mutate } = useSWR(`/api/projects/${projetId}/files`)
  const fichiers = Array.isArray(data) ? data : []
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const [glisse, setGlisse] = useState(false)
  const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

  async function deposer(liste) {
    setErreur('')
    for (const f of Array.from(liste || [])) {
      if (!TYPES.includes(f.type)) { setErreur(`${f.name} : format non accepté (JPG, PNG, GIF, WEBP ou PDF).`); continue }
      const taille = verifierTailleFichier(f)
      if (!taille.ok) { setErreur(taille.message); continue }
      setEnvoi(true)
      try {
        const base64 = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = e => ok(e.target.result.split(',')[1]); r.onerror = ko; r.readAsDataURL(f) })
        const r = await fetch(`/api/projects/${projetId}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: f.name, mime_type: f.type, base64, size: f.size }) })
        const d = await lireReponse(r).catch(e => ({ error: e.message }))
        if (d.error) setErreur(d.error)
      } catch { setErreur('Le dépôt a échoué.') } finally { setEnvoi(false) }
    }
    mutate()
  }
  async function retirer(f) {
    if (!confirm(`Supprimer « ${f.filename} » ?`)) return
    await fetch(`/api/projects/${projetId}/files`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: f.id, storagePath: f.storage_path }) })
    mutate()
  }

  return (
    <section className="fx-sec">
      <div className="fx-sec-t"><h3>Déposés dans Maze</h3></div>
      <label className={`fx-depose${glisse ? ' glisse' : ''}`}
        onDragOver={e => { e.preventDefault(); setGlisse(true) }} onDragLeave={() => setGlisse(false)}
        onDrop={e => { e.preventDefault(); setGlisse(false); deposer(e.dataTransfer.files) }}>
        <input type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { deposer(e.target.files); e.target.value = '' }} />
        <b>{envoi ? 'Dépôt en cours…' : 'Glisser des fichiers ici, ou cliquer pour parcourir'}</b>
        <small>Images et PDF</small>
      </label>
      {erreur && <p className="fx-note rouge">{erreur}</p>}
      {fichiers.length > 0 && (
        <ul className="fx-fichiers" style={{ marginTop: 28 }}>
          {fichiers.map(f => (
            <li key={f.id}>
              <span className="ico">{f.mime_type?.startsWith('image/') ? <img src={f.url} alt="" loading="lazy" /> : extension(f.filename)}</span>
              <span style={{ minWidth: 0 }}>
                <a className="nom" href={f.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}><b>{f.filename}</b></a>
                <button className="fx-lien gris" style={{ fontSize: 14 }} onClick={() => retirer(f)}>Supprimer</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function Fichiers({ projetId, dossierId, onCreerDossier, creationDossier }) {
  return (
    <div className="fx-panneau">
      <section className="fx-sec">
        <div className="fx-sec-t"><h3>Dossier kDrive</h3></div>
        {dossierId
          ? <DossierKdrive projetId={projetId} dossierId={dossierId} />
          : (
            <div className="fx-vide">
              <p>Ce projet n’a pas de dossier kDrive. C’est permis : une intervention d’une heure n’a pas de fichier, et tant qu’il n’y en a pas, on ne peut simplement rien y déposer.</p>
              <button className="fx-btn p" onClick={onCreerDossier} disabled={creationDossier}>{creationDossier ? 'Création…' : 'Créer le dossier'}</button>
            </div>
          )}
      </section>
      <DeposesMaze projetId={projetId} />
    </div>
  )
}

