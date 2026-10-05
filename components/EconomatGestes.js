// Les gestes de stock d'un article d'économat (brief V2, §11–§19).
//
// UN composant, deux endroits : la vue rapide après un scan (`/e/<jeton>`)
// et la fiche article du catalogue. §15 exige le réapprovisionnement « depuis
// le QR, l'interface mobile et l'interface desktop » — deux copies de ces
// boutons auraient divergé au premier ajustement.
//
// Règles tenues ici :
//  - un geste s'applique TOUT DE SUITE, sans bouton Enregistrer ni
//    confirmation (§12) ; « Annuler » reste offert quelques secondes ;
//  - en quantité approximative, on choisit le NIVEAU CONSTATÉ, jamais
//    « −⅓ » (§13) ;
//  - « Commander chez OPO » ouvre la page du fournisseur et ne change RIEN :
//    la prise en charge est un geste séparé (§18).
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import {
  NIVEAUX, niveau, formatQuantite, formatCommande, niveauxApprox, messageGeste,
  libellePriseEnCharge, actionAppro, uniteDe, libelleUnite,
} from '../lib/economat'

const DUREE_ANNULER = 8000

export default function EconomatGestes({ article, unites = [], fournisseurs = [], onMaj, grand = false }) {
  const [enCours, setEnCours] = useState('')
  const [souci, setSouci] = useState('')
  const [dernier, setDernier] = useState(null)      // { mouvement_id, message }
  const minuteur = useRef(null)
  useEffect(() => () => clearTimeout(minuteur.current), [])

  const n = niveau(article)
  const unite = uniteDe(article.unite_stock_id, unites)
  const d = Number(article.decoupage) || 1
  const pris = !!article.reappro_le
  const appro = actionAppro(article, fournisseurs)
  const aFaire = n === 'rouge' || n === 'orange'

  async function envoyer(cle, corps, { annulable = false } = {}) {
    setEnCours(cle); setSouci('')
    try {
      const r = await apiFetch('/api/economat/geste', { method: 'POST', json: { id: article.id, ...corps }, silencieux: true })
      if (r.article) onMaj?.(r.article)
      clearTimeout(minuteur.current)
      if (annulable && r.mouvement_id) {
        setDernier({ mouvement_id: r.mouvement_id, message: messageGeste(r.avant, r.apres, { ...article, ...r.article }, unites) })
        minuteur.current = setTimeout(() => setDernier(null), DUREE_ANNULER)
      } else {
        setDernier(null)
      }
    } catch (e) { setSouci(e.message) } finally { setEnCours('') }
  }

  const stock = (cle, corps) => envoyer(cle, { action: 'stock', ...corps }, { annulable: true })
  const annuler = () => envoyer('annuler', { action: 'annuler', mouvement_id: dernier.mouvement_id })

  const gros = grand ? 17 : 14
  const boutonGeste = (actif, desactive) => ({
    padding: grand ? '18px 8px' : '10px 8px', borderRadius: R.panel, cursor: desactive ? 'default' : 'pointer',
    border: `1.5px solid ${actif ? C.outline : C.border}`,
    background: actif ? AL.black : C.surface, color: actif ? AL.white : AL.black,
    font: `${actif ? 500 : 400} ${gros}px ${FONT}`, opacity: desactive ? 0.4 : 1,
  })
  const boutonLarge = plein => ({
    display: 'block', width: '100%', textAlign: 'center', padding: grand ? '15px 18px' : '10px 16px',
    borderRadius: R.pill, border: `1.5px solid ${C.outline}`, cursor: 'pointer', textDecoration: 'none',
    background: plein ? AL.black : C.surface, color: plein ? AL.white : AL.black, font: `500 ${grand ? 15 : 13.5}px ${FONT}`,
  })
  const petit = { font: `13px ${FONT}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', textDecoration: 'underline' }
  const nomUnite = libelleUnite(unite, d, d) || 'unité'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Le niveau physique, TOUJOURS visible — même pris en charge (§16). */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ font: `500 ${grand ? 24 : 18}px ${FONT}`, color: AL.black }}>
          {NIVEAUX[n]?.emoji} Stock : {formatQuantite(article.stock, article, unites)}
        </span>
        <span style={{ font: `13px ${FONT}`, color: C.muted }}>cible {formatQuantite(article.cible, article, unites)}</span>
      </div>
      {pris && (
        <p style={{ font: `${grand ? 15 : 13.5}px ${FONT}`, color: AL.black, margin: 0 }}>
          🔵 {libellePriseEnCharge(article)}
        </p>
      )}

      {/* LE GESTE PRINCIPAL. Entier : −1 / +1. Approximatif : le niveau. */}
      {article.suivi === 'entier' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => stock('moins', { type: 'mouvement', delta: -1 })}
            disabled={!!enCours || Number(article.stock) <= 0} style={boutonGeste(false, Number(article.stock) <= 0)}>
            −1 {nomUnite}
          </button>
          <button onClick={() => stock('plus', { type: 'mouvement', delta: 1 })} disabled={!!enCours} style={boutonGeste(false, false)}>
            +1 {nomUnite}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${niveauxApprox(article, unites).length}, 1fr)`, gap: 8 }}>
          {niveauxApprox(article, unites).map(x => {
            const actif = Number(article.stock) === x.parts
            return (
              <button key={x.parts} onClick={() => !actif && stock(`n${x.parts}`, { type: 'niveau', valeur: x.parts })}
                disabled={!!enCours} style={boutonGeste(actif, false)} title={actif ? 'Niveau actuel' : 'Niveau constaté'}>
                {x.libelle}
              </button>
            )
          })}
        </div>
      )}

      {dernier && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: AL.black, color: AL.white, borderRadius: R.panel, padding: '10px 14px', font: `14px ${FONT}`,
        }}>
          <span>✓ {dernier.message}</span>
          <button onClick={annuler} disabled={!!enCours}
            style={{ background: 'none', border: 'none', color: AL.white, font: `500 14px ${FONT}`, textDecoration: 'underline', cursor: 'pointer' }}>
            Annuler
          </button>
        </div>
      )}
      {souci && <p style={{ font: `13px ${FONT}`, color: C.danger, margin: 0 }}>{souci}</p>}

      {/* Réapprovisionner au stock cible (§15, §19) : remet à la cible, clôt la
          prise en charge, et laisse sa trace. Utile dès que le stock est sous
          la cible ou qu'un réapprovisionnement est en cours. */}
      {(Number(article.stock) < Number(article.cible) || pris) && (
        <button onClick={() => stock('reappro', { type: 'reappro' })} disabled={!!enCours} style={boutonLarge(true)}>
          Réapprovisionner au stock cible · {formatQuantite(article.cible, article, unites)}
        </button>
      )}

      {/* Le réapprovisionnement, quand le stock le demande ou qu'il est en cours. */}
      {(aFaire || pris) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!pris && appro.lien && (
            <a href={appro.lien} target="_blank" rel="noopener noreferrer" style={boutonLarge(false)}>{appro.libelle} ↗</a>
          )}
          {!pris && !appro.lien && (
            <p style={{ font: `500 ${grand ? 15 : 13.5}px ${FONT}`, color: AL.black, margin: 0 }}>{appro.libelle}</p>
          )}
          {formatCommande(article, unites) && !pris && (
            <p style={{ font: `13px ${FONT}`, color: C.muted, margin: 0 }}>Quantité habituelle : {formatCommande(article, unites)}</p>
          )}
          {/* La note doit être visible quand on doit agir (§8.3). */}
          {appro.note && <p style={{ font: `13.5px ${FONT}`, color: AL.black, background: C.hover, borderRadius: R.panel, padding: '8px 12px', margin: 0 }}>{appro.note}</p>}
          {!pris ? (
            <button onClick={() => envoyer('prendre', { action: 'prendre' })} disabled={!!enCours} style={boutonLarge(false)}>
              🔵 Prendre en charge
            </button>
          ) : (
            <button onClick={() => envoyer('lacher', { action: 'lacher' })} disabled={!!enCours} style={{ ...petit, alignSelf: 'flex-start' }}>
              Annuler la prise en charge
            </button>
          )}
        </div>
      )}

      {/* Ajustements (§14) : un achat ponctuel, une boîte retrouvée — sans
          prétendre que c'est le réapprovisionnement normal. Par contenant. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ font: `500 10.5px ${MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, marginRight: 4 }}>
          Ajustement
        </span>
        {[1, 2, -1].map(k => (
          <button key={k} onClick={() => stock(`aj${k}`, { type: 'ajustement', delta: k * d })}
            disabled={!!enCours || (k < 0 && Number(article.stock) <= 0)} style={petit}>
            {k > 0 ? `+${k}` : `−${-k}`} {libelleUnite(unite, Math.abs(k) * d, d) || ''}
          </button>
        ))}
      </div>
    </div>
  )
}
