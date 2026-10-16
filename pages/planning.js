// La jauge de charge — « est-ce qu'on peut prendre ce projet ? »
//
// Cet écran remplace l'ancien planning par demi-journées (plages manuelles
// `work_slots` + agenda Google), qui demandait de saisir à la main ce que
// l'offre sait déjà : les heures vendues, activité par activité. Il ne POSE
// aucun bloc — c'est l'affaire de l'agenda, à l'étape suivante. Il répond à la
// seule question dont une mauvaise réponse coûte un week-end :
//
//     est-ce que ce qu'on doit encore rentre dans le temps qui reste ?
//
// Tout le calcul vit dans `lib/capacite.js`, testé sans base ni réseau, et
// arrive ici tout cuit par `/api/capacite`. Cette page ne décide rien ; si
// elle se met à calculer, c'est qu'il faut le remonter dans la lib.
//
// Deux choses qu'elle montre et qu'un total global cache :
//   — le GOULOT : une activité qu'une seule personne sait faire peut déborder
//     alors que la somme des deux capacités tient largement ;
//   — le MUR : la première échéance qui casse. Décembre peut tenir quand la
//     semaine du 20 octobre est déjà perdue.
import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import useIsMobile from '../lib/useIsMobile'
import NavBar from '../components/NavBar'
import { AL, C, FONT, MONO, R, personChip } from '../lib/theme'
import { saitFaire } from '../lib/capacite'
import { CATEGORIES_OFFRE } from '../lib/quoteStatus'

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const fmtDate = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number)
  return d ? `${d} ${MOIS[m - 1]}` : '—'
}
const fmtLong = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number)
  return d ? `${d} ${MOIS[m - 1]} ${y}` : '—'
}
const heures = (n) => `${Math.round((Number(n) || 0) * 10) / 10} h`

