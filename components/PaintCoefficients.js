import { useState, useEffect } from 'react'
import { C, FONT, MONO } from '../lib/theme'
import { apiGet, apiPut } from '../lib/api'
import {
  COMPLEXITES_DEFAUT, normaliserComplexites,
  ajouterComplexite, retirerComplexite, renommerComplexite,
} from '../lib/paintCalc'

// Réglage des niveaux de complexité du chiffrage peinture.
//
// A0–A4 ne sont qu'un point de départ : les niveaux se créent, se renomment et
// se suppriment. Il en faut toujours au moins un, sans quoi le calculateur
// n'aurait aucun coefficient à appliquer.
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
        <strong>Quantité peinture</strong> mesure la surconsommation due à la
        <em>forme</em> de la pièce : chants, retours, recoins, angles où le pistolet
        repasse et où le brouillard se perd. Elle ne recouvre pas les pertes
        normales de pulvérisation — amorçage, réglage, fond de godet — qui valent
        même pour un panneau plat et se règlent à part, dans les paramètres avancés
        du chiffrage. <strong>Temps</strong> est le facteur de durée correspondant.
        <br /><br />
        Les valeurs livrées <strong>ne reposent sur aucune mesure</strong> : ce sont
        des ordres de grandeur posés au départ pour que le calcul tourne, ni RUCO ni
        un essai d’atelier ne les appuie. Ajuste-les dès que tu auras des chantiers
        pour les confronter. Les niveaux sont libres — ajoute les tiens si A0–A4 ne
        colle pas à ton travail. Ils sont partagés par toute l’équipe.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', font: `13px ${FONT}` }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 92 }}>Niveau</th>
              <th style={th}>Description</th>
              <th style={{ ...th, textAlign: 'right', width: 116 }}>Quantité peinture</th>
              <th style={{ ...th, textAlign: 'right', width: 96 }}>Temps</th>
              <th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(brouillon).map(cle => (
              <tr key={cle}>
                <td style={{ ...td, padding: '6px 4px 6px 8px' }}>
                  <input
                    disabled={!peutModifier}
                    aria-label={`Code du niveau ${cle}`}
                    style={{ width: 76, padding: '5px 6px', border: `1px solid ${C.border}`, borderRadius: 6, font: `600 12px ${MONO}`, color: C.ink, background: peutModifier ? '#fff' : '#f8fafc' }}
                    defaultValue={cle}
                    onBlur={e => {
                      const nouveau = e.target.value.trim()
                      if (nouveau === cle) return
                      const suite = renommerComplexite(brouillon, cle, nouveau)
                      if (suite === brouillon) e.target.value = cle   // refusé : on remet
                      else setBrouillon(suite)
                    }}
                  />
                </td>
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
                    value={brouillon[cle]?.quantite ?? ''}
                    onChange={e => majCoef(cle, 'quantite', e.target.value)} />
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <input disabled={!peutModifier} type="number" step="0.01" min="0.1" max="20"
                    style={{ ...champ, background: peutModifier ? '#fff' : '#f8fafc' }}
                    value={brouillon[cle]?.temps ?? ''}
                    onChange={e => majCoef(cle, 'temps', e.target.value)} />
                </td>
                <td style={{ ...td, textAlign: 'center', width: 36 }}>
                  {peutModifier && Object.keys(brouillon).length > 1 && (
                    <button onClick={() => setBrouillon(b => retirerComplexite(b, cle))}
                      aria-label={`Supprimer le niveau ${cle}`} title="Supprimer ce niveau"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, font: `15px ${FONT}`, padding: 2 }}>×</button>
                  )}
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
          <button onClick={() => setBrouillon(b => ajouterComplexite(b))}
            style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.ink, cursor: 'pointer', font: `500 13px ${FONT}` }}>
            + Niveau
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
