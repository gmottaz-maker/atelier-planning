// Marge au kilomètre — proposition dans le nouveau style, à côté de la page
// actuelle (/outils/marge-km). La conduite ne se facture jamais à l'heure :
// le kilomètre et le forfait doivent payer le véhicule ET le temps de chaque
// personne à bord. Les hypothèses se changent ICI sans toucher aux réglages.
// Mêmes calculs (lib/transport.js). Réservée aux admins : elle montre des coûts.
import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../../_app'
import useIsAdmin from '../../../lib/useIsAdmin'
import { useTransport } from '../../../lib/useTransport'
import { useQuoteDefaults } from '../../../lib/useQuoteDefaults'
import { STYLE_FICHE } from '../../../components/fiche/styles'
import { N } from '../../../lib/theme'
import { fmtCHF } from '../../../lib/money'
import { normaliserCouts, coutKm, simulerTrajet, margeParKm, nombre, CODE_CONDUITE } from '../../../lib/transport'

const deuxDec = n => (n == null ? '—' : `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')}`)
const signe = n => (n == null ? '?' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtCHF(Math.abs(n))}`)
const ton = m => (m == null ? 'gris' : m < 0 ? 'neg' : 'pos')

export default function MargeKmEssai() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const transport = useTransport()
  const { reglages } = useQuoteDefaults()
  const { data: coutsBruts } = useSWR('/api/app-settings/couts_vehicules')
  const { data: activitesBrutes } = useSWR('/api/activites')
  // Même clé que useTransport (une seule requête) : sert à savoir si les
  // réglages sont arrivés. Sans ça, « Aucun véhicule » et des hypothèses
  // par défaut s'affichaient le temps du chargement.
  const { data: transportBrut } = useSWR('/api/app-settings/transport')
  const charge = transportBrut !== undefined && coutsBruts !== undefined && activitesBrutes !== undefined
  const [modif, setModif] = useState({})

  if (user && !isAdmin) { router.replace('/'); return null }

  const couts = normaliserCouts(coutsBruts?.value)
  const conduite = (Array.isArray(activitesBrutes) ? activitesBrutes : []).find(a => Number(a.code) === CODE_CONDUITE)
  // Une hypothèse modifiée ici l'emporte ; sinon on prend le réglage réel.
  const val = (cle, defaut) => (modif[cle] !== undefined ? modif[cle] : defaut)
  const set = (cle, v) => setModif(m => ({ ...m, [cle]: v }))
  const coutHoraire = nombre(val('coutHoraire', conduite?.cout_revient ?? ''))
  const tarifKm = nombre(val('tarifKm', reglages?.taux_km ?? 3)) ?? 3
  const vitesse = nombre(val('vitesse', couts.vitesse_moyenne ?? 70)) ?? 70

  const vehicules = transport.vehicules.map(v => {
    const km = nombre(val(`km_${v.id}`, couts.vehicules[v.id]?.km_annuels ?? ''))
    return { ...v, km, cout: coutKm({ ...(couts.vehicules[v.id] || {}), km_annuels: km }, couts.prix_diesel) }
  })
  const colonnes = vehicules.flatMap(v => [1, 2].map(personnes => ({ v, personnes })))
  const plusCher = vehicules.reduce((a, b) => ((b.cout?.totalKm ?? -1) > (a?.cout?.totalKm ?? -1) ? b : a), null)
  const trajets = transport.forfaits.map(f => ({ nom: f.nom, prix: f.prix ?? 0, km: f.km ?? 0, minutes: f.duree ?? null }))
  const simuler = (t, v, personnes) => simulerTrajet({ prix: t.prix, km: t.km, minutes: t.minutes, coutKm: v?.cout?.totalKm ?? null, personnes, coutHoraire, vitesse })
  const pireKm = plusCher ? margeParKm({ tarif: tarifKm, coutKm: plusCher.cout?.totalKm ?? null, personnes: 2, coutHoraire, vitesse }) : null
  const equilibreKm = plusCher?.cout?.totalKm == null || coutHoraire == null ? null : plusCher.cout.totalKm + 2 * coutHoraire / vitesse
  const perdants = trajets.filter(t => (simuler(t, plusCher, 2).marge ?? 0) < 0).length

  const manques = [
    vehicules.length === 0 && 'Aucun véhicule dans Réglages → Transport.',
    vehicules.some(v => v.cout?.totalKm == null) && 'Un véhicule n’a pas de km par an, de consommation, ou le prix du diesel manque.',
    coutHoraire == null && 'La Conduite (51) n’a pas de coût de revient : renseigne-le dans Heures, ou pose une hypothèse ci-dessous.',
    trajets.length === 0 && 'Aucun forfait de ville dans Réglages → Transport.',
  ].filter(Boolean)

  const hypotheses = [
    { cle: 'coutHoraire', label: 'Coût de la conduite', unite: 'CHF / h, par personne', defaut: conduite?.cout_revient ?? '' },
    { cle: 'tarifKm', label: 'Tarif facturé', unite: 'CHF / km', defaut: reglages?.taux_km ?? 3 },
    { cle: 'vitesse', label: 'Vitesse moyenne', unite: 'km / h', defaut: couts.vitesse_moyenne ?? 70 },
    ...vehicules.map(v => ({ cle: `km_${v.id}`, label: `Km par an, ${v.nom}`, unite: v.cout?.totalKm == null ? 'coût inconnu' : `${deuxDec(v.cout.totalKm)} CHF / km`, defaut: couts.vehicules[v.id]?.km_annuels ?? '' })),
  ]

  return (
    <div className="fx">
      <Head><title>Marge au kilomètre — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <p className="fx-chemin"><Link href="/outils/essai">Outils</Link></p>
            <h1>Marge au kilomètre</h1>
            <p className="fx-resume-liste"><span>Un trajet gagne-t-il de l’argent ?</span>{charge && perdants > 0 && <span className="rouge">{perdants} forfait{perdants > 1 ? 's' : ''} perd{perdants > 1 ? 'ent' : ''} à deux dans le {plusCher?.nom}</span>}</p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/outils/marge-km" style={{ textDecoration: 'none' }}>Ancienne page</a>
          </div>
        </header>

        {!charge && <p className="fx-note" style={{ marginTop: 40 }}>Chargement…</p>}
        {charge && <div className="fx-offre" style={{ marginTop: 48 }}>
          <div style={{ minWidth: 0 }}>
            {manques.length > 0 && (
              <div className="fx-encadre" style={{ marginTop: 0, marginBottom: 32, background: N.rougeDoux }}>
                {manques.map(m => <p key={m} className="rouge">{m}</p>)}
                <p className="fx-note"><Link href="/settings">Réglages</Link> · <Link href="/heures">Heures</Link></p>
              </div>
            )}

            <section className="fx-sec">
              <div className="fx-sec-t"><h3>Hypothèses</h3>{Object.keys(modif).length > 0 && <button className="fx-lien" onClick={() => setModif({})}>Revenir aux réglages</button>}</div>
              <p className="fx-dos-sous">Elles partent des vrais réglages. Les changer ici ne modifie ni les réglages ni les offres.</p>
              <div className="fx-hyp">
                {hypotheses.map(h => (
                  <label key={h.cle} className={modif[h.cle] !== undefined ? 'modifie' : undefined}>
                    <span className="fx-etiquette">{h.label}</span>
                    <input className="fx-champ n" inputMode="decimal" value={val(h.cle, h.defaut ?? '')} onChange={e => set(h.cle, e.target.value)} />
                    <small>{h.unite}</small>
                  </label>
                ))}
              </div>
            </section>

            <section className="fx-sec">
              <div className="fx-sec-t"><h3>Ce que coûte un kilomètre</h3></div>
              <div className="fx-tab-defile">
                <table className="fx-tab">
                  <thead><tr><th>Véhicule</th><th className="nb">Fixe par an</th><th className="nb">Fixe par km</th><th className="nb">Diesel par km</th><th className="nb">Coût par km</th></tr></thead>
                  <tbody>
                    {vehicules.map(v => (
                      <tr key={v.id}>
                        <td><b>{v.nom}</b><small>{v.km ? `${fmtCHF(v.km)} km par an` : 'km par an manquants'}</small></td>
                        <td className="nb">{v.cout ? `${fmtCHF(v.cout.fixeAnnuel)} CHF` : '—'}</td>
                        <td className="nb">{deuxDec(v.cout?.fixeKm ?? null)}</td>
                        <td className="nb">{deuxDec(v.cout?.carburantKm ?? null)}</td>
                        <td className="nb"><b>{deuxDec(v.cout?.totalKm ?? null)} CHF</b></td>
                      </tr>
                    ))}
                    {vehicules.length === 0 && <tr><td colSpan={5} className="gris">Aucun véhicule configuré.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="fx-sec">
              <div className="fx-sec-t"><h3>Marge par trajet</h3></div>
              <p className="fx-dos-sous">Ce que chaque forfait laisse, une fois payés le véhicule et le temps des personnes à bord. En rouge, il en coûte.</p>
              <div className="fx-tab-defile">
                <table className="fx-tab">
                  <thead><tr><th>Trajet</th>{colonnes.map(c => <th key={`${c.v.id}-${c.personnes}`} className="nb">{c.v.nom}, {c.personnes === 1 ? 'seul' : 'à deux'}</th>)}<th className="nb">Équilibre</th></tr></thead>
                  <tbody>
                    {trajets.map(t => {
                      const eq = plusCher ? simuler(t, plusCher, 2).equilibre : null
                      return (
                        <tr key={t.nom}>
                          <td><b>{t.nom}</b><small>{fmtCHF(t.prix)} CHF · {t.km} km{t.minutes ? ` · ${Math.round(t.minutes / 6) / 10} h` : ''}</small></td>
                          {colonnes.map(c => { const m = simuler(t, c.v, c.personnes).marge; return <td key={`${c.v.id}-${c.personnes}`} className={`nb ${ton(m)}`}>{signe(m)}</td> })}
                          <td className="nb">{eq == null ? '?' : `${fmtCHF(eq)} CHF`}</td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td><b>Au kilomètre</b><small>{deuxDec(tarifKm)} CHF / km à {vitesse} km/h, marge par km</small></td>
                      {colonnes.map(c => { const m = margeParKm({ tarif: tarifKm, coutKm: c.v.cout?.totalKm ?? null, personnes: c.personnes, coutHoraire, vitesse }); return <td key={`${c.v.id}-${c.personnes}`} className={`nb ${ton(m)}`}>{m == null ? '?' : `${m > 0 ? '+' : ''}${deuxDec(m)}`}</td> })}
                      <td className="nb">{equilibreKm == null ? '?' : `${deuxDec(equilibreKm)} CHF`}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="fx-note" style={{ marginTop: 12 }}>« Équilibre » : le prix qui couvrirait tout juste le trajet dans le cas le plus cher{plusCher ? ` (${plusCher.nom}, à deux)` : ''}. Un trajet lent, en ville, coûte plus de temps par kilomètre : baisse la vitesse moyenne pour le voir.</p>
            </section>
          </div>

          <aside className="fx-recap">
            <p className="label">Au km, dans le cas le plus cher</p>
            <p className={`grand${pireKm != null && pireKm < 0 ? ' rouge' : ''}`}><span className="n">{pireKm == null ? '—' : `${pireKm > 0 ? '+' : ''}${deuxDec(pireKm)}`}</span><span className="fx-dev">CHF</span></p>
            <dl>
              <dt>Véhicule</dt><dd>{plusCher ? `${plusCher.nom}, à deux` : '—'}</dd>
              <dt>Tarif facturé</dt><dd className="n">{deuxDec(tarifKm)} CHF</dd>
              <dt>Prix d’équilibre</dt><dd className="n">{equilibreKm == null ? '—' : `${deuxDec(equilibreKm)} CHF`}</dd>
              <dt>Coût de la conduite</dt><dd className="n">{coutHoraire == null ? '—' : `${deuxDec(coutHoraire)} CHF / h`}</dd>
            </dl>
          </aside>
        </div>}
      </div>
    </div>
  )
}

