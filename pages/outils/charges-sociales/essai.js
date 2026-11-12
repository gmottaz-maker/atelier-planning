// Charges sociales — proposition dans le nouveau style, à côté de la page
// actuelle (/outils/charges-sociales). Mêmes données (lib/assurances.js),
// mêmes calculs (lib/assurancesCalc.js) : AVS/AC/AF, LAA et LPP, ce qui est
// prélevé sur les salaires sans qu'on ait le choix. L'IJM, qui se résilie,
// est comptée dans les assurances. Réservée aux admins : elle montre des salaires.
import { useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../../_app'
import useIsAdmin from '../../../lib/useIsAdmin'
import { STYLE_FICHE } from '../../../components/fiche/styles'
import { Chf, Contrat, Manque, Obligation, Question, Recap, Section } from '../../../components/outils/Dossier'
import { fmtCHF0 } from '../../../lib/money'
import { EFFECTIF, SORTIS, SINISTRES, MANQUES, MASSE_AVS, RELEVE_AU, contratsFamille, obligationsFamille, contratParId } from '../../../lib/assurances'
import { coutsParPersonne, totalAnnuel, ecartFactureCalcule, projection } from '../../../lib/assurancesCalc'

const FAMILLE = 'social'
// Les manques propres aux charges sociales ; les autres restent aux assurances.
const MANQUES_ICI = ['lpp-gabin', 'part-employeur-2026']

export default function ChargesSocialesEssai() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const parPersonne = useMemo(() => coutsParPersonne({ famille: FAMILLE }), [])
  const total = useMemo(() => totalAnnuel({ famille: FAMILLE }), [])
  const ecartSuva = useMemo(() => ecartFactureCalcule(contratParId('suva-laa')), [])
  const apres = useMemo(() => projection('2026-11-01', { famille: FAMILLE }), [])
  const actifs = contratsFamille(FAMILLE).filter(c => c.statut === 'actif')
  const obligations = [...obligationsFamille(FAMILLE)].sort((a, b) => (a.fait ? 1 : 0) - (b.fait ? 1 : 0))
  const sinistres = SINISTRES.filter(s => contratParId(s.contrat)?.famille === FAMILLE)
  const manques = MANQUES.filter(m => MANQUES_ICI.includes(m.id))
  const masse = EFFECTIF.reduce((s, p) => s + p.salaireAvs, 0)
  const aFaire = obligations.filter(o => !o.fait).length

  if (user && !isAdmin) { router.replace('/'); return null }

  return (
    <div className="fx">
      <Head><title>Charges sociales — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <p className="fx-chemin"><Link href="/outils/essai">Outils</Link></p>
            <h1>Charges sociales</h1>
            <p className="fx-resume-liste"><span>Ce qu’un employé coûte, et qui prélève quoi</span><span>dossier relu le {RELEVE_AU}</span>{aFaire > 0 && <span className="rouge">{aFaire} à faire</span>}</p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/outils/charges-sociales" style={{ textDecoration: 'none' }}>Ancienne page</a>
            <Link className="fx-btn g" href="/outils/assurances/essai" style={{ textDecoration: 'none' }}>Assurances</Link>
          </div>
        </header>

        <div className="fx-offre" style={{ marginTop: 48 }}>
          <div style={{ minWidth: 0 }}>
            <Section titre="Par personne" droite={<span className="tot"><Chf n={total.personnes.employeur} /></span>}
              sous="Les trois prélèvements assis sur les salaires. La colonne AVS regroupe l’AVS/AI/APG, le chômage, les allocations familiales, les PC Famille et les frais administratifs.">
              <div className="fx-tab-defile">
                <table className="fx-tab">
                  <thead><tr><th>Personne</th><th className="nb">Salaire AVS</th><th className="nb">AVS / AC / AF</th><th className="nb">Suva (LAA)</th><th className="nb">LPP</th><th className="nb">Employeur</th><th className="nb">% du salaire</th></tr></thead>
                  <tbody>
                    {parPersonne.map(p => {
                      const par = id => p.parContrat.find(c => c.contrat === id)?.employeur
                      return (
                        <tr key={p.personne}>
                          <td><b>{p.personne}</b></td>
                          <td className="nb"><Chf n={p.salaireAvs} /></td>
                          <td className="nb"><Chf n={par('avs-caf')} /></td>
                          <td className="nb"><Chf n={par('suva-laa')} /></td>
                          <td className="nb"><Chf n={par('nest-lpp')} /></td>
                          <td className="nb"><b><Chf n={p.employeurConnu} /></b></td>
                          <td className="nb gris">{p.chargeSurSalaire == null ? '—' : `${p.chargeSurSalaire.toFixed(1).replace('.', ',')} %`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr><td>Total</td><td className="nb"><Chf n={masse} /></td><td colSpan={3} /><td className="nb"><Chf n={total.personnes.employeur} /></td><td /></tr></tfoot>
                </table>
              </div>
              <p className="fx-note" style={{ marginTop: 12 }}>La part salariale de l’AVS vaut 6,400 % (4,35 + 0,7 + 0,25 pour l’AVS/AI/APG, plus 1,1 de chômage), exactement la ligne 9 des certificats de salaire. L’AANP n’y figure pas : l’employeur la paie en entier.</p>

              {apres.effectif.length < EFFECTIF.length && (
                <div className="fx-encadre">
                  <b>Dès novembre 2026</b>
                  <p>Gabin part après octobre 2026. Il restera {apres.effectif.join(' et ')}, pour une masse salariale de {fmtCHF0(apres.masseSalariale)} CHF au lieu de {fmtCHF0(masse)} CHF, et des charges sociales d’environ <b><Chf n={apres.employeurConnu} /></b> par an. Pensez à annoncer la sortie : une cotisation non annoncée court sur un salaire qui n’existe plus.</p>
                </div>
              )}
              {ecartSuva?.ecart != null && (
                <div className="fx-encadre">
                  <b>Régularisation Suva probable</b>
                  <p>La facture provisoire 2026 porte sur {fmtCHF0(ecartSuva.masseFacturee)} CHF, reprise du définitif 2024 majoré de 2 %. Le 3<sup>e</sup> trimestre 2026 a été facturé par la caisse AVS sur {fmtCHF0(MASSE_AVS.trimestre.base)} CHF, soit environ {fmtCHF0(ecartSuva.masseReelle)} CHF sur l’année. La prime réelle vaudrait <Chf n={ecartSuva.calcule} /> contre <Chf n={ecartSuva.facture} /> facturés : de l’ordre de <b><Chf n={ecartSuva.ecart} /></b> à récupérer au décompte de janvier 2027, davantage encore puisque Gabin part fin octobre.</p>
                  <p className="fx-note">Estimation : elle projette un trimestre sur quatre. À ne pas confondre avec la somme des salaires déclarés à Nest ({fmtCHF0(ecartSuva.masseLpp)} CHF), qui ne vaut que pour la LPP.</p>
                </div>
              )}
            </Section>

            <Section titre="Une question ?" sous="La recherche porte sur toutes les garanties, y compris celles des assurances : personne ne se demande dans quel écran poser sa question.">
              <Question famille={FAMILLE} exemples={['Un gars s’est coupé à l’atelier', 'Un collaborateur est en arrêt maladie depuis 3 semaines', 'On utilise des produits chimiques', 'Accident de ski pendant les vacances']} />
            </Section>

            <Section titre="À faire" droite={<span className="tot n">{aFaire}</span>} sous="Les déclarations et annonces qui ne se paient pas en francs, mais coûtent cher quand on les oublie.">
              {obligations.map(o => <Obligation key={o.id} obligation={o} aujourdhui={RELEVE_AU} />)}
            </Section>

            <Section titre="Organismes" sous="Qui prélève quoi, avec le numéro d’affilié et la personne à appeler.">
              {actifs.map(c => <Contrat key={c.id} contrat={c} />)}
            </Section>

            {sinistres.length > 0 && (
              <Section titre="Sinistres LAA" sous="Un sinistre pèse sur le taux de prime des années suivantes.">
                <div className="fx-tab-defile">
                  <table className="fx-tab">
                    <thead><tr><th>Date</th><th>Qui</th><th>Quoi</th><th className="nb">Versé</th></tr></thead>
                    <tbody>{sinistres.map(s => (
                      <tr key={s.id}><td className="n">{s.date || '—'}</td><td>{s.personne || '—'}</td><td>{s.type}<small>{s.detail}</small></td><td className="nb"><Chf n={s.montant} /></td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </Section>
            )}

            {manques.length > 0 && (
              <Section titre="Ce qui manque au dossier" sous="L’outil ne vaut que ce que vaut le dossier.">
                {manques.map(m => <Manque key={m.id} manque={m} />)}
              </Section>
            )}

            <p className="fx-note" style={{ marginTop: 48 }}>
              Effectif : {EFFECTIF.map(p => p.nom).join(', ')}.{SORTIS.length > 0 && <> Sortis, conservés pour mémoire : {SORTIS.map(p => p.nom).join(', ')}.</>} Les chiffres se modifient dans lib/assurances.js.
            </p>
          </div>

          <Recap
            label={total.incomplet ? 'Au moins, par an' : 'Coût employeur par an'}
            total={total.employeur}
            lignes={[{ label: `Par personne (${EFFECTIF.length})`, valeur: total.parTete }, { label: 'Masse salariale AVS', valeur: masse }]}
            avertissement={total.incomplet ? `« Au moins », parce que ${total.personnes.inconnus} ligne${total.personnes.inconnus > 1 ? 's' : ''} de cotisation ${total.personnes.inconnus > 1 ? 'ont' : 'a'} une part employeur que le dossier ne fixe pas.` : null}
          />
        </div>
      </div>
    </div>
  )
}
