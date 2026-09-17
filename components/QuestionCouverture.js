// Boîte à questions sur les couvertures — partagée par les deux outils.
//
// Elle est montée à la fois dans /outils/assurances et dans
// /outils/charges-sociales, et c'est délibéré : elle cherche dans TOUTES les
// couvertures, jamais dans celles du seul écran où l'on se trouve.
//
// La raison est simple et vient de l'usage : « un gars s'est blessé à
// l'atelier » relève de la LAA, donc des charges sociales, mais personne ne se
// demande dans quel écran poser la question. Un moteur filtré par famille
// répondrait « rien ne correspond » à la question la plus fréquente de
// l'atelier. Le découpage sert à ranger les COÛTS, pas à cloisonner les
// réponses.
//
// Quand la réponse relève de l'autre outil, le lien y mène.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import { OBLIGATIONS, contratParId } from '../lib/assurances'
import { chercherCouvertures, chercherObligations } from '../lib/assurancesCalc'

const microLabel = {
  fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em',
  textTransform: 'uppercase', color: C.muted,
}
const panneau = {
  border: `1px solid ${C.border}`, borderRadius: R.panel,
  padding: '18px 20px', background: C.surface,
}

const ETAT = {
  true:     { texte: 'Oui',         fg: C.success, bg: C.successBg },
  partiel:  { texte: 'En partie',   fg: C.warning, bg: C.warningBg },
  verifier: { texte: 'À vérifier',  fg: C.info,    bg: C.infoBg },
  false:    { texte: 'Non couvert', fg: C.danger,  bg: C.dangerBg },
}
const etatDe = (couvert) => ETAT[String(couvert)] || ETAT.verifier

const OUTIL = {
  social:    { href: '/outils/charges-sociales', nom: 'Charges sociales' },
  assurance: { href: '/outils/assurances',       nom: 'Assurances' },
}

function Pastille({ fg, bg, children }) {
  return (
    <span style={{
      font: `500 11px ${FONT}`, color: fg, background: bg,
      padding: '3px 9px', borderRadius: R.pill, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export default function QuestionCouverture({ famille, exemples = [] }) {
  const [question, setQuestion] = useState('')
  const [posee, setPosee] = useState('')

  const reponses = useMemo(() => (posee ? chercherCouvertures(posee) : []), [posee])
  const obligations = useMemo(() => (posee ? chercherObligations(posee, OBLIGATIONS) : []), [posee])

  const poser = (texte) => { setQuestion(texte); setPosee(texte.trim()) }

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); setPosee(question.trim()) }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Décris le problème en une phrase…"
          style={{
            width: '100%', padding: '13px 18px', borderRadius: R.pill,
            border: `1.5px solid ${C.outline}`, font: `14.5px ${FONT}`,
            color: AL.black, background: C.surface, outline: 'none',
          }}
        />
      </form>

      {exemples.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {exemples.map(ex => (
            <button
              key={ex} type="button" onClick={() => poser(ex)}
              style={{
                font: `12.5px ${FONT}`, color: C.inkSecondary, background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: R.pill,
                padding: '6px 13px', cursor: 'pointer',
              }}
            >{ex}</button>
          ))}
        </div>
      )}

      {posee && (
        <div style={{ marginTop: 20 }}>
          {reponses.length === 0 && (
            <div style={panneau}>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.7 }}>
                Rien ne correspond dans les garanties relevées. Cela ne veut pas dire que ce n’est
                pas couvert : le dossier ne contient aucune des Conditions Générales, et les
                exclusions y vivent. Reformule avec d’autres mots, ou appelle l’assureur concerné.
              </p>
            </div>
          )}

          {reponses.map(r => {
            const etat = etatDe(r.couvert)
            const fam = r.contratDetail?.famille ?? null
            const ailleurs = fam && famille && fam !== famille ? OUTIL[fam] : null
            return (
              <article key={r.id} style={{ ...panneau, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
                  <Pastille fg={etat.fg} bg={etat.bg}>{etat.texte}</Pastille>
                  <strong style={{ font: `600 15px ${FONT}` }}>{r.intitule}</strong>
                  {ailleurs && (
                    <Link href={ailleurs.href} style={{ ...microLabel, marginLeft: 'auto', textDecoration: 'none', color: C.accent }}>
                      {ailleurs.nom} →
                    </Link>
                  )}
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: '0 0 12px', color: C.inkTertiary }}>{r.detail}</p>

                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {r.plafond && (
                    <div>
                      <div style={microLabel}>Jusqu’à</div>
                      <div style={{ font: `13.5px ${MONO}`, marginTop: 2 }}>{r.plafond}</div>
                    </div>
                  )}
                  {r.franchise && (
                    <div>
                      <div style={microLabel}>Franchise</div>
                      <div style={{ font: `13.5px ${MONO}`, marginTop: 2 }}>{r.franchise}</div>
                    </div>
                  )}
                  {r.contratDetail && (
                    <div>
                      <div style={microLabel}>Contrat</div>
                      <div style={{ fontSize: 13.5, marginTop: 2 }}>
                        {r.contratDetail.assureur} · {r.contratDetail.police || r.contratDetail.branche}
                      </div>
                    </div>
                  )}
                  {r.contactDetail && (
                    <div>
                      <div style={microLabel}>Qui appeler</div>
                      <div style={{ fontSize: 13.5, marginTop: 2 }}>
                        {r.contactDetail.nom}
                        {r.contactDetail.tel && <span style={{ fontFamily: MONO }}> · {r.contactDetail.tel}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            )
          })}

          {obligations.map(o => (
            <article key={o.id} style={{ ...panneau, marginBottom: 12, borderColor: C.outline }}>
              <div style={{ ...microLabel, marginBottom: 6 }}>Au passage — une obligation touche ce sujet</div>
              <strong style={{ font: `600 14.5px ${FONT}` }}>{o.intitule}</strong>
              <p style={{ fontSize: 13, lineHeight: 1.7, margin: '6px 0 0', color: C.inkTertiary }}>{o.detail}</p>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
