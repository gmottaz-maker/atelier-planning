// Marge au kilomètre — simulation avant de faire une offre.
//
// La conduite ne se facture jamais à l'heure : ce sont les km et les forfaits
// qui doivent payer le véhicule ET le temps de chaque personne à bord. Cette
// page répond à « ce trajet gagne-t-il de l'argent, à deux, dans le Master ? »
// avant que l'offre parte.
//
// Elle lit les vrais réglages (Réglages → Transport) et le coût de revient de
// la Conduite (51). Les hypothèses restent modifiables ICI, sans rien changer
// aux réglages : on essaie un salaire plus haut ou un tarif au km sans toucher
// aux offres. Réservée aux admins — elle affiche des coûts.
import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import { useTransport } from '../../lib/useTransport'
import { useQuoteDefaults } from '../../lib/useQuoteDefaults'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import { fmtCHF } from '../../lib/money'
import { normaliserCouts, coutKm, simulerTrajet, margeParKm, nombre, CODE_CONDUITE } from '../../lib/transport'

const champ = {
  padding: '7px 12px', borderRadius: R.pill, border: `1px solid ${C.border}`,
  font: `14px ${MONO}`, color: AL.black, background: C.surface, outline: 'none',
  textAlign: 'right', fontVariantNumeric: 'tabular-nums',
}
const microLabel = { fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }
const cellule = { padding: '10px 14px', fontSize: 13.5, borderTop: `1px solid ${C.border}` }
const nombreCell = { ...cellule, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }
const deuxDec = n => (n == null ? '—' : `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')}`)

