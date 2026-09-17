// Briques d'écran partagées par /outils/charges-sociales et /outils/assurances.
//
// Les deux outils lisent le même dossier et se ressemblent donc beaucoup :
// même bandeau de totaux, mêmes cartes de contrat, mêmes pastilles d'état.
// Dupliquer ces ~150 lignes garantissait qu'elles divergeraient à la première
// retouche — c'est exactement ce que la convention du dépôt veut éviter.
//
// Ce fichier ne contient que de la présentation. Aucun calcul, aucune donnée.
import Link from 'next/link'
import { C, FONT, MONO, R } from '../lib/theme'
import { fmtCHF, fmtCHF0 } from '../lib/money'

export const microLabel = {
  fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em',
  textTransform: 'uppercase', color: C.muted,
}
export const panneau = {
  border: `1px solid ${C.border}`, borderRadius: R.panel,
  padding: '18px 20px', background: C.surface,
}
export const cellule = { padding: '10px 12px', fontSize: 13.5, borderTop: `1px solid ${C.border}`, textAlign: 'left' }
export const nombreCell = { ...cellule, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
export const enTete = { ...microLabel, padding: '0 12px 8px', textAlign: 'left' }
export const enTeteNb = { ...enTete, textAlign: 'right' }

export const CRITICITE = {
  haute:   { fg: C.danger,  bg: C.dangerBg },
  moyenne: { fg: C.warning, bg: C.warningBg },
  basse:   { fg: C.muted,   bg: C.neutralBg },
}

/** Un montant, ou un tiret quand il n'est pas connu. Jamais un zéro de confort. */
export const montant = (n, zero = '—') => (n == null ? zero : fmtCHF(n))

export function Pastille({ fg, bg, children }) {
  return (
    <span style={{
      font: `500 11px ${FONT}`, color: fg, background: bg,
      padding: '3px 9px', borderRadius: R.pill, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export function Section({ titre, sousTitre, children }) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={{ font: `600 17px ${FONT}`, color: C.ink, margin: '0 0 4px' }}>{titre}</h2>
      {sousTitre && (
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px', lineHeight: 1.6, maxWidth: 680 }}>{sousTitre}</p>
      )}
      {children}
    </section>
  )
}

/** L'en-tête de page : fil d'Ariane, titre, chapeau. */
export function EnTete({ titre, chapeau, lien }) {
  return (
    <>
      <Link href="/outils" style={{ fontSize: 12.5, color: C.muted, textDecoration: 'none' }}>← outils</Link>
      <h1 style={{ font: `700 24px ${FONT}`, margin: '14px 0 4px' }}>{titre}</h1>
      <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 12px', maxWidth: 680, lineHeight: 1.6 }}>{chapeau}</p>
      {lien && (
        <Link href={lien.href} style={{ fontSize: 13, color: C.accent, textDecoration: 'none' }}>
          {lien.texte} →
        </Link>
      )}
    </>
  )
}

/**
 * Le bandeau noir de totaux. `chiffres` : [{ label, valeur, principal }].
 * `avertissement` s'affiche en pleine largeur quand un total est incomplet.
 */
export function Bandeau({ chiffres, avertissement }) {
  return (
    <div style={{ ...panneau, background: C.ink, border: 'none', display: 'flex', flexWrap: 'wrap', gap: 32, marginTop: 24 }}>
      {chiffres.map(c => (
        <div key={c.label}>
          <div style={{ ...microLabel, color: c.principal ? C.accentOnDark : C.navInactive }}>{c.label}</div>
          <div style={{
            font: `${c.principal ? '700 30px' : '600 20px'} ${MONO}`,
            color: C.surface, marginTop: c.principal ? 4 : 8, fontVariantNumeric: 'tabular-nums',
          }}>
            {c.valeur == null ? '—' : fmtCHF0(c.valeur)}
          </div>
        </div>
      ))}
      {avertissement && (
        <p style={{ fontSize: 12.5, color: C.accentOnDark, margin: 0, width: '100%', lineHeight: 1.6 }}>
          {avertissement}
        </p>
      )}
    </div>
  )
}

/** La carte d'un contrat, avec sa prime, ses références et sa pièce source. */
export function CarteContrat({ contrat: c }) {
  return (
    <article style={{ ...panneau, padding: '16px 18px', opacity: c.statut === 'caduc' ? 0.62 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <strong style={{ font: `600 15px ${FONT}` }}>{c.assureur}</strong>
        <span style={microLabel}>{c.branche}</span>
        {c.obligatoire && <Pastille fg={C.inkSecondary} bg={C.neutralBg}>Obligatoire</Pastille>}
        {c.statut === 'caduc' && <Pastille fg={C.danger} bg={C.dangerBg}>Caduc</Pastille>}
        <span style={{ marginLeft: 'auto', font: `600 14px ${MONO}`, fontVariantNumeric: 'tabular-nums' }}>
          {c.primeFacturee == null ? '—' : `${fmtCHF(c.primeFacturee)}/an`}
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: C.inkTertiary, margin: '0 0 8px', lineHeight: 1.6 }}>{c.intitule}</p>
      {c.primeFactureeNote && (
        <p style={{ fontSize: 12.5, color: C.muted, margin: '0 0 8px', lineHeight: 1.6 }}>{c.primeFactureeNote}</p>
      )}
      {c.note && (
        <p style={{ fontSize: 12.5, color: C.warning, margin: '0 0 8px', lineHeight: 1.6 }}>{c.note}</p>
      )}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', font: `12px ${MONO}`, color: C.muted }}>
        {c.police && <span>Police {c.police}</span>}
        {c.fin && <span>Jusqu’au {c.fin}</span>}
        {c.echeance && <span>Échéance {c.echeance}</span>}
        {c.contact?.tel && <span>{c.contact.nom} · {c.contact.tel}</span>}
      </div>
      <p style={{ fontSize: 11.5, color: C.faint, margin: '8px 0 0', fontFamily: MONO, wordBreak: 'break-word' }}>
        {c.source}
      </p>
    </article>
  )
}

/** Une obligation : pastille d'état, détail, où la remplir. */
export function CarteObligation({ obligation: o, aujourdhui, assureur }) {
  const crit = CRITICITE[o.criticite] || CRITICITE.basse
  const enRetard = !o.fait && o.echeance && o.echeance < aujourdhui
  return (
    <article style={{ ...panneau, padding: '14px 18px', opacity: o.fait ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Pastille fg={o.fait ? C.success : crit.fg} bg={o.fait ? C.successBg : crit.bg}>
          {o.fait ? 'Fait' : enRetard ? 'En retard' : (o.recurrence || 'À faire')}
        </Pastille>
        <strong style={{ font: `500 14.5px ${FONT}`, flex: 1, minWidth: 200 }}>{o.intitule}</strong>
        <span style={microLabel}>{assureur}</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 0', color: C.inkTertiary }}>{o.detail}</p>
      {o.ou && <p style={{ font: `12px ${MONO}`, color: C.muted, margin: '6px 0 0' }}>{o.ou}</p>}
    </article>
  )
}

/** Un manque du dossier : ce qu'il faut, pourquoi, et où le trouver. */
export function CarteManque({ manque: m }) {
  const crit = CRITICITE[m.criticite] || CRITICITE.basse
  return (
    <article style={{ ...panneau, padding: '14px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Pastille fg={crit.fg} bg={crit.bg}>{m.criticite}</Pastille>
        <strong style={{ font: `500 14.5px ${FONT}` }}>{m.quoi}</strong>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 0', color: C.inkTertiary }}>{m.pourquoi}</p>
      <p style={{ font: `12px ${MONO}`, color: C.muted, margin: '6px 0 0' }}>Où le trouver : {m.ou}</p>
    </article>
  )
}

/** Le cadre commun des deux pages. */
export function Page({ titre, children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 80px' }}>
        {children}
      </div>
    </div>
  )
}
