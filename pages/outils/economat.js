// Économat — les consommables de l'atelier, derrière le Kanban physique.
//
// Deux vues, et leur ordre n'est pas neutre. LE SUIVI D'ABORD : ce qu'on vient
// chercher ici, c'est « qu'est-ce qu'il y a à commander », pas « montre-moi
// les 84 articles ». Le vert reste accessible, en second. Le catalogue sert à
// créer, corriger et imprimer les cartes — trois gestes qu'on fait une fois
// par mois, contre un coup d'œil au suivi qu'on fait avant chaque commande.
//
// Maze ne décide JAMAIS d'un état : les seuils sont du texte, personne ne les
// compare à rien, et c'est un humain devant une boîte qui bascule la pastille.
import { useState, useMemo } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import { apiFetch } from '../../lib/api'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import {
  ETATS, ETATS_CHAUDS, etatInfo, arbreEconomat, filtrerArticles, compterEtats,
  valeursDistinctes, fournisseursUtiles, nomFournisseur, categorieDe, couleurDe,
  lienCommande, enRetard,
} from '../../lib/economat'

const VIDE = {
  designation: '', categorie_id: '', fournisseur_id: '', fournisseur_alt_id: '',
  reference: '', url_produit: '', delai: '', delai_jours: '', unite: '', stock_cible: '',
  seuil_bas: '', seuil_commander: '', quantite_commande: '', emplacement: '', notes: '',
  photo_path: '',
}

const champ = {
  width: '100%', padding: '8px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
  font: `13.5px ${FONT}`, color: C.ink, background: C.surface, outline: 'none', resize: 'vertical',
}
const micro = {
  fontSize: 10.5, fontWeight: 500, fontFamily: MONO, letterSpacing: '.08em',
  textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 4,
}
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

