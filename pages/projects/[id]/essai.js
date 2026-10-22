// Nouvelle fiche projet — page d'essai, à côté de la fiche actuelle
// (/projects/[id]). Mêmes routes, mêmes données : on peut passer de l'une à
// l'autre sans rien perdre, et la fiche actuelle ne change pas tant que
// celle-ci n'est pas validée.
//
// La page charge et enregistre ; l'affichage vit dans components/fiche/ et le
// calcul dans lib/fiche.js et lib/quoteLines.js.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import useSWR from 'swr'
import { useAuth } from '../../_app'
import useIsAdmin from '../../../lib/useIsAdmin'
import { useResponsibles } from '../../../lib/useResponsibles'
import { useQuoteDefaults } from '../../../lib/useQuoteDefaults'
import { useTransport } from '../../../lib/useTransport'
import { defaultQuote, doitSemerOffreVierge } from '../../../lib/quoteDefaults'
import { chargeUtileEntete, initLogistics, toDateStr, today } from '../../../lib/projectHelpers'
import { totauxDevis } from '../../../lib/quoteLines'
import { lignesSansActivite } from '../../../lib/rentabilite'
import { apiFetch } from '../../../lib/api'
import { lireReponse } from '../../../lib/uploadLimit'
import { dateDuJour } from '../../../lib/aujourdhui'
import { fmtCHF } from '../../../lib/money'
import { aVenir, enRetard, etapeCourante, parcours } from '../../../lib/fiche'
import { STYLE_FICHE } from '../../../components/fiche/styles'
import { AVenir, Entete, Frise, Synthese } from '../../../components/fiche/Haut'
import Taches from '../../../components/fiche/Taches'
import Offre from '../../../components/fiche/Offre'
import { Fichiers, Presentations, Rentabilite } from '../../../components/fiche/Dossiers'
import TaskFormDrawer from '../../../components/TaskFormDrawer'

const TYPES_LOGISTIQUE = [
  { key: 'montage', label: 'Montage' },
  { key: 'demontage', label: 'Démontage' },
  { key: 'livraison', label: 'Livraison' },
  { key: 'recuperation', label: 'Récupération' },
  { key: 'envoi_dhl', label: 'Envoi DHL' },
  { key: 'envoi_ete', label: 'Envoi ETE' },
]
const PERSONNES = ['Arnaud', 'Guillaume', 'Gabin', 'Coople']
const VEHICULES = ['Vito', 'Master', 'Autre']
const NOMS_TYPES = Object.fromEntries(TYPES_LOGISTIQUE.map(t => [t.key, t.label]))

// Le dossier ouvert à l'arrivée suit l'étape : on prépare l'offre, puis on
// travaille sur les tâches, puis on regarde ce que le chantier a coûté.
function dossierParDefaut(etape, isAdmin) {
  if (etape === 'preparation' || etape === 'offre') return 'offre'
  if (etape === 'termine') return isAdmin ? 'rentabilite' : 'offre'
  return 'taches'
}

// Relit l'offre enregistrée, quel que soit son âge (même règle que la fiche
// actuelle). `null` quand il n'y a rien d'enregistré.
function offreEnregistree(q) {
  if (!q) return null
  if (Array.isArray(q.items) || Array.isArray(q.management)) {
    const n = (q.management?.length || 0) + (q.items?.length || 0) + (q.subcontracting?.length || 0) + (q.logistics?.length || 0)
    if (!n) return null
    return { management: q.management || [], items: q.items || [], subcontracting: q.subcontracting || [], logistics: q.logistics || [],
      general_margin: q.general_margin ?? '', status: q.status || 'brouillon', number: q.number || '' }
  }
  if (q.purchases?.length || q.labor?.length || q.logistics?.length) {
    return { migree: true, management: [], subcontracting: [], logistics: q.logistics || [], general_margin: '',
      items: (q.purchases?.length || q.labor?.length) ? [{ _uid: `i_${Date.now()}`, name: 'Général', purchases: q.purchases || [], labor: q.labor || [] }] : [],
      status: q.status || 'brouillon', number: q.number || '' }
  }
  return null
}

