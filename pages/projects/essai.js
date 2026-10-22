// Liste des projets — proposition dans le nouveau style, à côté de la liste
// actuelle (/). Mêmes données, mêmes routes ; chaque projet ouvre sa fiche
// d'essai (/projects/[id]/essai).
//
// Une seule question par écran : où en est chaque projet. Les projets se
// rangent par STATUT — le même que la frise de leur fiche — en liste ou en
// kanban, ou par date de livraison. Le calcul vit dans lib/fiche.js.
import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { STYLE_FICHE } from '../../components/fiche/styles'
import { STATUTS, aVenir, dateCourte, delai, statutProjet, groupesParStatut, groupesParLivraison, livraisonEnRetard } from '../../lib/fiche'
import useIsAdmin from '../../lib/useIsAdmin'
import { useAuth } from '../_app'
import { CATEGORIES_OFFRE, categorieOffre, compterOffres } from '../../lib/quoteStatus'
import { chercherProjets, initLogistics } from '../../lib/projectHelpers'
import { dateDuJour } from '../../lib/aujourdhui'

const NOMS_TYPES = { montage: 'Montage', demontage: 'Démontage', livraison: 'Livraison', recuperation: 'Récupération', envoi_dhl: 'Envoi DHL', envoi_ete: 'Envoi ETE' }
const OFFRE = {
  a_faire: { mot: 'À faire', couleur: '#c4152b' },
  envoye: { mot: 'Envoyée', couleur: '#1f2de6' },
  accepte: { mot: 'Acceptée', couleur: '#1b8a5a' },
  refuse: { mot: 'Refusée', couleur: '#9aa0a9' },
}
const initiales = n => (!n || n === 'non défini') ? '–' : String(n).trim().split(/\s+/).map(m => m[0]).join('').slice(0, 2).toUpperCase()

// Préférences d'affichage gardées d'une visite à l'autre (confort seulement).
function memoire(cle, defaut) {
  try { return localStorage.getItem(cle) || defaut } catch { return defaut }
}
function retenir(cle, v) { try { localStorage.setItem(cle, v) } catch { /* navigation privée */ } }

function MiniFrise({ statut }) {
  const rang = STATUTS.findIndex(e => e.cle === statut)
  return (
    <span className="fx-mini" aria-hidden="true">
      {STATUTS.map((e, i) => <i key={e.cle} className={i < rang ? 'fait' : i === rang ? 'ici' : ''} />)}
    </span>
  )
}

function Livraison({ p, aujourdhui }) {
  const retard = livraisonEnRetard(p, aujourdhui)
  const d = p.deadline ? p.deadline.slice(0, 10) : null
  return (
    <span className={`livraison${retard ? ' rouge' : ''}`}>
      {d ? <><b className="n">{dateCourte(d)}</b><small>{retard ? `en retard, ${delai(d, aujourdhui).replace('il y a ', '')}` : delai(d, aujourdhui)}</small></> : <small>Pas de date</small>}
    </span>
  )
}

function Ligne({ p, prochaine, aujourdhui, archive, facture }) {
  const etape = statutProjet(p, facture)
  const offre = OFFRE[categorieOffre(p.quote_data)]
  return (
    <Link href={`/projects/${p.id}/essai`} className={`fx-projet${archive ? ' archive' : ''}`}>
      <span className="no n">{p.numero}</span>
      <span className="nom">
        <b>{p.name}</b>
        <small>{p.client || 'Client à définir'}</small>
      </span>
      <Livraison p={p} aujourdhui={aujourdhui} />
      <span className="etape">
        {p.suspended ? <span className="mot gris">En pause</span> : <><MiniFrise statut={etape} /><span className="mot">{STATUTS.find(e => e.cle === etape)?.nom}</span></>}
      </span>
      <span className="offre"><i style={{ background: offre.couleur }} />{offre.mot}</span>
      <span className="prochaine">
        {prochaine ? <><b className="n">{dateCourte(prochaine.date)}</b><small>{prochaine.titre}</small></> : <small>Rien de daté</small>}
      </span>
      <span className="qui" title={p.responsible || 'non défini'}>{initiales(p.responsible)}</span>
    </Link>
  )
}

// Une carte du kanban : ce qu'il faut pour décider sans ouvrir — qui, quand
// livrer, où en est l'offre. Elle se glisse vers une autre colonne pour
// changer de statut.
function Carte({ p, aujourdhui, onGlisser }) {
  const offre = OFFRE[categorieOffre(p.quote_data)]
  return (
    <Link href={`/projects/${p.id}/essai`} className="fx-carte" draggable={!p.suspended}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.id)); onGlisser(p) }}
      onDragEnd={() => onGlisser(null)}>
      <span className="haut"><span className="no n">{p.numero}</span><span className="qui" title={p.responsible || 'non défini'}>{initiales(p.responsible)}</span></span>
      <b>{p.name}</b>
      <small>{p.client || 'Client à définir'}</small>
      <span className="bas"><Livraison p={p} aujourdhui={aujourdhui} /><span className="offre"><i style={{ background: offre.couleur }} />{offre.mot}</span></span>
    </Link>
  )
}

