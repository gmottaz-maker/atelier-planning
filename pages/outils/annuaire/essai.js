// Annuaire — proposition dans le nouveau style, à côté de la page actuelle
// (/outils/annuaire). « Le thermolaquage, on le fait faire chez qui, déjà ? »
//
// Les catégories (rangées par TECHNIQUE, jamais par région) tiennent dans une
// colonne à gauche ; la liste à droite ; une entrée s'ouvre dans un panneau.
// Une entrée peut n'être qu'un nom et un site — c'est le cas le plus fréquent.
// Tout le calcul (arbre, filtre, recherche dans le nom des catégories) vit
// dans lib/annuaire.js, inchangé.
import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { apiFetch } from '../../../lib/api'
import { STYLE_FICHE } from '../../../components/fiche/styles'
import { N } from '../../../lib/theme'
import { arbreAnnuaire, filtrerEntrees, categoriesDe, estLienValide } from '../../../lib/annuaire'

const VIDE = { nom: '', quoi: '', site: '', contact_nom: '', email: '', telephone: '', adresse: '', ville: '', notes: '', categories: [] }

/** Une catégorie du panneau de gestion : on renomme en écrivant dans le nom. */
function LigneCategorie({ categorie, decale, onRenommer, onSupprimer }) {
  const [nom, setNom] = useState(categorie.nom)
  return (
    <div className={`fx-annu-cat-gestion${decale ? ' fille' : ''}`}>
      <input className="fx-champ" value={nom} aria-label={`Nom de la catégorie ${categorie.nom}`}
        onChange={e => setNom(e.target.value)} onBlur={() => onRenommer(categorie, nom)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      <span className="n">{categorie.nb}</span>
      <button className="fx-lien gris" onClick={() => onSupprimer(categorie)}>Supprimer</button>
    </div>
  )
}

/** Le panneau d'une entrée : la créer, la modifier, la supprimer. */
function Fiche({ form, setForm, arbre, enCours, erreur, onEnregistrer, onSupprimer, onFermer }) {
  const maj = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const basculer = id => setForm(f => ({ ...f, categories: f.categories.includes(id) ? f.categories.filter(x => x !== id) : [...f.categories, id] }))
  const champ = (k, label, placeholder, attrs = {}) => (
    <label><span className="fx-etiquette">{label}</span><input className="fx-champ" value={form[k]} onChange={e => maj(k, e.target.value)} placeholder={placeholder} {...attrs} /></label>
  )
  return (
    <div className="fx-voile" onClick={onFermer}>
      <div className="fx-feuille" role="dialog" aria-modal="true" aria-label={form.id ? form.nom : 'Nouvelle entrée'} onClick={e => e.stopPropagation()}>
        <div><h2>{form.id ? form.nom || 'Entrée' : 'Nouvelle entrée'}</h2><p className="sous">Seul le nom est requis. Un nom et un site suffisent souvent.</p></div>
        {champ('nom', 'Nom', 'Thermolaquage Riviera', { autoFocus: !form.id })}
        {champ('quoi', 'Ce qu’ils font', 'Poudre époxy, petites séries')}
        <div className="deux">{champ('site', 'Site', 'exemple.ch')}{champ('contact_nom', 'Contact', 'Prénom Nom')}</div>
        <div className="deux">{champ('telephone', 'Téléphone', '', { inputMode: 'tel' })}{champ('email', 'E-mail', '', { inputMode: 'email' })}</div>
        <div className="deux">{champ('adresse', 'Adresse', '')}{champ('ville', 'Ville', '')}</div>
        <div>
          <span className="fx-etiquette">Catégories</span>
          <div className="fx-puces">
            {arbre.flatMap(r => [
              <button key={r.id} aria-pressed={form.categories.includes(r.id)} onClick={() => basculer(r.id)}>{r.nom}</button>,
              ...r.enfants.map(e => <button key={e.id} aria-pressed={form.categories.includes(e.id)} onClick={() => basculer(e.id)}>{r.nom} › {e.nom}</button>),
            ])}
          </div>
        </div>
        <label><span className="fx-etiquette">Notes</span>
          <textarea className="fx-champ" rows={4} value={form.notes} onChange={e => maj('notes', e.target.value)} placeholder="Délais, minimum de commande, ce qu’ils ratent, le nom du gars à l’atelier…" /></label>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="fx-actions">
          <button className="fx-btn p" onClick={onEnregistrer} disabled={enCours || !form.nom.trim()}>{enCours ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Ajouter à l’annuaire'}</button>
          <button className="fx-btn g" onClick={onFermer}>Annuler</button>
          {form.id && <button className="fx-lien" style={{ color: N.rouge, marginLeft: 'auto' }} disabled={enCours} onClick={onSupprimer}>Supprimer</button>}
        </div>
      </div>
    </div>
  )
}

export default function AnnuaireEssai() {
  const { data, mutate } = useSWR('/api/annuaire')
  const [recherche, setRecherche] = useState('')
  const [categorie, setCategorie] = useState(null)
  const [form, setForm] = useState(null)
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [gestion, setGestion] = useState(false)
  const [nouvelleCat, setNouvelleCat] = useState({ nom: '', parent_id: '' })

  const entrees = data?.entrees || []
  const categories = data?.categories || []
  const liens = data?.liens || []
  const arbre = arbreAnnuaire(categories, liens)
  const visibles = filtrerEntrees(entrees, { recherche, categorie, liens, categories })
  const nomCategorie = categorie ? categories.find(c => Number(c.id) === Number(categorie))?.nom : null

  const ouvrir = entree => { setErreur(''); setForm(entree ? { ...VIDE, ...entree, categories: categoriesDe(entree.id, liens, categories).map(c => c.id) } : { ...VIDE, categories: categorie ? [Number(categorie)] : [] }) }

  async function enregistrer() {
    if (!form.nom.trim()) { setErreur('Un nom est requis.'); return }
    setEnCours(true); setErreur('')
    try {
      const { created_at: _c, updated_at: _u, created_by: _b, ...corps } = form
      await apiFetch('/api/annuaire', { method: form.id ? 'PUT' : 'POST', json: corps, silencieux: true })
      setForm(null); mutate()
    } catch (e) { setErreur(e.message) } finally { setEnCours(false) }
  }
  async function supprimer() {
    if (!confirm(`Supprimer « ${form.nom} » de l’annuaire ?`)) return
    setEnCours(true)
    try { await apiFetch('/api/annuaire', { method: 'DELETE', json: { id: form.id } }); setForm(null); mutate() } finally { setEnCours(false) }
  }
  async function ajouterCategorie() {
    if (!nouvelleCat.nom.trim()) return
    setErreur('')
    try {
      await apiFetch('/api/annuaire-categories', { method: 'POST', json: { nom: nouvelleCat.nom, parent_id: nouvelleCat.parent_id || null }, silencieux: true })
      setNouvelleCat(c => ({ nom: '', parent_id: c.parent_id })); mutate()
    } catch (e) { setErreur(e.message) }
  }
  async function renommerCategorie(c, nom) {
    const propre = String(nom || '').trim()
    if (!propre || propre === c.nom) return
    try { await apiFetch('/api/annuaire-categories', { method: 'PUT', json: { id: c.id, nom: propre, parent_id: c.parent_id ?? null }, silencieux: true }); mutate() } catch (e) { setErreur(e.message) }
  }
  async function supprimerCategorie(c) {
    const sous = arbre.find(r => Number(r.id) === Number(c.id))?.enfants?.length || 0
    const message = sous > 0
      ? `Supprimer « ${c.nom} » et ses ${sous} sous-catégorie${sous > 1 ? 's' : ''} ? Les entrées restent, sans catégorie.`
      : `Supprimer « ${c.nom} » ? Les entrées rangées dessous restent, sans catégorie.`
    if (!confirm(message)) return
    await apiFetch('/api/annuaire-categories', { method: 'DELETE', json: { id: c.id } })
    if (Number(categorie) === Number(c.id)) setCategorie(null)
    mutate()
  }

  const Cat = ({ c, fille }) => (
    <button className={fille ? 'fille' : undefined} aria-pressed={Number(categorie) === Number(c.id)} onClick={() => setCategorie(Number(categorie) === Number(c.id) ? null : c.id)}>
      <span>{c.nom}</span><span className="n">{c.nb}</span>
    </button>
  )
  const ouverte = r => Number(categorie) === Number(r.id) || r.enfants.some(e => Number(e.id) === Number(categorie))

  return (
    <div className="fx">
      <Head><title>Annuaire — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <p className="fx-chemin"><Link href="/outils/essai">Outils</Link></p>
            <h1>Annuaire</h1>
            <p className="fx-resume-liste"><span>Qui fait quoi, et où l’on commande</span><span>{entrees.length} adresse{entrees.length > 1 ? 's' : ''}</span><span>{arbre.length} technique{arbre.length > 1 ? 's' : ''}</span></p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/outils/annuaire" style={{ textDecoration: 'none' }}>Ancienne page</a>
            <button className="fx-btn p" onClick={() => ouvrir(null)}>Nouvelle entrée</button>
          </div>
        </header>

        {erreur && !form && <p className="fx-note rouge" style={{ marginTop: 16 }}>{erreur}</p>}

        <div className="fx-annu">
          <nav className="fx-annu-cats" aria-label="Techniques">
            <button aria-pressed={!categorie} onClick={() => setCategorie(null)}><span>Toutes</span><span className="n">{entrees.length}</span></button>
            {arbre.map(r => (
              <div key={r.id}>
                <Cat c={r} />
                {ouverte(r) && r.enfants.map(e => <Cat key={e.id} c={e} fille />)}
              </div>
            ))}
            <button className="fx-lien gerer" onClick={() => setGestion(g => !g)}>{gestion ? 'Fermer la gestion' : 'Gérer les catégories'}</button>
          </nav>

          <div style={{ minWidth: 0 }}>
            <label className="fx-cherche">
              <svg className="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Thermolaquage, un nom, une ville…" aria-label="Chercher dans l’annuaire" />
            </label>

            {gestion && (
              <section className="fx-annu-gestion">
                <h3>Catégories</h3>
                <p className="fx-note">On renomme en écrivant dans le nom. Supprimer une catégorie emporte ses sous-catégories, jamais les entrées : elles restent, sans catégorie.</p>
                {arbre.map(r => <div key={r.id}><LigneCategorie categorie={r} onRenommer={renommerCategorie} onSupprimer={supprimerCategorie} />{r.enfants.map(e => <LigneCategorie key={e.id} categorie={e} decale onRenommer={renommerCategorie} onSupprimer={supprimerCategorie} />)}</div>)}
                <div className="ajout">
                  <input className="fx-champ" value={nouvelleCat.nom} onChange={e => setNouvelleCat(c => ({ ...c, nom: e.target.value }))} placeholder="Nouvelle catégorie (ex. Sérigraphie)" aria-label="Nouvelle catégorie" />
                  <select className="fx-champ" value={nouvelleCat.parent_id} onChange={e => setNouvelleCat(c => ({ ...c, parent_id: e.target.value }))} aria-label="Ranger sous">
                    <option value="">Catégorie principale</option>
                    {arbre.map(r => <option key={r.id} value={r.id}>Sous {r.nom}</option>)}
                  </select>
                  <button className="fx-btn g" onClick={ajouterCategorie} disabled={!nouvelleCat.nom.trim()}>Ajouter</button>
                </div>
              </section>
            )}

            <h2 className="fx-annu-titre">{nomCategorie || (recherche ? 'Résultats' : 'Toutes les adresses')} <span className="n">{visibles.length}</span></h2>
            {!data && <p className="fx-note">Chargement…</p>}
            {data && visibles.length === 0 && (
              <div className="fx-vide" style={{ marginTop: 16 }}>
                <h3>{entrees.length === 0 ? 'L’annuaire est vide.' : 'Rien à cet endroit.'}</h3>
                <p>{entrees.length === 0 ? 'La première entrée est souvent la plus utile : celle qu’on cherche deux fois par an.' : 'Essaie un autre mot, ou ajoute l’adresse que tu cherchais.'} <button className="fx-lien" onClick={() => ouvrir(null)}>Nouvelle entrée</button></p>
              </div>
            )}
            {visibles.map(e => {
              const cats = categoriesDe(e.id, liens, categories)
              const coordonnees = [e.telephone, e.email, e.contact_nom, e.ville].filter(Boolean)
              return (
                <article key={e.id} className="fx-entree">
                  <div className="tete">
                    <button className="nom" onClick={() => ouvrir(e)}>{e.nom}</button>
                    {cats.length > 0 && <span className="cats">{cats.map(c => c.nom).join(' · ')}</span>}
                  </div>
                  {e.quoi && <p>{e.quoi}</p>}
                  {(e.site || coordonnees.length > 0) && (
                    <p className="coord">
                      {e.site && (estLienValide(e.site) ? <a href={e.site} target="_blank" rel="noreferrer" className="fx-lien">{e.site.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : <span>{e.site}</span>)}
                      {coordonnees.map(x => <span key={x}>{x}</span>)}
                    </p>
                  )}
                  {e.notes && <p className="notes">{e.notes}</p>}
                </article>
              )
            })}
          </div>
        </div>
      </div>

      {form && <Fiche form={form} setForm={setForm} arbre={arbre} enCours={enCours} erreur={erreur} onEnregistrer={enregistrer} onSupprimer={supprimer} onFermer={() => setForm(null)} />}
    </div>
  )
}