export default function Economat() {
  const { data, mutate } = useSWR('/api/economat')
  const [vue, setVue] = useState('suivi')          // suivi | catalogue
  const [recherche, setRecherche] = useState('')
  const [categorie, setCategorie] = useState(null)
  const [etat, setEtat] = useState(null)
  const [fournisseur, setFournisseur] = useState(null)
  const [emplacement, setEmplacement] = useState(null)
  const [form, setForm] = useState(null)
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [gestion, setGestion] = useState(false)
  const [nouvelleCat, setNouvelleCat] = useState({ nom: '', parent_id: '', couleur: '#D5D5D5' })
  const [selection, setSelection] = useState([])

  const articles = useMemo(() => data?.articles || [], [data])
  const categories = useMemo(() => data?.categories || [], [data])
  const fournisseurs = useMemo(() => data?.fournisseurs || [], [data])
  const arbre = arbreEconomat(categories, articles)
  const comptes = compterEtats(articles)
  const listeFournisseurs = fournisseursUtiles(fournisseurs, articles)

  const visibles = filtrerArticles(articles, {
    recherche, categorie, etat, fournisseur, emplacement, categories, fournisseurs,
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
      const corps = { ...form }
      for (const k of ['code', 'jeton', 'etat', 'etat_le', 'created_at', 'updated_at', 'created_by']) delete corps[k]
      await apiFetch('/api/economat', { method: form.id ? 'PUT' : 'POST', json: corps, silencieux: true })
      setForm(null); mutate()
    } catch (e) { setErreur(e.message) } finally { setEnCours(false) }
  }

  async function archiver(article) {
    await apiFetch('/api/economat', { method: 'PUT', json: { id: article.id, archived: !article.archived } })
    setForm(null); mutate()
  }

  // Un fournisseur se crée sans quitter la fiche : forcer un détour par un
  // écran d'administration pour taper « Distrelec » ferait saisir « OPO » dans
  // le champ référence, et c'est exactement ce qu'on cherche à éviter.
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
          Le catalogue des consommables. Le Kanban de l’atelier reste l’outil : ici on voit d’un coup
          ce qu’il y a à commander, on garde l’historique, et on imprime les cartes.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button onClick={() => { setVue('suivi'); setEtat(null) }} style={bouton(vue === 'suivi')}>Suivi</button>
          <button onClick={() => setVue('catalogue')} style={bouton(vue === 'catalogue')}>Catalogue</button>
          <span style={{ flex: 1 }} />
          {vue === 'catalogue' && (
            <>
              <button onClick={() => setGestion(!gestion)} style={bouton(false)}>Catégories</button>
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
          {valeursDistinctes(articles, 'emplacement').length > 0 && (
            <select value={emplacement || ''} onChange={e => setEmplacement(e.target.value || null)} style={{ ...champ, width: 'auto' }}>
              <option value="">Tous emplacements</option>
              {valeursDistinctes(articles, 'emplacement').map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
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
        {gestion && (
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

        {erreur && <p style={{ font: `13px ${FONT}`, color: C.danger, marginBottom: 12 }}>{erreur}</p>}

        {/* ── Liste ────────────────────────────────────────────────────── */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden' }}>
          {ranges.length === 0 && (
            <p style={{ font: `14px ${FONT}`, color: C.muted, padding: 24, margin: 0 }}>Aucun article.</p>
          )}
          {ranges.map((a, i) => (
            <Ligne
              key={a.id} article={a} categories={categories} fournisseurs={fournisseurs} premier={i === 0}
              catalogue={vue === 'catalogue'}
              choisi={selection.includes(a.id)}
              onChoisir={() => setSelection(s => (s.includes(a.id) ? s.filter(x => x !== a.id) : [...s, a.id]))}
              onEtat={cle => basculer(a, cle)}
              onOuvrir={() => {
                setErreur('')
                setForm({
                  ...VIDE, ...a,
                  categorie_id: a.categorie_id || '',
                  fournisseur_id: a.fournisseur_id || '',
                  fournisseur_alt_id: a.fournisseur_alt_id || '',
                  delai_jours: a.delai_jours ?? '',
                })
              }}
            />
          ))}
        </div>

        {vue === 'catalogue' && (
          <p style={{ font: `12.5px ${FONT}`, color: C.muted, marginTop: 14, lineHeight: 1.7 }}>
            Les cartes sortent par planches A4 <strong>paysage</strong>, quatre A6 par feuille, repères de coupe compris.
            L’état courant et le stock cible ne sont pas imprimés : ils changent, la carte non.
          </p>
        )}

        {form && (
          <Formulaire
            form={form} setForm={setForm} arbre={arbre} fournisseurs={listeFournisseurs}
            enCours={enCours} erreur={erreur} onNouveauFournisseur={ajouterFournisseur}
            onEnregistrer={enregistrer} onFermer={() => setForm(null)} onArchiver={archiver}
          />
        )}
      </div>
    </>
  )
}

const rang = cle => ({ commander: 0, bas: 1, commande: 2, ok: 3 }[cle] ?? 4)

/** Une ligne du catalogue : la pastille, ce qu'on cherche, et le geste. */
function Ligne({ article, categories, fournisseurs, premier, catalogue, choisi, onChoisir, onEtat, onOuvrir }) {
  const couleur = couleurDe(article, categories)
  const { feuille, racine } = categorieDe(article, categories)
  const nomCat = [racine?.nom, feuille && feuille.id !== racine?.id ? feuille.nom : null].filter(Boolean).join(' · ')
  const commander = lienCommande(article, fournisseurs)
  const retard = enRetard(article)
  const chezQui = nomFournisseur(article.fournisseur_id, fournisseurs)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', flexWrap: 'wrap',
      borderTop: premier ? 'none' : `1px solid ${C.divider}`,
      background: article.archived ? C.hover : C.surface,
    }}>
      {catalogue && (
        <input type="checkbox" checked={choisi} onChange={onChoisir} title="Ajouter à la planche de cartes"
          style={{ width: 16, height: 16, flex: 'none', cursor: 'pointer', accentColor: AL.black }} />
      )}

      {/* La couleur de la catégorie, au même endroit que sur la carte papier. */}
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: R.pill, background: couleur, flex: 'none' }} />

      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <button onClick={onOuvrir} style={{
          font: `500 14.5px ${FONT}`, color: AL.black, background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', textAlign: 'left', display: 'block', maxWidth: '100%',
        }}>
          {article.designation}
          {article.archived && <span style={{ font: `11px ${MONO}`, color: C.muted }}> — archivé</span>}
        </button>
        <span style={{ font: `12px ${FONT}`, color: C.muted }}>
          {[nomCat, chezQui, article.reference, article.emplacement].filter(Boolean).join(' · ') || '—'}
        </span>
      </div>

      {retard && (
        <span style={{
          font: `500 10.5px ${MONO}`, letterSpacing: '.06em', textTransform: 'uppercase',
          color: C.danger, background: C.dangerBg, borderRadius: R.pill, padding: '3px 8px', flex: 'none',
        }}>en retard</span>
      )}

      {commander && (
        <a href={commander} target="_blank" rel="noopener noreferrer"
          style={{ font: `12.5px ${FONT}`, color: C.muted, textDecoration: 'none', flex: 'none' }}>
          commander ↗
        </a>
      )}

      {/* Le geste : quatre pastilles, celle qui est active en noir. */}
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

/** La fiche article. Seule la désignation est exigée : la moitié des colonnes
 *  du fichier repris de Numbers sont vides, et exiger une fiche complète
 *  reviendrait à n'en saisir aucune. */
function Formulaire({ form, setForm, arbre, fournisseurs, enCours, erreur, onNouveauFournisseur, onEnregistrer, onFermer, onArchiver }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const info = etatInfo(form.etat)

  return (
    <div onClick={onFermer} style={{
      position: 'fixed', inset: 0, background: 'rgba(12,12,12,.35)', zIndex: 60,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 100%)', background: C.surface, height: '100%', overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
          <h2 style={{ font: `500 22px ${FONT}`, color: AL.black, margin: 0 }}>
            {form.id ? form.designation || 'Article' : 'Nouvel article'}
          </h2>
          {form.code && <span style={{ font: `12px ${MONO}`, color: C.muted }}>{form.code}</span>}
        </div>

        {form.id && (
          <p style={{ font: `13px ${FONT}`, color: C.muted, margin: '0 0 18px' }}>
            {info.emoji} {info.libelle} · l’état se change depuis la liste ou en scannant la carte.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label><span style={micro}>Désignation</span>
            <input value={form.designation} onChange={e => set('designation', e.target.value)} style={champ} /></label>

          <label><span style={micro}>Catégorie</span>
            <select value={form.categorie_id} onChange={e => set('categorie_id', e.target.value)} style={champ}>
              <option value="">— sans catégorie —</option>
              {arbre.map(r => (
                <optgroup key={r.id} label={r.nom}>
                  <option value={r.id}>{r.nom}</option>
                  {r.enfants.map(e2 => <option key={e2.id} value={e2.id}>↳ {e2.nom}</option>)}
                </optgroup>
              ))}
            </select></label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Liste contrôlée, pas de texte libre : le fournisseur est un
                filtre métier, et une colonne libre produirait « OPO », « opo »
                et « OPO Oeschger » côte à côte au bout de six mois. */}
            <label><span style={micro}>Fournisseur</span>
              <select value={form.fournisseur_id} onChange={e => {
                if (e.target.value === '+') { onNouveauFournisseur(id => set('fournisseur_id', id)); return }
                set('fournisseur_id', e.target.value)
              }} style={champ}>
                <option value="">— aucun —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                <option value="+">+ nouveau fournisseur…</option>
              </select></label>
            <label><span style={micro}>Référence fournisseur</span>
              <input value={form.reference} onChange={e => set('reference', e.target.value)} style={{ ...champ, fontFamily: MONO }} /></label>
          </div>

          <label><span style={micro}>URL produit — facultative</span>
            <input value={form.url_produit} onChange={e => set('url_produit', e.target.value)} placeholder="https://…" style={champ} />
            {/* Le bouton « Commander » se déduit de la référence chez OPO :
                inutile de saisir une URL pour les trois quarts du catalogue. */}
            <span style={{ font: `12px ${FONT}`, color: C.muted, display: 'block', marginTop: 4 }}>
              Chez OPO, le bouton « Commander » se fabrique tout seul depuis la référence.
              Une adresse saisie ici la remplace — pour les exceptions.
            </span></label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label><span style={micro}>Délai habituel</span>
              <input value={form.delai} onChange={e => set('delai', e.target.value)} placeholder="Le lendemain si avant 17h" style={champ} /></label>
            <label><span style={micro}>Délai en jours — pour signaler un retard</span>
              <input value={form.delai_jours} onChange={e => set('delai_jours', e.target.value)} placeholder="vide = aucun signalement" style={champ} /></label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label><span style={micro}>Seuil 🟠 stock bas</span>
              <input value={form.seuil_bas} onChange={e => set('seuil_bas', e.target.value)} placeholder="½ rouleau" style={champ} /></label>
            <label><span style={micro}>Seuil 🔴 à commander</span>
              <input value={form.seuil_commander} onChange={e => set('seuil_commander', e.target.value)} placeholder="Si inférieur à 100pce" style={champ} /></label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label><span style={micro}>Quantité à commander</span>
              <input value={form.quantite_commande} onChange={e => set('quantite_commande', e.target.value)} style={champ} /></label>
            <label><span style={micro}>Unité de gestion</span>
              <input value={form.unite} onChange={e => set('unite', e.target.value)} style={champ} /></label>
            <label><span style={micro}>Stock cible</span>
              <input value={form.stock_cible} onChange={e => set('stock_cible', e.target.value)} style={champ} /></label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label><span style={micro}>Emplacement</span>
              <input value={form.emplacement} onChange={e => set('emplacement', e.target.value)} style={champ} /></label>
            <label><span style={micro}>Fournisseur alternatif</span>
              <select value={form.fournisseur_alt_id} onChange={e => set('fournisseur_alt_id', e.target.value)} style={champ}>
                <option value="">— aucun —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select></label>
          </div>

          <label><span style={micro}>Notes internes</span>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} style={champ} /></label>

          <Photo form={form} set={set} />
        </div>

        {erreur && <p style={{ font: `13px ${FONT}`, color: C.danger, marginTop: 12 }}>{erreur}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
          <button onClick={onEnregistrer} disabled={enCours} style={bouton(true)}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={onFermer} style={bouton(false)}>Annuler</button>
          <span style={{ flex: 1 }} />
          {form.id && (
            <>
              <a href={`/api/economat/cartes?ids=${form.id}`} target="_blank" rel="noopener noreferrer"
                style={{ ...bouton(false), textDecoration: 'none' }}>Carte</a>
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
          {form.photo_path ? <img src={urlPhoto(form.photo_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'aucune'}
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