export default function FicheEssai() {
  const router = useRouter()
  const { id } = router.query
  const { user } = useAuth()
  const moi = user?.name || ''
  const isAdmin = useIsAdmin()
  const { responsibles } = useResponsibles()
  const { reglages, loaded: reglagesCharges } = useQuoteDefaults()
  const transport = useTransport()
  const { data: activitesBrutes } = useSWR('/api/activites')
  const activites = Array.isArray(activitesBrutes) ? activitesBrutes : []

  const [projet, setProjet] = useState(null)
  const [taches, setTaches] = useState([])
  const [entrees, setEntrees] = useState([])
  const [logistique, setLogistique] = useState([])
  const [chargement, setChargement] = useState(true)
  const [quote, setQuote] = useState(() => defaultQuote())
  const [sale, setSale] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [dossier, setDossier] = useState(null)
  const [synthEnCours, setSynthEnCours] = useState(false)
  const [synthErreur, setSynthErreur] = useState('')
  const [duplication, setDuplication] = useState(false)
  const [creationDossier, setCreationDossier] = useState(false)
  const [tiroir, setTiroir] = useState(null)        // { task } ou { categorie }
  const [largeurChamp, setLargeurChamp] = useState(null)
  const aujourdhui = dateDuJour()

  // ── Offre vierge : semée UNE fois, quand les tarifs réglés arrivent ──────
  // (même garde que la fiche actuelle : deux offres ont été perdues par un
  // re-semis après enregistrement).
  const offreVierge = useRef(true)
  const semeFait = useRef(false)
  const saleRef = useRef(false)
  useEffect(() => { saleRef.current = sale }, [sale])
  useEffect(() => {
    if (!doitSemerOffreVierge({ tarifsCharges: reglagesCharges, dejaSeme: semeFait.current, offreEnregistree: !offreVierge.current, offreTouchee: saleRef.current })) return
    semeFait.current = true
    setQuote(defaultQuote(reglages))
  }, [reglagesCharges, reglages])

  // ── Chargement ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !moi) return
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch('/api/tasks', { headers: { 'x-actor': moi } }).then(r => r.json()),
      fetch(`/api/projects/${id}/updates`).then(r => r.json()),
    ]).then(([p, toutes, maj]) => {
      if (p && !p.error) {
        setProjet(p)
        setLogistique(initLogistics(p))
        const q = offreEnregistree(p.quote_data)
        if (q) {
          const { migree, ...offre } = q
          setQuote(offre)
          offreVierge.current = false
          if (migree) setSale(true)
        }
      }
      if (Array.isArray(toutes)) setTaches(toutes.filter(t => String(t.project_id) === String(id)))
      if (Array.isArray(maj)) setEntrees(maj)
    }).catch(console.error).finally(() => setChargement(false))
  }, [id, moi])

  // Dossier d'arrivée : celui de l'URL, sinon celui que l'étape appelle.
  useEffect(() => {
    if (!projet || dossier) return
    const demande = router.query.dossier
    setDossier(typeof demande === 'string' ? demande : dossierParDefaut(etapeCourante({ phase: projet.phase, statutOffre: quote.status }), isAdmin))
  }, [projet, dossier, router.query.dossier, quote.status, isAdmin])
  function ouvrirDossier(cle) {
    setDossier(cle)
    router.replace({ pathname: router.pathname, query: { ...router.query, dossier: cle } }, undefined, { shallow: true, scroll: false })
  }

  // Le champ de dépôt s'arrête au bord droit de l'onglet « Fichiers ».
  const caler = useCallback(() => {
    const champ = document.querySelector('.fx-composer'), fich = document.querySelector('.fx-onglet[data-cle="fichiers"]')
    if (!champ || !fich || window.innerWidth <= 860) { setLargeurChamp(null); return }
    setLargeurChamp(Math.round(fich.getBoundingClientRect().right - champ.getBoundingClientRect().left))
  }, [])
  useEffect(() => {
    if (!projet) return
    caler()
    window.addEventListener('resize', caler)
    document.fonts?.ready?.then(caler)
    return () => window.removeEventListener('resize', caler)
  }, [projet, caler])

  // ── Offre ───────────────────────────────────────────────────────────────
  const enregistrerOffre = useCallback(async (devis) => {
    const aEcrire = devis || quote
    setEnregistrement(true)
    try {
      const r = await fetch(`/api/projects/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
        body: JSON.stringify({ ...projet, quote_data: aEcrire }),
      })
      if (r.ok) setSale(false)
      return r.ok
    } catch { return false } finally { setEnregistrement(false) }
  }, [id, moi, projet, quote])

  // Enregistrement silencieux cinq minutes après la dernière modification,
  // et un avertissement si l'on quitte la page avant.
  useEffect(() => {
    if (!sale) return
    const t = setTimeout(() => { enregistrerOffre() }, 5 * 60 * 1000)
    const quitter = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', quitter)
    return () => { clearTimeout(t); window.removeEventListener('beforeunload', quitter) }
  }, [sale, enregistrerOffre])

  // Le statut est un état, pas une rédaction : il s'enregistre seul.
  async function changerStatut(statut) {
    const suivant = { ...quote, status: statut }
    setQuote(suivant)
    const ok = await enregistrerOffre(suivant)
    if (!ok) alert('Le statut n’a pas pu être enregistré — vérifie la connexion, puis clique sur Enregistrer.')
  }

  // ── En-tête ─────────────────────────────────────────────────────────────
  async function enregistrerEntete(form) {
    const r = await fetch(`/api/projects/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
      body: JSON.stringify(chargeUtileEntete(projet, form)),
    })
    const d = await r.json()
    if (!r.ok || d.error) return false
    setProjet(d)
    return true
  }
  async function dupliquer() {
    const nom = prompt('Nom du nouveau projet ?', `${projet.name} (copie)`)
    if (!nom || !nom.trim()) return
    if (!confirm(`Créer « ${nom.trim()} » à partir de ce projet ?\n\nSont repris : client, contact, résumé, notes, logistique, démontage, visite sur place et toute l'offre (en brouillon, sans numéro).\n\nNe suivent pas : le dossier kDrive, la référence client, la synthèse, la phase — ni les tâches, fichiers, heures et coûts.`)) return
    setDuplication(true)
    try {
      const copie = await apiFetch(`/api/projects/${projet.id}/dupliquer`, { method: 'POST', json: { name: nom.trim() }, silencieux: true })
      router.push(`/projects/${copie.id}/essai`)
    } catch (e) { alert(`Duplication impossible : ${e.message}`); setDuplication(false) }
  }

  // ── Mises à jour et synthèse ────────────────────────────────────────────
  async function refaireSynthese() {
    setSynthEnCours(true); setSynthErreur('')
    try {
      const r = await fetch(`/api/projects/${id}/synthese`, { method: 'POST' })
      const d = await r.json()
      if (d.error) { setSynthErreur(d.error); return }
      setProjet(p => (p ? { ...p, ...d } : p))
    } catch { setSynthErreur('Synthèse indisponible pour le moment') } finally { setSynthEnCours(false) }
  }
  async function deposer({ texte, fichier }) {
    try {
      const r = await fetch(`/api/projects/${id}/updates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: moi || 'Inconnu', content: texte, file: fichier ? { base64: fichier.base64, mime_type: fichier.mime_type, filename: fichier.filename } : null }),
      })
      const d = await lireReponse(r).catch(e => ({ error: e.message }))
      if (d.error) return { error: d.error }
      setEntrees(prev => [d, ...prev])
      refaireSynthese()
      return { avertissement: d.avertissement }
    } catch { return { error: 'Erreur lors de la publication' } }
  }
  async function supprimerEntree(updateId) {
    if (!confirm('Supprimer cette entrée ?')) return
    setEntrees(prev => prev.filter(u => u.id !== updateId))
    await fetch(`/api/projects/${id}/updates`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updateId }) })
    refaireSynthese()
  }

  // ── Tâches ──────────────────────────────────────────────────────────────
  async function basculerTache(t) {
    const statut = t.status === 'completed' ? 'active' : 'completed'
    const now = new Date().toISOString()
    setTaches(prev => prev.map(x => x.id === t.id ? { ...x, status: statut, completed_at: statut === 'completed' ? now : null } : x))
    try {
      const { projects: _p, ...donnees } = t
      await fetch(`/api/tasks/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
        body: JSON.stringify({ ...donnees, status: statut, prev_status: t.status, completed_at: statut === 'completed' ? now : null }) })
    } catch { setTaches(prev => prev.map(x => x.id === t.id ? t : x)) }
  }
  async function supprimerTache(t) {
    if (!confirm(`Supprimer la tâche « ${t.title} » ?`)) return
    setTaches(prev => prev.filter(x => x.id !== t.id))
    await fetch(`/api/tasks/${t.id}`, { method: 'DELETE', headers: { 'x-actor': moi } })
  }
  async function enregistrerTache(body, tacheId) {
    const r = await fetch(tacheId ? `/api/tasks/${tacheId}` : '/api/tasks', {
      method: tacheId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
      body: JSON.stringify(tacheId ? { ...tiroir.task, ...body } : body),
    })
    const d = await r.json()
    if (!r.ok || d.error) { alert(`Enregistrement impossible : ${d.error || `erreur ${r.status}`}`); return }
    setTaches(prev => tacheId ? prev.map(x => x.id === tacheId ? d : x) : [...prev, d])
    setTiroir(null)
  }

  // Un point logistique porte une tâche par personne assignée (même règle que
  // la fiche actuelle) : on les crée, on retire celles qui n'ont plus lieu.
  async function synchroniserTaches(points) {
    const toutes = await fetch('/api/tasks', { headers: { 'x-actor': moi } }).then(r => r.json()).catch(() => null)
    if (!Array.isArray(toutes)) return
    const liees = toutes.filter(t => String(t.project_id) === String(id) && t.category === 'logistique' && t.category_data?.source_logistics_uid)
    const ecrire = (url, init) => fetch(url, { ...init, headers: { 'Content-Type': 'application/json', 'x-actor': moi } }).catch(console.error)
    for (const p of points) {
      if (!p.uid) continue
      const voulues = new Set(Array.isArray(p.assignees) ? p.assignees : [])
      const existantes = liees.filter(t => t.category_data?.source_logistics_uid === p.uid)
      const deja = new Set(existantes.map(t => t.responsible))
      for (const personne of voulues) {
        if (deja.has(personne)) continue
        await ecrire('/api/tasks', { method: 'POST', body: JSON.stringify({
          title: `${NOMS_TYPES[p.type] || p.type} — ${projet.name}`, responsible: personne,
          execution_date: p.date || toDateStr(today()), project_id: id, category: 'logistique',
          category_data: { source_logistics_uid: p.uid, logistics_type: p.type, vehicle: p.vehicle || null }, notes: p.notes || null,
        }) })
      }
      for (const t of existantes) if (!voulues.has(t.responsible)) await ecrire(`/api/tasks/${t.id}`, { method: 'DELETE' })
    }
    const valides = new Set(points.map(p => p.uid).filter(Boolean))
    for (const t of liees) if (!valides.has(t.category_data?.source_logistics_uid)) await ecrire(`/api/tasks/${t.id}`, { method: 'DELETE' })
    const fraiches = await fetch('/api/tasks', { headers: { 'x-actor': moi } }).then(r => r.json()).catch(() => null)
    if (Array.isArray(fraiches)) setTaches(fraiches.filter(t => String(t.project_id) === String(id)))
  }
  async function enregistrerLogistique(points) {
    const avant = logistique
    setLogistique(points)
    const r = await fetch(`/api/projects/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-actor': moi },
      body: JSON.stringify({ ...projet, logistics_data: points }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) { setLogistique(avant); alert('La date n’a pas pu être enregistrée.'); return }
    setProjet(d)
    await synchroniserTaches(points)
  }

  async function creerDossierKdrive() {
    setCreationDossier(true)
    try {
      const r = await fetch(`/api/projects/${id}/kdrive-folder`, { method: 'POST', headers: { 'x-actor': moi } })
      const d = await r.json()
      if (r.ok && d.kdrive_folder_id) setProjet(p => ({ ...p, kdrive_folder_id: d.kdrive_folder_id }))
    } finally { setCreationDossier(false) }
  }

  // ── Rendu ───────────────────────────────────────────────────────────────
  if (chargement) return <div className="fx" style={{ padding: 40 }}><style>{STYLE_FICHE}</style><p style={{ color: '#5f6672' }}>Chargement…</p></div>
  if (!projet || projet.error) return <div className="fx"><style>{STYLE_FICHE}</style><p>Projet introuvable.</p></div>

  const etapes = parcours({ phase: projet.phase, statutOffre: quote.status, logistique, disassemblyDate: projet.disassembly_date })
  const prochaines = aVenir({ taches, logistique, aujourdhui, limite: 4, nomsTypes: NOMS_TYPES })
  const ouvertes = taches.filter(t => t.status !== 'completed' && !t.category_data?.source_logistics_uid)
  const retards = ouvertes.filter(t => enRetard(t, aujourdhui)).length
  const total = totauxDevis(quote).total
  const aCoder = lignesSansActivite(quote).length
  const versAncienne = `/projects/${id}`

  const onglets = [
    { cle: 'taches', nom: 'Tâches', v: retards ? `${retards} en retard` : `${ouvertes.length} ouverte${ouvertes.length > 1 ? 's' : ''}`, rouge: retards > 0 },
    { cle: 'offre', nom: 'Offre', v: total ? `${fmtCHF(total)} CHF` : 'à faire', rouge: aCoder > 0 && quote.status === 'accepte' },
    { cle: 'presentation', nom: 'Présentation', v: 'support client' },
    ...(isAdmin ? [{ cle: 'rentabilite', nom: 'Rentabilité', v: 'heures et marge' }] : []),
    { cle: 'fichiers', nom: 'Fichiers', v: projet.kdrive_folder_id ? 'kDrive' : 'aucun dossier' },
  ]

  return (
    <div className="fx">
      <Head><title>{projet.name} — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <Entete projet={projet} responsables={responsibles} onEnregistrer={enregistrerEntete}
          onDupliquer={dupliquer} duplication={duplication} versAncienne={versAncienne} />

        <div className="fx-etat">
          <Frise etapes={etapes} />
          <Synthese projet={projet} entrees={entrees} peutSupprimer={isAdmin} enCours={synthEnCours} erreur={synthErreur}
            onRefaire={refaireSynthese} onDeposer={deposer} onSupprimer={supprimerEntree} largeurChamp={largeurChamp} />
          <AVenir items={prochaines} />
        </div>

        <div className="fx-onglets" role="tablist" aria-label="Dossiers du projet">
          {onglets.map(o => (
            <button key={o.cle} className="fx-onglet" role="tab" data-cle={o.cle} aria-selected={dossier === o.cle} onClick={() => ouvrirDossier(o.cle)}>
              <span className="nom">{o.nom}</span><span className={`v n${o.rouge ? ' rouge' : ''}`}>{o.v}</span>
            </button>
          ))}
        </div>

        {dossier === 'taches' && (
          <div className="fx-panneau">
            <Taches taches={taches} logistique={logistique} aujourdhui={aujourdhui}
              types={TYPES_LOGISTIQUE} personnes={PERSONNES} vehicules={VEHICULES}
              onBasculer={basculerTache} onEditer={t => setTiroir({ task: t })} onSupprimer={supprimerTache}
              onNouvelle={c => setTiroir({ categorie: c })} onLogistique={enregistrerLogistique} />
          </div>
        )}
        {dossier === 'offre' && (
          <Offre quote={quote} onChange={q => { setQuote(q); setSale(true) }} onStatut={changerStatut}
            activites={activites} reglages={reglages} transport={transport} projetId={id} isAdmin={isAdmin}
            sale={sale} enregistrement={enregistrement} onEnregistrer={() => enregistrerOffre()} />
        )}
        {dossier === 'presentation' && <Presentations projetId={id} />}
        {dossier === 'rentabilite' && isAdmin && <Rentabilite projetId={id} quote={quote} versAncienne={versAncienne} />}
        {dossier === 'fichiers' && <Fichiers projetId={id} dossierId={projet.kdrive_folder_id} onCreerDossier={creerDossierKdrive} creationDossier={creationDossier} />}
      </div>

      {tiroir && (
        <TaskFormDrawer task={tiroir.task} currentUser={moi} defaultProjectId={projet.id} defaultCategory={tiroir.categorie}
          hideProjectSelector onSave={enregistrerTache} onClose={() => setTiroir(null)} />
      )}
    </div>
  )
}