export default function MargeKm() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const transport = useTransport()
  const { reglages } = useQuoteDefaults()
  const { data: coutsBruts } = useSWR('/api/app-settings/couts_vehicules')
  const { data: activitesBrutes } = useSWR('/api/activites')
  const [modif, setModif] = useState({})

  if (user && !isAdmin) { router.replace('/'); return null }

  const couts = normaliserCouts(coutsBruts?.value)
  const activites = Array.isArray(activitesBrutes) ? activitesBrutes : []
  const conduite = activites.find(a => Number(a.code) === CODE_CONDUITE)

  // Une hypothèse modifiée ici l'emporte ; sinon on prend le réglage réel.
  const val = (cle, defaut) => (modif[cle] !== undefined ? modif[cle] : defaut)
  const set = (cle, v) => setModif(m => ({ ...m, [cle]: v }))
  const coutHoraire = nombre(val('coutHoraire', conduite?.cout_revient ?? ''))
  const tarifKm = nombre(val('tarifKm', reglages?.taux_km ?? 3)) ?? 3
  const vitesse = nombre(val('vitesse', couts.vitesse_moyenne ?? 70)) ?? 70
  const kmAn = id => nombre(val(`km_${id}`, couts.vehicules[id]?.km_annuels ?? ''))

  const vehicules = transport.vehicules.map(v => {
    const km = kmAn(v.id)
    const c = coutKm({ ...(couts.vehicules[v.id] || {}), km_annuels: km }, couts.prix_diesel)
    return { ...v, km, cout: c }
  })
  const colonnes = vehicules.flatMap(v => [1, 2].map(personnes => ({ v, personnes })))
  const plusCher = vehicules.reduce((a, b) => ((b.cout?.totalKm ?? -1) > (a?.cout?.totalKm ?? -1) ? b : a), null)

  const trajets = transport.forfaits.map(f => ({ nom: f.nom, prix: f.prix ?? 0, km: f.km ?? 0, minutes: f.duree ?? null }))
  const marge = (t, col) => simulerTrajet({
    prix: t.prix, km: t.km, minutes: t.minutes, coutKm: col.v.cout?.totalKm ?? null,
    personnes: col.personnes, coutHoraire, vitesse,
  })
  const equilibre = t => (plusCher ? simulerTrajet({
    prix: t.prix, km: t.km, minutes: t.minutes, coutKm: plusCher.cout?.totalKm ?? null,
    personnes: 2, coutHoraire, vitesse,
  }).equilibre : null)

  const couleur = m => (m == null ? C.muted : m < 0 ? C.danger : C.success)
  const manques = [
    vehicules.length === 0 && 'Aucun véhicule dans Réglages → Transport.',
    vehicules.some(v => v.cout?.totalKm == null) && 'Un véhicule n\'a pas de km par an, de consommation, ou le prix du diesel manque.',
    coutHoraire == null && 'La Conduite (51) n\'a pas de coût de revient : renseigne-le dans /heures, ou pose une hypothèse ci-dessous.',
    trajets.length === 0 && 'Aucun forfait de ville dans Réglages → Transport.',
  ].filter(Boolean)

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Marge au kilomètre · Maze Project</title></Head>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 64px' }}>
        <Link href="/outils" style={{ fontSize: 12.5, color: C.muted, textDecoration: 'none' }}>← outils</Link>
        <h1 style={{ font: `700 24px ${FONT}`, margin: '14px 0 4px' }}>Marge au kilomètre</h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 24px', maxWidth: 680, lineHeight: 1.6 }}>
          La conduite ne se facture pas à l'heure : le kilomètre et le forfait doivent payer le véhicule
          <strong style={{ fontWeight: 500, color: AL.black }}> et </strong>
          le temps de chaque personne à bord. Les hypothèses ci-dessous ne modifient aucun réglage.
        </p>

        {manques.length > 0 && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '12px 16px', marginBottom: 22 }}>
            {manques.map(m => (
              <p key={m} style={{ margin: '2px 0', fontSize: 13, color: C.warning }}>{m}</p>
            ))}
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>
              <Link href="/settings" style={{ color: AL.black }}>Réglages</Link> ·{' '}
              <Link href="/heures" style={{ color: AL.black }}>Heures</Link>
            </p>
          </div>
        )}

        {/* ── Hypothèses ── */}
        <div style={{ ...microLabel, marginBottom: 10 }}>hypothèses</div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 28 }}>
          {[
            { cle: 'coutHoraire', label: 'Coût de la conduite', unite: 'CHF / h par personne', defaut: conduite?.cout_revient ?? '' },
            { cle: 'tarifKm', label: 'Tarif facturé', unite: 'CHF / km', defaut: reglages?.taux_km ?? 3 },
            { cle: 'vitesse', label: 'Vitesse moyenne', unite: 'km / h', defaut: couts.vitesse_moyenne ?? 70 },
          ].map(h => (
            <label key={h.cle} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              {h.label}
              <input inputMode="decimal" style={{ ...champ, width: 110 }}
                value={val(h.cle, h.defaut ?? '')} onChange={e => set(h.cle, e.target.value)} />
              <span style={{ fontSize: 11.5, color: C.muted }}>{h.unite}</span>
            </label>
          ))}
          {vehicules.map(v => (
            <label key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              Km par an · {v.nom}
              <input inputMode="decimal" style={{ ...champ, width: 110 }}
                value={val(`km_${v.id}`, couts.vehicules[v.id]?.km_annuels ?? '')}
                onChange={e => set(`km_${v.id}`, e.target.value)} />
              <span style={{ fontSize: 11.5, color: C.muted }}>{v.cout?.totalKm == null ? 'coût inconnu' : `${deuxDec(v.cout.totalKm)} / km`}</span>
            </label>
          ))}
          {Object.keys(modif).length > 0 && (
            <button onClick={() => setModif({})}
              style={{ border: 'none', background: 'none', padding: '0 0 22px', cursor: 'pointer', font: `13px ${FONT}`, color: C.muted }}>
              revenir aux réglages
            </button>
          )}
        </div>

        {/* ── Coût d'un kilomètre ── */}
        <div style={{ ...microLabel, marginBottom: 10 }}>coût d'un kilomètre</div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden', overflowX: 'auto', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
            <thead>
              <tr style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500 }}>véhicule</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>fixe / an</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>fixe / km</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>diesel / km</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>coût / km</th>
              </tr>
            </thead>
            <tbody>
              {vehicules.map(v => (
                <tr key={v.id}>
                  <td style={cellule}>{v.nom}<span style={{ color: C.muted }}> · {v.km ? `${fmtCHF(v.km)} km/an` : 'km/an manquants'}</span></td>
                  <td style={nombreCell}>{v.cout ? fmtCHF(v.cout.fixeAnnuel) : '—'}</td>
                  <td style={nombreCell}>{deuxDec(v.cout?.fixeKm ?? null)}</td>
                  <td style={nombreCell}>{deuxDec(v.cout?.carburantKm ?? null)}</td>
                  <td style={{ ...nombreCell, fontWeight: 500 }}>{deuxDec(v.cout?.totalKm ?? null)}</td>
                </tr>
              ))}
              {vehicules.length === 0 && (
                <tr><td style={cellule} colSpan={5}>Aucun véhicule configuré.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Marge par trajet ── */}
        <div style={{ ...microLabel, marginBottom: 10 }}>marge par trajet</div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500 }}>trajet</th>
                {colonnes.map(c => (
                  <th key={`${c.v.id}-${c.personnes}`} style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>
                    {c.v.nom} · {c.personnes}
                  </th>
                ))}
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>
                  équilibre{plusCher ? ` · ${plusCher.nom} à 2` : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {trajets.map(t => (
                <tr key={t.nom}>
                  <td style={cellule}>
                    {t.nom}
                    <span style={{ color: C.muted }}> · {fmtCHF(t.prix)} CHF · {t.km} km{t.minutes ? ` · ${Math.round(t.minutes / 60 * 10) / 10} h` : ''}</span>
                  </td>
                  {colonnes.map(c => {
                    const m = marge(t, c).marge
                    return (
                      <td key={`${c.v.id}-${c.personnes}`} style={{ ...nombreCell, color: couleur(m), fontWeight: m != null && m < 0 ? 500 : 400 }}>
                        {m == null ? '?' : `${m > 0 ? '+' : m < 0 ? '−' : ''}${fmtCHF(Math.abs(m))}`}
                      </td>
                    )
                  })}
                  <td style={nombreCell}>{equilibre(t) == null ? '?' : fmtCHF(equilibre(t))}</td>
                </tr>
              ))}
              <tr>
                <td style={cellule}>
                  Au km<span style={{ color: C.muted }}> · {deuxDec(tarifKm)} CHF / km à {vitesse} km/h — marge par km</span>
                </td>
                {colonnes.map(c => {
                  const m = margeParKm({ tarif: tarifKm, coutKm: c.v.cout?.totalKm ?? null, personnes: c.personnes, coutHoraire, vitesse })
                  return (
                    <td key={`${c.v.id}-${c.personnes}`} style={{ ...nombreCell, color: couleur(m), fontWeight: m != null && m < 0 ? 500 : 400 }}>
                      {m == null ? '?' : `${m > 0 ? '+' : ''}${deuxDec(m)}`}
                    </td>
                  )
                })}
                <td style={nombreCell}>
                  {plusCher?.cout?.totalKm == null || coutHoraire == null ? '?' : deuxDec(plusCher.cout.totalKm + 2 * coutHoraire / vitesse)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, margin: '10px 0 0', lineHeight: 1.6, maxWidth: 680 }}>
          La colonne « équilibre » donne le prix qui couvrirait tout juste le trajet dans le cas le plus cher.
          Un trajet lent, en ville, coûte plus de temps par kilomètre : baisse la vitesse moyenne pour le voir.
        </p>
      </div>
    </div>
  )
}
