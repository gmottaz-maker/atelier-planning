import { useState, useMemo } from 'react'
import { C, FONT, MONO } from '../lib/theme'
import { fmtCHF, fmtNombre } from '../lib/money'
import { chercherPrix } from '../lib/paintPrices'
import { chiffrer, prixMelange, rendement, fmtDuree, COMPLEXITES_DEFAUT, REGLAGES_DEFAUT } from '../lib/paintCalc'

// Chiffrage d'un travail de peinture, greffé sur la fiche d'un produit RUCO.
//
// Le lien entre le catalogue technique et le tarif d'atelier se fait par le
// SKU : un produit du catalogue est chiffrable si l'un de ses articles figure
// dans lib/paintPrices.js. Sinon on l'affiche quand même, en disant pourquoi —
// un produit sans prix reste un produit qu'on peut vouloir utiliser.

/** Articles d'un produit catalogue pour lesquels on connaît un prix. */
export function articlesChiffrables(produitCatalogue) {
  return (produitCatalogue?.articles || [])
    .map(a => ({ article: a, tarif: chercherPrix(a.sku) }))
    .filter(x => x.tarif)
}

const nb = (v, d = 2) => (Number.isFinite(v) ? fmtNombre(v, d) : '—')
const chf = v => (Number.isFinite(v) ? `${fmtCHF(v)} CHF` : '—')

