// Briques des deux écrans du dossier d'assurances, dans le nouveau style :
// /outils/charges-sociales/essai et /outils/assurances/essai. Les deux pages
// sont jumelles — un seul jeu de briques, sinon elles divergeraient à la
// première retouche (même raison que components/DossierUI.js).
//
// Présentation seulement : les données viennent de lib/assurances.js, les
// calculs de lib/assurancesCalc.js.
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { fmtCHF, fmtCHF0 } from '../../lib/money'
import { OBLIGATIONS, contratParId } from '../../lib/assurances'
import { chercherCouvertures, chercherObligations } from '../../lib/assurancesCalc'

/** Un montant suivi de CHF, ou un tiret quand il n'est pas connu. Jamais un zéro de confort. */
export function Chf({ n, rond = false }) {
  if (n == null) return <span className="n">—</span>
  return <span className="n">{rond ? fmtCHF0(n) : fmtCHF(n)}<span className="fx-dev">CHF</span></span>
}

export function Section({ titre, sous, droite, children }) {
  return (
    <section className="fx-sec">
      <div className="fx-sec-t"><h3>{titre}</h3>{droite}</div>
      {sous && <p className="fx-dos-sous">{sous}</p>}
      {children}
    </section>
  )
}

/** Le point de couleur et son mot : vert acquis, rouge manque, cobalt à vérifier, encre en partie. */
export function Point({ ton, children }) {
  return <span className={`fx-pt ${ton || ''}`}><i />{children}</span>
}

const COUVERT = {
  true: { ton: 'vert', texte: 'Couvert' },
  partiel: { ton: 'encre', texte: 'En partie' },
  verifier: { ton: 'cobalt', texte: 'À vérifier' },
  false: { ton: 'rouge', texte: 'Non couvert' },
}
export const couvertDe = c => COUVERT[String(c)] || COUVERT.verifier
const CRITICITE = { haute: 'rouge', moyenne: 'encre', basse: 'gris' }

/** Le récapitulatif de droite : le grand chiffre, puis le détail. */
export function Recap({ label, total, lignes = [], avertissement, children }) {
  return (
    <aside className="fx-recap">
      <p className="label">{label}</p>
      <p className="grand"><Chf n={total} rond /></p>
      <dl>
        {lignes.map(l => <Fragment key={l.label}><dt>{l.label}</dt><dd><Chf n={l.valeur} rond /></dd></Fragment>)}
      </dl>
      {avertissement && <p className="fx-dos-avert">{avertissement}</p>}
      {children}
    </aside>
  )
}

export function Contrat({ contrat: c }) {
  return (
    <article className={`fx-dos-ligne${c.statut === 'caduc' ? ' caduc' : ''}`}>
      <div className="tete">
        <b>{c.assureur}</b>
        <span className="meta">{c.branche}{c.obligatoire ? ' · obligatoire' : ''}{c.statut === 'caduc' ? ' · caduc' : ''}</span>
        <span className="droite">{c.primeFacturee == null ? '—' : <><Chf n={c.primeFacturee} /> / an</>}</span>
      </div>
      <p>{c.intitule}</p>
      {c.primeFactureeNote && <p className="note">{c.primeFactureeNote}</p>}
      {c.note && <p className="note rouge">{c.note}</p>}
      <p className="refs">
        {[c.police && `Police ${c.police}`, c.fin && `Jusqu’au ${c.fin}`, c.echeance && `Échéance ${c.echeance}`, c.contact?.tel && `${c.contact.nom}, ${c.contact.tel}`].filter(Boolean).join(' · ')}
      </p>
      <p className="source">{c.source}</p>
    </article>
  )
}

export function Obligation({ obligation: o, aujourdhui }) {
  const retard = !o.fait && o.echeance && o.echeance < aujourdhui
  const assureur = contratParId(o.contrat)?.assureur
  return (
    <article className={`fx-dos-ligne${o.fait ? ' fait' : ''}`}>
      <div className="tete">
        <Point ton={o.fait ? 'vert' : retard ? 'rouge' : CRITICITE[o.criticite]}>{o.fait ? 'Fait' : retard ? 'En retard' : (o.recurrence || 'À faire')}</Point>
        <b>{o.intitule}</b>
        {assureur && <span className="droite meta">{assureur}</span>}
      </div>
      <p>{o.detail}</p>
      {o.ou && <p className="refs">{o.ou}</p>}
    </article>
  )
}