export default function ProjetsEssai() {
  const { data: brut, isLoading } = useSWR('/api/projects?light=1')
  const { data: taches } = useSWR('/api/tasks')
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  // « Facturé » se déduit d'une facture ; les factures ne se lisent que par l'admin.
  const { data: factures } = useSWR(isAdmin ? '/api/customer-invoices' : null)
  const facturesIds = useMemo(() => new Set((Array.isArray(factures) ? factures : []).map(f => String(f.project_id))), [factures])
  const [statutsLocaux, setStatutsLocaux] = useState({})   // id → statut posé ici, avant revalidation
  const projets = (Array.isArray(brut) ? brut : []).map(p => (p.id in statutsLocaux ? { ...p, statut: statutsLocaux[p.id] } : p))
  const [vue, setVue] = useState('liste')
  const [tenu, setTenu] = useState(null)
  const [survol, setSurvol] = useState(null)
  const aujourdhui = dateDuJour()
  const [recherche, setRecherche] = useState('')
  const [offre, setOffre] = useState('tous')
  const [rangement, setRangement] = useState('statut')
  const [archives, setArchives] = useState(false)
  useEffect(() => { setRangement(memoire('projetsEssaiRangement', 'statut') === 'livraison' ? 'livraison' : 'statut'); setOffre(memoire('projetsEssaiOffre', 'tous')); setVue(memoire('projetsEssaiVue', 'liste')) }, [])
  const changerVue = v => { setVue(v); retenir('projetsEssaiVue', v) }
  const changerRangement = v => { setRangement(v); retenir('projetsEssaiRangement', v) }
  const changerOffre = v => { setOffre(v); retenir('projetsEssaiOffre', v) }

  const actifs = projets.filter(p => p.status === 'active')
  const archives_ = projets.filter(p => p.status !== 'active')
  const comptes = compterOffres(actifs)
  const vus = chercherProjets(offre === 'tous' ? actifs : actifs.filter(p => categorieOffre(p.quote_data) === offre), recherche)
  const archivesVues = chercherProjets(archives_, recherche).sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0))
  const groupes = rangement === 'livraison' ? groupesParLivraison(vus, aujourdhui) : groupesParStatut(vus, { factures: facturesIds })
  const colonnes = groupesParStatut(vus, { factures: facturesIds, vides: true })

  // Lâcher une carte dans une colonne pose ce statut. Préparation et
  // pré-production rendent la main à l'offre ; facturé et pause ne se posent
  // pas en glissant.
  async function poser(p, cle) {
    if (!p || p.suspended || ['facture', 'pause'].includes(cle) || statutProjet(p, facturesIds.has(String(p.id))) === cle) return
    const statut = ['preparation', 'preproduction'].includes(cle) ? null : cle
    setStatutsLocaux(m => ({ ...m, [p.id]: statut }))
    const r = await fetch(`/api/projects/${p.id}/statut`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-actor': user?.name || '' }, body: JSON.stringify({ statut }) })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setStatutsLocaux(m => { const n = { ...m }; delete n[p.id]; return n })
      alert(d.error || 'Le statut n’a pas pu être enregistré.')
    }
  }

  // La prochaine date de chaque projet : logistique et tâches mêlées, comme
  // le bloc « À venir » de sa fiche.
  const prochaines = useMemo(() => {
    const parProjet = {}
    for (const t of Array.isArray(taches) ? taches : []) (parProjet[t.project_id] ||= []).push(t)
    const out = {}
    for (const p of projets) out[p.id] = aVenir({ taches: parProjet[p.id] || [], logistique: initLogistics(p), aujourdhui, limite: 1, nomsTypes: NOMS_TYPES })[0] || null
    return out
  }, [projets, taches, aujourdhui])

  const enRetard = actifs.filter(p => livraisonEnRetard(p, aujourdhui)).length
  const enPause = actifs.filter(p => p.suspended).length
  const sansDate = actifs.filter(p => !p.deadline).length
  const resume = [
    `${actifs.length} projet${actifs.length > 1 ? 's' : ''} en cours`,
    enRetard ? `${enRetard} en retard` : null,
    enPause ? `${enPause} en pause` : null,
    sansDate ? `${sansDate} sans date de livraison` : null,
  ].filter(Boolean)

  return (
    <div className="fx">
      <Head><title>Projets — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <h1>Projets</h1>
            <p className="fx-resume-liste">
              {resume.map((r, i) => <span key={i} className={i === 1 && enRetard ? 'rouge' : undefined}>{r}</span>)}
            </p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/" style={{ textDecoration: 'none' }}>Ancienne liste</a>
            <a className="fx-btn p" href="/?nouveau=1" style={{ textDecoration: 'none' }}>Nouveau projet</a>
          </div>
        </header>

        <div className="fx-filtres">
          <label className="fx-cherche">
            <svg className="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Chercher : numéro, nom, client, référence…" aria-label="Chercher un projet" />
          </label>
          <span className="fx-pastilles" role="group" aria-label="Filtrer par offre">
            <button aria-pressed={offre === 'tous'} onClick={() => changerOffre('tous')}>Tous <span className="n">{actifs.length}</span></button>
            {CATEGORIES_OFFRE.filter(c => comptes[c.key] || offre === c.key).map(c => (
              <button key={c.key} aria-pressed={offre === c.key} onClick={() => changerOffre(c.key)}>
                <i style={{ background: OFFRE[c.key].couleur }} />{c.label.replace('offre ', 'Offre ')} <span className="n">{comptes[c.key]}</span>
              </button>
            ))}
          </span>
          <span className="fx-seg" role="group" aria-label="Affichage">
            <button aria-pressed={vue === 'liste' && rangement === 'statut'} onClick={() => { changerVue('liste'); changerRangement('statut') }}>Par statut</button>
            <button aria-pressed={vue === 'kanban'} onClick={() => changerVue('kanban')}>Kanban</button>
            <button aria-pressed={vue === 'liste' && rangement === 'livraison'} onClick={() => { changerVue('liste'); changerRangement('livraison') }}>Par livraison</button>
          </span>
        </div>

        {isLoading && !projets.length && <p className="fx-note">Chargement…</p>}
        {!isLoading && !vus.length && <p className="fx-vide" style={{ marginTop: 48 }}>Aucun projet en cours ne répond à « {recherche || CATEGORIES_OFFRE.find(c => c.key === offre)?.label} ».</p>}

        {vue === 'kanban' && (
          <div className="fx-kanban">
            {colonnes.map(c => {
              const posable = !['facture', 'pause'].includes(c.cle)
              return (
                <section key={c.cle} className={`fx-colonne${survol === c.cle && tenu ? ' survol' : ''}${tenu && !posable ? ' ferme' : ''}`}
                  onDragOver={e => { if (tenu && posable) { e.preventDefault(); if (survol !== c.cle) setSurvol(c.cle) } }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(null) }}
                  onDrop={e => { e.preventDefault(); setSurvol(null); poser(tenu, c.cle); setTenu(null) }}>
                  <h2>{c.nom} <span className="n">{c.projets.length}</span></h2>
                  {c.auto && c.cle !== 'pause' && <p className="auto">{c.cle === 'facture' ? 'Dès qu’une facture existe' : 'Suit l’état de l’offre'}</p>}
                  <div className="cartes">
                    {c.projets.map(p => <Carte key={p.id} p={p} aujourdhui={aujourdhui} onGlisser={setTenu} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {vue === 'liste' && <div className="fx-liste">
          <div className="fx-projet tete" aria-hidden="true">
            <span /><span>Projet</span><span>Livraison</span><span>Étape</span><span>Offre</span><span>Prochaine date</span><span />
          </div>
          {groupes.map(g => (
            <section key={g.cle} className="fx-groupe-liste">
              <h2>{g.nom} <span className="n">{g.projets.length}</span></h2>
              {g.projets.map(p => <Ligne key={p.id} p={p} prochaine={prochaines[p.id]} aujourdhui={aujourdhui} facture={facturesIds.has(String(p.id))} />)}
            </section>
          ))}

          {archivesVues.length > 0 && (
            <section className="fx-groupe-liste">
              {recherche.trim() || archives
                ? <>
                    <h2>Archivés <span className="n">{archivesVues.length}</span></h2>
                    {archivesVues.map(p => <Ligne key={p.id} p={p} prochaine={null} aujourdhui={aujourdhui} archive />)}
                    {!recherche.trim() && <div className="fx-ajouts"><button className="fx-lien" onClick={() => setArchives(false)}>Masquer les archivés</button></div>}
                  </>
                : <div className="fx-ajouts"><button className="fx-lien" onClick={() => setArchives(true)}>Voir les {archivesVues.length} projets archivés</button></div>}
            </section>
          )}
        </div>}
      </div>
    </div>
  )
}
