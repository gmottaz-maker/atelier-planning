import { useState, useEffect } from 'react'
import { C, FONT, MONO } from '../lib/theme'
import { apiGet, apiPut } from '../lib/api'
import { COMPLEXITES_DEFAUT, normaliserComplexites } from '../lib/paintCalc'

// Réglage des coefficients de complexité A0–A4.
//
// Ils sont PARTAGÉS, pas propres à chaque poste : rangés dans `app_settings`
// sous la clé `paint_coefficients`. Si quelqu'un les recalibre après des essais
// d'atelier, les chiffrages de toute l'équipe en profitent — c'est tout
// l'intérêt de les mesurer. Lecture pour tous, écriture réservée à l'admin,
// comme le reste de cette table.

const CLE = '/api/app-settings/paint_coefficients'

/** Charge les coefficients partagés. Retombe sur les valeurs par défaut. */
export function useCoefficients() {
  const [coefficients, setCoefficients] = useState(COMPLEXITES_DEFAUT)
  const [charge, setCharge] = useState(false)

  useEffect(() => {
    let annule = false
    apiGet(CLE)
      .then(d => { if (!annule) setCoefficients(normaliserComplexites(d?.value)) })
      .catch(() => { /* défauts conservés : un réglage absent ne bloque rien */ })
      .finally(() => { if (!annule) setCharge(true) })
    return () => { annule = true }
  }, [])

  return { coefficients, setCoefficients, charge }
}

export default function PaintCoefficients({ coefficients, onChange, peutModifier }) {
  const [brouillon, setBrouillon] = useState(coefficients)
  const [etat, setEtat] = useState(null)

  useEffect(() => { setBrouillon(coefficients) }, [coefficients])

  const modifie = JSON.stringify(brouillon) !== JSON.stringify(coefficients)

  const majCoef = (cle, champ, valeur) =>
    setBrouillon(b => ({ ...b, [cle]: { ...b[cle], [champ]: valeur } }))

  async function enregistrer() {
    const propre = normaliserComplexites(brouillon)
    setEtat('enregistrement')
    try {
      await apiPut(CLE, { value: propre })
      onChange(propre)
      setBrouillon(propre)
      setEtat('ok')
      setTimeout(() => setEtat(null), 2500)
    } catch (e) {
      // L'échec est déjà signalé par le bandeau global ; on note juste l'état.
      setEtat('erreur')
    }
  }

  const champ = {
    width: 68, padding: '5px 7px', border: `1px solid ${C.border}`, borderRadius: 6,
    font: `13px ${MONO}`, color: C.ink, background: '#fff', textAlign: 'right',
  }
  const th = {
    textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.border}`,
    font: `600 10px ${MONO}`, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em',
  }
  const td = { padding: '6px 8px', borderBottom: `1px solid ${C.divider}` }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, padding: '14px 16px' }}>
      <p style={{ font: `12.5px ${FONT}`, color: C.inkTertiary, margin: '0 0 12px', maxWidth: '68ch', lineHeight: 1.6 }}>
        Ces coefficients multiplient la surface (matière) et la durée (temps) selon
        la difficulté de la pièce. Ce sont des <strong>hypothèses d’atelier</strong>,
        pas des données RUCO : ils sont faits pour être ajustés au fil des essais.
        Ils sont partagés par toute l’équipe.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', font: `13px ${FONT}` }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 48 }}>Niv.</th>
              <th style={th}>Description</th>
              <th style={{ ...th, textAlign: 'right', width: 96 }}>Matière</th>
              <th style={{ ...th, textAlign: 'right', width: 96 }}>Temps</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(COMPLEXITES_DEFAUT).map(cle => (
              <tr key={cle}>
                <td style={{ ...td, fontFamily: MONO, fontWeight: 600 }}>{cle}</td>
                <td style={td}>
                  <input
                    disabled={!peutModifier}
                    style={{ width: '100%', padding: '5px 7px', border: `1px solid ${C.border}`, borderRadius: 6, font: `13px ${FONT}`, color: C.ink, background: peutModifier ? '#fff' : '#f8fafc' }}
                    value={brouillon[cle]?.label || ''}
                    onChange={e => majCoef(cle, 'label', e.target.value)}
                  />
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <input disabled={!peutModifier} type="number" step="0.01" min="0.1" max="20"
                    style={{ ...champ, background: peutModifier ? '#fff' : '#f8fafc' }}
                    value={brouillon[cle]?.matiere ?? ''}
                    onChange={e => majCoef(cle, 'matiere', e.target.value)} />
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <input disabled={!peutModifier} type="number" step="0.01" min="0.1" max="20"
                    style={{ ...champ, background: peutModifier ? '#fff' : '#f8fafc' }}
                    value={brouillon[cle]?.temps ?? ''}
                    onChange={e => majCoef(cle, 'temps', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {peutModifier ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={enregistrer} disabled={!modifie || etat === 'enregistrement'}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: modifie ? 'pointer' : 'default',
              background: modifie ? C.ink : '#e5e7eb', color: modifie ? '#fff' : C.muted,
              font: `500 13px ${FONT}`,
            }}>
            {etat === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={() => setBrouillon(COMPLEXITES_DEFAUT)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: `13px ${FONT}`, color: C.muted, textDecoration: 'underline' }}>
            Revenir aux valeurs d’origine
          </button>
          {etat === 'ok' && <span style={{ font: `12.5px ${FONT}`, color: '#065f46' }}>Enregistré pour toute l’équipe.</span>}
          {etat === 'erreur' && <span style={{ font: `12.5px ${FONT}`, color: '#9a3412' }}>Échec — rien n’a été modifié.</span>}
        </div>
      ) : (
        <p style={{ font: `12.5px ${FONT}`, color: C.muted, margin: '12px 0 0' }}>
          Lecture seule : la modification est réservée aux administrateurs.
        </p>
      )}
    </div>
  )
}
