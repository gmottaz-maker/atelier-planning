// Assurances — ce qu'on a choisi d'assurer, et ce qui est réellement couvert.
//
// IJM, RC, biens, véhicules, protection juridique : des contrats qu'on négocie,
// qu'on résilie et qu'on compare. Ce que l'État prélève sans qu'on ait le choix
// — AVS, LAA, LPP — vit dans /outils/charges-sociales.
//
// La boîte à questions est la raison d'être de cette page : le coût, on finit
// toujours par le retrouver sur un relevé bancaire ; savoir si un meuble confié
// est assuré, non. Elle cherche dans TOUTES les garanties, y compris celles des
// charges sociales, parce que personne ne se demande dans quel écran poser sa
// question.
//
// La page ne lit ni Supabase ni aucune API : tout vient de `lib/assurances.js`,
// relu à la main sur le dossier kDrive. Une dizaine de contrats qui bougent une
// fois par an ne valent pas une table, une migration et un écran
// d'administration ; et un fichier versionné laisse voir, dans `git log`, quand
// une garantie a changé — ce qu'une ligne de base ne dit pas.
//
// Réservée aux admins : elle affiche des salaires.
import { useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import QuestionCouverture from '../../components/QuestionCouverture'
import {
  Page, EnTete, Section, Bandeau, Pastille, CarteContrat, CarteObligation, CarteManque,
  microLabel, panneau, cellule, nombreCell, enTete, enTeteNb, montant,
} from '../../components/DossierUI'
import { C, FONT, MONO } from '../../lib/theme'
import {
  EFFECTIF, SINISTRES, MANQUES, RELEVE_AU,
  contratsFamille, couverturesFamille, obligationsFamille, contratParId,
} from '../../lib/assurances'
import { coutsParPersonne, coutsEntreprise, totalAnnuel } from '../../lib/assurancesCalc'

const FAMILLE = 'assurance'

// Les manques propres aux charges sociales restent là-bas.
const MANQUES_AILLEURS = ['lpp-gabin', 'part-employeur-2026']

const ETAT = {
  true:     { texte: 'Oui',         fg: C.success, bg: C.successBg },
  partiel:  { texte: 'En partie',   fg: C.warning, bg: C.warningBg },
  verifier: { texte: 'À vérifier',  fg: C.info,    bg: C.infoBg },
  false:    { texte: 'Non couvert', fg: C.danger,  bg: C.dangerBg },
}
const etatDe = (couvert) => ETAT[String(couvert)] || ETAT.verifier

export default function Assurances() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const [voirCaducs, setVoirCaducs] = useState(false)

  const parPersonne = useMemo(() => coutsParPersonne({ famille: FAMILLE }), [])
  const entreprise = useMemo(() => coutsEntreprise({ famille: FAMILLE }), [])
  const total = useMemo(() => totalAnnuel({ famille: FAMILLE }), [])

  const contrats = contratsFamille(FAMILLE)
  const actifs = contrats.filter(c => c.statut === 'actif')
  const caducs = contrats.filter(c => c.statut === 'caduc')
  const couvertures = couverturesFamille(FAMILLE)
  const obligations = obligationsFamille(FAMILLE)
  const sinistres = SINISTRES.filter(s => !s.contrat || contratParId(s.contrat)?.famille === FAMILLE)
  const manques = MANQUES.filter(m => !MANQUES_AILLEURS.includes(m.id))

  if (user && !isAdmin) { router.replace('/'); return null }

  return (
    <Page>
      <Head><title>Assurances · Maze Project</title></Head>

      <EnTete
        titre="Assurances"
        chapeau="Perte de gain maladie, responsabilité civile, biens, véhicules, protection juridique : ce qu’on a choisi d’assurer. La question ici n’est pas « combien », c’est « suis-je couvert »."
        lien={{ href: '/outils/charges-sociales', texte: 'AVS, LAA et LPP sont dans l’outil Charges sociales' }}
      />

      <Bandeau
        chiffres={[
          { label: total.incomplet ? 'Au moins, par an' : 'Primes par an', valeur: total.employeur, principal: true },
          { label: 'Locaux, matériel, véhicules', valeur: total.entreprise.primes },
          { label: 'Perte de gain (IJM)', valeur: total.personnes.total },
        ]}
        avertissement={total.incomplet
          ? "« Au moins » : le contrat de travail prévoit une part employé sur l’IJM, les certificats de salaire n’en montrent aucune. Tant que ce n’est pas tranché, la prime est comptée en entier côté employeur."
          : null}
      />

      <Section
        titre="Poser une question"
        sousTitre="Décris le problème en une phrase, comme tu le dirais à voix haute. La réponse renvoie à une garantie précise, à sa limite et à la personne à appeler."
      >
        <QuestionCouverture
          famille={FAMILLE}
          exemples={[
            'On m’a volé de l’outillage sur un chantier',
            'J’ai accroché une voiture avec le Master',
            'Un client dit qu’on a rayé son meuble',
            'Un client ne paie pas sa facture',
            'Panne sur l’autoroute',
          ]}
        />
      </Section>

      <Section
        titre="Ce qui est couvert, ce qui ne l’est pas"
        sousTitre="Dans l’ordre : d’abord ce qui manque ou coince, ensuite ce qui est acquis."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {[...couvertures]
            .sort((a, b) => {
              const rang = { false: 0, verifier: 1, partiel: 2, true: 3 }
              return rang[String(a.couvert)] - rang[String(b.couvert)]
            })
            .map(c => {
              const etat = etatDe(c.couvert)
              const contrat = c.contrat ? contratParId(c.contrat) : null
              return (
                <article key={c.id} style={{ ...panneau, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Pastille fg={etat.fg} bg={etat.bg}>{etat.texte}</Pastille>
                    <strong style={{ font: `500 14.5px ${FONT}`, flex: 1, minWidth: 200 }}>{c.intitule}</strong>
                    <span style={microLabel}>{contrat ? contrat.assureur : 'Aucun contrat'}</span>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 0', color: C.inkTertiary }}>{c.detail}</p>
                  {(c.plafond || c.franchise) && (
                    <p style={{ font: `12px ${MONO}`, color: C.muted, margin: '8px 0 0' }}>
                      {c.plafond && <>Jusqu’à {c.plafond}</>}
                      {c.plafond && c.franchise && ' · '}
                      {c.franchise && <>Franchise {c.franchise}</>}
                    </p>
                  )}
                </article>
              )
            })}
        </div>
      </Section>

      <Section
        titre="Ce que ça coûte"
        sousTitre="Les primes qui ne suivent personne. Les répartir par tête serait une convention comptable, pas un fait."
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={enTete}>Contrat</th>
                <th style={enTete}>Ce qu’il couvre</th>
                <th style={enTeteNb}>Prime annuelle</th>
              </tr>
            </thead>
            <tbody>
              {entreprise.map(e => (
                <tr key={e.contrat}>
                  <td style={cellule}>
                    <strong style={{ fontWeight: 500 }}>{e.assureur}</strong>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{e.branche}</div>
                  </td>
                  <td style={{ ...cellule, color: C.inkTertiary, fontSize: 13 }}>{e.intitule}</td>
                  <td style={nombreCell}>{montant(e.prime)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={{ ...cellule, borderTop: `1.5px solid ${C.outline}`, fontWeight: 600 }}>Total</td>
                <td style={{ ...nombreCell, borderTop: `1.5px solid ${C.outline}`, fontWeight: 600 }}>
                  {montant(total.entreprise.primes)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 12, lineHeight: 1.7 }}>
          Détail des quatre modules Helvetia : biens mobiliers 412.60, technique 248.80, RC entreprise
          et professionnelle 1 358.20, protection juridique 681.60, plus 135.10 de droit de timbre.
        </p>

        <div style={{ ...panneau, marginTop: 14, borderColor: C.outline }}>
          <div style={{ ...microLabel, marginBottom: 6 }}>Perte de gain maladie, par personne</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, color: C.inkTertiary }}>
            {parPersonne.map(p => `${p.personne} ${montant(p.total)}`).join(' · ')}
            {' — '}1,47 % du salaire AVS, soit {montant(total.personnes.total)} au total.
          </p>
        </div>
      </Section>

      <Section titre="À faire" sousTitre="Les obligations qui ne se paient pas en francs.">
        <div style={{ display: 'grid', gap: 10 }}>
          {[...obligations].sort((a, b) => (a.fait ? 1 : 0) - (b.fait ? 1 : 0)).map(o => (
            <CarteObligation key={o.id} obligation={o} aujourdhui={RELEVE_AU} assureur={contratParId(o.contrat)?.assureur} />
          ))}
        </div>
      </Section>

      <Section titre="Contrats" sousTitre="Qui couvre quoi, avec le numéro de police et la personne à appeler.">
        <div style={{ display: 'grid', gap: 10 }}>
          {(voirCaducs ? [...actifs, ...caducs] : actifs).map(c => <CarteContrat key={c.id} contrat={c} />)}
        </div>
        {caducs.length > 0 && (
          <button
            type="button" onClick={() => setVoirCaducs(v => !v)}
            style={{
              marginTop: 12, font: `12.5px ${FONT}`, color: C.inkSecondary,
              background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: 999, padding: '7px 15px', cursor: 'pointer',
            }}
          >
            {voirCaducs ? 'Masquer' : `Voir les ${caducs.length} contrats caducs`}
          </button>
        )}
      </Section>

      <Section titre="Sinistres" sousTitre="Ce que le dossier garde en mémoire.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                <th style={enTete}>Date</th>
                <th style={enTete}>Quoi</th>
                <th style={enTete}>État</th>
                <th style={enTeteNb}>Versé</th>
              </tr>
            </thead>
            <tbody>
              {sinistres.map(s => (
                <tr key={s.id}>
                  <td style={{ ...cellule, fontFamily: MONO, fontSize: 12.5, whiteSpace: 'nowrap' }}>{s.date || '—'}</td>
                  <td style={{ ...cellule, color: C.inkTertiary }}>
                    {s.type}
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.6 }}>{s.detail}</div>
                  </td>
                  <td style={cellule}><span style={{ fontSize: 12.5, color: C.muted }}>{s.statut}</span></td>
                  <td style={nombreCell}>{montant(s.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section titre="Ce qui manque" sousTitre="L’outil ne vaut que ce que vaut le dossier.">
        <div style={{ display: 'grid', gap: 10 }}>
          {manques.map(m => <CarteManque key={m.id} manque={m} />)}
        </div>
      </Section>

      <p style={{ fontSize: 12, color: C.muted, marginTop: 40, lineHeight: 1.8 }}>
        Dossier relu le {RELEVE_AU} sur{' '}
        <code style={{ fontFamily: MONO, fontSize: 11.5 }}>kDrive/Common documents/amazing files/00. Admin/Assurances</code>.
        {' '}Effectif assuré : {EFFECTIF.map(p => p.nom).join(', ')}.
        {' '}Les chiffres se modifient dans <code style={{ fontFamily: MONO, fontSize: 11.5 }}>lib/assurances.js</code>.
      </p>
    </Page>
  )
}