export default function PaintCosting({ produit, complexites = COMPLEXITES_DEFAUT }) {
  const chiffrables = useMemo(() => articlesChiffrables(produit), [produit])
  const [refChoisie, setRefChoisie] = useState(null)
  const [surface, setSurface] = useState(15)
  const [couches, setCouches] = useState(2)
  const [cleVoulue, setCleVoulue] = useState('A2')
  const [modeRendement, setModeRendement] = useState('moyen')
  const [modeDilution, setModeDilution] = useState('retenue')
  const [avance, setAvance] = useState(false)
  const [reglages, setReglages] = useState(REGLAGES_DEFAUT)

  // Les niveaux sont configurables : celui qu'on a choisi peut avoir été
  // renommé ou supprimé entre-temps. On retombe alors sur le premier existant
  // plutôt que de chiffrer avec un coefficient absent.
  const cles = Object.keys(complexites)
  const cle = complexites[cleVoulue] ? cleVoulue : (cles[0] || null)

  const tarif = useMemo(() => {
    if (!chiffrables.length) return null
    const trouve = chiffrables.find(x => x.article.sku === refChoisie)
    return (trouve || chiffrables[0]).tarif
  }, [chiffrables, refChoisie])

  const r = useMemo(() => chiffrer({
    produit: tarif, surface, couches,
    complexite: complexites[cle],
    modeRendement, modeDilution,
    ...reglages,
  }), [tarif, surface, couches, cle, complexites, modeRendement, modeDilution, reglages])

  const h4 = { font: `700 10px ${MONO}`, letterSpacing: '.1em', color: C.muted, textTransform: 'uppercase', margin: '14px 0 6px' }
  const champ = { width: '100%', padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 6, font: `13px ${FONT}`, color: C.ink, background: '#fff' }
  const etiq = { font: `12px ${FONT}`, color: C.muted, display: 'block', marginBottom: 3 }

  if (!chiffrables.length) {
    return (
      <div style={{ padding: '10px 12px', background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 8, font: `12.5px ${FONT}`, color: C.inkTertiary }}>
        Pas de prix d’atelier pour ce produit — il ne figure pas encore dans les
        factures RUCO dépouillées. Le choix technique reste valable, seul le
        chiffrage manque.
      </div>
    )
  }

  return (
    <div>
      <div style={h4}>Chiffrage</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {chiffrables.length > 1 && (
          <label style={{ gridColumn: '1 / -1' }}>
            <span style={etiq}>Conditionnement</span>
            <select style={champ} value={refChoisie || chiffrables[0].article.sku}
              onChange={e => setRefChoisie(e.target.value)}>
              {chiffrables.map(({ article, tarif: t }) => (
                <option key={article.sku} value={article.sku}>
                  {article.content || article.label} — {t.prixA == null ? 'prix inconnu' : `${fmtCHF(t.prixA)} CHF`}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span style={etiq}>Surface réelle (m²)</span>
          <input style={champ} type="number" min="0" step="0.5" value={surface}
            onChange={e => setSurface(e.target.value)} />
        </label>

        <label>
          <span style={etiq}>Couches</span>
          <input style={champ} type="number" min="1" step="1" value={couches}
            onChange={e => setCouches(e.target.value)} />
        </label>

        <label style={{ gridColumn: '1 / -1' }}>
          <span style={etiq}>Complexité</span>
          <select style={champ} value={cle || ''} onChange={e => setCleVoulue(e.target.value)}>
            {Object.entries(complexites).map(([k, v]) => (
              <option key={k} value={k}>{k} — {v.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span style={etiq}>Rendement</span>
          <select style={champ} value={modeRendement} onChange={e => setModeRendement(e.target.value)}>
            <option value="min">Prudent</option>
            <option value="moyen">Moyen</option>
            <option value="max">Optimiste</option>
          </select>
        </label>

        <label>
          <span style={etiq}>Dilution</span>
          <select style={champ} value={modeDilution} onChange={e => setModeDilution(e.target.value)}>
            <option value="min">Minimum FT</option>
            <option value="retenue">Retenue</option>
            <option value="max">Maximum FT</option>
          </select>
        </label>
      </div>

      {/* Repères techniques du produit chiffré */}
      <div style={{ marginTop: 12, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, font: `12px ${FONT}`, color: C.inkTertiary, lineHeight: 1.7 }}>
        <strong style={{ color: C.ink }}>{tarif.nom}</strong> · {tarif.type}
        {tarif.durcisseur && <> · durcisseur {tarif.durcisseur} ({tarif.ratioA}:{tarif.ratioB})</>}
        {tarif.diluant && <> · diluant {tarif.diluant}</>}
        <br />
        Mélange prêt à durcir : {chf(prixMelange(tarif))}/{tarif.rendUnite === 'm²/L' ? 'kg' : 'kg'} ·
        rendement retenu {nb(rendement(tarif, modeRendement), 1)} {tarif.rendUnite || ''}
        {tarif.dilRetenue != null && (
          <><br />Dilution de chiffrage {nb(tarif.dilRetenue * 100, 0)} % — hypothèse Amazing Lab,
            dans la plage {nb(tarif.dilMin * 100, 0)}–{nb(tarif.dilMax * 100, 0)} % de la fiche technique.</>
        )}
      </div>

      {/* Résultats */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Chiffre label="Matière + marge" valeur={chf(r.coutMatiereMarge)} fort />
        <Chiffre label="Total indicatif" valeur={chf(r.total)} fort />
        <Chiffre label="Prêt à gicler" valeur={r.masseAGicler != null ? `${nb(r.masseAGicler)} kg` : '—'} />
        <Chiffre label="Temps estimé" valeur={fmtDuree(r.tempsMin)} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, font: `12.5px ${FONT}` }}>
        <tbody>
          {[
            ['Surface pondérée', `${nb(r.surfacePonderee)} m²`],
            ['Surface totale (couches comprises)', `${nb(r.surfaceTotale)} m²`],
            ['Mélange A+B nécessaire', r.melange != null ? `${nb(r.melange)} kg` : '—'],
            [`Composant A${tarif.durcisseur ? '' : ' (1K)'}`, r.quantiteA != null ? `${nb(r.quantiteA)} kg` : '—'],
            ...(tarif.ratioB ? [[`Durcisseur ${tarif.durcisseur}`, r.quantiteB != null ? `${nb(r.quantiteB)} kg` : '—']] : []),
            [`Diluant ${tarif.diluant || ''}`.trim(), r.quantiteDiluant != null ? `${nb(r.quantiteDiluant)} kg` : '—'],
            ['Coût A', chf(r.coutA)],
            ...(tarif.ratioB ? [['Coût durcisseur', chf(r.coutB)]] : []),
            ['Coût diluant', chf(r.coutDiluant)],
            ['Coût matière HT', chf(r.coutMatiere)],
            ['Coût temps atelier', chf(r.coutTemps)],
          ].map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '4px 0', color: C.muted, borderBottom: `1px solid ${C.divider}` }}>{k}</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: MONO, color: C.ink, borderBottom: `1px solid ${C.divider}`, fontVariantNumeric: 'tabular-nums' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!!r.avertissements.length && (
        <ul style={{ marginTop: 10, paddingLeft: 16, font: `12px ${FONT}`, color: '#9a3412' }}>
          {r.avertissements.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}

      <button onClick={() => setAvance(v => !v)}
        style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: `12px ${FONT}`, color: C.muted, textDecoration: 'underline' }}>
        {avance ? 'Masquer' : 'Afficher'} les paramètres avancés
      </button>

      {avance && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[
            ['margeMatiere', 'Marge matière (%)', 1],
            ['pertes', 'Pertes préparation (%)', 1],
            ['tempsA0', 'Temps A0 (min/m²/couche)', 0.5],
            ['tauxHoraire', 'Taux atelier (CHF/h)', 5],
          ].map(([k, label, pas]) => (
            <label key={k}>
              <span style={etiq}>{label}</span>
              <input style={champ} type="number" step={pas} value={reglages[k]}
                onChange={e => setReglages(s => ({ ...s, [k]: e.target.value }))} />
            </label>
          ))}
          <p style={{ gridColumn: '1 / -1', margin: 0, font: `11.5px ${FONT}`, color: C.muted }}>
            Le temps A0 et les coefficients de complexité sont des hypothèses
            d’atelier, à recalibrer sur des essais réels. Ils ne viennent pas de RUCO.
          </p>
        </div>
      )}
    </div>
  )
}

function Chiffre({ label, valeur, fort }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8,
      background: fort ? C.ink : '#f8fafc',
      color: fort ? '#fff' : C.ink,
    }}>
      <div style={{ font: `10px ${MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', opacity: fort ? .75 : 1, color: fort ? '#fff' : C.muted }}>{label}</div>
      <div style={{ font: `600 15px ${MONO}`, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{valeur}</div>
    </div>
  )
}