const micro = { font: `500 10.5px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }
const panneau = { background: C.surface, border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: 20 }
const panneauLeger = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.panel, padding: 20 }
const pill = {
  font: `13px ${FONT}`, padding: '8px 16px', borderRadius: R.pill,
  border: `1.5px solid ${C.outline}`, background: C.surface, color: AL.black, cursor: 'pointer',
}

// Pourquoi la fenêtre s'arrête là. Le dire évite de lire « jusqu'à la dernière
// échéance » un jour où c'est le plancher de huit semaines qui a décidé.
const MOTIF = {
  echeance: 'la dernière échéance engagée',
  plancher: 'huit semaines, faute d’échéance plus lointaine',
  demande: 'date demandée',
}

// Les quatre catégories de la liste de projets, pas une cinquième nomenclature.
const LIBELLES_OFFRE = Object.fromEntries(CATEGORIES_OFFRE.map(c => [c.key, c.label]))

/** La barre. Pleine = la capacité ; le remplissage = la demande. */
function Barre({ demande, capacite, hauteur = 12 }) {
  const part = capacite > 0 ? demande / capacite : (demande > 0 ? Infinity : 0)
  const deborde = part > 1
  const largeur = capacite > 0 ? Math.min(100, part * 100) : 0
  return (
    <div style={{ height: hauteur, borderRadius: R.pill, background: C.neutralBg, overflow: 'hidden' }}>
      <div style={{ width: `${largeur}%`, height: '100%', borderRadius: R.pill, background: deborde ? C.danger : C.ink }} />
    </div>
  )
}

/**
 * Une jauge : la demande, la capacité, et la phrase qui tranche.
 *
 * Volontairement bavarde en cas d'échec et sèche en cas de succès : « ça
 * tient » n'a pas besoin d'explication, « ça ne tient pas » a besoin de dire
 * où et de combien.
 */
function Jauge({ titre, legende, verdict, fort = false }) {
  if (!verdict) return null
  const { demande, capacite, tient, manque, goulots = [], orphelines = [] } = verdict
  const reste = Math.max(0, capacite - demande)
  return (
    <div style={fort ? panneau : panneauLeger}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: fort ? 17 : 15, fontWeight: 500, color: AL.black }}>{titre}</span>
        {legende && <span style={micro}>{legende}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: fort ? 40 : 28, fontWeight: 500, lineHeight: 1, color: tient ? AL.black : C.danger }}>
          {heures(demande)}
        </span>
        <span style={{ fontSize: 15, color: C.muted }}>à faire · {heures(capacite)} disponibles</span>
      </div>

      <Barre demande={demande} capacite={capacite} hauteur={fort ? 14 : 10} />

      <p style={{ margin: '12px 0 0', fontSize: 14, color: tient ? C.inkSecondary : C.danger, fontWeight: tient ? 400 : 500 }}>
        {capacite === 0
          ? "Aucune capacité connue : personne n'a de réglage d'heures pour cette année."
          : tient
            ? `Ça tient — il reste ${heures(reste)}.`
            : `Il manque ${heures(manque)}.`}
      </p>

      {goulots.length > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: C.danger }}>
          {goulots.map(g => `${g.nom} déborde de ${heures(g.manque)}`).join(' · ')} — sur des activités que personne d'autre ne sait faire.
        </p>
      )}
      {orphelines.length > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: C.danger }}>
          {heures(orphelines.reduce((s, o) => s + o.reste, 0))} que PERSONNE ne sait faire : {orphelines.map(o => o.libelle).join(', ')}.
        </p>
      )}
    </div>
  )
}

/** Le mur : la première échéance qui casse. */
function Mur({ mur, projets }) {
  if (!mur) {
    return (
      <div style={{ ...panneauLeger, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: C.success }}>Aucun mur</span>
        <span style={{ fontSize: 14, color: C.muted }}>Chaque échéance engagée tient avec ce qui est dû avant elle.</span>
      </div>
    )
  }
  const noms = Object.fromEntries(projets.map(p => [String(p.id), p]))
  return (
    <div style={{ ...panneau, borderColor: C.danger, background: C.dangerBg }}>
      <div style={{ ...micro, color: C.danger }}>Le mur</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 500, lineHeight: 1, color: C.danger }}>{fmtLong(mur.date)}</span>
        <span style={{ fontSize: 15, color: AL.black }}>il manque {heures(mur.manque)}</span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: AL.black }}>
        C'est la première échéance qui ne tient pas. Les suivantes en découlent — il n'y a rien à corriger après celle-ci avant de l'avoir réglée.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {mur.projets.map(id => {
          const p = noms[String(id)]
          return (
            <Link key={id} href={`/projects/${id}`}
              style={{ textDecoration: 'none', fontSize: 13, padding: '5px 12px', borderRadius: R.pill, background: C.surface, color: AL.black, border: `1px solid ${C.border}` }}>
              {p ? `${p.numero ?? '—'} · ${p.name}` : `projet ${id}`}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/** Qui a quoi sur les bras. */
function Personnes({ verdict, personnes }) {
  const detail = Object.fromEntries((personnes || []).map(p => [p.nom, p]))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {(verdict?.parPersonne || []).map(p => {
        const d = detail[p.nom] || {}
        const chip = personChip(p.nom)
        return (
          <div key={p.nom} style={panneauLeger}>
            <span style={{ fontSize: 12.5, fontWeight: 500, padding: '5px 12px', borderRadius: R.pill, background: chip.bg, color: chip.fg }}>{p.nom}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
              <span style={{ fontSize: 26, fontWeight: 500, lineHeight: 1, color: AL.black }}>{heures(p.capacite)}</span>
              <span style={{ fontSize: 13, color: C.muted }}>disponibles</span>
            </div>
            <div style={{ font: `11px ${MONO}`, color: C.muted }}>
              {Math.round((d.jours || 0) * 10) / 10} JOURS À {Math.round((d.parJour || 0) * 10) / 10} H
              {d.joursAbsents ? ` · ${d.joursAbsents} HORS` : ''}
            </div>
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.divider}`, paddingTop: 10, fontSize: 13.5, color: C.inkSecondary }}>
              {p.impose > 0
                ? <>Dont <b style={{ fontWeight: 500, color: AL.black }}>{heures(p.impose)}</b> que personne d'autre ne peut faire.</>
                : <>Rien qui ne puisse être fait par l'autre.</>}
            </div>
            {p.manque > 0 && (
              <div style={{ marginTop: 6, fontSize: 13.5, color: C.danger, fontWeight: 500 }}>
                Déborde de {heures(p.manque)} — même en ne faisant que ça.
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** L'échéancier : chaque palier avec tout ce qui est dû avant lui. */
function Echeancier({ paliers, mobile }) {
  if (!paliers?.length) return <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Aucun projet engagé n'a d'échéance.</p>
  return (
    <div style={{ ...panneauLeger, padding: 0, overflow: 'hidden' }}>
      {!mobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr 1fr', gap: 10, padding: '10px 18px', borderBottom: `1px solid ${C.border}` }}>
          {['échéance', 'projets', 'à faire', 'disponible', 'verdict'].map(t => <span key={t} style={micro}>{t}</span>)}
        </div>
      )}
      {paliers.map(p => {
        const verdictTexte = p.tient ? `+ ${heures(p.capacite - p.demande)}` : `− ${heures(p.manque)}`
        const couleur = p.tient ? C.success : C.danger
        const fond = p.tient ? 'transparent' : C.dangerBg
        // Au doigt, cinq colonnes de chiffres nus ne se lisent pas : les
        // en-têtes qui les nommaient sont masqués, et « 39,5 h · 33,6 h » ne
        // dit plus lequel est la demande. On repasse en phrase.
        if (mobile) {
          return (
            <div key={p.date} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.divider}`, background: fond }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: AL.black }}>{fmtDate(p.date)}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: couleur, marginLeft: 'auto' }}>{verdictTexte}</span>
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
                {p.projets.length} projet{p.projets.length > 1 ? 's' : ''} · {heures(p.demande)} à faire · {heures(p.capacite)} disponibles
              </div>
            </div>
          )
        }
        return (
          <div key={p.date} style={{
            display: 'grid', alignItems: 'baseline',
            gridTemplateColumns: '1fr 80px 1fr 1fr 1fr', gap: 10,
            padding: '12px 18px', borderBottom: `1px solid ${C.divider}`, background: fond,
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: AL.black }}>{fmtDate(p.date)}</span>
            <span style={{ font: `12px ${MONO}`, color: C.muted }}>{p.projets.length}</span>
            <span style={{ fontSize: 14, color: AL.black }}>{heures(p.demande)}</span>
            <span style={{ fontSize: 14, color: C.muted }}>{heures(p.capacite)}</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: couleur }}>{verdictTexte}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Qui sait faire quoi.
 *
 * Rangé dans `app_settings.competences`, pas dans une table : deux personnes
 * et une vingtaine d'activités. Une personne jamais cochée sait TOUT faire —
 * c'est l'état de départ, et il vaut mieux une jauge optimiste qu'une jauge
 * qui refuse un projet parce qu'un écran n'a pas été rempli.
 */
function Competences({ personnes, activites, competences, onEnregistre }) {
  const [etat, setEtat] = useState(competences || {})
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const tous = activites.map(a => Number(a.code))

  function basculer(nom, code) {
    setEtat(e => {
      // Une personne sans liste sait tout faire : décocher sa première case
      // doit donc matérialiser la liste complète MOINS cette activité, sinon
      // le clic ne retire rien.
      const liste = Array.isArray(e[nom]) ? e[nom].map(Number) : tous
      const presente = liste.includes(Number(code))
      const suite = presente ? liste.filter(c => c !== Number(code)) : [...liste, Number(code)]
      return { ...e, [nom]: [...new Set(suite)].sort((a, b) => a - b) }
    })
  }
  function toutRendre(nom) {
    setEtat(e => { const c = { ...e }; delete c[nom]; return c })
  }

  async function enregistrer() {
    if (envoi) return
    setEnvoi(true); setErreur('')
    try {
      const r = await fetch('/api/app-settings/competences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: etat }),
      })
      if (!r.ok) { setErreur(`Erreur ${r.status}`); return }
      await onEnregistre()
    } catch { setErreur('Enregistrement impossible — réseau ?') }
    finally { setEnvoi(false) }
  }

  return (
    <div style={panneauLeger}>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: C.inkSecondary }}>
        Décoche ce qu'une personne ne sait pas faire. Tout coché = la jauge peut
        attribuer l'activité à l'un ou à l'autre ; une seule case cochée et
        l'activité est IMPOSÉE à cette personne — c'est ce qui fait apparaître
        les goulots.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: FONT, minWidth: 320 }}>
          <thead>
            <tr>
              <th style={{ ...micro, textAlign: 'left', padding: '0 14px 8px 0' }}>activité</th>
              {personnes.map(p => (
                <th key={p.nom} style={{ ...micro, padding: '0 10px 8px', textAlign: 'center' }}>{p.nom}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activites.map(a => (
              <tr key={a.code} style={{ borderTop: `1px solid ${C.divider}` }}>
                <td style={{ padding: '7px 14px 7px 0', fontSize: 13.5, color: AL.black, whiteSpace: 'nowrap' }}>
                  <span style={{ font: `11px ${MONO}`, color: C.muted, marginRight: 8 }}>{a.code}</span>
                  {a.libelle}
                </td>
                {personnes.map(p => (
                  <td key={p.nom} style={{ padding: '7px 10px', textAlign: 'center' }}>
                    <input type="checkbox" className="u-tactile"
                      checked={saitFaire(p.nom, a.code, etat)}
                      onChange={() => basculer(p.nom, a.code)}
                      aria-label={`${p.nom} sait faire ${a.libelle}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button onClick={enregistrer} disabled={envoi}
          style={{ ...pill, background: C.ink, color: C.accentOnDark, border: 'none', fontWeight: 600, opacity: envoi ? .5 : 1 }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {personnes.map(p => (
          <button key={p.nom} onClick={() => toutRendre(p.nom)} style={{ ...pill, border: `1px solid ${C.border}`, color: C.muted }}>
            {p.nom} sait tout faire
          </button>
        ))}
        {erreur && <span style={{ fontSize: 13, color: C.danger }}>{erreur}</span>}
      </div>
    </div>
  )
}

export default function Planning() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const mobile = useIsMobile()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Le début de la fenêtre. Vide = demain, ce qu'on veut savoir le plus
  // souvent. Le renseigner répond à l'autre question, celle qui vient quand on
  // sait qu'on ne commencera pas tout de suite : « et à partir du 1er
  // novembre ? ». Une date passée est refusée par la route, pas ici.
  const [depuis, setDepuis] = useState('')
  const cle = depuis ? `/api/capacite?du=${encodeURIComponent(depuis)}` : '/api/capacite'
  const { data, error, isLoading, mutate } = useSWR(isAdmin ? cle : null)
  const [ongletCompetences, setOngletCompetences] = useState(false)

  const d = data || {}
  const personnes  = d.personnes || []
  const projets    = d.projets || []
  const activites  = (d.activites || []).slice().sort((a, b) => a.code - b.code)
  const engage     = d.engage
  const potentiel  = d.avecPotentiel
  const echeancier = d.echeancier || {}
  const engages    = projets.filter(p => p.offre === 'accepte')
  const enAttente  = projets.filter(p => p.offre !== 'accepte' && p.reste?.total > 0)
  const sansCode   = engage?.sansCode || 0

  // Les activités demandées, avec qui peut les prendre : c'est la lecture qui
  // explique un goulot, là où la jauge ne fait que l'annoncer.
  const demandees = (engage?.parActivite || []).slice().sort((a, b) => b.reste - a.reste)

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>Charge de l&apos;atelier — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          @media (max-width: 768px) {
            .cap-main { padding: 20px 16px 104px !important; }
            .cap-titre { font-size: 27px !important; }
          }
        `}</style>
      </Head>
      <NavBar title="charge" />

      <main className="cap-main" style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 className="cap-titre" style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>
            Charge de l&apos;atelier
          </h1>
          <p style={{ fontSize: 17, color: C.muted, margin: '10px 0 0' }}>
            {d.periode
              ? <>{d.periode.debut === 'demain' ? 'De demain' : 'Du'} ({fmtLong(d.periode.du)}) au {fmtLong(d.periode.au)} — {MOTIF[d.periode.motif] || 'fenêtre de mesure'}.</>
              : <>Ce qu&apos;on doit encore, contre le temps qui reste.</>}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <span style={micro}>compter à partir du</span>
            <input type="date" value={depuis} onChange={e => setDepuis(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: R.pill, border: `1px solid ${C.border}`, font: `13px ${FONT}`, color: AL.black, background: C.surface }} />
            {depuis && (
              <button onClick={() => setDepuis('')} style={{ ...pill, border: `1px solid ${C.border}`, color: C.muted }}>demain</button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ ...panneauLeger, borderColor: C.danger, color: C.danger, fontSize: 14 }}>
            Impossible de lire la charge. {String(error.message || '')}
          </div>
        )}
        {isLoading && !data && (
          <div style={{ ...panneauLeger, textAlign: 'center', color: C.muted, fontSize: 14 }}>Chargement…</div>
        )}

        {data && (
          <>
            {personnes.length === 0 && (
              <div style={{ ...panneau, borderColor: C.warning, background: C.warningBg }}>
                <div style={{ ...micro, color: C.warning }}>Rien à mesurer</div>
                <p style={{ margin: '8px 0 0', fontSize: 14.5, color: AL.black }}>
                  Personne n&apos;a d&apos;heures contractuelles enregistrées pour cette année : sans
                  elles, la jauge n&apos;a pas de capacité à comparer et ne peut rien dire.
                  Elles se saisissent dans <Link href="/schedule" style={{ color: AL.black }}>congés et horaires</Link>.
                </p>
              </div>
            )}

            <Jauge fort titre="Ce qui est engagé" legende={`${engages.length} offre${engages.length > 1 ? 's' : ''} acceptée${engages.length > 1 ? 's' : ''}`} verdict={engage?.verdict} />

            <Mur mur={echeancier.mur} projets={projets} />

            {/* Tout ce qui n'est pas refusé : les offres envoyées, mais aussi
                celles qui restent à écrire. Ce sont ces heures-là qui disent
                s'il faut dire oui au prochain client. */}
            <Jauge titre="Si tout se confirme" legende={`+ ${enAttente.length} projet${enAttente.length > 1 ? 's' : ''} dont l'offre n'est pas acceptée`} verdict={potentiel?.verdict} />

            {sansCode > 0 && (
              <div style={{ ...panneau, borderColor: C.warning, background: C.warningBg }}>
                <div style={{ ...micro, color: C.warning }}>Ce que la jauge ne voit pas</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 28, fontWeight: 500, lineHeight: 1, color: AL.black }}>{heures(sansCode)}</span>
                  <span style={{ fontSize: 15, color: AL.black }}>d&apos;offres acceptées sans code d&apos;activité</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: AL.black }}>
                  Ces heures sont dues, mais aucune activité ne les porte : on ne sait pas qui
                  sait les faire, elles ne comptent dans aucune jauge et dans aucun palier.
                  {sansCode > (engage?.heures || 0) && <> Elles pèsent aujourd&apos;hui plus lourd que tout ce qui est compté
                  ci-dessus — tant qu&apos;elles ne sont pas codées, la jauge est optimiste par construction.</>}
                  {' '}Elles se corrigent dans l&apos;offre, en donnant une activité à chaque ligne de
                  main-d&apos;œuvre : l&apos;éditeur signale maintenant en rouge celles qui manquent, et
                  refuse de passer une offre en « acceptée » tant qu&apos;il en reste. La colonne
                  « à coder » de la liste ci-dessous dit par quels projets commencer.
                </p>
              </div>
            )}

            {(echeancier.enRetard?.heures > 0 || echeancier.sansEcheance?.heures > 0) && (
              <div style={{ ...panneauLeger, fontSize: 14, color: C.inkSecondary, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {echeancier.enRetard?.heures > 0 && (
                  <span>
                    <b style={{ fontWeight: 500, color: AL.black }}>{heures(echeancier.enRetard.heures)}</b> dues
                    sur {echeancier.enRetard.projets.length} projet{echeancier.enRetard.projets.length > 1 ? 's' : ''} dont
                    l&apos;échéance est DÉJÀ PASSÉE. Ce n&apos;est pas un problème de capacité — plus aucune heure ne peut être
                    placée avant ces dates — mais ces heures continuent de peser sur tous les paliers ci-dessous.
                  </span>
                )}
                {echeancier.sansEcheance?.heures > 0 && (
                  <span>
                    <b style={{ fontWeight: 500, color: AL.black }}>{heures(echeancier.sansEcheance.heures)}</b> engagées
                    sur {echeancier.sansEcheance.projets.length} projet{echeancier.sansEcheance.projets.length > 1 ? 's' : ''} sans
                    échéance : une dette réelle, mais sans mur — elle ne figure dans aucun palier.
                  </span>
                )}
              </div>
            )}

            <h2 style={{ fontSize: 22, fontWeight: 500, margin: '14px 0 0', color: AL.black }}>Qui a quoi sur les bras</h2>
            <Personnes verdict={engage?.verdict} personnes={personnes} />

            <h2 style={{ fontSize: 22, fontWeight: 500, margin: '14px 0 0', color: AL.black }}>Échéance par échéance</h2>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              Chaque palier porte tout ce qui est dû avant lui — c&apos;est ce cumul qui fait céder une date, pas le projet seul.
            </p>
            <Echeancier paliers={echeancier.paliers} mobile={mobile} />

            <h2 style={{ fontSize: 22, fontWeight: 500, margin: '14px 0 0', color: AL.black }}>Ce qui reste à faire, par activité</h2>
            <div style={{ ...panneauLeger, padding: 0, overflow: 'hidden' }}>
              {demandees.length === 0 ? (
                <p style={{ padding: 20, margin: 0, fontSize: 14, color: C.muted }}>Rien d&apos;engagé ne reste à faire.</p>
              ) : demandees.map(a => {
                const qui = personnes.filter(p => saitFaire(p.nom, a.code, d.competences || {})).map(p => p.nom)
                return (
                  <div key={a.code} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 18px', borderBottom: `1px solid ${C.divider}`, flexWrap: 'wrap' }}>
                    <span style={{ font: `11px ${MONO}`, color: C.muted, width: 26 }}>{a.code}</span>
                    <span style={{ flex: '1 1 160px', fontSize: 14, color: AL.black }}>{a.libelle}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: AL.black }}>{heures(a.reste)}</span>
                    <span style={{ fontSize: 13, color: qui.length === 0 ? C.danger : qui.length === 1 ? C.warning : C.muted, flex: '0 0 auto' }}>
                      {qui.length === 0 ? 'personne ne sait faire' : qui.length === 1 ? `${qui[0]} seul·e` : qui.join(' ou ')}
                    </span>
                  </div>
                )
              })}
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 500, margin: '14px 0 0', color: AL.black }}>Les projets comptés</h2>
            <div style={{ ...panneauLeger, padding: 0, overflow: 'hidden' }}>
              {projets.length === 0 ? (
                <p style={{ padding: 20, margin: 0, fontSize: 14, color: C.muted }}>Aucun projet actif.</p>
              ) : projets.slice().sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).map(p => (
                <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.divider}`, flexWrap: 'wrap' }}>
                    <span style={{ font: `11px ${MONO}`, color: C.muted, flex: '0 0 auto' }}>{p.numero ?? '—'}</span>
                    <span style={{ flex: '1 1 200px', fontSize: 14, fontWeight: 500, color: AL.black }}>{p.name}</span>
                    <span style={{ fontSize: 13, color: C.muted, flex: '0 0 auto' }}>{p.client || ''}</span>
                    <span style={{ fontSize: 12.5, padding: '3px 10px', borderRadius: R.pill, flex: '0 0 auto',
                      background: p.offre === 'accepte' ? C.successBg : C.neutralBg,
                      color: p.offre === 'accepte' ? C.success : C.muted }}>
                      {LIBELLES_OFFRE[p.offre] || p.offre}
                    </span>
                    <span style={{ fontSize: 13, color: p.deadline ? AL.black : C.muted, flex: '0 0 auto', marginLeft: 'auto' }}>
                      {p.deadline ? fmtDate(p.deadline) : 'sans échéance'}
                    </span>
                    {/* Les heures sans activité, projet par projet : c'est la
                        liste de travail de la reprise des offres, et elle se
                        termine quand cette colonne est vide partout. */}
                    {p.reste?.sansCode > 0 && (
                      <span title="Heures en heures sans activité : invisibles pour la jauge"
                        style={{ fontSize: 12.5, padding: '3px 10px', borderRadius: R.pill, flex: '0 0 auto', background: C.warningBg, color: C.warning }}>
                        {heures(p.reste.sansCode)} à coder
                      </span>
                    )}
                    <span style={{ fontSize: 14, fontWeight: 500, color: AL.black, flex: '0 0 auto', minWidth: 54, textAlign: 'right' }}>
                      {heures(p.reste?.total)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '14px 0 0', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: AL.black }}>Qui sait faire quoi</h2>
              <button onClick={() => setOngletCompetences(v => !v)} style={{ ...pill, border: `1px solid ${C.border}`, color: C.muted }}>
                {ongletCompetences ? 'masquer' : 'modifier'}
              </button>
            </div>
            {ongletCompetences && personnes.length > 0 && (
              <Competences personnes={personnes} activites={activites} competences={d.competences || {}}
                onEnregistre={() => mutate()} />
            )}

            <span style={{ ...micro, marginTop: 8 }}>
              La jauge suppose le travail divisible et ignore l&apos;ordre des étapes · « ça ne rentre pas » a toujours raison, « ça rentre » dit seulement qu&apos;il n&apos;y a pas de mur
            </span>
          </>
        )}
      </main>
    </div>
  )
}
