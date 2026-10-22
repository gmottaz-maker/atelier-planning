// Dossier « Offre » de la nouvelle fiche projet.
//
// Une ligne se LIT d'abord : activité, désignation, quantité, prix, total, et
// l'œil qui la montre ou la cache au client. Le reste — prix d'achat, marge,
// escompte, dimension, véhicule — s'ouvre en cliquant sur la ligne. C'est la
// réponse au diagnostic d'octobre 2026 : 288 champs pour 36 lignes, dont 75
// d'escompte pour un seul rempli.
//
// AUCUN calcul ici. Totaux, prix unitaires et mise à plat viennent de
// lib/quoteLines.js, la seule source du barème : l'éditeur, le PDF et la
// validation serveur des factures doivent compter pareil.
import { useEffect, useRef, useState } from 'react'
import CatalogPicker, { toPurchaseRow, toRateRow } from '../CatalogPicker'
import QtyInput from '../QtyInput'
import { fmtCHF } from '../../lib/money'
import {
  purchaseNet, laborNet, serviceNet, logisticsNet, purchasePrice, servicePrice, logisticsPrice,
  totalItem, totalComposition, totalEvenement, totauxDevis, evenementsLogistiques, deplacerLigne,
  copierItem, copierEvenement, genRowUid, genItemUid, aUnEscompte, libelleEscompte, lignesDevis,
} from '../../lib/quoteLines'
import { estEnHeures, lignesSansActivite } from '../../lib/rentabilite'
import { activitesParFamille, ligneOffreActivite, libelleSuitActivite } from '../../lib/heures'
import { ligneForfait } from '../../lib/transport'
import { QUOTE_STATUSES } from '../../lib/quoteStatus'
import useSWR from 'swr'
import { compensationConsommee, ligneCompensation, CODE_CONSULTING } from '../../lib/consulting'
import { formatDuree } from '../../lib/heures'

const UNITES = ['heure(s)', 'jour(s)', 'ml', 'm²', 'km', 'PAN', 'pce']
const uniteCourte = u => ({ 'heure(s)': 'h', 'jour(s)': 'j' })[u] || u || ''
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const qte = r => (r.quantity === '' || r.quantity == null) ? '' : `${String(r.quantity).replace('.', ',')}${r.unit ? ` ${uniteCourte(r.unit)}` : ''}`
const Chf = ({ v }) => <>{fmtCHF(v)}<span className="fx-dev">CHF</span></>
const LIBELLE_STATUT = { brouillon: 'Offre en brouillon', envoye: 'Offre envoyée', a_corriger: 'Offre à corriger', accepte: 'Offre acceptée', refuse: 'Offre refusée' }
const COULEUR_STATUT = { brouillon: '#9aa0a9', envoye: '#1f2de6', a_corriger: '#c47a00', accepte: '#1b8a5a', refuse: '#c4152b' }

const I = {
  oeil: <svg className="i" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>,
  barre: <svg className="i" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1"/></svg>,
  chev: <svg className="i" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><path d="m6 9 6 6 6-6"/></svg>,
  haut: <svg className="i" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="m18 15-6-6-6 6"/></svg>,
  bas: <svg className="i" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="m6 9 6 6 6-6"/></svg>,
  copie: <svg className="i" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/></svg>,
  suppr: <svg className="i" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg>,
}

// ── Où vit une ligne ────────────────────────────────────────────────────────
// Une adresse dit dans quelle liste du devis se trouve une ligne. Toutes les
// écritures passent par `majListe`, pour qu'aucune ne recopie la structure.
//   { liste: 'management' | 'subcontracting' }
//   { item: i, kind: 'purchases' | 'labor' }
//   { item: i, element: j, kind }
//   { evenement: e }
function majListe(q, a, fn) {
  if (a.liste) return { ...q, [a.liste]: fn(q[a.liste] || []) }
  if (a.evenement != null) {
    const evs = evenementsLogistiques(q.logistics)
    return { ...q, logistics: evs.map((ev, i) => i === a.evenement ? { ...ev, lignes: fn(ev.lignes || []) } : ev) }
  }
  return {
    ...q,
    items: (q.items || []).map((it, i) => {
      if (i !== a.item) return it
      if (a.element == null) return { ...it, [a.kind]: fn(it[a.kind] || []) }
      return { ...it, elements: (it.elements || []).map((el, j) => j === a.element ? { ...el, [a.kind]: fn(el[a.kind] || []) } : el) }
    }),
  }
}
const cleAdresse = (a, i) => JSON.stringify(a) + ':' + i

