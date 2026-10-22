// Liste des projets — proposition dans le nouveau style, à côté de la liste
// actuelle (/). Mêmes données, mêmes routes ; chaque projet ouvre sa fiche
// d'essai (/projects/[id]/essai).
//
// Une seule question par écran : où en est chaque projet. Les projets se
// rangent par ÉTAPE — la même que la frise de leur fiche — ou par date de
// livraison. Le calcul vit dans lib/fiche.js.
import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { STYLE_FICHE } from '../../components/fiche/styles'
import { ETAPES, aVenir, dateCourte, delai, etapeProjet, groupesParEtape, groupesParLivraison, livraisonEnRetard } from '../../lib/fiche'
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

function MiniFrise({ etape }) {
  const rang = ETAPES.findIndex(e => e.cle === etape)
  return (
    <span className="fx-mini" aria-hidden="true">
      {ETAPES.map((e, i) => <i key={e.cle} className={i < rang ? 'fait' : i === rang ? 'ici' : ''} />)}
    </span>
  )
}

function Ligne({ p, prochaine, aujourdhui, archive }) {
  const etape = etapeProjet(p)
  const offre = OFFRE[categorieOffre(p.quote_data)]
  const retard = livraisonEnRetard(p, aujourdhui)
  const d = p.deadline ? p.deadline.slice(0, 10) : null
  return (
    <Link href={`/projects/${p.id}/essai`} className={`fx-projet${archive ? ' archive' : ''}`}>
      <span className="no n">{p.numero}</span>
      <span className="nom">
        <b>{p.name}</b>
        <small>{p.client || 'Client à définir'}</small>
      </span>
      <span className="etape">
        {p.suspended ? <span className="mot gris">En pause</span> : <><MiniFrise etape={etape} /><span className="mot">{ETAPES.find(e => e.cle === etape)?.nom}</span></>}
      </span>
      <span className="offre"><i style={{ background: offre.couleur }} />{offre.mot}</span>
      <span className="prochaine">
        {prochaine ? <><b className="n">{dateCourte(prochaine.date)}</b><small>{prochaine.titre}</small></> : <small>Rien de daté</small>}
      </span>
      <span className={`livraison${retard ? ' rouge' : ''}`}>
        {d ? <><b className="n">{dateCourte(d)}</b><small>{retard ? `en retard, ${delai(d, aujourdhui).replace('il y a ', '')}` : delai(d, aujourdhui)}</small></> : <small>Pas de date</small>}
      </span>
      <span className="qui" title={p.responsible || 'non défini'}>{initiales(p.responsible)}</span>
    </Link>
  )
}

export default function ProjetsEssai() {
  const { data: brut, isLoading } = useSWR('/api/projects?light=1')
  const { data: taches } = useSWR('/api/tasks')
  const projets = Array.isArray(brut) ? brut : []
  const aujourdhui = dateDuJour()
  const [recherche, setRecherche] = useState('')
  const [offre, setOffre] = useState('tous')
  const [rangement, setRangement] = useState('etape')
  const [archives, setArchives] = useState(false)
  useEffect(() => { setRangement(memoire('projetsEssaiRangement', 'etape')); setOffre(memoire('projetsEssaiOffre', 'tous')) }, [])
  const changerRangement = v => { setRangement(v); retenir('projetsEssaiRangement', v) }
  const changerOffre = v => { setOffre(v); retenir('projetsEssaiOffre', v) }

  const actifs = projets.filter(p => p.status === 'active')
  const archives_ = projets.filter(p => p.status !== 'active')
  const comptes = compterOffres(actifs)
  const vus = chercherProjets(offre === 'tous' ? actifs : actifs.filter(p => categorieOffre(p.quote_data) === offre), recherche)
  const archivesVues = chercherProjets(archives_, recherche).sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0))
  const groupes = rangement === 'livraison' ? groupesParLivraison(vus, aujourdhui) : groupesParEtape(vus)

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
          <span className="fx-seg" role="group" aria-label="Ranger par">
            <button aria-pressed={rangement === 'etape'} onClick={() => changerRangement('etape')}>Par étape</button>
            <button aria-pressed={rangement === 'livraison'} onClick={() => changerRangement('livraison')}>Par livraison</button>
          </span>
        </div>

        {isLoading && !projets.length && <p className="fx-note">Chargement…</p>}
        {!isLoading && !vus.length && <p className="fx-vide" style={{ marginTop: 48 }}>Aucun projet en cours ne répond à « {recherche || CATEGORIES_OFFRE.find(c => c.key === offre)?.label} ».</p>}

        <div className="fx-liste">
          <div className="fx-projet tete" aria-hidden="true">
            <span /><span>Projet</span><span>Étape</span><span>Offre</span><span>Prochaine date</span><span>Livraison</span><span />
          </div>
          {groupes.map(g => (
            <section key={g.cle} className="fx-groupe-liste">
              <h2>{g.nom} <span className="n">{g.projets.length}</span></h2>
              {g.projets.map(p => <Ligne key={p.id} p={p} prochaine={prochaines[p.id]} aujourdhui={aujourdhui} />)}
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
        </div>
      </div>
    </div>
  )
}
