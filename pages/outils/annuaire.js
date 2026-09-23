// Annuaire — qui fait quoi, et où l'on commande.
//
// « Le thermolaquage, on le fait faire chez qui, déjà ? » La réponse vivait
// dans d'anciennes factures et dans la tête d'Arnaud. Elle vit ici, rangée par
// TECHNIQUE et jamais par région : on cherche un savoir-faire, pas une ville.
//
// L'écran tient en trois gestes : on cherche, on range par catégorie, on
// ajoute. Une entrée peut n'être qu'un nom et un site — c'est le cas le plus
// fréquent, et exiger une fiche complète reviendrait à n'en saisir aucune.
import { useState } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import { apiFetch } from '../../lib/api'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import { arbreAnnuaire, filtrerEntrees, categoriesDe, estLienValide } from '../../lib/annuaire'

const VIDE = { nom: '', quoi: '', site: '', contact_nom: '', email: '', telephone: '', adresse: '', ville: '', notes: '', categories: [] }

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

/** Une catégorie du panneau de gestion : nom modifiable, compteur, suppression. */
function LigneCategorie({ categorie, gras, decale, onRenommer, onSupprimer }) {
  const [nom, setNom] = useState(categorie.nom)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: decale ? 18 : 0 }}>
      {decale && <span style={{ color: C.faint }}>↳</span>}
      <input
        value={nom}
        onChange={e => setNom(e.target.value)}
        onBlur={() => onRenommer(categorie, nom)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: R.panel, border: `1px solid transparent`,
          font: `${gras ? 500 : 400} 13px ${FONT}`, color: C.ink, background: 'transparent', outline: 'none' }}
        onFocus={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
      />
      <span style={{ font: `11px ${MONO}`, color: C.muted }}>{categorie.nb}</span>
      <button onClick={() => onSupprimer(categorie)}
        style={{ font: `12px ${FONT}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
        supprimer
      </button>
    </div>
  )
}

export default function Annuaire() {
  const { data, mutate } = useSWR('/api/annuaire')
  const [recherche, setRecherche] = useState('')
  const [categorie, setCategorie] = useState(null)
  const [form, setForm] = useState(null)          // entrée en cours d'édition, ou null
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [gestion, setGestion] = useState(false)   // panneau des catégories
  const [nouvelleCat, setNouvelleCat] = useState({ nom: '', parent_id: '' })

  const entrees = data?.entrees || []
  const categories = data?.categories || []
  const liens = data?.liens || []
  const arbre = arbreAnnuaire(categories, liens)
  const visibles = filtrerEntrees(entrees, { recherche, categorie, liens, categories })
  const racineOuverte = categorie
    ? arbre.find(r => Number(r.id) === Number(categorie) || r.enfants.some(e => Number(e.id) === Number(categorie)))
    : null

  function ouvrir(entree) {
    setErreur('')
    setForm(entree
      ? { ...VIDE, ...entree, categories: categoriesDe(entree.id, liens, categories).map(c => c.id) }
      : { ...VIDE })
  }

  async function enregistrer() {
    if (!form.nom.trim()) { setErreur('Un nom est requis'); return }
    setEnCours(true); setErreur('')
    try {
      const corps = { ...form }
      delete corps.created_at; delete corps.updated_at; delete corps.created_by
      await apiFetch('/api/annuaire', { method: form.id ? 'PUT' : 'POST', json: corps, silencieux: true })
      setForm(null)
      mutate()
    } catch (e) { setErreur(e.message) } finally { setEnCours(false) }
  }

  async function supprimer() {
    if (!confirm(`Supprimer « ${form.nom} » de l'annuaire ?`)) return
    setEnCours(true)
    try {
      await apiFetch('/api/annuaire', { method: 'DELETE', json: { id: form.id } })
      setForm(null); mutate()
    } finally { setEnCours(false) }
  }

  async function ajouterCategorie() {
    if (!nouvelleCat.nom.trim()) return
    setErreur('')
    try {
      await apiFetch('/api/annuaire-categories', {
        method: 'POST', json: { nom: nouvelleCat.nom, parent_id: nouvelleCat.parent_id || null }, silencieux: true,
      })
      setNouvelleCat({ nom: '', parent_id: nouvelleCat.parent_id })
      mutate()
    } catch (e) { setErreur(e.message) }
  }

  async function renommerCategorie(c, nom) {
    const propre = String(nom || '').trim()
    if (!propre || propre === c.nom) return
    setErreur('')
    try {
      await apiFetch('/api/annuaire-categories', {
        method: 'PUT', json: { id: c.id, nom: propre, parent_id: c.parent_id ?? null }, silencieux: true,
      })
      mutate()
    } catch (e) { setErreur(e.message) }
  }

  async function supprimerCategorie(c) {
    const sous = arbre.find(r => Number(r.id) === Number(c.id))?.enfants?.length || 0
    const message = sous > 0
      ? `Supprimer « ${c.nom} » et ses ${sous} sous-catégorie${sous > 1 ? 's' : ''} ? Les entrées, elles, restent — elles se retrouveront sans catégorie.`
      : `Supprimer « ${c.nom} » ? Les entrées rangées dessous restent, sans catégorie.`
    if (!confirm(message)) return
    await apiFetch('/api/annuaire-categories', { method: 'DELETE', json: { id: c.id } })
    if (Number(categorie) === Number(c.id)) setCategorie(null)
    mutate()
  }

  const majForm = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const basculerCategorie = id => setForm(f => ({
    ...f,
    categories: f.categories.includes(id) ? f.categories.filter(x => x !== id) : [...f.categories, id],
  }))

  return (
    <>
      <Head><title>Annuaire · Maze Project</title></Head>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 64px' }}>

        <h1 style={{ font: `700 24px ${FONT}`, color: C.ink, margin: '0 0 4px' }}>Annuaire</h1>
        <p style={{ font: `14px ${FONT}`, color: C.muted, margin: '0 0 20px', lineHeight: 1.6 }}>
          Qui fait quoi, et où l’on commande. Rangé par technique — tôlerie, thermolaquage, fraises de
          CNC, filtres — jamais par région. Une entrée peut n’être qu’un nom et un site.
        </p>

        {erreur && (
          <div style={{ border: `1px solid ${C.danger}`, borderRadius: R.panel, padding: '10px 14px',
            font: `13px ${FONT}`, color: C.danger, marginBottom: 16 }}>{erreur}</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input style={{ ...champ, flex: 1, minWidth: 220 }} value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="chercher : thermolaquage, fraises, tôlerie, un nom, une ville…" />
          <button style={bouton()} onClick={() => ouvrir(null)}>+ Nouvelle entrée</button>
        </div>

        {/* Les catégories. Une racine s'ouvre sur ses filles — deux niveaux
            affichés, la base n'en impose aucun. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <button style={pastille(!categorie)} onClick={() => setCategorie(null)}>tout {entrees.length}</button>
          {arbre.map(r => (
            <button key={r.id} style={pastille(Number(categorie) === Number(r.id))} onClick={() => setCategorie(r.id)}>
              {r.nom} <span style={{ fontFamily: MONO, fontSize: 11 }}>{r.nb}</span>
            </button>
          ))}
          <button style={{ ...pastille(gestion), marginLeft: 'auto' }} onClick={() => setGestion(g => !g)}>
            {gestion ? 'fermer' : 'gérer les catégories'}
          </button>
        </div>
        {racineOuverte && racineOuverte.enfants.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6, paddingLeft: 14 }}>
            {racineOuverte.enfants.map(e => (
              <button key={e.id} style={pastille(Number(categorie) === Number(e.id))} onClick={() => setCategorie(e.id)}>
                ↳ {e.nom} <span style={{ fontFamily: MONO, fontSize: 11 }}>{e.nb}</span>
              </button>
            ))}
          </div>
        )}

        {gestion && (
          <section style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '14px 16px', margin: '12px 0 20px' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input style={{ ...champ, flex: 1, minWidth: 180 }} value={nouvelleCat.nom}
                onChange={e => setNouvelleCat(c => ({ ...c, nom: e.target.value }))}
                placeholder="nouvelle catégorie (ex : Sérigraphie)" />
              <select style={{ ...champ, width: 'auto' }} value={nouvelleCat.parent_id}
                onChange={e => setNouvelleCat(c => ({ ...c, parent_id: e.target.value }))}>
                <option value="">— catégorie principale</option>
                {arbre.map(r => <option key={r.id} value={r.id}>sous {r.nom}</option>)}
              </select>
              <button style={bouton(false)} onClick={ajouterCategorie}>ajouter</button>
            </div>
            {/* Renommer se fait SUR PLACE : le nom est le champ, on écrit
                dedans et ça s'enregistre en sortant. Une catégorie mal nommée
                est plus souvent corrigée que supprimée. */}
            {arbre.map(r => (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <LigneCategorie categorie={r} gras onRenommer={renommerCategorie} onSupprimer={supprimerCategorie} />
                {r.enfants.map(e => (
                  <LigneCategorie key={e.id} categorie={e} decale onRenommer={renommerCategorie} onSupprimer={supprimerCategorie} />
                ))}
              </div>
            ))}
          </section>
        )}

        {/* Le formulaire, ouvert au-dessus de la liste */}
        {form && (
          <section style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: '18px 20px', margin: '16px 0 24px' }}>
            <h2 style={{ font: `600 15px ${FONT}`, color: C.ink, margin: '0 0 14px' }}>
              {form.id ? form.nom || 'Entrée' : 'Nouvelle entrée'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label><span style={micro}>nom *</span>
                <input style={champ} value={form.nom} onChange={e => majForm('nom', e.target.value)} placeholder="Thermolaquage Riviera" /></label>
              <label><span style={micro}>ce qu’ils font</span>
                <input style={champ} value={form.quoi} onChange={e => majForm('quoi', e.target.value)} placeholder="poudre époxy, petites séries" /></label>
              <label><span style={micro}>site</span>
                <input style={champ} value={form.site} onChange={e => majForm('site', e.target.value)} placeholder="exemple.ch" /></label>
              <label><span style={micro}>contact</span>
                <input style={champ} value={form.contact_nom} onChange={e => majForm('contact_nom', e.target.value)} placeholder="prénom nom" /></label>
              <label><span style={micro}>téléphone</span>
                <input style={champ} value={form.telephone} onChange={e => majForm('telephone', e.target.value)} /></label>
              <label><span style={micro}>e-mail</span>
                <input style={champ} value={form.email} onChange={e => majForm('email', e.target.value)} /></label>
              <label><span style={micro}>adresse</span>
                <input style={champ} value={form.adresse} onChange={e => majForm('adresse', e.target.value)} /></label>
              <label><span style={micro}>ville</span>
                <input style={champ} value={form.ville} onChange={e => majForm('ville', e.target.value)} /></label>
            </div>

            <div style={{ marginTop: 12 }}>
              <span style={micro}>catégories</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {arbre.flatMap(r => [
                  <button key={r.id} style={pastille(form.categories.includes(r.id))} onClick={() => basculerCategorie(r.id)}>{r.nom}</button>,
                  ...r.enfants.map(e => (
                    <button key={e.id} style={pastille(form.categories.includes(e.id))} onClick={() => basculerCategorie(e.id)}>↳ {e.nom}</button>
                  )),
                ])}
              </div>
            </div>

            <label style={{ display: 'block', marginTop: 12 }}><span style={micro}>notes</span>
              <textarea style={{ ...champ, minHeight: 72 }} value={form.notes} onChange={e => majForm('notes', e.target.value)}
                placeholder="délais, minimum de commande, ce qu’ils ratent, le nom du gars à l’atelier…" /></label>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button style={bouton()} onClick={enregistrer} disabled={enCours}>
                {enCours ? 'enregistrement…' : 'Enregistrer'}
              </button>
              <button style={bouton(false)} onClick={() => setForm(null)}>Annuler</button>
              {form.id && (
                <button onClick={supprimer} style={{ font: `12.5px ${FONT}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
                  supprimer
                </button>
              )}
            </div>
          </section>
        )}

        {/* La liste */}
        {!data ? (
          <p style={{ font: `13px ${FONT}`, color: C.muted }}>Chargement…</p>
        ) : visibles.length === 0 ? (
          <p style={{ font: `13.5px ${FONT}`, color: C.muted, lineHeight: 1.6 }}>
            {entrees.length === 0
              ? 'L’annuaire est vide. La première entrée est souvent la plus utile : celle qu’on cherche deux fois par an.'
              : 'Rien à cet endroit.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {visibles.map(e => {
              const cats = categoriesDe(e.id, liens, categories)
              return (
                <article key={e.id} onClick={() => ouvrir(e)}
                  style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '14px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ font: `600 15px ${FONT}`, color: C.ink }}>{e.nom}</span>
                    {cats.map(c => (
                      <span key={c.id} style={{ font: `10.5px ${MONO}`, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted }}>{c.nom}</span>
                    ))}
                  </div>
                  {e.quoi && <div style={{ font: `13.5px ${FONT}`, color: C.inkTertiary, marginTop: 4 }}>{e.quoi}</div>}
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, font: `12.5px ${FONT}`, color: C.muted }}>
                    {e.site && (estLienValide(e.site)
                      ? <a href={e.site} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} style={{ color: C.accent }}>{e.site.replace(/^https?:\/\//, '')}</a>
                      : <span>{e.site}</span>)}
                    {e.telephone && <span>{e.telephone}</span>}
                    {e.email && <span>{e.email}</span>}
                    {e.contact_nom && <span>{e.contact_nom}</span>}
                    {e.ville && <span>{e.ville}</span>}
                  </div>
                  {e.notes && <div style={{ font: `12.5px ${FONT}`, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>{e.notes}</div>}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
