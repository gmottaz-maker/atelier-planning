// Assurances — proposition dans le nouveau style, à côté de la page actuelle
// (/outils/assurances). Mêmes données (lib/assurances.js, relu à la main sur
// le dossier kDrive), mêmes calculs. La question ici n'est pas « combien »,
// c'est « suis-je couvert » : la boîte à questions vient donc en premier.
// Réservée aux admins : elle montre des salaires.
import { useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../../_app'
import useIsAdmin from '../../../lib/useIsAdmin'
import { STYLE_FICHE } from '../../../components/fiche/styles'
import { Chf, Contrat, Manque, Obligation, Point, Question, Recap, Section, couvertDe } from '../../../components/outils/Dossier'
import { EFFECTIF, SINISTRES, MANQUES, RELEVE_AU, contratsFamille, couverturesFamille, obligationsFamille, contratParId } from '../../../lib/assurances'
import { coutsParPersonne, coutsEntreprise, totalAnnuel } from '../../../lib/assurancesCalc'

const FAMILLE = 'assurance'
const MANQUES_AILLEURS = ['lpp-gabin', 'part-employeur-2026']
const RANG = { false: 0, verifier: 1, partiel: 2, true: 3 }

export default function AssurancesEssai() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const [voirCaducs, setVoirCaducs] = useState(false)
  const [voirAcquis, setVoirAcquis] = useState(false)
  const parPersonne = useMemo(() => coutsParPersonne({ famille: FAMILLE }), [])
  const entreprise = useMemo(() => coutsEntreprise({ famille: FAMILLE }), [])
  const total = useMemo(() => totalAnnuel({ famille: FAMILLE }), [])
  const contrats = contratsFamille(FAMILLE)
  const actifs = contrats.filter(c => c.statut === 'actif')
  const caducs = contrats.filter(c => c.statut === 'caduc')
  const couvertures = [...couverturesFamille(FAMILLE)].sort((a, b) => RANG[String(a.couvert)] - RANG[String(b.couvert)])
  // D'abord ce qui manque ou coince ; ce qui est acquis se déplie.
  const aRegarder = couvertures.filter(c => c.couvert !== true)
  const acquis = couvertures.filter(c => c.couvert === true)
  const obligations = [...obligationsFamille(FAMILLE)].sort((a, b) => (a.fait ? 1 : 0) - (b.fait ? 1 : 0))
  const sinistres = SINISTRES.filter(s => !s.contrat || contratParId(s.contrat)?.famille === FAMILLE)
  const manques = MANQUES.filter(m => !MANQUES_AILLEURS.includes(m.id))
  const nonCouverts = couvertures.filter(c => c.couvert === false).length

  if (user && !isAdmin) { router.replace('/'); return null }

  const Couverture = ({ c }) => {
    const e = couvertDe(c.couvert)
    const contrat = c.contrat ? contratParId(c.contrat) : null
    return (
      <article className="fx-dos-ligne">
        <div className="tete"><Point ton={e.ton}>{e.texte}</Point><b>{c.intitule}</b><span className="droite meta">{contrat ? contrat.assureur : 'Aucun contrat'}</span></div>
        <p>{c.detail}</p>
        {(c.plafond || c.franchise) && <p className="refs">{[c.plafond && `Jusqu’à ${c.plafond}`, c.franchise && `Franchise ${c.franchise}`].filter(Boolean).join(' · ')}</p>}
      </article>
    )
  }

  return (
    <div className="fx">
      <Head><title>Assurances — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <p className="fx-chemin"><Link href="/outils/essai">Outils</Link></p>
            <h1>Assurances</h1>
            <p className="fx-resume-liste"><span>Ce qu’on a choisi d’assurer, et ce qui est couvert</span><span>dossier relu le {RELEVE_AU}</span>{nonCouverts > 0 && <span className="rouge">{nonCouverts} non couvert{nonCouverts > 1 ? 's' : ''}</span>}</p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/outils/assurances" style={{ textDecoration: 'none' }}>Ancienne page</a>
            <Link className="fx-btn g" href="/outils/charges-sociales/essai" style={{ textDecoration: 'none' }}>Charges sociales</Link>
          </div>
        </header>

        <div className="fx-offre" style={{ marginTop: 48 }}>
          <div style={{ minWidth: 0 }}>
            <Section titre="Suis-je couvert ?" sous="Décris le problème comme tu le dirais à voix haute. La réponse renvoie à une garantie précise, à sa limite et à la personne à appeler.">
              <Question famille={FAMILLE} exemples={['On m’a volé de l’outillage sur un chantier', 'J’ai accroché une voiture avec le Master', 'Un client dit qu’on a rayé son meuble', 'Un client ne paie pas sa facture', 'Panne sur l’autoroute']} />
            </Section>

            <Section titre="Ce qui coince" droite={<span className="tot n">{aRegarder.length}</span>} sous="Non couvert, à vérifier ou couvert en partie, dans cet ordre.">
              {aRegarder.map(c => <Couverture key={c.id} c={c} />)}
              {acquis.length > 0 && (
                <div className="fx-ajouts"><button className="fx-lien" onClick={() => setVoirAcquis(v => !v)}>{voirAcquis ? 'Masquer ce qui est couvert' : `Voir les ${acquis.length} garanties acquises`}</button></div>
              )}
              {voirAcquis && acquis.map(c => <Couverture key={c.id} c={c} />)}
            </Section>

            <Section titre="Ce que ça coûte" droite={<span className="tot"><Chf n={total.entreprise.primes} /></span>} sous="Les primes qui ne suivent personne. Les répartir par tête serait une convention comptable, pas un fait.">
              <div className="fx-tab-defile">
                <table className="fx-tab">
                  <thead><tr><th>Contrat</th><th>Ce qu’il couvre</th><th className="nb">Prime annuelle</th></tr></thead>
                  <tbody>{entreprise.map(e => (
                    <tr key={e.contrat}><td><b>{e.assureur}</b><small>{e.branche}</small></td><td className="gris">{e.intitule}</td><td className="nb"><Chf n={e.prime} /></td></tr>
                  ))}</tbody>
                  <tfoot><tr><td colSpan={2}>Total</td><td className="nb"><Chf n={total.entreprise.primes} /></td></tr></tfoot>
                </table>
              </div>
              <p className="fx-note" style={{ marginTop: 12 }}>Détail des quatre modules Helvetia : biens mobiliers 412.60, technique 248.80, RC entreprise et professionnelle 1 358.20, protection juridique 681.60, plus 135.10 de droit de timbre.</p>
              <div className="fx-encadre">
                <b>Perte de gain maladie, par personne</b>
                <p>{parPersonne.map((p, i) => <span key={p.personne}>{i > 0 && ' · '}{p.personne} <Chf n={p.total} /></span>)}. 1,47 % du salaire AVS, soit <b><Chf n={total.personnes.total} /></b> au total.</p>
              </div>
            </Section>

            <Section titre="À faire" droite={<span className="tot n">{obligations.filter(o => !o.fait).length}</span>} sous="Les obligations qui ne se paient pas en francs.">
              {obligations.map(o => <Obligation key={o.id} obligation={o} aujourdhui={RELEVE_AU} />)}
            </Section>

            <Section titre="Contrats" sous="Qui couvre quoi, avec le numéro de police et la personne à appeler.">
              {(voirCaducs ? [...actifs, ...caducs] : actifs).map(c => <Contrat key={c.id} contrat={c} />)}
              {caducs.length > 0 && <div className="fx-ajouts"><button className="fx-lien" onClick={() => setVoirCaducs(v => !v)}>{voirCaducs ? 'Masquer les contrats caducs' : `Voir les ${caducs.length} contrats caducs`}</button></div>}
            </Section>

            <Section titre="Sinistres" sous="Ce que le dossier garde en mémoire.">
              <div className="fx-tab-defile">
                <table className="fx-tab">
                  <thead><tr><th>Date</th><th>Quoi</th><th>État</th><th className="nb">Versé</th></tr></thead>
                  <tbody>{sinistres.map(s => (
                    <tr key={s.id}><td className="n">{s.date || '—'}</td><td>{s.type}<small>{s.detail}</small></td><td className="gris">{s.statut}</td><td className="nb"><Chf n={s.montant} /></td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Section>

            <Section titre="Ce qui manque au dossier" sous="L’outil ne vaut que ce que vaut le dossier.">
              {manques.map(m => <Manque key={m.id} manque={m} />)}
            </Section>

            <p className="fx-note" style={{ marginTop: 48 }}>Dossier relu sur kDrive, Common documents / amazing files / 00. Admin / Assurances. Effectif assuré : {EFFECTIF.map(p => p.nom).join(', ')}. Les chiffres se modifient dans lib/assurances.js.</p>
          </div>

          <Recap
            label={total.incomplet ? 'Au moins, par an' : 'Primes par an'}
            total={total.employeur}
            lignes={[{ label: 'Locaux, matériel, véhicules', valeur: total.entreprise.primes }, { label: 'Perte de gain (IJM)', valeur: total.personnes.total }]}
            avertissement={total.incomplet ? '« Au moins » : le contrat de travail prévoit une part employé sur l’IJM, les certificats de salaire n’en montrent aucune. Tant que ce n’est pas tranché, la prime est comptée en entier côté employeur.' : null}
          />
        </div>
      </div>
    </div>
  )
}