// Ce qu'une ligne est, selon l'endroit où elle vit.
function nature(a) {
  if (a.liste === 'management') return 'gestion'
  if (a.liste === 'subcontracting') return 'soustraitance'
  if (a.evenement != null) return 'logistique'
  return a.kind === 'purchases' ? 'achat' : 'mo'
}
const champTitre = n => ({ gestion: 'item', soustraitance: 'item', logistique: 'trajet' })[n] || 'description'
const porteActivite = (n, r) => n === 'gestion' || n === 'mo' || (n === 'logistique' && (estEnHeures(r.unit) || r.activite != null && r.activite !== ''))

function montants(n, r, gm) {
  if (n === 'achat') return { pu: purchasePrice(r, gm), total: purchaseNet(r, gm) }
  if (n === 'soustraitance') return { pu: servicePrice(r, gm), total: serviceNet(r, gm) }
  if (n === 'logistique') return { pu: logisticsPrice(r), total: logisticsNet(r) }
  return { pu: num(r.rate), total: laborNet(r) }
}

// ── Menu d'activités ────────────────────────────────────────────────────────
// Posé en `position: fixed` près du clic : dans un tableau, un menu absolu se
// ferait couper par le premier ancêtre qui défile.
function MenuActivites({ ouvert, activites, familles, avecRetrait, onChoisir, onFermer }) {
  const boite = useRef(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = e => { if (boite.current && !boite.current.contains(e.target)) onFermer() }
    const echap = e => { if (e.key === 'Escape') onFermer() }
    setTimeout(() => document.addEventListener('mousedown', dehors), 0)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert, onFermer])
  if (!ouvert) return null
  const groupes = activitesParFamille(activites)
  const tries = familles ? [...groupes.filter(g => familles.includes(g.famille)), ...groupes.filter(g => !familles.includes(g.famille))] : groupes
  const x = Math.min(ouvert.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 336)
  const y = Math.min(ouvert.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 396)
  return (
    <div ref={boite} className="fx-menu" style={{ left: Math.max(8, x), top: Math.max(8, y) }} role="menu">
      {avecRetrait && <button className="retirer" onClick={() => onChoisir(null)}>Retirer l’activité</button>}
      {tries.length === 0 && <p className="famille">Aucune activité.</p>}
      {tries.map(g => (
        <div key={g.famille}>
          <p className="famille">{g.libelle}</p>
          {g.activites.map(a => (
            <button key={a.code} role="menuitem" onClick={() => onChoisir(a)}>
              <span className="code n">{a.code}</span><span>{a.libelle}</span>
              <span className="tarif n">{a.tarif_vente == null ? 'sans tarif' : `${fmtCHF(a.tarif_vente)}/h`}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Une ligne et son détail ─────────────────────────────────────────────────

function Ligne({ r, a, i, total: nbDansListe, gm, ouverte, activites, avecVehicules, transport, onOuvrir, onMaj, onBascule, onDeplacer, onSupprimer, onDupliquer, onMenu }) {
  const n = nature(a)
  const titre = r[champTitre(n)] || (champTitre(n) !== 'description' ? r.description : '') || ''
  const sous = [
    champTitre(n) !== 'description' && r[champTitre(n)] ? r.description : '',
    n === 'achat' ? r.dimension : '',
    n === 'logistique' && r.vehicule ? [transport?.vehicules?.find(v => v.id === r.vehicule)?.nom, r.personnes > 1 ? `${r.personnes} personnes` : ''].filter(Boolean).join(', ') : '',
    aUnEscompte(r) ? libelleEscompte(r, fmtCHF) : '',
  ].filter(Boolean).join(' · ')
  const { pu, total } = montants(n, r, gm)
  const act = porteActivite(n, r)
  const code = r.activite
  const choisie = code !== null && code !== undefined && code !== ''
  const activite = choisie ? activites.find(x => Number(x.code) === Number(code)) : null
  const manque = act && !choisie && estEnHeures(r.unit) && num(r.quantity) > 0
  const ouvrirMenu = e => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); onMenu({ x: b.left, y: b.bottom + 6, cible: { a, i } }) }

  const set = (champ, v) => onMaj(champ, v)
  const champ = (cle, libelle, props = {}) => (
    <label className={props.large ? 'large' : undefined}><span className="fx-etiquette">{libelle}</span>
      <input className="fx-champ" value={r[cle] ?? ''} onChange={e => set(cle, e.target.value)} {...(props.attrs || {})} /></label>
  )
  const nombre = (cle, libelle, placeholder) => champ(cle, libelle, { attrs: { type: 'number', step: '0.01', inputMode: 'decimal', placeholder } })

  return (
    <>
      <tr className={`fx-ligne${r.hidden ? ' masquee' : ''}${ouverte ? ' ouverte' : ''}`} onClick={onOuvrir} data-manque={manque ? 'oui' : undefined}>
        <td className="c-act-td" onClick={e => act && e.stopPropagation()}>
          {act && (choisie
            ? <button className="fx-act" onClick={ouvrirMenu} title={`${code} ${activite?.libelle || ''} : changer l’activité`}><span className="code n">{code}</span>{activite?.libelle || ''}</button>
            : <button className="fx-act choisir" onClick={ouvrirMenu}>À choisir</button>)}
        </td>
        <td className="desig">
          {act && <span className="act-mobile" style={{ color: choisie ? '#c4152b' : '#5f6672' }}>{choisie ? `${code} ${activite?.libelle || ''}` : 'Activité à choisir'}</span>}
          {titre || <span style={{ color: '#5f6672' }}>Sans désignation</span>}
          {sous && <small>{sous}</small>}
        </td>
        <td className="r n">{qte(r)}</td>
        <td className="r n pu">{num(r.quantity) || pu ? fmtCHF(pu) : ''}</td>
        <td className="r n tot"><Chf v={total} /></td>
        <td onClick={e => e.stopPropagation()}>
          <button className="fx-vis" onClick={onBascule} aria-pressed={!r.hidden}
            aria-label={r.hidden ? 'Masquée sur le document : cliquer pour l’afficher' : 'Visible sur le document : cliquer pour la masquer'}
            title={r.hidden ? 'Masquée pour le client' : 'Visible pour le client'}>{r.hidden ? I.barre : I.oeil}</button>
        </td>
      </tr>
      {ouverte && (
        <tr className="fx-detail">
          <td colSpan={6}>
            <div className="grille">
              {champTitre(n) !== 'description' && champ(champTitre(n), n === 'logistique' ? 'Intitulé' : 'Item', { large: true })}
              {champ('description', champTitre(n) !== 'description' ? 'Précision' : 'Désignation', { large: true })}
              {n === 'achat' && champ('dimension', 'Dimension')}
              <label><span className="fx-etiquette">Quantité</span><QtyInput className="fx-champ" value={r.quantity} onChange={v => set('quantity', v)} /></label>
              <label><span className="fx-etiquette">Unité</span>
                <select className="fx-champ" value={r.unit || ''} onChange={e => set('unit', e.target.value)}>
                  <option value="">—</option>{UNITES.map(u => <option key={u} value={u}>{uniteCourte(u)}</option>)}
                </select></label>
              {n === 'achat' ? nombre('unit_price', 'Prix d’achat') : nombre('rate', n === 'soustraitance' ? 'Prix' : 'Tarif')}
              {(n === 'achat' || n === 'soustraitance') && nombre('margin', 'Marge %', gm ? `${gm} (générale)` : '0')}
              {n === 'logistique' && nombre('margin', 'Marge %', '0')}
              {nombre('discount', 'Escompte %', '0')}
              {nombre('discount_amount', 'Escompte CHF', '0')}
              {n === 'logistique' && avecVehicules && (String(r.unit || '').toLowerCase() === 'km' || r.forfait) && (
                <>
                  <label><span className="fx-etiquette">Véhicule</span>
                    <select className="fx-champ" value={r.vehicule || ''} onChange={e => set('vehicule', e.target.value)}>
                      <option value="">—</option>{transport.vehicules.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
                    </select></label>
                  <label><span className="fx-etiquette">Personnes à bord</span>
                    <select className="fx-champ" value={r.personnes || 1} onChange={e => set('personnes', Number(e.target.value))}>
                      {[1, 2, 3].map(p => <option key={p} value={p}>{p}</option>)}
                    </select></label>
                </>
              )}
            </div>
            <div className="pied">
              <button className="fx-btn g" onClick={onOuvrir}>Fermer</button>
              <button onClick={() => onDeplacer(-1)} disabled={i === 0}>Monter</button>
              <button onClick={() => onDeplacer(1)} disabled={i === nbDansListe - 1}>Descendre</button>
              <button onClick={onDupliquer}>Dupliquer</button>
              <button className="suppr" onClick={onSupprimer}>Supprimer la ligne</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function EnTeteTable() {
  return (
    <>
      <colgroup><col className="c-act" /><col /><col className="c-q" /><col className="c-pu" /><col className="c-tot" /><col className="c-vis" /></colgroup>
      <thead><tr><th>Activité</th><th>Désignation</th><th className="r">Qté</th><th className="r">Prix</th><th className="r">Total</th><th /></tr></thead>
    </>
  )
}

// Le solde de consulting du client, au-dessus de l'offre (admin). « Compenser »
// glisse une ligne de Gestion MASQUÉE : invisible sur le document, comprise
// dans le prix. Le serveur compte les AUTRES offres du client ; celle-ci se lit
// à l'écran, enregistrée ou non.
function Consulting({ projetId, contactId, quote, activites, tarifDefaut, onCompenser }) {
  const { data } = useSWR(contactId ? `/api/consulting?contact=${contactId}&exclure=${projetId}` : null)
  if (!data || data.error) return null
  const ici = compensationConsommee(quote)
  if (!data.consulte && !data.compense && !ici) return null
  const reste = data.solde - ici
  const tarif = activites.find(a => Number(a.code) === CODE_CONSULTING)?.tarif_vente ?? tarifDefaut
  return (
    <div className="fx-consulting">
      <div>
        <b>Consulting de ce client</b>
        <p>{formatDuree(data.consulte)} noté · {formatDuree(data.compense)} compensé dans d’autres offres{ici ? ` · ${formatDuree(ici)} dans celle-ci` : ''} · <span style={reste < 0 ? { color: '#c4152b', fontWeight: 600 } : { fontWeight: 600 }}>{reste < 0 ? `compensé ${formatDuree(-reste)} de trop` : `reste ${formatDuree(reste)}`}</span></p>
        <small>La compensation est une ligne de gestion masquée : invisible sur l’offre, comprise dans le prix. Une offre refusée rend ses heures au solde.</small>
      </div>
      {reste > 0 && <button className="fx-btn p" onClick={() => onCompenser(ligneCompensation({ minutes: reste, tarif }))}>Compenser {formatDuree(reste)}</button>}
    </div>
  )
}

// En-tête repliable d'un item, d'un élément ou d'un événement nommé. Défini
// HORS de l'éditeur : recréé à chaque rendu, son champ perdrait le focus à
// chaque lettre tapée.
function Groupe({ plie, onBascule, sous, nom, placeholder, total, onNom, outils }) {
  return (
    <tr className={`fx-groupe${plie ? ' plie' : ''}${sous ? ' sous' : ''}`}>
      <td colSpan={4}>
        <span className="titre">
          <button className="fx-chev" aria-expanded={!plie} aria-label={plie ? 'Déplier' : 'Replier'} onClick={onBascule}>{I.chev}</button>
          <input value={nom || ''} placeholder={placeholder} onChange={e => onNom(e.target.value)} aria-label={placeholder} />
        </span>
      </td>
      <td className="r n"><Chf v={total} /></td>
      <td><span className="outils">{outils}</span></td>
    </tr>
  )
}

// ── L'éditeur ───────────────────────────────────────────────────────────────

export default function Offre({ quote, onChange, onStatut, activites, reglages, transport, projetId, contactId, isAdmin, sale, enregistrement, onEnregistrer }) {
  const [ouverte, setOuverte] = useState(null)           // clé de la ligne dépliée
  const [plies, setPlies] = useState({})                 // _uid d'item ou d'élément → replié
  const [menu, setMenu] = useState(null)                 // { x, y, cible } ou { x, y, ajout }
  const [vueClient, setVueClient] = useState(false)
  const gm = quote.general_margin ?? ''
  const tauxMO = reglages?.taux_main_oeuvre ?? ''
  const t = totauxDevis(quote)
  const evenements = evenementsLogistiques(quote.logistics)
  const sansActivite = lignesSansActivite(quote)
  const avecVehicules = (transport?.vehicules?.length || 0) > 0

  const maj = fn => onChange(fn(quote))
  const majLigne = (a, i, champ, v) => maj(q => majListe(q, a, l => l.map((r, k) => k === i ? { ...r, [champ]: v } : r)))
  const ajouter = (a, ligne, ouvrir = true) => {
    const r = { _uid: genRowUid(), description: '', quantity: '', unit: '', discount: '', discount_amount: '', ...ligne }
    let index = 0
    maj(q => { const nq = majListe(q, a, l => { index = l.length; return [...l, r] }); return nq })
    if (ouvrir) setTimeout(() => setOuverte(cleAdresse(a, index)), 0)
  }
  // La composition d'un item sert au chiffrage : elle part masquée, comme
  // dans l'éditeur d'origine. Les lignes existantes ne changent pas.
  const vide = (n) => ({
    gestion: { item: '', rate: tauxMO },
    soustraitance: { item: '', rate: '', margin: '' },
    logistique: { trajet: '', rate: '', margin: '' },
    achat: { dimension: '', unit_price: '', margin: '', hidden: true },
    mo: { rate: tauxMO, hidden: true },
  })[n]

  function choisirActivite(act) {
    const c = menu
    setMenu(null)
    if (!c) return
    if (c.cible) {
      const { a, i } = c.cible
      const n = nature(a)
      maj(q => majListe(q, a, l => l.map((r, k) => {
        if (k !== i) return r
        const suite = { ...r, activite: act ? act.code : null }
        const cleTitre = champTitre(n)
        const ancien = activites.find(x => Number(x.code) === Number(r.activite))?.libelle
        if (act && libelleSuitActivite(r[cleTitre], ancien)) suite[cleTitre] = act.libelle
        if (act && (r.rate === '' || r.rate == null) && act.tarif_vente != null) suite.rate = String(act.tarif_vente)
        return suite
      })))
      return
    }
    if (c.ajout && act) {
      const base = ligneOffreActivite(act)
      const n = nature(c.ajout)
      const ligne = n === 'gestion' ? { ...base, item: base.description, description: '' }
        : n === 'logistique' ? { ...base, trajet: base.description, description: '' }
        : { ...base, hidden: true }
      ajouter(c.ajout, ligne, false)
    }
  }
  const menuAjout = (a, familles) => e => { const b = e.currentTarget.getBoundingClientRect(); setMenu({ x: b.left, y: b.bottom + 6, ajout: a, familles }) }

  function premiereSansActivite() {
    const el = document.querySelector('.fx-ligne[data-manque="oui"]')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const b = el.querySelector('.fx-act')
    if (b) setTimeout(() => b.click(), 350)
  }

  function changerStatut(s) {
    if (s === 'accepte' && sansActivite.length > 0) {
      alert(`${sansActivite.length} ligne(s) en heures n'ont pas d'activité (${Math.round(sansActivite.reduce((x, l) => x + l.heures, 0) * 10) / 10} h).\n\n`
        + 'Une offre acceptée alimente la charge de l\'atelier et sert de référence aux heures imputées : ces heures-là y seraient invisibles.\n\n'
        + 'Choisis une activité sur chaque ligne « À choisir », puis réessaie.')
      return
    }
    onStatut(s)
  }

  // Rendu d'une liste de lignes à une adresse donnée.
  const lignes = (liste, a) => liste.map((r, i) => {
    const cle = cleAdresse(a, i)
    return (
      <Ligne key={r._uid || cle} r={r} a={a} i={i} total={liste.length} gm={gm} ouverte={ouverte === cle}
        activites={activites} avecVehicules={avecVehicules} transport={transport}
        onOuvrir={() => setOuverte(o => o === cle ? null : cle)}
        onMaj={(champ, v) => majLigne(a, i, champ, v)}
        onBascule={() => majLigne(a, i, 'hidden', !r.hidden)}
        onDeplacer={sens => { maj(q => majListe(q, a, l => deplacerLigne(l, i, sens))); setOuverte(cleAdresse(a, i + sens)) }}
        onDupliquer={() => maj(q => majListe(q, a, l => [...l.slice(0, i + 1), { ...r, _uid: genRowUid() }, ...l.slice(i + 1)]))}
        onSupprimer={() => { if (confirm(`Supprimer la ligne « ${r[champTitre(nature(a))] || r.description || 'sans désignation'} » ?`)) { maj(q => majListe(q, a, l => l.filter((_, k) => k !== i))); setOuverte(null) } }}
        onMenu={setMenu} />
    )
  })

  const outil = (icone, libelle, fn, desactive) => <button className="fx-vis" title={libelle} aria-label={libelle} onClick={fn} disabled={desactive} style={{ marginTop: 0 }}>{icone}</button>

  const majItem = (i, fn) => maj(q => ({ ...q, items: (q.items || []).map((it, k) => k === i ? fn(it) : it) }))
  const majEvenements = fn => maj(q => ({ ...q, logistics: fn(evenementsLogistiques(q.logistics)) }))

  if (vueClient) {
    const doc = lignesDevis(quote, { fmtCHF })
    return (
      <div className="fx-panneau">
        <BarreOffre quote={quote} maj={maj} changerStatut={changerStatut} vueClient={vueClient} setVueClient={setVueClient} />
        <div className="fx-client-doc">
          {doc.map((l, k) => l.kind === 'section'
            ? <div key={k} className="sec"><span>{l.label}</span><span className="n"><Chf v={l.total} /></span></div>
            : (
              <div key={k} className={`ln n${l.level}`} style={l.role === 'composition' ? { fontWeight: 400 } : undefined}>
                <span>{l.title}{l.desc && <small>{l.desc}</small>}</span>
                <span className="n" style={{ textAlign: 'right' }}>{l.qty}</span>
                <span className="n" style={{ textAlign: 'right', color: '#5f6672' }}>{l.price != null ? fmtCHF(l.price) : ''}</span>
                <span className="n" style={{ textAlign: 'right' }}>{l.total != null ? <Chf v={l.total} /> : ''}</span>
              </div>
            ))}
          <div className="sec" style={{ borderBottom: 0, fontSize: 28 }}><span>Total HT</span><span className="n"><Chf v={t.total} /></span></div>
        </div>
      </div>
    )
  }

  return (
    <div className="fx-panneau">
      <BarreOffre quote={quote} maj={maj} changerStatut={changerStatut} vueClient={vueClient} setVueClient={setVueClient} />
      {isAdmin && <Consulting projetId={projetId} contactId={contactId} quote={quote} activites={activites} tarifDefaut={reglages?.taux_projet}
        onCompenser={ligne => maj(q => ({ ...q, management: [...(q.management || []), { _uid: genRowUid(), ...ligne }] }))} />}
      <div className="fx-offre">
        <div style={{ minWidth: 0 }}>

          {/* ── Gestion ── */}
          <section className="fx-sec">
            <div className="fx-sec-t"><h3>Gestion de projet</h3><span className="tot n"><Chf v={t.gestion} /></span></div>
            <table className="fx-table"><EnTeteTable /><tbody>{lignes(quote.management || [], { liste: 'management' })}</tbody></table>
            <div className="fx-ajouts">
              <button className="fx-lien" onClick={menuAjout({ liste: 'management' }, ['gestion'])}>+ Activité</button>
              <button className="fx-lien" onClick={() => ajouter({ liste: 'management' }, vide('gestion'))}>+ Ligne libre</button>
            </div>
          </section>

          {/* ── Fabrication ── */}
          <section className="fx-sec">
            <div className="fx-sec-t"><h3>Fabrication</h3><span className="tot n"><Chf v={t.fabrication} /></span></div>
            <table className="fx-table"><EnTeteTable /><tbody>
              {(quote.items || []).map((it, ii) => {
                const uid = it._uid || `item-${ii}`
                const plie = plies[uid]
                return [
                  <Groupe key={`g-${uid}`} plie={!!plies[uid]} onBascule={() => setPlies(p => ({ ...p, [uid]: !p[uid] }))} nom={it.name} placeholder="Nom de l’item (Bar, Pergola…)" total={totalItem(it, gm)}
                    onNom={v => majItem(ii, x => ({ ...x, name: v }))}
                    outils={<>
                      {outil(I.haut, 'Monter l’item', () => maj(q => ({ ...q, items: deplacerLigne(q.items, ii, -1) })), ii === 0)}
                      {outil(I.bas, 'Descendre l’item', () => maj(q => ({ ...q, items: deplacerLigne(q.items, ii, 1) })), ii === quote.items.length - 1)}
                      {outil(I.copie, 'Dupliquer l’item avec sa composition', () => maj(q => { const items = [...q.items]; items.splice(ii + 1, 0, copierItem(q.items[ii])); return { ...q, items } }))}
                      {outil(I.suppr, 'Supprimer l’item', () => { if (confirm(`Supprimer l’item « ${it.name || 'sans nom'} » et sa composition ?`)) maj(q => ({ ...q, items: q.items.filter((_, k) => k !== ii) })) })}
                    </>} />,
                  ...(plie ? [] : [
                    ...lignes(it.purchases || [], { item: ii, kind: 'purchases' }),
                    ...lignes(it.labor || [], { item: ii, kind: 'labor' }),
                    ...(it.elements || []).flatMap((el, ej) => {
                      const euid = el._uid || `${uid}-el-${ej}`
                      return [
                        <Groupe key={`e-${euid}`} plie={!!plies[euid]} onBascule={() => setPlies(p => ({ ...p, [euid]: !p[euid] }))} sous nom={el.name} placeholder="Nom de l’élément (Toiture, Structure…)" total={totalComposition(el, gm)}
                          onNom={v => majItem(ii, x => ({ ...x, elements: x.elements.map((y, k) => k === ej ? { ...y, name: v } : y) }))}
                          outils={outil(I.suppr, 'Supprimer l’élément', () => { if (confirm(`Supprimer l’élément « ${el.name || 'sans nom'} » ?`)) majItem(ii, x => ({ ...x, elements: x.elements.filter((_, k) => k !== ej) })) })} />,
                        ...(plies[euid] ? [] : [
                          ...lignes(el.purchases || [], { item: ii, element: ej, kind: 'purchases' }),
                          ...lignes(el.labor || [], { item: ii, element: ej, kind: 'labor' }),
                          <tr key={`ea-${euid}`}><td colSpan={6} style={{ borderBottom: 0, paddingLeft: 28 }}>
                            <div className="fx-ajouts dans">
                              <button className="fx-lien" onClick={() => ajouter({ item: ii, element: ej, kind: 'purchases' }, vide('achat'))}>+ Matériau</button>
                              <button className="fx-lien" onClick={menuAjout({ item: ii, element: ej, kind: 'labor' })}>+ Main d’œuvre</button>
                            </div>
                          </td></tr>,
                        ]),
                      ]
                    }),
                    <tr key={`a-${uid}`}><td colSpan={6} style={{ borderBottom: 0 }}>
                      <div className="fx-ajouts dans">
                        <button className="fx-lien" onClick={() => ajouter({ item: ii, kind: 'purchases' }, vide('achat'))}>+ Matériau</button>
                        <span onClick={e => e.stopPropagation()}><CatalogPicker kind="article" label="+ Catalogue" onPick={x => ajouter({ item: ii, kind: 'purchases' }, { ...toPurchaseRow(x), hidden: true }, false)} /></span>
                        <button className="fx-lien" onClick={menuAjout({ item: ii, kind: 'labor' })}>+ Main d’œuvre</button>
                        <button className="fx-lien" style={{ color: '#5f6672', fontWeight: 500 }}
                          onClick={() => majItem(ii, x => ({ ...x, elements: [...(x.elements || []), { _uid: genItemUid(), name: '', purchases: [], labor: [] }] }))}>+ Élément</button>
                      </div>
                    </td></tr>,
                  ]),
                ]
              })}
            </tbody></table>
            <div className="fx-ajouts">
              <button className="fx-lien" onClick={() => maj(q => ({ ...q, items: [...(q.items || []), { _uid: genItemUid(), name: '', purchases: [], labor: [] }] }))}>+ Ajouter un item</button>
            </div>
          </section>

          {/* ── Sous-traitance ── */}
          <section className="fx-sec">
            <div className="fx-sec-t"><h3>Sous-traitance</h3><span className="tot n"><Chf v={t.soustraitance} /></span></div>
            <table className="fx-table"><EnTeteTable /><tbody>{lignes(quote.subcontracting || [], { liste: 'subcontracting' })}</tbody></table>
            <div className="fx-ajouts">
              <button className="fx-lien" onClick={() => ajouter({ liste: 'subcontracting' }, vide('soustraitance'))}>+ Ligne</button>
              <CatalogPicker kind="all" label="+ Catalogue" onPick={x => ajouter({ liste: 'subcontracting' }, toRateRow(x), false)} />
            </div>
          </section>

          {/* ── Logistique ── */}
          <section className="fx-sec">
            <div className="fx-sec-t"><h3>Logistique</h3><span className="tot n"><Chf v={t.logistique} /></span></div>
            <table className="fx-table"><EnTeteTable /><tbody>
              {evenements.map((ev, ei) => {
                const uid = ev._uid || `ev-${ei}`
                // Un seul événement sans nom ne pose pas d'en-tête : ses lignes
                // se lisent directement, comme avant les événements.
                const entete = evenements.length > 1 || String(ev.nom || '').trim()
                return [
                  entete && <Groupe key={`g-${uid}`} plie={!!plies[uid]} onBascule={() => setPlies(p => ({ ...p, [uid]: !p[uid] }))} nom={ev.nom} placeholder="Nom du passage (Montage Genève…) — facultatif" total={totalEvenement(ev)}
                    onNom={v => majEvenements(evs => evs.map((x, k) => k === ei ? { ...x, nom: v } : x))}
                    outils={<>
                      {outil(I.copie, 'Dupliquer : le second passage sur le même chantier', () => majEvenements(evs => [...evs.slice(0, ei + 1), copierEvenement(evs[ei]), ...evs.slice(ei + 1)]))}
                      {outil(I.suppr, 'Supprimer le passage', () => { if (confirm(`Supprimer « ${ev.nom || 'sans nom'} » et ses ${ev.lignes.length} ligne(s) ?`)) majEvenements(evs => evs.filter((_, k) => k !== ei)) })}
                    </>} />,
                  ...(entete && plies[uid] ? [] : lignes(ev.lignes || [], { evenement: ei })),
                  <tr key={`a-${uid}`}><td colSpan={6} style={{ borderBottom: 0 }}>
                    <div className="fx-ajouts dans">
                      <button className="fx-lien" onClick={() => ajouter({ evenement: ei }, vide('logistique'))}>+ Ligne</button>
                      <button className="fx-lien" onClick={menuAjout({ evenement: ei }, ['chantier', 'logistique'])}>+ Activité</button>
                      {transport?.forfaits?.length > 0 && (
                        <select className="fx-lien" value="" aria-label="Ajouter un forfait" style={{ border: 0, background: 'none', cursor: 'pointer' }}
                          onChange={e => { const f = transport.forfaits.find(x => x.id === e.target.value); if (f) ajouter({ evenement: ei }, ligneForfait(f), false) }}>
                          <option value="">+ Forfait</option>
                          {transport.forfaits.map(f => <option key={f.id} value={f.id}>{f.nom} · {f.prix ?? '?'} CHF · {f.km ?? '?'} km</option>)}
                        </select>
                      )}
                    </div>
                  </td></tr>,
                ]
              })}
            </tbody></table>
            <div className="fx-ajouts">
              <button className="fx-lien" onClick={() => majEvenements(evs => [...(evs.length ? evs : [{ _uid: genItemUid(), nom: '', lignes: [] }]), { _uid: genItemUid(), nom: '', lignes: [] }])}>+ Ajouter un passage</button>
            </div>
          </section>
        </div>

        {/* ── Récapitulatif ── */}
        <aside className="fx-recap">
          <p className="grand n"><Chf v={t.total} /></p>
          <p className="label">Total HT, marges et escomptes compris</p>
          <dl className="n">
            <dt>Gestion</dt><dd><Chf v={t.gestion} /></dd>
            <dt>Fabrication</dt><dd><Chf v={t.fabrication} /></dd>
            <dt>Sous-traitance</dt><dd><Chf v={t.soustraitance} /></dd>
            <dt>Logistique</dt><dd><Chf v={t.logistique} /></dd>
          </dl>
          {sansActivite.length > 0 && (
            <div className="fx-attente">
              <b>{sansActivite.length} ligne{sansActivite.length > 1 ? 's' : ''} sans activité</b>
              <p>{Math.round(sansActivite.reduce((x, l) => x + l.heures, 0) * 10) / 10} h vendues que la charge de l’atelier ne sait pas encore attribuer.</p>
              <button onClick={premiereSansActivite}>Aller à la première →</button>
            </div>
          )}
          <div className="btns">
            <button className="fx-btn p" onClick={onEnregistrer} disabled={!sale || enregistrement}>{enregistrement ? 'Enregistrement…' : sale ? 'Enregistrer l’offre' : 'Offre enregistrée'}</button>
            <a className="fx-btn g" href={`/projects/${projetId}/devis`} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}
              title={sale ? 'Enregistre d’abord pour inclure les dernières modifications' : 'Aperçu et PDF de l’offre'}>Aperçu PDF</a>
            {isAdmin && <a className="fx-btn g" href={`/factures-emises/new?from=${projetId}`} style={{ textDecoration: 'none' }}>Convertir en facture</a>}
            {sale && <p className="etat-enr modif">Modifications non enregistrées</p>}
          </div>
        </aside>
      </div>

      <MenuActivites ouvert={menu} activites={activites} familles={menu?.familles}
        avecRetrait={!!menu?.cible} onChoisir={choisirActivite} onFermer={() => setMenu(null)} />
    </div>
  )
}

function BarreOffre({ quote, maj, changerStatut, vueClient, setVueClient }) {
  const statut = quote.status || 'brouillon'
  return (
    <div className="fx-barre-offre">
      <div className="gauche">
        <select className="fx-statut" value={statut} style={{ '--pt': COULEUR_STATUT[statut] || '#9aa0a9' }}
          onChange={e => changerStatut(e.target.value)} aria-label="Statut de l’offre">
          {QUOTE_STATUSES.map(s => <option key={s.key} value={s.key}>{LIBELLE_STATUT[s.key] || s.label}</option>)}
        </select>
        <label className="fx-numero">N°
          <input value={quote.number || ''} placeholder="automatique" onChange={e => maj(q => ({ ...q, number: e.target.value }))} /></label>
        <label className="fx-marge">Marge générale
          <input type="number" step="0.1" inputMode="decimal" value={quote.general_margin ?? ''} placeholder="0"
            onChange={e => maj(q => ({ ...q, general_margin: e.target.value }))} /> %</label>
      </div>
      <span className="fx-seg" role="group" aria-label="Affichage de l’offre">
        <button aria-pressed={!vueClient} onClick={() => setVueClient(false)}>Chiffrage</button>
        <button aria-pressed={vueClient} onClick={() => setVueClient(true)}>Vue client</button>
      </span>
    </div>
  )
}
