// Charges sociales — ce qu'un employé coûte réellement à l'entreprise.
//
// AVS/AC/allocations familiales, LAA (Suva) et LPP (Nest) : ce que l'État et la
// prévoyance obligatoire prélèvent sur les salaires. On ne les choisit pas, on
// ne les résilie pas ; la seule question utile est « combien », et par qui.
//
// Ce qui se choisit et se négocie — IJM, RC, choses, véhicules — vit dans
// /outils/assurances. L'IJM Visana est assise sur les salaires elle aussi,
// mais elle se résilie : elle est donc comptée là-bas, et le coût employeur
// affiché ici ne la contient pas.
//
// Réservée aux admins : elle affiche des salaires.
import { useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import { fmtCHF0 } from '../../lib/money'
import QuestionCouverture from '../../components/QuestionCouverture'
import {
  Page, EnTete, Section, Bandeau, CarteContrat, CarteObligation, CarteManque,
  microLabel, panneau, cellule, nombreCell, enTete, enTeteNb, montant,
} from '../../components/DossierUI'
import { C, FONT, MONO } from '../../lib/theme'
import {
  EFFECTIF, SORTIS, SINISTRES, MANQUES, MASSE_AVS, RELEVE_AU,
  contratsFamille, obligationsFamille, contratParId,
} from '../../lib/assurances'
import {
  coutsParPersonne, totalAnnuel, ecartFactureCalcule, projection,
} from '../../lib/assurancesCalc'

const FAMILLE = 'social'

// Les manques qui relèvent des charges sociales. Les autres restent dans
// l'outil Assurances : un écran qui liste les trous de l'autre n'aide personne.
const MANQUES_ICI = ['lpp-gabin', 'part-employeur-2026']

export default function ChargesSociales() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()

  const parPersonne = useMemo(() => coutsParPersonne({ famille: FAMILLE }), [])
  const total = useMemo(() => totalAnnuel({ famille: FAMILLE }), [])
  const ecartSuva = useMemo(() => ecartFactureCalcule(contratParId('suva-laa')), [])
  const apres = useMemo(() => projection('2026-11-01', { famille: FAMILLE }), [])

  const contrats = contratsFamille(FAMILLE)
  const actifs = contrats.filter(c => c.statut === 'actif')
  const obligations = obligationsFamille(FAMILLE)
  const sinistres = SINISTRES.filter(s => contratParId(s.contrat)?.famille === FAMILLE)
  const manques = MANQUES.filter(m => MANQUES_ICI.includes(m.id))
  const masseSalariale = EFFECTIF.reduce((s, p) => s + p.salaireAvs, 0)

  if (user && !isAdmin) { router.replace('/'); return null }

  return (
    <Page>
      <Head><title>Charges sociales · Maze Project</title></Head>

      <EnTete
        titre="Charges sociales"
        chapeau="AVS, chômage, allocations familiales, accidents (LAA) et prévoyance (LPP). Ce qui est prélevé sur les salaires sans qu’on ait le choix. La question ici est « combien coûte un employé », et qui paie quoi."
        lien={{ href: '/outils/assurances', texte: 'Les assurances qui se choisissent sont dans l’outil Assurances' }}
      />

      <Bandeau
        chiffres={[
          { label: total.incomplet ? 'Au moins, par an' : 'Coût employeur par an', valeur: total.employeur, principal: true },
          { label: `Par personne (${EFFECTIF.length})`, valeur: total.parTete },
          { label: 'Masse salariale AVS', valeur: masseSalariale },
        ]}
        avertissement={total.incomplet
          ? `« Au moins », parce que ${total.personnes.inconnus} ligne${total.personnes.inconnus > 1 ? 's' : ''} de cotisation ${total.personnes.inconnus > 1 ? 'ont' : 'a'} une part employeur que le dossier ne fixe pas.`
          : null}
      />

      <Section
        titre="Par personne"
        sousTitre="Les trois prélèvements assis sur les salaires. La colonne AVS regroupe l’AVS/AI/APG, le chômage, les allocations familiales, les PC Famille et les frais administratifs."
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                <th style={enTete}>Personne</th>
                <th style={enTeteNb}>Salaire AVS</th>
                <th style={enTeteNb}>AVS / AC / AF</th>
                <th style={enTeteNb}>Suva (LAA)</th>
                <th style={enTeteNb}>LPP</th>
                <th style={enTeteNb}>Employeur</th>
                <th style={enTeteNb}>% du salaire</th>
              </tr>
            </thead>
            <tbody>
              {parPersonne.map(p => {
                const par = (id) => p.parContrat.find(c => c.contrat === id)
                return (
                  <tr key={p.personne}>
                    <td style={cellule}><strong style={{ fontWeight: 500 }}>{p.personne}</strong></td>
                    <td style={nombreCell}>{montant(p.salaireAvs)}</td>
                    <td style={nombreCell}>{montant(par('avs-caf')?.employeur)}</td>
                    <td style={nombreCell}>{montant(par('suva-laa')?.employeur)}</td>
                    <td style={nombreCell}>{montant(par('nest-lpp')?.employeur)}</td>
                    <td style={{ ...nombreCell, fontWeight: 600 }}>{montant(p.employeurConnu)}</td>
                    <td style={{ ...nombreCell, color: C.muted }}>
                      {p.chargeSurSalaire == null ? '—' : `${p.chargeSurSalaire.toFixed(1).replace('.', ',')} %`}
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ ...cellule, borderTop: `1.5px solid ${C.outline}`, fontWeight: 600 }}>Total</td>
                <td style={{ ...nombreCell, borderTop: `1.5px solid ${C.outline}` }}>{montant(masseSalariale)}</td>
                <td colSpan={3} style={{ ...nombreCell, borderTop: `1.5px solid ${C.outline}` }} />
                <td style={{ ...nombreCell, borderTop: `1.5px solid ${C.outline}`, fontWeight: 600 }}>
                  {montant(total.personnes.employeur)}
                </td>
                <td style={{ ...nombreCell, borderTop: `1.5px solid ${C.outline}` }} />
              </tr>
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 12, lineHeight: 1.7 }}>
          La part salariale de l’AVS vaut 6,400 % (4,35 + 0,7 + 0,25 pour l’AVS/AI/APG, plus 1,1 de
          chômage) — exactement la ligne 9 des certificats de salaire. L’AANP, elle, n’y figure pas :
          l’employeur la paie en entier, alors que la loi l’autoriserait à la retenir.
        </p>

        {apres.effectif.length < EFFECTIF.length && (
          <div style={{ ...panneau, marginTop: 14, borderColor: C.outline }}>
            <div style={{ ...microLabel, marginBottom: 6 }}>Dès novembre 2026</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, color: C.inkTertiary }}>
              Gabin part après octobre 2026. Il restera {apres.effectif.join(' et ')}, pour une masse
              salariale de {fmtCHF0(apres.masseSalariale)} au lieu de {fmtCHF0(masseSalariale)}, et des
              charges sociales d’environ <strong style={{ fontWeight: 600 }}>{montant(apres.employeurConnu)}</strong> par an.
              Pensez à annoncer la sortie : une cotisation non annoncée court sur un salaire qui n’existe plus.
            </p>
          </div>
        )}

        {ecartSuva?.ecart != null && (
          <div style={{ ...panneau, marginTop: 14, borderColor: C.outline }}>
            <div style={{ ...microLabel, marginBottom: 6 }}>Régularisation Suva probable</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, color: C.inkTertiary }}>
              La facture provisoire 2026 porte sur {fmtCHF0(ecartSuva.masseFacturee)}, reprise du
              définitif 2024 majoré de 2 %. Or le 3<sup>e</sup> trimestre 2026 a été facturé par la caisse AVS
              sur {fmtCHF0(MASSE_AVS.trimestre.base)}, soit environ {fmtCHF0(ecartSuva.masseReelle)} sur
              l’année. La prime réelle vaudrait {montant(ecartSuva.calcule)} contre {montant(ecartSuva.facture)} facturés :
              de l’ordre de <strong style={{ fontWeight: 600 }}>{montant(ecartSuva.ecart)}</strong> à récupérer
              au décompte de janvier 2027 — davantage encore, puisque Gabin part fin octobre.
            </p>
            <p style={{ fontSize: 12.5, color: C.muted, margin: '8px 0 0', lineHeight: 1.6 }}>
              Estimation : elle projette un trimestre sur quatre. À ne pas confondre avec la somme des
              salaires déclarés à Nest ({fmtCHF0(ecartSuva.masseLpp)}), qui ne vaut que pour la LPP.
            </p>
          </div>
        )}
      </Section>

      <Section
        titre="Une question ?"
        sousTitre="La recherche porte sur TOUTES les garanties, y compris celles de l’outil Assurances : personne ne se demande dans quel écran poser sa question."
      >
        <QuestionCouverture
          famille={FAMILLE}
          exemples={[
            'Un gars s’est coupé à l’atelier',
            'Un collaborateur est en arrêt maladie depuis 3 semaines',
            'On utilise des produits chimiques',
            'Accident de ski pendant les vacances',
          ]}
        />
      </Section>

      <Section titre="À faire" sousTitre="Les déclarations et annonces qui ne se paient pas en francs, mais coûtent cher quand on les oublie.">
        <div style={{ display: 'grid', gap: 10 }}>
          {[...obligations].sort((a, b) => (a.fait ? 1 : 0) - (b.fait ? 1 : 0)).map(o => (
            <CarteObligation key={o.id} obligation={o} aujourdhui={RELEVE_AU} assureur={contratParId(o.contrat)?.assureur} />
          ))}
        </div>
      </Section>

      <Section titre="Organismes" sousTitre="Qui prélève quoi, avec le numéro d’affilié et la personne à appeler.">
        <div style={{ display: 'grid', gap: 10 }}>
          {actifs.map(c => <CarteContrat key={c.id} contrat={c} />)}
        </div>
      </Section>

      {sinistres.length > 0 && (
        <Section titre="Sinistres LAA" sousTitre="Un sinistre pèse sur le taux de prime des années suivantes.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={enTete}>Date</th>
                  <th style={enTete}>Qui</th>
                  <th style={enTete}>Quoi</th>
                  <th style={enTeteNb}>Versé</th>
                </tr>
              </thead>
              <tbody>
                {sinistres.map(s => (
                  <tr key={s.id}>
                    <td style={{ ...cellule, fontFamily: MONO, fontSize: 12.5, whiteSpace: 'nowrap' }}>{s.date || '—'}</td>
                    <td style={cellule}>{s.personne || '—'}</td>
                    <td style={{ ...cellule, color: C.inkTertiary }}>
                      {s.type}
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.6 }}>{s.detail}</div>
                    </td>
                    <td style={nombreCell}>{montant(s.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {manques.length > 0 && (
        <Section titre="Ce qui manque" sousTitre="L’outil ne vaut que ce que vaut le dossier.">
          <div style={{ display: 'grid', gap: 10 }}>
            {manques.map(m => <CarteManque key={m.id} manque={m} />)}
          </div>
        </Section>
      )}

      <p style={{ fontSize: 12, color: C.muted, marginTop: 40, lineHeight: 1.8 }}>
        Dossier relu le {RELEVE_AU}. Effectif : {EFFECTIF.map(p => p.nom).join(', ')}.
        {SORTIS.length > 0 && <> Sortis, conservés pour mémoire : {SORTIS.map(p => p.nom).join(', ')}.</>}
        {' '}Les chiffres se modifient dans <code style={{ fontFamily: MONO, fontSize: 11.5 }}>lib/assurances.js</code>.
      </p>
    </Page>
  )
}
