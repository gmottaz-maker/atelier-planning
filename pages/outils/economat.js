// Économat — les consommables de l'atelier, derrière le Kanban physique.
//
// Deux vues, et leur ordre n'est pas neutre. LE SUIVI D'ABORD : ce qu'on vient
// chercher ici, c'est « qu'est-ce qu'il y a à réapprovisionner », pas
// « montre-moi les 84 articles ». Le catalogue sert à créer, corriger et
// imprimer les cartes.
//
// V2, étape 1 (brief §29) : le MODÈLE. La fiche article porte le type, le
// sous-titre, l'emplacement contrôlé, le bloc Stock (mode de suivi, unité,
// cible, seuils) et le bloc Approvisionnement ; les unités, délais,
// emplacements et fournisseurs s'administrent depuis le panneau « Listes ».
// Étape 2 : un article configuré bouge par ses GESTES (−1, niveau constaté,
// réapprovisionnement, prise en charge), dans la fiche comme au QR — même
// composant. Ses pastilles V1 disparaissent : son état est calculé. Un
// article repris de V1 et pas encore configuré garde ses pastilles (§26).
import { useState, useMemo, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { apiFetch } from '../../lib/api'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import {
  ETATS, ETATS_CHAUDS, etatInfo, arbreEconomat, filtrerArticles, compterEtats,
  fournisseursUtiles, nomFournisseur, nomEntree, categorieDe, couleurDe,
  lienCommande, enRetard, TYPES, SUIVIS, DECOUPAGES, MODES_APPRO, NIVEAUX,
  niveau, estConfigure, manquants, formatQuantite, formatCommande, choixQuantites,
  entreesUtiles, libellePriseEnCharge,
} from '../../lib/economat'
import EconomatGestes from '../../components/EconomatGestes'

const VIDE = {
  type: 'stocke', designation: '', sous_titre: '', categorie_id: '', emplacement_id: '',
  photo_path: '', notes: '', projets: [],
  // Bloc Stock, tel que la fiche le saisit : la cible en UNITÉS (« 1 boîte »),
  // les seuils en PARTS (« ⅓ » = 1 part en tiers). Converti à l'envoi.
  suivi: '', unite_stock_id: '', decoupage: '', cible_unites: '', seuil_orange: '', seuil_rouge: '',
  // Bloc Approvisionnement.
  mode_appro: '', fournisseur_id: '', fournisseur_alt_id: '', reference: '', url_produit: '',
  quantite_cmd: '', unite_cmd_id: '', delai_id: '', note_appro: '',
}

const champ = {
  width: '100%', padding: '8px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
  font: `13.5px ${FONT}`, color: C.ink, background: C.surface, outline: 'none', resize: 'vertical',
}
const micro = {
  fontSize: 10.5, fontWeight: 500, fontFamily: MONO, letterSpacing: '.08em',
  textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 4,
}
const aide = { font: `12px ${FONT}`, color: C.muted, display: 'block', marginTop: 4 }
const bouton = (actif = true) => ({
  padding: '8px 16px', borderRadius: R.pill, border: `1.5px solid ${C.outline}`,
  background: actif ? AL.black : C.surface, color: actif ? AL.white : AL.black,
  font: `500 13px ${FONT}`, cursor: 'pointer',
})
const pastille = (actif) => ({
  padding: '5px 12px', borderRadius: R.pill, cursor: 'pointer', font: `${actif ? 500 : 400} 12.5px ${FONT}`,
  border: `1px solid ${actif ? C.outline : C.border}`,
  background: actif ? AL.black : C.surface, color: actif ? AL.white : C.muted,
})
const etiquette = {
  font: `500 10.5px ${MONO}`, letterSpacing: '.06em', textTransform: 'uppercase',
  borderRadius: R.pill, padding: '3px 8px', flex: 'none',
}
const s = v => (v === null || v === undefined ? '' : String(v))

/** Un article de la base → les valeurs de la fiche. */
function versFormulaire(a) {
  const d = Number(a.decoupage) || 1
  return {
    ...VIDE, ...a,
    type: a.type || 'stocke',
    sous_titre: s(a.sous_titre), notes: s(a.notes), reference: s(a.reference), url_produit: s(a.url_produit),
    note_appro: s(a.note_appro), photo_path: s(a.photo_path),
    categorie_id: s(a.categorie_id), emplacement_id: s(a.emplacement_id),
    fournisseur_id: s(a.fournisseur_id), fournisseur_alt_id: s(a.fournisseur_alt_id),
    mode_appro: s(a.mode_appro), quantite_cmd: s(a.quantite_cmd), unite_cmd_id: s(a.unite_cmd_id), delai_id: s(a.delai_id),
    suivi: s(a.suivi), unite_stock_id: s(a.unite_stock_id), decoupage: a.suivi === 'approx' ? s(a.decoupage) : '',
    cible_unites: a.cible === null || a.cible === undefined ? '' : String(Math.round(Number(a.cible) / d)),
    seuil_orange: s(a.seuil_orange), seuil_rouge: s(a.seuil_rouge),
    projets: a.projets || [],
    // L'article tel qu'il est en base : les gestes s'appliquent à lui, pas aux
    // champs en cours de saisie.
    enBase: a,
  }
}

/** Les valeurs de la fiche → le corps envoyé à l'API. Liste explicite. */
function versCorps(f) {
  const d = f.suivi === 'approx' ? Number(f.decoupage) || 0 : 1
  const corps = {
    type: f.type, designation: f.designation, sous_titre: f.sous_titre, photo_path: f.photo_path,
    categorie_id: f.categorie_id, emplacement_id: f.emplacement_id, notes: f.notes, projets: f.projets,
    fournisseur_id: f.fournisseur_id, fournisseur_alt_id: f.fournisseur_alt_id,
    reference: f.reference, url_produit: f.url_produit,
    mode_appro: f.mode_appro, quantite_cmd: f.quantite_cmd, unite_cmd_id: f.unite_cmd_id,
    delai_id: f.delai_id, note_appro: f.note_appro,
    suivi: f.suivi, unite_stock_id: f.unite_stock_id, decoupage: f.suivi === 'approx' ? f.decoupage : (f.suivi ? 1 : ''),
    // Approximatif : un seul contenant, la cible est une boîte pleine.
    cible: f.suivi === 'approx' ? d : (f.cible_unites === '' ? '' : Number(f.cible_unites)),
    seuil_orange: f.seuil_orange, seuil_rouge: f.seuil_rouge,
  }
  if (f.id) corps.id = f.id
  if (f.stock_corrige !== undefined && f.stock_corrige !== '') corps.stock = Number(f.stock_corrige)
  // `enBase` ne part jamais : c'est une copie locale, pas un champ.
  return corps
}

export default function Economat() {
  const router = useRouter()
  const { data, mutate } = useSWR('/api/economat')
  const [vue, setVue] = useState('suivi')          // suivi | catalogue
  const [recherche, setRecherche] = useState('')
  const [categorie, setCategorie] = useState(null)
  const [etat, setEtat] = useState(null)
  const [fournisseur, setFournisseur] = useState(null)
  const [emplacement, setEmplacement] = useState(null)
  const [aCompleter, setACompleter] = useState(false)
  const [form, setForm] = useState(null)
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [panneau, setPanneau] = useState(null)     // null | categories | listes
  const [nouvelleCat, setNouvelleCat] = useState({ nom: '', parent_id: '', couleur: '#D5D5D5' })
  const [selection, setSelection] = useState([])

  const articles = useMemo(() => data?.articles || [], [data])
  const categories = useMemo(() => data?.categories || [], [data])
  const fournisseurs = useMemo(() => data?.fournisseurs || [], [data])
  const unites = useMemo(() => data?.unites || [], [data])
  const delais = useMemo(() => data?.delais || [], [data])
  const emplacements = useMemo(() => data?.emplacements || [], [data])
  const listes = { fournisseurs, unites, delais, emplacements, categories }
  const arbre = arbreEconomat(categories, articles)
  const comptes = compterEtats(articles)
  const listeFournisseurs = fournisseursUtiles(fournisseurs, articles)
  const nbACompleter = articles.filter(a => !a.archived && manquants(a).length > 0).length

  // `?article=<id>` ouvre la fiche : c'est là que mène l'invite « Configurer
  // l'article » de la vue rapide, après un scan.
  const demande = router.query.article
  useEffect(() => {
    if (!demande || !articles.length) return
    const a = articles.find(x => String(x.id) === String(demande))
    if (a) { setVue('catalogue'); setForm(versFormulaire(a)) }
    router.replace('/outils/economat', undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande, articles.length])

  // Un geste depuis la fiche : la fiche ET la liste se mettent à jour.
  function apresGeste(partiel) {
    setForm(f => (f && f.id === partiel.id ? { ...f, ...partiel } : f))
    mutate({ ...data, articles: articles.map(a => (a.id === partiel.id ? { ...a, ...partiel } : a)) }, { revalidate: true })
  }

  const visibles = filtrerArticles(articles, {
    recherche, categorie, etat, fournisseur, emplacement, categories, fournisseurs, emplacements,
    aCompleter: vue === 'catalogue' && aCompleter,
  })
  // Dans le suivi, le vert passe derrière : 🔴 d'abord, puis 🟠, puis 🔵.
  const ranges = vue === 'suivi' && !etat
    ? [...visibles].sort((a, b) => rang(a.etat) - rang(b.etat) || String(a.designation).localeCompare(String(b.designation), 'fr'))
    : visibles
  const chauds = visibles.filter(a => ETATS_CHAUDS.includes(a.etat))

  async function basculer(article, cle) {
    // Optimiste : le geste doit répondre tout de suite, c'est celui qu'on fait
    // quarante fois. L'erreur remonte par le bandeau global si ça casse.
    mutate({ ...data, articles: articles.map(a => (a.id === article.id ? { ...a, etat: cle, etat_le: new Date().toISOString() } : a)) }, { revalidate: false })
    await apiFetch('/api/economat/etat', { method: 'POST', json: { id: article.id, etat: cle } })
    mutate()
  }

  async function enregistrer() {
    if (!form.designation.trim()) { setErreur('Une désignation est requise'); return }
    setEnCours(true); setErreur('')
    try {
      await apiFetch('/api/economat', { method: form.id ? 'PUT' : 'POST', json: versCorps(form), silencieux: true })
      setForm(null); mutate()
    } catch (e) { setErreur(e.message) } finally { setEnCours(false) }
  }

  async function archiver(article) {
    await apiFetch('/api/economat', { method: 'PUT', json: { id: article.id, archived: !article.archived } })
    setForm(null); mutate()
  }

  // Un fournisseur se crée aussi sans quitter la fiche (§9 : « un raccourci
  // + Nouveau fournisseur peut rester disponible depuis la fiche article »).
  async function ajouterFournisseur(poser) {
    const nom = prompt('Nom du fournisseur ?')
    if (!nom || !nom.trim()) return
    try {
      const cree = await apiFetch('/api/economat/fournisseurs', { method: 'POST', json: { nom }, silencieux: true })
      await mutate()
      poser(String(cree.id))
    } catch (e) { setErreur(e.message) }
  }

  async function ajouterCategorie() {
    if (!nouvelleCat.nom.trim()) return
    setErreur('')
    try {
      await apiFetch('/api/economat/categories', {
        method: 'POST',
        json: { nom: nouvelleCat.nom, parent_id: nouvelleCat.parent_id || null, couleur: nouvelleCat.parent_id ? null : nouvelleCat.couleur },
        silencieux: true,
      })
      setNouvelleCat({ ...nouvelleCat, nom: '' })
      mutate()
    } catch (e) { setErreur(e.message) }
  }

  async function majCategorie(cat, patch) {
    await apiFetch('/api/economat/categories', { method: 'PUT', json: { id: cat.id, nom: cat.nom, parent_id: cat.parent_id ?? null, ...patch } })
    mutate()
  }

  async function supprimerCategorie(cat) {
    const enfants = arbre.find(r => Number(r.id) === Number(cat.id))?.enfants?.length || 0
    const message = enfants
      ? `Supprimer « ${cat.nom} » et ses ${enfants} sous-catégories ? Les ${cat.nb} articles rangés dessous restent, sans catégorie.`
      : `Supprimer « ${cat.nom} » ? Les ${cat.nb} articles rangés dessous restent, sans catégorie.`
    if (!confirm(message)) return
    await apiFetch('/api/economat/categories', { method: 'DELETE', json: { id: cat.id } })
    if (Number(categorie) === Number(cat.id)) setCategorie(null)
    mutate()
  }

  const lienCartes = () => {
    if (selection.length) return `/api/economat/cartes?ids=${selection.join(',')}`
    if (categorie) return `/api/economat/cartes?categorie=${categorie}`
    return '/api/economat/cartes'
  }

  return (
    <>
      <Head><title>Économat · Maze Project</title></Head>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px 64px' }}>

        <h1 style={{ font: `500 38px ${FONT}`, lineHeight: 1.05, letterSpacing: '-.01em', color: AL.black, margin: 0 }}>
          Économat
        </h1>
        <p style={{ font: `18px ${FONT}`, color: C.muted, margin: '12px 0 24px', maxWidth: 680 }}>
          Les consommables de l’atelier. Les cartes Kanban restent l’outil : ici on voit ce qu’il y a à
          réapprovisionner, on garde l’historique, et on imprime les cartes.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button onClick={() => { setVue('suivi'); setEtat(null) }} style={bouton(vue === 'suivi')}>Suivi</button>
          <button onClick={() => setVue('catalogue')} style={bouton(vue === 'catalogue')}>Catalogue</button>
          <span style={{ flex: 1 }} />
          {vue === 'catalogue' && (
            <>
              <button onClick={() => setPanneau(panneau === 'categories' ? null : 'categories')} style={bouton(false)}>Catégories</button>
              <button onClick={() => setPanneau(panneau === 'listes' ? null : 'listes')} style={bouton(false)}>Listes</button>
              <a href={lienCartes()} target="_blank" rel="noopener noreferrer" style={{ ...bouton(false), textDecoration: 'none' }}>
                Cartes{selection.length ? ` (${selection.length})` : categorie ? ' de la catégorie' : ' — tout'}
              </a>
              <button onClick={() => { setErreur(''); setForm({ ...VIDE }) }} style={bouton(true)}>+ Article</button>
            </>
          )}
        </div>

        {/* ── Pastilles d'état ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={() => setEtat(null)} style={pastille(etat === null)}>Tout {comptes.tout}</button>
          {ETATS.map(e => (
            <button key={e.cle} onClick={() => setEtat(etat === e.cle ? null : e.cle)} style={pastille(etat === e.cle)}>
              {e.emoji} {e.libelle} {comptes[e.cle]}
            </button>
          ))}
          {vue === 'catalogue' && nbACompleter > 0 && (
            <button onClick={() => setACompleter(!aCompleter)} style={pastille(aCompleter)}>
              À compléter {nbACompleter}
            </button>
          )}
        </div>

        {/* ── Filtres ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Chercher une désignation, une référence, une catégorie…"
            style={{ ...champ, flex: '1 1 280px', width: 'auto' }}
          />
          <select value={categorie || ''} onChange={e => setCategorie(e.target.value || null)} style={{ ...champ, width: 'auto' }}>
            <option value="">Toutes catégories</option>
            {arbre.map(r => (
              <optgroup key={r.id} label={`${r.nom} (${r.nb})`}>
                <option value={r.id}>{r.nom} — tout ({r.nb})</option>
                {r.enfants.map(e => <option key={e.id} value={e.id}>{e.nom} ({e.nb})</option>)}
              </optgroup>
            ))}
          </select>
          <select value={fournisseur || ''} onChange={e => setFournisseur(e.target.value || null)} style={{ ...champ, width: 'auto' }}>
            <option value="">Tous fournisseurs</option>
            {listeFournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <select value={emplacement || ''} onChange={e => setEmplacement(e.target.value || null)} style={{ ...champ, width: 'auto' }}>
            <option value="">Tous emplacements</option>
            {emplacements.filter(e => !e.archived || articles.some(a => Number(a.emplacement_id) === Number(e.id)))
              .map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </div>

        {/* Le cas d'usage cité par le brief : filtrer OPO pendant une promo et
            voir tout de suite ce qui est 🟠 et 🔴. */}
        {vue === 'suivi' && (
          <p style={{ font: `13px ${FONT}`, color: C.muted, margin: '0 0 16px' }}>
            {chauds.length === 0
              ? 'Rien à surveiller dans cette sélection.'
              : `${chauds.length} article${chauds.length > 1 ? 's' : ''} à surveiller${fournisseur ? ` chez ${nomFournisseur(fournisseur, fournisseurs)}` : ''}.`}
          </p>
        )}

        {/* ── Panneau des catégories ───────────────────────────────────── */}
        {panneau === 'categories' && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: 16, marginBottom: 18 }}>
            <p style={{ ...micro, marginBottom: 10 }}>Catégories — la couleur est celle du bandeau des cartes</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {arbre.map(r => (
                <div key={r.id}>
                  <LigneCategorie categorie={r} gras onRenommer={(c, nom) => nom !== c.nom && majCategorie(c, { nom })}
                    onCouleur={(c, couleur) => majCategorie(c, { couleur })} onSupprimer={supprimerCategorie} />
                  {r.enfants.map(e => (
                    <LigneCategorie key={e.id} categorie={e} decale onRenommer={(c, nom) => nom !== c.nom && majCategorie(c, { nom })}
                      onSupprimer={supprimerCategorie} />
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={nouvelleCat.nom} onChange={e => setNouvelleCat({ ...nouvelleCat, nom: e.target.value })}
                placeholder="Nouvelle catégorie" style={{ ...champ, flex: '1 1 200px', width: 'auto' }} />
              <select value={nouvelleCat.parent_id} onChange={e => setNouvelleCat({ ...nouvelleCat, parent_id: e.target.value })}
                style={{ ...champ, width: 'auto' }}>
                <option value="">— au premier niveau —</option>
                {arbre.map(r => <option key={r.id} value={r.id}>sous {r.nom}</option>)}
              </select>
              {!nouvelleCat.parent_id && (
                <input type="color" value={nouvelleCat.couleur} onChange={e => setNouvelleCat({ ...nouvelleCat, couleur: e.target.value })}
                  style={{ width: 40, height: 34, border: `1px solid ${C.border}`, borderRadius: R.panel, background: C.surface, cursor: 'pointer' }} />
              )}
              <button onClick={ajouterCategorie} style={bouton(true)}>Ajouter</button>
            </div>
          </div>
        )}

        {/* ── Panneau des listes ───────────────────────────────────────── */}
        {panneau === 'listes' && <Listes listes={listes} articles={articles} mutate={mutate} />}

        {erreur && !form && <p style={{ font: `13px ${FONT}`, color: C.danger, marginBottom: 12 }}>{erreur}</p>}

        {/* ── Liste ────────────────────────────────────────────────────── */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden' }}>
          {ranges.length === 0 && (
            <p style={{ font: `14px ${FONT}`, color: C.muted, padding: 24, margin: 0 }}>Aucun article.</p>
          )}
          {ranges.map((a, i) => (
            <Ligne
              key={a.id} article={a} listes={listes} premier={i === 0}
              catalogue={vue === 'catalogue'}
              choisi={selection.includes(a.id)}
              onChoisir={() => setSelection(sel => (sel.includes(a.id) ? sel.filter(x => x !== a.id) : [...sel, a.id]))}
              onEtat={cle => basculer(a, cle)}
              onOuvrir={() => { setErreur(''); setForm(versFormulaire(a)) }}
            />
          ))}
        </div>

        {vue === 'catalogue' && (
          <p style={{ font: `12.5px ${FONT}`, color: C.muted, marginTop: 14, lineHeight: 1.7 }}>
            Les cartes sortent par planches A4 <strong>paysage</strong>, quatre A6 par feuille, repères de coupe compris.
          </p>
        )}

        {form && (
          <Formulaire
            form={form} setForm={setForm} arbre={arbre} listes={listes} listeFournisseurs={listeFournisseurs}
            enCours={enCours} erreur={erreur} onNouveauFournisseur={ajouterFournisseur}
            onEnregistrer={enregistrer} onFermer={() => setForm(null)} onArchiver={archiver} onGeste={apresGeste}
          />
        )}
      </div>
    </>
  )
}

const rang = cle => ({ commander: 0, bas: 1, commande: 2, ok: 3 }[cle] ?? 4)

/** Une ligne du catalogue : la pastille, ce qu'on cherche, et le geste. */
function Ligne({ article, listes, premier, catalogue, choisi, onChoisir, onEtat, onOuvrir }) {
  const { categories, fournisseurs, emplacements, unites } = listes
  const couleur = couleurDe(article, categories)
  const { feuille, racine } = categorieDe(article, categories)
  const nomCat = [racine?.nom, feuille && feuille.id !== racine?.id ? feuille.nom : null].filter(Boolean).join(' · ')
  const commander = lienCommande(article, fournisseurs)
  const retard = enRetard(article)
  const chezQui = nomFournisseur(article.fournisseur_id, fournisseurs)
  const ou = nomEntree(article.emplacement_id, emplacements)
  const reference = article.type === 'reference'
  const n = niveau(article)
  const incomplet = manquants(article)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', flexWrap: 'wrap',
      borderTop: premier ? 'none' : `1px solid ${C.divider}`,
      background: article.archived ? C.hover : C.surface,
    }}>
      {catalogue && (
        <input type="checkbox" checked={choisi} onChange={onChoisir} title="Ajouter à la planche de cartes"
          disabled={reference}
          style={{ width: 16, height: 16, flex: 'none', cursor: reference ? 'default' : 'pointer', accentColor: AL.black, opacity: reference ? 0.3 : 1 }} />
      )}

      {/* La couleur de la catégorie, au même endroit que sur la carte papier. */}
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: R.pill, background: couleur, flex: 'none' }} />

      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <button onClick={onOuvrir} style={{
          font: `500 14.5px ${FONT}`, color: AL.black, background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', textAlign: 'left', display: 'block', maxWidth: '100%',
        }}>
          {article.designation}
          {article.sous_titre && <span style={{ fontWeight: 400, color: C.muted }}> · {article.sous_titre}</span>}
          {article.archived && <span style={{ font: `11px ${MONO}`, color: C.muted }}> — archivé</span>}
        </button>
        <span style={{ font: `12px ${FONT}`, color: C.muted }}>
          {[nomCat, chezQui, article.reference, ou].filter(Boolean).join(' · ') || '—'}
        </span>
      </div>

      {/* Le stock CALCULÉ, pour un article configuré : niveau réel et cible. */}
      {n && (
        <span title={NIVEAUX[n].libelle} style={{ font: `12.5px ${FONT}`, color: C.ink, flex: 'none' }}>
          {NIVEAUX[n].emoji} {formatQuantite(article.stock, article, unites)}
          <span style={{ color: C.muted }}> / {formatQuantite(article.cible, article, unites)}</span>
        </span>
      )}
      {article.reappro_le && (
        <span title={libellePriseEnCharge(article)} style={{ ...etiquette, color: AL.black, background: C.hover }}>
          🔵 {article.reappro_par || 'pris en charge'}
        </span>
      )}
      {reference && <span style={{ ...etiquette, color: C.muted, background: C.hover }}>référence</span>}
      {catalogue && incomplet.length > 0 && (
        <span title={`À compléter : ${incomplet.join(', ')}`} style={{ ...etiquette, color: C.muted, border: `1px dashed ${C.border}` }}>
          à compléter
        </span>
      )}

      {retard && <span style={{ ...etiquette, color: C.danger, background: C.dangerBg }}>en retard</span>}

      {commander && (
        <a href={commander} target="_blank" rel="noopener noreferrer"
          style={{ font: `12.5px ${FONT}`, color: C.muted, textDecoration: 'none', flex: 'none' }}>
          commander ↗
        </a>
      )}

      {/* Le geste V1 : quatre pastilles, celle qui est active en noir. Il ne
          reste qu'aux articles PAS ENCORE configurés ; les autres bougent par
          leurs gestes de stock. Une référence n'a pas de stock, donc pas d'état. */}
      {!reference && !n && (
        <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
          {ETATS.map(e => (
            <button key={e.cle} onClick={() => onEtat(e.cle)} title={e.libelle}
              style={{
                width: 30, height: 30, borderRadius: R.pill, cursor: 'pointer', fontSize: 14, lineHeight: 1,
                border: `1.5px solid ${article.etat === e.cle ? C.outline : 'transparent'}`,
                background: article.etat === e.cle ? AL.black : C.hover,
                filter: article.etat === e.cle ? 'none' : 'grayscale(1) opacity(.45)',
              }}>
              {e.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LigneCategorie({ categorie, gras, decale, onRenommer, onCouleur, onSupprimer }) {
  const [nom, setNom] = useState(categorie.nom)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: decale ? 18 : 0 }}>
      {decale && <span style={{ color: C.faint }}>↳</span>}
      {!decale && (
        <input type="color" value={categorie.couleur || '#D5D5D5'} onChange={e => onCouleur(categorie, e.target.value)}
          title="Couleur du bandeau de la carte"
          style={{ width: 26, height: 22, border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, cursor: 'pointer', flex: 'none', padding: 0 }} />
      )}
      <input
        value={nom} onChange={e => setNom(e.target.value)} onBlur={() => onRenommer(categorie, nom)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: R.panel, border: '1px solid transparent',
          font: `${gras ? 500 : 400} 13px ${FONT}`, color: C.ink, background: 'transparent', outline: 'none' }}
      />
      <span style={{ font: `11px ${MONO}`, color: C.muted }}>{categorie.nb}</span>
      <button onClick={() => onSupprimer(categorie)}
        style={{ font: `12px ${FONT}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
        supprimer
      </button>
    </div>
  )
}

// ── Listes administrables ────────────────────────────────────────────────
// §9 : les fournisseurs s'administrent INDÉPENDAMMENT de la création d'un
// article. §5, §10, §2.1 : unités, délais et emplacements aussi. On ajoute,
// on renomme, on archive — jamais on ne supprime : une entrée retirée
// laisserait des articles qui la portent sans rien à afficher.

const SECTIONS = [
  { liste: 'fournisseurs', titre: 'Fournisseurs', route: '/api/economat/fournisseurs', champ: 'nom', usage: 'fournisseur_id' },
  { liste: 'unites', titre: 'Unités', route: '/api/economat/listes', champ: 'nom', usage: 'unite_stock_id' },
  { liste: 'delais', titre: 'Délais', route: '/api/economat/listes', champ: 'libelle', usage: 'delai_id' },
  { liste: 'emplacements', titre: 'Emplacements', route: '/api/economat/listes', champ: 'nom', usage: 'emplacement_id' },
]

function Listes({ listes, articles, mutate }) {
  const [souci, setSouci] = useState('')
  async function envoyer(section, method, corps) {
    setSouci('')
    try {
      const json = section.liste === 'fournisseurs' ? corps : { liste: section.liste, ...corps }
      await apiFetch(section.route, { method, json, silencieux: true })
      mutate()
      return true
    } catch (e) { setSouci(e.message); return false }
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: 16, marginBottom: 18 }}>
      {souci && <p style={{ font: `13px ${FONT}`, color: C.danger, margin: '0 0 12px' }}>{souci}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
        {SECTIONS.map(section => (
          <SectionListe key={section.liste} section={section} entrees={listes[section.liste] || []}
            articles={articles} envoyer={envoyer} />
        ))}
      </div>
    </div>
  )
}

function SectionListe({ section, entrees, articles, envoyer }) {
  const [nouveau, setNouveau] = useState({ nom: '', pluriel: '', feminin: false, jours_ouvrables: '' })
  const utilisee = id => articles.filter(a => !a.archived && (Number(a[section.usage]) === Number(id)
    || (section.liste === 'unites' && Number(a.unite_cmd_id) === Number(id))
    || (section.liste === 'fournisseurs' && Number(a.fournisseur_alt_id) === Number(id)))).length

  async function ajouter() {
    if (!nouveau.nom.trim()) return
    const corps = { [section.champ]: nouveau.nom }
    if (section.liste === 'unites') Object.assign(corps, { pluriel: nouveau.pluriel || nouveau.nom, feminin: nouveau.feminin })
    if (section.liste === 'delais') corps.jours_ouvrables = nouveau.jours_ouvrables
    if (await envoyer(section, 'POST', corps)) setNouveau({ nom: '', pluriel: '', feminin: false, jours_ouvrables: '' })
  }

  return (
    <div>
      <p style={{ ...micro, marginBottom: 8 }}>{section.titre}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {entrees.map(e => (
          <EntreeListe key={e.id} section={section} entree={e} nb={utilisee(e.id)}
            onMaj={patch => envoyer(section, 'PUT', { id: e.id, ...patch })} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={nouveau.nom} onChange={e => setNouveau({ ...nouveau, nom: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') ajouter() }}
          placeholder={section.liste === 'delais' ? 'Nouveau délai' : 'Ajouter…'}
          style={{ ...champ, flex: '1 1 120px', width: 'auto', padding: '6px 10px' }} />
        {section.liste === 'unites' && nouveau.nom && (
          <>
            <input value={nouveau.pluriel} onChange={e => setNouveau({ ...nouveau, pluriel: e.target.value })}
              placeholder="Pluriel" style={{ ...champ, flex: '1 1 90px', width: 'auto', padding: '6px 10px' }} />
            <label style={{ font: `12px ${FONT}`, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={nouveau.feminin} onChange={e => setNouveau({ ...nouveau, feminin: e.target.checked })} />
              féminin
            </label>
          </>
        )}
        {section.liste === 'delais' && nouveau.nom && (
          <input value={nouveau.jours_ouvrables} onChange={e => setNouveau({ ...nouveau, jours_ouvrables: e.target.value })}
            placeholder="jours" title="Jours ouvrables — sert plus tard à signaler un retard ; vide = sur commande"
            style={{ ...champ, width: 70, padding: '6px 10px' }} />
        )}
        <button onClick={ajouter} style={{ ...bouton(true), padding: '6px 12px' }}>+</button>
      </div>
    </div>
  )
}

function EntreeListe({ section, entree, nb, onMaj }) {
  const [nom, setNom] = useState(entree[section.champ])
  const [pluriel, setPluriel] = useState(entree.pluriel || '')
  const [jours, setJours] = useState(entree.jours_ouvrables ?? '')
  const ligne = { flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: R.panel, border: '1px solid transparent',
    font: `13px ${FONT}`, color: entree.archived ? C.muted : C.ink, background: 'transparent', outline: 'none' }
  const valider = e => { if (e.key === 'Enter') e.currentTarget.blur() }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input value={nom} onChange={e => setNom(e.target.value)} onKeyDown={valider}
        onBlur={() => nom !== entree[section.champ] && onMaj({ [section.champ]: nom })}
        style={{ ...ligne, textDecoration: entree.archived ? 'line-through' : 'none' }} />
      {section.liste === 'unites' && (
        <>
          <input value={pluriel} onChange={e => setPluriel(e.target.value)} onKeyDown={valider} title="Pluriel"
            onBlur={() => pluriel !== entree.pluriel && onMaj({ pluriel })} style={{ ...ligne, flex: '0 1 90px', color: C.muted }} />
          <button onClick={() => onMaj({ feminin: !entree.feminin })} title="Genre — « Pleine » ou « Plein » sur la vue rapide"
            style={{ font: `11px ${MONO}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', flex: 'none' }}>
            {entree.feminin ? 'f.' : 'm.'}
          </button>
        </>
      )}
      {section.liste === 'delais' && (
        <input value={jours} onChange={e => setJours(e.target.value)} onKeyDown={valider} title="Jours ouvrables — vide = sur commande"
          onBlur={() => String(jours) !== String(entree.jours_ouvrables ?? '') && onMaj({ jours_ouvrables: jours })}
          placeholder="—" style={{ ...ligne, flex: '0 0 40px', textAlign: 'right', color: C.muted }} />
      )}
      <span title="Articles qui l'utilisent" style={{ font: `11px ${MONO}`, color: C.muted, flex: 'none', minWidth: 18, textAlign: 'right' }}>{nb || ''}</span>
      <button onClick={() => onMaj({ archived: !entree.archived })}
        style={{ font: `12px ${FONT}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', flex: 'none' }}>
        {entree.archived ? 'réactiver' : 'archiver'}
      </button>
    </div>
  )
}

// ── La fiche article ─────────────────────────────────────────────────────

/** Un bloc de la fiche, avec son titre. */
function Bloc({ titre, children }) {
  return (
    <section style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 16, marginTop: 18 }}>
      <h3 style={{ font: `500 15px ${FONT}`, color: AL.black, margin: '0 0 12px' }}>{titre}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}

/** L'ancienne valeur texte de V1, montrée sous un champ vide pour aider la
 *  reprise (§26 : « les anciens seuils textuels peuvent aider à préparer la
 *  migration »). Elle ne se convertit pas toute seule. */
function Ancien({ valeur }) {
  if (!String(valeur || '').trim()) return null
  return <span style={aide}>V1 : « {valeur} »</span>
}

function Formulaire({ form, setForm, arbre, listes, listeFournisseurs, enCours, erreur, onNouveauFournisseur, onEnregistrer, onFermer, onArchiver, onGeste }) {
  const { unites, delais, emplacements, fournisseurs } = listes
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const reference = form.type === 'reference'
  const info = etatInfo(form.etat)

  // Changer le mode de suivi ou le découpage change la valeur d'une part :
  // les seuils déjà choisis ne voudraient plus rien dire, on les vide.
  const setStructure = (k, v) => setForm(f => ({ ...f, [k]: v, seuil_orange: '', seuil_rouge: '' }))

  // L'article tel que la fiche le décrit, pour afficher les quantités.
  const d = form.suivi === 'approx' ? Number(form.decoupage) || 0 : 1
  const cibleParts = form.suivi === 'approx' ? (d || null) : (form.cible_unites === '' ? null : Number(form.cible_unites))
  const apercu = { suivi: form.suivi, decoupage: d, unite_stock_id: form.unite_stock_id }
  const choix = cibleParts ? choixQuantites(apercu, unites, { jusqua: cibleParts - 1 }) : []
  const configure = estConfigure(form)
  const incomplet = form.id ? manquants({ ...form, categorie_id: form.categorie_id || null, emplacement_id: form.emplacement_id || null }) : []

  return (
    <div onClick={onFermer} style={{
      position: 'fixed', inset: 0, background: 'rgba(12,12,12,.35)', zIndex: 60,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(600px, 100%)', background: C.surface, height: '100%', overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
          <h2 style={{ font: `500 22px ${FONT}`, color: AL.black, margin: 0 }}>
            {form.id ? form.designation || 'Article' : 'Nouvel article'}
          </h2>
          {form.code && <span style={{ font: `12px ${MONO}`, color: C.muted }}>{form.code}</span>}
        </div>

        {incomplet.length > 0 && (
          <p style={{ font: `13px ${FONT}`, color: C.ink, background: C.hover, borderRadius: R.panel, padding: '8px 12px', margin: '0 0 6px' }}>
            À compléter : {incomplet.join(', ')}.
          </p>
        )}

        {/* ── Identification (§2.1) ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {TYPES.map(t => (
              <button key={t.cle} onClick={() => set('type', t.cle)} style={pastille(form.type === t.cle)}>{t.libelle}</button>
            ))}
          </div>
          {reference && (
            <span style={{ ...aide, marginTop: -8 }}>
              Une référence est gardée comme mémoire technique : pas de stock, pas de seuil, pas de carte Kanban.
            </span>
          )}

          <label><span style={micro}>Désignation</span>
            <input value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Lames réversibles" style={champ} /></label>
          <label><span style={micro}>Sous-titre — facultatif</span>
            <input value={form.sous_titre} onChange={e => set('sous_titre', e.target.value)} placeholder="12 × 12 × 1,5 mm" style={champ} /></label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label><span style={micro}>Catégorie</span>
              <select value={form.categorie_id} onChange={e => set('categorie_id', e.target.value)} style={champ}>
                <option value="">— choisir —</option>
                {arbre.map(r => (
                  <optgroup key={r.id} label={r.nom}>
                    <option value={r.id}>{r.nom}</option>
                    {r.enfants.map(e2 => <option key={e2.id} value={e2.id}>↳ {e2.nom}</option>)}
                  </optgroup>
                ))}
              </select></label>
            {!reference && (
              <label><span style={micro}>Emplacement du stock suivi</span>
                <select value={form.emplacement_id} onChange={e => set('emplacement_id', e.target.value)} style={champ}>
                  <option value="">— choisir —</option>
                  {entreesUtiles(emplacements, form.emplacement_id).map(e2 => <option key={e2.id} value={e2.id}>{e2.nom}</option>)}
                </select>
                <Ancien valeur={form.emplacement_id ? '' : form.emplacement} /></label>
            )}
          </div>

          <Photo form={form} set={set} />
        </div>

        {/* ── Gestes (§15 : aussi depuis l'interface desktop) ──────────
            Sur l'article TEL QU'IL EST EN BASE : un geste ne s'applique pas
            à une configuration pas encore enregistrée. */}
        {form.id && !reference && form.enBase && estConfigure(form.enBase) && (
          <Bloc titre="Gestes">
            <EconomatGestes article={{ ...form.enBase, reappro_par: form.reappro_par, reappro_le: form.reappro_le, stock: form.stock }}
              unites={unites} fournisseurs={fournisseurs} onMaj={onGeste} />
          </Bloc>
        )}

        {/* ── Stock et seuils (§4, §6) ──────────────────────────────── */}
        {!reference && (
          <Bloc titre="Stock">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <label><span style={micro}>Mode de suivi</span>
                <select value={form.suivi} onChange={e => setStructure('suivi', e.target.value)} style={champ}>
                  <option value="">— pas encore configuré —</option>
                  {SUIVIS.map(x => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}
                </select></label>
              {form.suivi === 'approx' && (
                <label><span style={micro}>Découpage</span>
                  <select value={form.decoupage} onChange={e => setStructure('decoupage', e.target.value)} style={champ}>
                    <option value="">— choisir —</option>
                    {DECOUPAGES.map(x => <option key={x.n} value={x.n}>{x.libelle}</option>)}
                  </select></label>
              )}
              {form.suivi && (
                <label><span style={micro}>Unité de stock</span>
                  <select value={form.unite_stock_id} onChange={e => set('unite_stock_id', e.target.value)} style={champ}>
                    <option value="">— choisir —</option>
                    {entreesUtiles(unites, form.unite_stock_id).map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}
                  </select>
                  <Ancien valeur={form.unite} /></label>
              )}
              {form.suivi === 'approx' && (
                <div><span style={micro}>Stock cible</span>
                  <span style={{ font: `14px ${FONT}`, color: AL.black, display: 'block', padding: '8px 0' }}>
                    {formatQuantite(d || 1, { ...apercu, decoupage: d || 1 }, unites) || '1 contenant'}
                  </span>
                  <span style={{ ...aide, marginTop: 0 }}>Un seul contenant. Pour en suivre plusieurs, passe en quantité entière.</span>
                </div>
              )}
              {form.suivi === 'entier' && (
                <label><span style={micro}>Stock cible</span>
                  <input type="number" min="1" step="1" inputMode="numeric" value={form.cible_unites}
                    onChange={e => { set('cible_unites', e.target.value); set('seuil_orange', ''); set('seuil_rouge', '') }}
                    placeholder="3" style={champ} />
                  <Ancien valeur={form.stock_cible} /></label>
              )}
            </div>

            {form.suivi && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label><span style={micro}>🟠 Stock bas — facultatif</span>
                  <select value={form.seuil_orange} onChange={e => set('seuil_orange', e.target.value)} style={champ} disabled={!choix.length}>
                    <option value="">— aucun —</option>
                    {choix.filter(c => form.seuil_rouge === '' || c.parts > Number(form.seuil_rouge))
                      .map(c => <option key={c.parts} value={c.parts}>{c.libelle}</option>)}
                  </select>
                  <Ancien valeur={form.seuil_bas} /></label>
                <label><span style={micro}>🔴 À réapprovisionner</span>
                  <select value={form.seuil_rouge} onChange={e => set('seuil_rouge', e.target.value)} style={champ} disabled={!choix.length}>
                    <option value="">— choisir —</option>
                    {choix.filter(c => form.seuil_orange === '' || c.parts < Number(form.seuil_orange))
                      .map(c => <option key={c.parts} value={c.parts}>{c.libelle}</option>)}
                  </select>
                  <Ancien valeur={form.seuil_commander} /></label>
              </div>
            )}
            {form.suivi && !choix.length && (
              <span style={{ ...aide, marginTop: -6 }}>Choisis {form.suivi === 'approx' && !d ? 'le découpage et ' : ''}le stock cible pour proposer les seuils.</span>
            )}
            {!form.suivi && (form.seuil_commander || form.stock_cible) && (
              <span style={aide}>V1 : seuil « {form.seuil_commander || '—'} »{form.stock_cible ? `, cible « ${form.stock_cible} »` : ''}.</span>
            )}

            {/* Le stock actuel n'est pas un paramètre de création (§4.2) : il
                est posé à la cible, puis vit avec les mouvements. Il se
                CORRIGE ici, en cas d'erreur ou d'inventaire. */}
            {form.id && configure && (
              <CorrectionStock form={form} set={set} unites={unites} />
            )}
            {form.suivi && !configure && (
              <span style={aide}>Le stock actuel sera posé au stock cible à l’enregistrement.</span>
            )}
          </Bloc>
        )}

        {/* ── Approvisionnement (§8) ────────────────────────────────── */}
        <Bloc titre={reference ? 'Fournisseur' : 'Approvisionnement'}>
          {!reference && (
            <div style={{ display: 'flex', gap: 6 }}>
              {MODES_APPRO.map(m => (
                <button key={m.cle} onClick={() => set('mode_appro', form.mode_appro === m.cle ? '' : m.cle)} style={pastille(form.mode_appro === m.cle)}>
                  {m.libelle}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label><span style={micro}>Fournisseur principal</span>
              <select value={form.fournisseur_id} onChange={e => {
                if (e.target.value === '+') { onNouveauFournisseur(id => set('fournisseur_id', id)); return }
                set('fournisseur_id', e.target.value)
              }} style={champ}>
                <option value="">— aucun —</option>
                {entreesUtiles(listeFournisseurs, form.fournisseur_id).map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                <option value="+">+ nouveau fournisseur…</option>
              </select></label>
            <label><span style={micro}>Référence fournisseur</span>
              <input value={form.reference} onChange={e => set('reference', e.target.value)} style={{ ...champ, fontFamily: MONO }} /></label>
          </div>

          <label><span style={micro}>Lien produit — facultatif</span>
            <input value={form.url_produit} onChange={e => set('url_produit', e.target.value)} placeholder="https://…" style={champ} />
            <span style={aide}>
              Chez OPO, le lien se fabrique tout seul depuis la référence. Une adresse saisie ici le remplace.
            </span></label>

          {!reference && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <label><span style={micro}>Quantité habituelle</span>
                  <input type="number" min="1" step="1" inputMode="numeric" value={form.quantite_cmd}
                    onChange={e => set('quantite_cmd', e.target.value)} placeholder="1000" style={champ} />
                  <Ancien valeur={form.quantite_cmd ? '' : form.quantite_commande} /></label>
                <label><span style={micro}>Unité de commande</span>
                  <select value={form.unite_cmd_id} onChange={e => set('unite_cmd_id', e.target.value)} style={champ}>
                    <option value="">— choisir —</option>
                    {entreesUtiles(unites, form.unite_cmd_id).map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}
                  </select></label>
                <label><span style={micro}>Délai habituel</span>
                  <select value={form.delai_id} onChange={e => set('delai_id', e.target.value)} style={champ}>
                    <option value="">— choisir —</option>
                    {entreesUtiles(delais, form.delai_id).map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                  </select>
                  <Ancien valeur={form.delai_id ? '' : form.delai} /></label>
              </div>
              {form.quantite_cmd && form.unite_cmd_id && (
                <span style={{ ...aide, marginTop: -8 }}>Imprimé sur la carte : « {formatCommande({ quantite_cmd: form.quantite_cmd, unite_cmd_id: form.unite_cmd_id }, unites)} ».</span>
              )}

              <label><span style={micro}>Note d’approvisionnement — facultative</span>
                <input value={form.note_appro} onChange={e => set('note_appro', e.target.value)}
                  placeholder={form.mode_appro === 'magasin' ? 'Ramener la bouteille vide — échange / consigne' : ''} style={champ} /></label>
            </>
          )}

          <label><span style={micro}>Fournisseur alternatif — facultatif</span>
            <select value={form.fournisseur_alt_id} onChange={e => set('fournisseur_alt_id', e.target.value)} style={champ}>
              <option value="">— aucun —</option>
              {entreesUtiles(listeFournisseurs, form.fournisseur_alt_id).map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select></label>
        </Bloc>

        {/* ── Projets et notes (§3.2) ───────────────────────────────── */}
        <Bloc titre="Projets et notes">
          <Projets form={form} set={set} />
          <label><span style={micro}>Notes internes</span>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} style={champ} /></label>
        </Bloc>

        {form.id && !reference && (
          <p style={{ font: `12px ${FONT}`, color: C.muted, margin: '18px 0 0' }}>
            État V1 : {info.emoji} {info.libelle} · il se change depuis la liste ou en scannant la carte.
          </p>
        )}

        {erreur && <p style={{ font: `13px ${FONT}`, color: C.danger, marginTop: 12 }}>{erreur}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
          <button onClick={onEnregistrer} disabled={enCours} style={bouton(true)}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={onFermer} style={bouton(false)}>Annuler</button>
          <span style={{ flex: 1 }} />
          {form.id && (
            <>
              {!reference && (
                <a href={`/api/economat/cartes?ids=${form.id}`} target="_blank" rel="noopener noreferrer"
                  style={{ ...bouton(false), textDecoration: 'none' }}>Carte</a>
              )}
              {/* Un article se RANGE, il ne se jette pas : son code est imprimé
                  sur une carte et cité dans l'historique des commandes. */}
              <button onClick={() => onArchiver(form)} style={bouton(false)}>
                {form.archived ? 'Réactiver' : 'Archiver'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Le stock actuel et sa correction (§4.2). La correction n'est envoyée que
 *  si on la touche : enregistrer une fiche ne doit pas réécrire un stock qui
 *  a bougé entre-temps. */
function CorrectionStock({ form, set, unites }) {
  const article = { ...form, decoupage: Number(form.decoupage) || 1 }
  const max = Math.max(Number(form.cible) || 0, Number(form.stock) || 0)
  const options = choixQuantites(article, unites, { jusqua: max })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
      <div>
        <span style={micro}>Stock actuel</span>
        <span style={{ font: `15px ${FONT}`, color: AL.black }}>
          {NIVEAUX[niveau(form)]?.emoji} {formatQuantite(form.stock, article, unites)}
        </span>
      </div>
      <label><span style={micro}>Corriger — erreur ou inventaire</span>
        {form.suivi === 'entier' ? (
          <input type="number" min="0" step="1" inputMode="numeric" value={form.stock_corrige ?? ''}
            onChange={e => set('stock_corrige', e.target.value)} placeholder={String(form.stock)} style={champ} />
        ) : (
          <select value={form.stock_corrige ?? ''} onChange={e => set('stock_corrige', e.target.value)} style={champ}>
            <option value="">— inchangé —</option>
            {options.map(o => <option key={o.parts} value={o.parts}>{o.libelle}</option>)}
          </select>
        )}
      </label>
    </div>
  )
}

/** Les projets où l'article a servi (§3.2). La liste des projets n'est
 *  chargée qu'à l'ouverture d'une fiche. */
function Projets({ form, set }) {
  const { data } = useSWR('/api/projects?light=1')
  const projets = data || []
  const nom = id => {
    const p = projets.find(x => String(x.id) === String(id))
    return p ? [p.numero, p.name].filter(Boolean).join(' · ') : '…'
  }
  const libres = projets.filter(p => !form.projets.includes(p.id))
    .sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0))
  return (
    <div>
      <span style={micro}>Projets associés</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: form.projets.length ? 8 : 0 }}>
        {form.projets.map(id => (
          <span key={id} style={{ ...pastille(false), cursor: 'default', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {nom(id)}
            <button onClick={() => set('projets', form.projets.filter(x => x !== id))} title="Retirer"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, font: `13px ${FONT}` }}>×</button>
          </span>
        ))}
      </div>
      <select value="" onChange={e => e.target.value && set('projets', [...form.projets, e.target.value])} style={champ}>
        <option value="">+ associer un projet…</option>
        {libres.map(p => <option key={p.id} value={p.id}>{[p.numero, p.name, p.client].filter(Boolean).join(' · ')}</option>)}
      </select>
    </div>
  )
}

/** La photo, réduite dans le navigateur avant l'envoi : une photo d'iPhone
 *  fait huit mégaoctets, et le corps d'une requête est plafonné à 4,5 Mo sur
 *  Vercel, tous plans confondus. */
function Photo({ form, set }) {
  const [enCours, setEnCours] = useState(false)

  async function deposer(fichier) {
    if (!fichier) return
    setEnCours(true)
    try {
      const image = await reduire(fichier)
      const { path } = await apiFetch('/api/economat/photo', { method: 'POST', json: { image } })
      set('photo_path', path)
    } finally { setEnCours(false) }
  }

  return (
    <div>
      <span style={micro}>Photo</span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: R.panel, border: `1px solid ${C.border}`, flex: 'none',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          font: `10px ${MONO}`, color: C.muted, background: C.hover,
        }}>
          {form.photo_path ? <img src={urlPhoto(form.photo_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : 'aucune'}
        </div>
        <input type="file" accept="image/*" onChange={e => deposer(e.target.files?.[0])}
          style={{ font: `12.5px ${FONT}`, color: C.muted }} />
        {enCours && <span style={{ font: `12.5px ${FONT}`, color: C.muted }}>envoi…</span>}
        {form.photo_path && !enCours && (
          <button onClick={() => set('photo_path', '')} style={{ font: `12px ${FONT}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
            retirer
          </button>
        )}
      </div>
    </div>
  )
}

const urlPhoto = chemin =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/economat-photos/${chemin}`

/** 1200 px de côté, JPEG qualité 0,82 : largement assez pour une vignette de
 *  34 mm sur une carte et pour un écran de téléphone. */
function reduire(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible'))
    lecteur.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Image illisible'))
      img.onload = () => {
        const cote = Math.max(img.width, img.height)
        const k = cote > 1200 ? 1200 / cote : 1
        const toile = document.createElement('canvas')
        toile.width = Math.round(img.width * k)
        toile.height = Math.round(img.height * k)
        toile.getContext('2d').drawImage(img, 0, 0, toile.width, toile.height)
        resolve(toile.toDataURL('image/jpeg', 0.82))
      }
      img.src = lecteur.result
    }
    lecteur.readAsDataURL(fichier)
  })
}
