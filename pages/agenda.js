// L'agenda de l'atelier — où passe le temps, demi-journée par demi-journée.
//
// Il remplace cinq calendriers Google qui ne se parlaient pas, et surtout qui
// ne savaient pas à quel PROJET ni à quelle ACTIVITÉ VENDUE ils
// appartenaient. Un bloc d'ici porte les deux : c'est ce qui permettra de
// confronter le prévu au fait, et à la jauge de savoir ce qui est déjà placé.
//
// ── Ce que l'écran refuse de laisser faire ──────────────────────────────────
//
// Poser du travail sur une absence. Les congés de `/schedule` et les jours
// fériés vaudois sont dessinés par-dessus la grille : la demi-journée n'a
// alors pas de bouton « + ». C'est la faute que l'ancien planning laissait
// commettre sans rien dire, parce qu'il ignorait les congés.
//
// ── Pas d'heure de début ────────────────────────────────────────────────────
//
// Une demi-journée, et c'est tout. La durée, si elle est utile, se compte en
// demi-heures : trois heures de peinture ne sont pas un bloc de trois heures.
import { useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import useIsMobile from '../lib/useIsMobile'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'
import { AL, C, FONT, MONO, R, personChip } from '../lib/theme'
import { dateDuJour } from '../lib/aujourdhui'
import { joursFeries } from '../lib/joursFeries'
import { heuresParJour } from '../lib/capacite'
import {
  TYPES, typeDe, DEMIS, libelleDemi, lundiDe, semaineOuvree,
  blocsDe, minutesPlacees, placeLibre, typeParDefaut,
  prochainJourTravaille, estJourTravaille,
} from '../lib/agenda'

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const versD = s => { const [y, m, j] = String(s).split('-').map(Number); return new Date(y, m - 1, j) }
const decaler = (s, n) => { const d = versD(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtJour = s => { const d = versD(s); return `${JOURS[d.getDay()]} ${d.getDate()}` }
const fmtLong = s => { const d = versD(s); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}` }
const hhmm = m => (m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60}`)

// Les couleurs vivent dans le thème, jamais en dur. Le type porte le sens ;
// la teinte ne fait que le rappeler d'un coup d'œil, et une seule famille de
// gris pour ce qui n'est pas du travail vendu.
const TEINTE = {
  production: C.ink,
  montage:    C.accent,
  demontage:  C.accent,
  trajet:     C.info,
  meeting:    C.violet,
  admin:      C.muted,
  entretien:  C.success,
  autre:      C.faint,
}

const micro = { font: `500 10.5px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }
const panneau = { background: C.surface, border: `1.5px solid ${C.outline}`, borderRadius: R.panel }
const pill = {
  font: `13px ${FONT}`, padding: '8px 16px', borderRadius: R.pill,
  border: `1.5px solid ${C.outline}`, background: C.surface, color: AL.black, cursor: 'pointer',
}
const champ = {
  padding: '8px 12px', borderRadius: R.pill, border: `1px solid ${C.border}`,
  font: `13px ${FONT}`, color: AL.black, background: C.surface, outline: 'none',
}

const ABSENCES = {
  VACATION:    'vacances',
  VACATION_AM: 'congé matin',
  VACATION_PM: 'congé après-midi',
  SICK:        'maladie',
  HOLIDAY:     'férié',
}
/** Ce qui rend une demi-journée indisponible, pour une personne, ce jour-là. */
function absenceDe(entrees, nom, date, demi) {
  for (const e of entrees) {
    if (e.user_name !== nom || e.date !== date) continue
    if (e.type === 'VACATION' || e.type === 'SICK' || e.type === 'HOLIDAY') return ABSENCES[e.type]
    if (e.type === 'VACATION_AM' && demi === 'am') return ABSENCES.VACATION_AM
    if (e.type === 'VACATION_PM' && demi === 'pm') return ABSENCES.VACATION_PM
  }
  return null
}

/** Une puce de bloc : la couleur dit le type, le texte dit quoi. */
function Puce({ bloc, onClick }) {
  const t = typeDe(bloc.type)
  const nom = bloc.projects?.name || bloc.titre || (t ? t.label : 'bloc')
  return (
    <button onClick={onClick} className="u-tactile" title={`${t ? t.label : bloc.type}${bloc.projects ? ' · ' + bloc.projects.name : ''}${bloc.note ? ' · ' + bloc.note : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
        padding: '6px 9px', borderRadius: R.pill, minWidth: 0, cursor: 'pointer',
        background: C.surface, border: `1px solid ${bloc.fige ? C.outline : C.border}`,
      }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: TEINTE[bloc.type] || C.muted, flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, color: AL.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</span>
      {bloc.minutes ? <span style={{ font: `10px ${MONO}`, color: C.muted, flex: 'none' }}>{hhmm(bloc.minutes)}</span> : null}
    </button>
  )
}

/** Une demi-journée : ses blocs, son absence, son bouton. */
function Demi({ blocs, absence, defaut, parJour, onAjouter, onOuvrir, hauteur }) {
  // Sans contrat connu, on ne sait pas ce que vaut une demi-journée : on
  // n'annonce alors ni place libre ni dépassement plutôt que de les inventer.
  const connu = parJour > 0
  const libre = connu ? placeLibre(blocs, parJour) : 0
  const trop = connu && minutesPlacees(blocs, parJour) > Math.round((parJour / 2) * 60)
  if (absence) {
    return (
      <div style={{
        minHeight: hauteur, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.neutralBg, borderBottom: `1px dashed ${C.border}`,
      }}>
        <span style={{ ...micro, color: C.faint }}>{absence}</span>
      </div>
    )
  }
  return (
    <div style={{ minHeight: hauteur, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, borderBottom: `1px dashed ${C.border}` }}>
      {blocs.map(b => <Puce key={b.id} bloc={b} onClick={() => onOuvrir(b)} />)}
      {trop && <span style={{ font: `10px ${MONO}`, color: C.danger }}>DÉPASSE LA DEMI-JOURNÉE</span>}
      <button onClick={onAjouter} className="u-tactile" title="Ajouter un bloc"
        style={{
          marginTop: 'auto', border: `1px dashed ${C.border}`, borderRadius: R.pill, background: 'transparent',
          color: defaut ? (TEINTE[defaut] || C.muted) : C.faint, cursor: 'pointer', font: `11px ${MONO}`, padding: '3px 0',
        }}>
        {blocs.length === 0 && defaut ? typeDe(defaut)?.label || '+' : '+'}
        {blocs.length > 0 && libre > 0 ? ` ${hhmm(libre)}` : ''}
      </button>
    </div>
  )
}

/**
 * La feuille d'ajout — trois gestes.
 *
 * Un appel Zoom ou une demi-journée d'administratif : « + », « meeting »,
 * fini. Un bloc de production demande le projet et l'activité, parce que sans
 * eux il n'avance aucune heure vendue — c'est le seul endroit où l'on exige
 * quelque chose.
 */
function Feuille({ ctx, projets, activites, onFerme, onEnregistre }) {
  const edition = !!ctx.bloc
  const b = ctx.bloc || {}
  const [type, setType] = useState(b.type || ctx.defaut || 'production')
  const [projet, setProjet] = useState(b.project_id || '')
  const [activite, setActivite] = useState(b.activite ? String(b.activite) : '')
  const [minutes, setMinutes] = useState(b.minutes ? String(b.minutes) : '')
  const [titre, setTitre] = useState(b.titre || '')
  const [lieu, setLieu] = useState(b.lieu || '')
  const [note, setNote] = useState(b.note || '')
  const [fige, setFige] = useState(b.fige === true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  const t = typeDe(type)
  const exigeProjet = !!t?.exigeProjet

  async function enregistrer() {
    if (envoi) return
    setEnvoi(true); setErreur('')
    const corps = {
      user_name: ctx.nom, date: ctx.date, demi: ctx.demi, type,
      project_id: projet || null, activite: activite || null,
      minutes: minutes || null, titre, lieu, note, fige,
    }
    try {
      const r = await fetch(edition ? `/api/agenda/${b.id}` : '/api/agenda', {
        method: edition ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setErreur(data.error || `Erreur ${r.status}`); setEnvoi(false); return }
      await onEnregistre(); onFerme()
    } catch { setErreur('Enregistrement impossible — réseau ?'); setEnvoi(false) }
  }

  async function supprimer() {
    if (!edition || envoi) return
    setEnvoi(true); setErreur('')
    try {
      const r = await fetch(`/api/agenda/${b.id}`, { method: 'DELETE' })
      if (!r.ok && r.status !== 204) { setErreur(`Erreur ${r.status}`); setEnvoi(false); return }
      await onEnregistre(); onFerme()
    } catch { setErreur('Suppression impossible — réseau ?'); setEnvoi(false) }
  }

  return (
    <div onClick={onFerme} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(12,12,12,.4)' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, borderTopLeftRadius: R.panel, borderTopRightRadius: R.panel,
        width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
        padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
        fontFamily: FONT, color: C.ink, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: AL.black }}>{edition ? 'Modifier le bloc' : 'Poser un bloc'}</div>
          <div style={{ ...micro, marginTop: 4 }}>{ctx.nom} · {fmtLong(ctx.date)} · {libelleDemi(ctx.demi)}</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TYPES.map(x => (
            <button key={x.key} onClick={() => setType(x.key)} className="u-tactile"
              style={{
                font: `13px ${FONT}`, padding: '7px 14px', borderRadius: R.pill, cursor: 'pointer',
                border: `1.5px solid ${type === x.key ? C.outline : C.border}`,
                background: type === x.key ? C.ink : C.surface,
                color: type === x.key ? C.accentOnDark : AL.black,
              }}>{x.label}</button>
          ))}
        </div>

        {(exigeProjet || projet || type === 'montage' || type === 'demontage' || type === 'trajet') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={micro}>projet {exigeProjet ? '' : '(facultatif)'}</span>
            <select value={projet} onChange={e => setProjet(e.target.value)} style={champ}>
              <option value="">—</option>
              {projets.map(p => <option key={p.id} value={p.id}>{p.numero} · {p.name}</option>)}
            </select>
          </div>
        )}

        {exigeProjet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={micro}>activité vendue</span>
            <select value={activite} onChange={e => setActivite(e.target.value)} style={champ}>
              <option value="">—</option>
              {activites.map(a => <option key={a.code} value={a.code}>{a.code} · {a.libelle}</option>)}
            </select>
          </div>
        )}

        {!exigeProjet && (
          <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre (ex. appel Red Bull)" style={champ} />
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 150px' }}>
            <span style={micro}>durée</span>
            <select value={minutes} onChange={e => setMinutes(e.target.value)} style={champ}>
              <option value="">toute la demi-journée</option>
              {[30, 60, 90, 120, 150, 180, 210, 240].map(m => <option key={m} value={m}>{hhmm(m)}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 150px' }}>
            <span style={micro}>lieu</span>
            <input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="atelier, sur place…" style={champ} />
          </div>
        </div>

        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note" style={champ} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.inkSecondary }}>
          <input type="checkbox" checked={fige} onChange={e => setFige(e.target.checked)} className="u-tactile" />
          Figé — le planificateur ne le déplacera pas
        </label>

        {erreur && <span style={{ fontSize: 13, color: C.danger }}>{erreur}</span>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={enregistrer} disabled={envoi}
            style={{ ...pill, background: C.ink, color: C.accentOnDark, border: 'none', fontWeight: 600, opacity: envoi ? .5 : 1 }}>
            {envoi ? 'Enregistrement…' : edition ? 'Enregistrer' : 'Poser'}
          </button>
          <button onClick={onFerme} style={{ ...pill, border: `1px solid ${C.border}`, color: C.muted }}>annuler</button>
          {edition && (
            <button onClick={supprimer} disabled={envoi}
              style={{ ...pill, border: `1px solid ${C.border}`, color: C.danger, marginLeft: 'auto' }}>supprimer</button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * La semaine type : les demi-journées qui reviennent.
 *
 * Elle n'écrit aucun bloc — elle colore le fond des demi-journées vides et
 * propose le type au moment de poser. Matérialiser l'habitude en centaines de
 * blocs identiques obligerait à les supprimer un par un le jour où elle change.
 */
function SemaineType({ personnes, valeur, onEnregistre }) {
  const [etat, setEtat] = useState(valeur || {})
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const JOURS_ST = [[1, 'lundi'], [2, 'mardi'], [4, 'jeudi'], [5, 'vendredi']]

  function poser(nom, jour, i, type) {
    setEtat(e => {
      const jours = { ...(e[nom] || {}) }
      const couple = Array.isArray(jours[jour]) ? [...jours[jour]] : [null, null]
      couple[i] = type || null
      jours[jour] = couple
      return { ...e, [nom]: jours }
    })
  }

  async function enregistrer() {
    if (envoi) return
    setEnvoi(true); setErreur('')
    try {
      const r = await fetch('/api/app-settings/semaine_type', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: etat }),
      })
      if (!r.ok) { setErreur(`Erreur ${r.status}`); return }
      await onEnregistre()
    } catch { setErreur('Enregistrement impossible — réseau ?') }
    finally { setEnvoi(false) }
  }

  return (
    <div style={{ ...panneau, border: `1px solid ${C.border}`, padding: 20 }}>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: C.inkSecondary }}>
        Ce qui revient chaque semaine. Aucun bloc n&apos;est créé : la demi-journée vide
        prend juste cette couleur, et le bouton propose ce type.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {personnes.map(nom => (
          <div key={nom}>
            <span style={{ fontSize: 12.5, fontWeight: 500, padding: '5px 12px', borderRadius: R.pill, background: personChip(nom).bg, color: personChip(nom).fg }}>{nom}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
              {JOURS_ST.map(([j, label]) => (
                <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={micro}>{label}</span>
                  {DEMIS.map((demi, i) => (
                    <select key={demi} value={(etat[nom]?.[j] || [])[i] || ''} onChange={e => poser(nom, j, i, e.target.value)}
                      style={{ ...champ, font: `12.5px ${FONT}` }}>
                      <option value="">{libelleDemi(demi)} — libre</option>
                      {TYPES.map(t => <option key={t.key} value={t.key}>{libelleDemi(demi)} — {t.label}</option>)}
                    </select>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button onClick={enregistrer} disabled={envoi}
          style={{ ...pill, background: C.ink, color: C.accentOnDark, border: 'none', fontWeight: 600, opacity: envoi ? .5 : 1 }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {erreur && <span style={{ fontSize: 13, color: C.danger }}>{erreur}</span>}
      </div>
    </div>
  )
}

export default function Agenda() {
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const mobile = useIsMobile()
  const { responsibles } = useResponsibles()

  const aujourdhui = dateDuJour()
  // Un samedi, la semaine en cours est finie : ouvrir sur elle ne montre que
  // des jours passés. On part donc du prochain jour d'atelier.
  const depart = prochainJourTravaille(aujourdhui)
  const [lundi, setLundi] = useState(() => lundiDe(depart) || depart)
  const [jourMobile, setJourMobile] = useState(depart)
  const [feuille, setFeuille] = useState(null)
  const [reglagesOuverts, setReglagesOuverts] = useState(false)

  const jours = useMemo(() => semaineOuvree(lundi), [lundi])
  const du = jours[0] || lundi
  const au = jours[jours.length - 1] || lundi

  const { data: blocsBruts, mutate } = useSWR(`/api/agenda?from=${du}&to=${au}`)
  const { data: absencesBrutes } = useSWR(`/api/work-entries?from=${du}&to=${au}${isAdmin ? '&userName=*' : ''}`)
  const { data: projetsBruts } = useSWR('/api/projects?light=1')
  const { data: activitesBrutes } = useSWR('/api/activites')
  // Sans `userName`, l'admin reçoit TOUTE l'équipe (un tableau) et un membre
  // reçoit son seul réglage (un objet) : les deux formes se normalisent ici.
  const { data: reglagesBruts } = useSWR('/api/work-settings')
  const { data: semaineTypeBrute, mutate: mutateST } = useSWR(isAdmin ? '/api/app-settings/semaine_type' : null)

  const blocs = Array.isArray(blocsBruts) ? blocsBruts : []
  const absences = Array.isArray(absencesBrutes) ? absencesBrutes : []
  const activites = (Array.isArray(activitesBrutes) ? activitesBrutes : []).filter(a => a.actif !== false)
  const projets = (Array.isArray(projetsBruts) ? projetsBruts : [])
    .filter(p => p.status === 'active' && p.numero != null)
    .sort((a, b) => b.numero - a.numero)
  const semaineType = semaineTypeBrute?.value || {}

  // Les fériés vaudois sont calculés, jamais stockés — ils se déduisent de
  // Pâques et du calendrier.
  const feries = useMemo(() => {
    const an = Number(String(du).slice(0, 4))
    return Object.fromEntries(joursFeries(an).concat(joursFeries(an + 1)).map(f => [f.date, f.label]))
  }, [du])

  // Les personnes affichées : l'équipe pour l'admin, soi seul sinon.
  const personnes = useMemo(() => {
    const tous = (Array.isArray(responsibles) ? responsibles : []).filter(r => r && r !== 'non défini' && r !== 'Sous-traitant')
    return isAdmin ? tous : tous.filter(n => n === user?.name)
  }, [responsibles, isAdmin, user])

  // Les heures d'une journée pleine, par personne : une demi-journée fait la
  // moitié du contrat, pas quatre heures en dur.
  const parJourDe = useMemo(() => {
    const liste = Array.isArray(reglagesBruts) ? reglagesBruts : (reglagesBruts ? [reglagesBruts] : [])
    const out = {}
    for (const r of liste) out[r.user_name] = heuresParJour(r)
    return out
  }, [reglagesBruts])

  const joursVisibles = mobile ? [jourMobile] : jours
  const LARGEUR_NOM = mobile ? 92 : 150

  function cellule(nom, date, demi) {
    const ferie = feries[date]
    const absence = ferie || absenceDe(absences, nom, date, demi)
    const mesBlocs = blocsDe(blocs, nom, date, demi)
    const [dAm, dPm] = typeParDefaut(semaineType, nom, date)
    return (
      <Demi key={demi} blocs={mesBlocs} absence={absence} defaut={demi === 'am' ? dAm : dPm}
        parJour={parJourDe[nom] || 0} hauteur={mobile ? 72 : 60}
        onAjouter={() => setFeuille({ nom, date, demi, defaut: demi === 'am' ? dAm : dPm })}
        onOuvrir={b => setFeuille({ nom, date, demi, bloc: b })} />
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>Agenda — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          @media (max-width: 768px) {
            .ag-main { padding: 20px 16px 104px !important; }
            .ag-titre { font-size: 27px !important; }
            input, select { font-size: 16px !important; }
          }
        `}</style>
      </Head>
      <NavBar title="agenda" />

      <main className="ag-main" style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 className="ag-titre" style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>
            Agenda
          </h1>
          <p style={{ fontSize: 17, color: C.muted, margin: '10px 0 0' }}>
            Lundi, mardi, jeudi, vendredi — par demi-journée, sans heure de début.
          </p>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {mobile ? (
            <>
              <button onClick={() => setJourMobile(j => decaler(j, -1))} className="u-tactile" style={{ ...pill, padding: '8px 14px' }}>←</button>
              <span style={{ fontSize: 15, fontWeight: 500, color: AL.black, flex: 1, textAlign: 'center' }}>{fmtLong(jourMobile)}</span>
              <button onClick={() => setJourMobile(j => decaler(j, 1))} className="u-tactile" style={{ ...pill, padding: '8px 14px' }}>→</button>
              <button onClick={() => setJourMobile(depart)} style={{ ...pill, border: `1px solid ${C.border}`, color: C.muted }}>
                {aujourdhui === depart ? 'aujourd\u2019hui' : 'prochain jour'}
              </button>
              {!estJourTravaille(jourMobile) && (
                <span style={{ ...micro, width: '100%', color: C.warning }}>
                  Hors semaine d&apos;atelier — un bloc posé ici ne compte dans aucune capacité
                </span>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setLundi(l => decaler(l, -7))} style={{ ...pill, padding: '8px 14px' }}>←</button>
              <button onClick={() => setLundi(l => decaler(l, 7))} style={{ ...pill, padding: '8px 14px' }}>→</button>
              <span style={{ fontSize: 16, fontWeight: 500, color: AL.black }}>{fmtLong(du)} — {fmtLong(au)}</span>
              <button onClick={() => setLundi(lundiDe(aujourdhui))} style={{ ...pill, border: `1px solid ${C.border}`, color: C.muted }}>cette semaine</button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <button onClick={() => setReglagesOuverts(v => !v)} style={{ ...pill, border: `1px solid ${C.border}`, color: C.muted }}>
              {reglagesOuverts ? 'masquer la semaine type' : 'semaine type'}
            </button>
          )}
        </div>

        {isAdmin && reglagesOuverts && (
          <SemaineType personnes={personnes} valeur={semaineType} onEnregistre={() => mutateST()} />
        )}

        {/* La grille */}
        <div style={{ ...panneau, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `${LARGEUR_NOM}px repeat(${joursVisibles.length}, minmax(0, 1fr))`, borderBottom: `1px solid ${C.border}` }}>
            <div />
            {joursVisibles.map(j => {
              const estAuj = j === aujourdhui
              return (
                <div key={j} style={{ padding: '10px 8px', textAlign: 'center', borderLeft: `1px solid ${C.divider}`, background: estAuj ? C.accentBg : 'transparent' }}>
                  <div style={{ ...micro, color: estAuj ? C.accent : C.muted }}>{fmtJour(j)}</div>
                  {feries[j] && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{feries[j]}</div>}
                </div>
              )
            })}
          </div>

          {personnes.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 14, margin: 0 }}>Aucune personne à afficher.</p>
          ) : personnes.map(nom => (
            <div key={nom} style={{ display: 'grid', gridTemplateColumns: `${LARGEUR_NOM}px repeat(${joursVisibles.length}, minmax(0, 1fr))`, borderBottom: `1px solid ${C.divider}` }}>
              <div style={{ display: 'flex', alignItems: 'stretch', borderRight: `1px solid ${C.divider}` }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '10px 4px 10px 12px', minWidth: 0 }}>
                  <span style={{
                    fontSize: 12.5, fontWeight: 500, padding: '5px 10px', borderRadius: R.pill,
                    background: personChip(nom).bg, color: personChip(nom).fg,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{nom}</span>
                </div>
                <div style={{ width: 24, flex: 'none', display: 'flex', flexDirection: 'column' }}>
                  {DEMIS.map(d => (
                    <span key={d} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `8.5px ${MONO}`, color: C.muted, borderBottom: d === 'am' ? `1px dashed ${C.border}` : 'none' }}>
                      {d.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
              {joursVisibles.map(j => (
                <div key={j} style={{ borderLeft: `1px solid ${C.divider}`, background: j === aujourdhui ? 'rgba(255,77,109,.04)' : 'transparent', display: 'flex', flexDirection: 'column' }}>
                  {DEMIS.map(demi => cellule(nom, j, demi))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Légende */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEINTE[t.key], flex: 'none' }} />
              <span style={micro}>{t.label}</span>
            </div>
          ))}
        </div>

        <span style={micro}>
          Les congés et les fériés viennent de <Link href="/schedule" style={{ color: C.muted }}>horaires</Link> · la charge de l&apos;atelier se lit dans <Link href="/planning" style={{ color: C.muted }}>planning</Link>
        </span>
      </main>

      {feuille && (
        <Feuille ctx={feuille} projets={projets} activites={activites}
          onFerme={() => setFeuille(null)} onEnregistre={() => mutate()} />
      )}
    </div>
  )
}