export function Manque({ manque: m }) {
  return (
    <article className="fx-dos-ligne">
      <div className="tete"><Point ton={CRITICITE[m.criticite]}>{m.criticite[0].toUpperCase() + m.criticite.slice(1)}</Point><b>{m.quoi}</b></div>
      <p>{m.pourquoi}</p>
      <p className="refs">Où le trouver : {m.ou}</p>
    </article>
  )
}

const OUTIL = {
  social: { href: '/outils/charges-sociales/essai', nom: 'Charges sociales' },
  assurance: { href: '/outils/assurances/essai', nom: 'Assurances' },
}

/**
 * La boîte à questions. Elle cherche dans TOUTES les garanties, jamais
 * seulement celles de l'écran : « un gars s'est blessé à l'atelier » relève
 * de la LAA, et personne ne se demande dans quel écran poser la question.
 */
export function Question({ famille, exemples = [] }) {
  const [question, setQuestion] = useState('')
  const [posee, setPosee] = useState('')
  const reponses = useMemo(() => (posee ? chercherCouvertures(posee) : []), [posee])
  const obligations = useMemo(() => (posee ? chercherObligations(posee, OBLIGATIONS) : []), [posee])
  const poser = t => { setQuestion(t); setPosee(t.trim()) }
  return (
    <div className="fx-question">
      <form onSubmit={e => { e.preventDefault(); setPosee(question.trim()) }}>
        <input className="fx-champ" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Décris le problème en une phrase…" aria-label="Question" />
        <button className="fx-btn p" type="submit" disabled={!question.trim()}>Chercher</button>
      </form>
      {exemples.length > 0 && (
        <div className="fx-puces">{exemples.map(ex => <button key={ex} type="button" aria-pressed={posee === ex} onClick={() => poser(ex)}>{ex}</button>)}</div>
      )}
      {posee && reponses.length === 0 && (
        <p className="fx-note" style={{ marginTop: 16 }}>Rien ne correspond dans les garanties relevées. Cela ne veut pas dire que ce n’est pas couvert : le dossier ne contient aucune des Conditions Générales, et les exclusions y vivent. Reformule, ou appelle l’assureur concerné.</p>
      )}
      {reponses.map(r => {
        const e = couvertDe(r.couvert)
        const fam = r.contratDetail?.famille ?? null
        const ailleurs = fam && famille && fam !== famille ? OUTIL[fam] : null
        return (
          <article key={r.id} className="fx-dos-ligne reponse">
            <div className="tete"><Point ton={e.ton}>{e.texte}</Point><b>{r.intitule}</b>{ailleurs && <Link className="fx-lien droite" href={ailleurs.href}>{ailleurs.nom} →</Link>}</div>
            <p>{r.detail}</p>
            <dl className="faits">
              {r.plafond && <div><dt>Jusqu’à</dt><dd>{r.plafond}</dd></div>}
              {r.franchise && <div><dt>Franchise</dt><dd>{r.franchise}</dd></div>}
              {r.contratDetail && <div><dt>Contrat</dt><dd>{r.contratDetail.assureur}, {r.contratDetail.police || r.contratDetail.branche}</dd></div>}
              {r.contactDetail && <div><dt>Qui appeler</dt><dd>{r.contactDetail.nom}{r.contactDetail.tel ? `, ${r.contactDetail.tel}` : ''}</dd></div>}
            </dl>
          </article>
        )
      })}
      {obligations.map(o => (
        <article key={o.id} className="fx-dos-ligne reponse">
          <div className="tete"><Point ton="cobalt">Obligation liée</Point><b>{o.intitule}</b></div>
          <p>{o.detail}</p>
        </article>
      ))}
    </div>
  )
}
