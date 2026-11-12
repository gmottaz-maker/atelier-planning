// Agenda — proposition dans le nouveau style, à côté de l'agenda actuel
// (/agenda). Mêmes blocs, mêmes routes, mêmes règles :
//   - une demi-journée, jamais d'heure de début ;
//   - les congés et les fériés recouvrent la demi-journée, qui n'a alors pas
//     de bouton — on ne pose pas de travail sur une absence ;
//   - la semaine type n'écrit aucun bloc, elle propose un type.
// Ce qui change : trois familles au lieu de huit couleurs (à l'atelier,
// dehors, au bureau), le projet écrit en clair, la place libre dite.
import { useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import useSWR from 'swr'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import useIsMobile from '../../lib/useIsMobile'
import { useResponsibles } from '../../lib/useResponsibles'
import { STYLE_FICHE } from '../../components/fiche/styles'
import { N } from '../../lib/theme'
import { dateDuJour } from '../../lib/aujourdhui'
import { joursFeries } from '../../lib/joursFeries'
import { heuresParJour } from '../../lib/capacite'
import { decaler } from '../../lib/accueil'
import { TYPES, typeDe, DEMIS, libelleDemi, lundiDe, semaineOuvree, blocsDe, typeParDefaut, prochainJourTravaille } from '../../lib/agenda'
import { NOMS_FAMILLES, absenceDe, demiJournee, duree, familleBloc, libelleBloc, resumeSemaine } from '../../lib/vueAgenda'

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const versD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const jourMois = s => `${versD(s).getDate()} ${MOIS[versD(s).getMonth()]}`
const nomJour = s => JOURS[versD(s).getDay()]
const COULEUR = { atelier: N.encre, dehors: N.cobalt, bureau: '#9aa0a9' }
const majuscule = s => (s ? s[0].toUpperCase() + s.slice(1) : s)

function numeroSemaine(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
}

/**
 * La feuille d'un bloc. Un appel ou une demi-journée d'administratif : le
 * type, et c'est fini. La production exige le projet et l'activité vendue,
 * parce que sans eux elle n'avance aucune heure vendue.
 */
function Feuille({ ctx, projets, activites, onFerme, onEnregistre }) {
  const edition = !!ctx.bloc
  const b = ctx.bloc || {}
  const [f, setF] = useState({
    type: b.type || ctx.defaut || 'production', projet: b.project_id || '', activite: b.activite ? String(b.activite) : '',
    minutes: b.minutes ? String(b.minutes) : '', titre: b.titre || '', lieu: b.lieu || '', note: b.note || '', fige: b.fige === true,
  })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const exigeProjet = !!typeDe(f.type)?.exigeProjet
  const avecProjet = exigeProjet || f.projet || ['montage', 'demontage', 'trajet'].includes(f.type)

  async function envoyer(methode, url, corps) {
    if (envoi) return
    setEnvoi(true); setErreur('')
    try {
      const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
      const d = await r.json().catch(() => ({}))
      if (!r.ok && r.status !== 204) { setErreur(d.error || `Erreur ${r.status}`); setEnvoi(false); return }
      await onEnregistre(); onFerme()
    } catch { setErreur('Enregistrement impossible : le réseau ne répond pas.'); setEnvoi(false) }
  }
  const enregistrer = () => envoyer(edition ? 'PUT' : 'POST', edition ? `/api/agenda/${b.id}` : '/api/agenda', {
    user_name: ctx.nom, date: ctx.date, demi: ctx.demi, type: f.type,
    project_id: f.projet || null, activite: f.activite || null, minutes: f.minutes || null,
    titre: f.titre, lieu: f.lieu, note: f.note, fige: f.fige,
  })

  return (
    <div className="fx-voile" onClick={onFerme}>
      <div className="fx-feuille" role="dialog" aria-modal="true" aria-label={edition ? 'Modifier le bloc' : 'Poser un bloc'} onClick={e => e.stopPropagation()}>
        <div>
          <h2>{edition ? 'Modifier le bloc' : 'Poser un bloc'}</h2>
          <p className="sous">{ctx.nom}, {nomJour(ctx.date)} {jourMois(ctx.date)}, {libelleDemi(ctx.demi)}</p>
        </div>
        <div>
          <span className="fx-etiquette">Type</span>
          <div className="fx-puces">
            {TYPES.map(x => <button key={x.key} aria-pressed={f.type === x.key} onClick={() => set('type', x.key)}>{majuscule(x.label)}</button>)}
          </div>
        </div>
        {avecProjet && (
          <label><span className="fx-etiquette">Projet{exigeProjet ? '' : ' (facultatif)'}</span>
            <select className="fx-champ" value={f.projet} onChange={e => set('projet', e.target.value)}>
              <option value="">Aucun</option>
              {projets.map(p => <option key={p.id} value={p.id}>{p.numero} {p.name}</option>)}
            </select></label>
        )}
        {exigeProjet && (
          <label><span className="fx-etiquette">Activité vendue</span>
            <select className="fx-champ" value={f.activite} onChange={e => set('activite', e.target.value)}>
              <option value="">À choisir</option>
              {activites.map(a => <option key={a.code} value={a.code}>{a.code} {a.libelle}</option>)}
            </select></label>
        )}
        {!exigeProjet && (
          <label><span className="fx-etiquette">Titre</span>
            <input className="fx-champ" value={f.titre} onChange={e => set('titre', e.target.value)} placeholder="Appel Red Bull" /></label>
        )}
        <div className="deux">
          <label><span className="fx-etiquette">Durée</span>
            <select className="fx-champ" value={f.minutes} onChange={e => set('minutes', e.target.value)}>
              <option value="">Toute la demi-journée</option>
              {[30, 60, 90, 120, 150, 180, 210, 240].map(m => <option key={m} value={m}>{duree(m)}</option>)}
            </select></label>
          <label><span className="fx-etiquette">Lieu</span>
            <input className="fx-champ" value={f.lieu} onChange={e => set('lieu', e.target.value)} placeholder="Atelier, sur place…" /></label>
        </div>
        <label><span className="fx-etiquette">Note</span>
          <input className="fx-champ" value={f.note} onChange={e => set('note', e.target.value)} /></label>
        <label className="coche"><input type="checkbox" checked={f.fige} onChange={e => set('fige', e.target.checked)} /> Figé : le planificateur ne le déplacera pas</label>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="fx-actions">
          <button className="fx-btn p" onClick={enregistrer} disabled={envoi}>{envoi ? 'Enregistrement…' : edition ? 'Enregistrer' : 'Poser le bloc'}</button>
          <button className="fx-btn g" onClick={onFerme}>Annuler</button>
          {edition && <button className="fx-lien" style={{ color: N.rouge, marginLeft: 'auto' }} disabled={envoi} onClick={() => envoyer('DELETE', `/api/agenda/${b.id}`)}>Supprimer</button>}
        </div>
      </div>
    </div>
  )
}

/** La semaine type : ce qui revient chaque semaine. Aucun bloc n'est créé. */
function SemaineType({ personnes, valeur, onEnregistre }) {
  const [etat, setEtat] = useState(valeur || {})
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const JOURS_ST = [[1, 'Lundi'], [2, 'Mardi'], [4, 'Jeudi'], [5, 'Vendredi']]
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
    setEnvoi(true); setErreur('')
    try {
      const r = await fetch('/api/app-settings/semaine_type', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: etat }) })
      if (!r.ok) { setErreur(`Erreur ${r.status}`); return }
      await onEnregistre()
    } catch { setErreur('Enregistrement impossible : le réseau ne répond pas.') } finally { setEnvoi(false) }
  }
  return (
    <section className="fx-st">
      <p className="fx-note">Ce qui revient chaque semaine. Aucun bloc n’est créé : une demi-journée vide propose simplement ce type.</p>
      {personnes.map(nom => (
        <div key={nom}>
          <b>{nom}</b>
          <div className="fx-st-jours">
            {JOURS_ST.map(([j, nomJ]) => (
              <div key={j}>
                <span className="fx-etiquette">{nomJ}</span>
                {DEMIS.map((demi, i) => (
                  <select key={demi} className="fx-champ" aria-label={`${nom}, ${nomJ} ${libelleDemi(demi)}`} value={(etat[nom]?.[j] || [])[i] || ''} onChange={e => poser(nom, j, i, e.target.value)}>
                    <option value="">{majuscule(libelleDemi(demi))} : libre</option>
                    {TYPES.map(t => <option key={t.key} value={t.key}>{majuscule(libelleDemi(demi))} : {t.label}</option>)}
                  </select>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="fx-actions">
        <button className="fx-btn p" onClick={enregistrer} disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer la semaine type'}</button>
        {erreur && <span style={{ color: N.rouge }}>{erreur}</span>}
      </div>
    </section>
  )
}

export default function AgendaEssai() {
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const mobile = useIsMobile()
  const { responsibles } = useResponsibles()
  const aujourdhui = dateDuJour()
  // Un samedi, la semaine est finie : on ouvre sur le prochain jour d'atelier.
  const depart = prochainJourTravaille(aujourdhui)
  const [lundi, setLundi] = useState(() => lundiDe(depart) || depart)
  const [jourMobile, setJourMobile] = useState(depart)
  const [feuille, setFeuille] = useState(null)
  const [semaineTypeOuverte, setSemaineTypeOuverte] = useState(false)

  const jours = useMemo(() => semaineOuvree(lundi), [lundi])
  const du = jours[0] || lundi
  const au = jours[jours.length - 1] || lundi
  const { data: blocsBruts, mutate } = useSWR(`/api/agenda?from=${du}&to=${au}`)
  const { data: absencesBrutes } = useSWR(`/api/work-entries?from=${du}&to=${au}${isAdmin ? '&userName=*' : ''}`)
  const { data: projetsBruts } = useSWR('/api/projects?light=1')
  const { data: activitesBrutes } = useSWR('/api/activites')
  // L'admin reçoit toute l'équipe (un tableau), un membre son seul réglage.
  const { data: reglagesBruts } = useSWR('/api/work-settings')
  const { data: semaineTypeBrute, mutate: rechargerST } = useSWR(isAdmin ? '/api/app-settings/semaine_type' : null)

  const blocs = Array.isArray(blocsBruts) ? blocsBruts : []
  const absences = Array.isArray(absencesBrutes) ? absencesBrutes : []
  const activites = (Array.isArray(activitesBrutes) ? activitesBrutes : []).filter(a => a.actif !== false)
  const projets = (Array.isArray(projetsBruts) ? projetsBruts : []).filter(p => p.status === 'active' && p.numero != null).sort((a, b) => b.numero - a.numero)
  const semaineType = semaineTypeBrute?.value || {}
  const feries = useMemo(() => {
    const an = Number(du.slice(0, 4))
    return Object.fromEntries(joursFeries(an).concat(joursFeries(an + 1)).map(f => [f.date, f.label]))
  }, [du])
  const personnes = useMemo(() => {
    const tous = (Array.isArray(responsibles) ? responsibles : []).filter(r => r && r !== 'non défini' && r !== 'Sous-traitant')
    return isAdmin ? tous : tous.filter(n => n === user?.name)
  }, [responsibles, isAdmin, user])
  const parJourDe = useMemo(() => {
    const liste = Array.isArray(reglagesBruts) ? reglagesBruts : (reglagesBruts ? [reglagesBruts] : [])
    return Object.fromEntries(liste.map(r => [r.user_name, heuresParJour(r)]))
  }, [reglagesBruts])

  const resume = resumeSemaine(blocs)
  const visibles = mobile ? [jours.includes(jourMobile) ? jourMobile : jours[0]] : jours
  const changerSemaine = n => { const l = decaler(lundi, 7 * n); setLundi(l); setJourMobile(semaineOuvree(l)[0]) }
  const revenir = () => { setLundi(lundiDe(depart)); setJourMobile(depart) }
  const surCetteSemaine = lundi === lundiDe(depart)

  function Demi({ nom, date, demi }) {
    const [dAm, dPm] = typeParDefaut(semaineType, nom, date)
    const defaut = demi === 'am' ? dAm : dPm
    const d = demiJournee({
      blocs: blocsDe(blocs, nom, date, demi),
      absence: feries[date] || absenceDe(absences, nom, date, demi),
      defaut, parJour: parJourDe[nom] || 0,
    })
    if (d.absence) return <div className="fx-demi absent">{d.absence}</div>
    return (
      <div className="fx-demi">
        <span className="quand">{majuscule(libelleDemi(demi))}</span>
        {d.blocs.map(b => {
          const l = libelleBloc(b)
          return (
            <button key={b.id} className="fx-bloc" style={{ '--fam': COULEUR[familleBloc(b.type)] }} onClick={() => setFeuille({ nom, date, demi, bloc: b })}
              title={[l.type, l.quoi, b.lieu, b.note].filter(Boolean).join(' · ')}>
              <span className="type"><span>{l.type}{b.fige ? ' · figé' : ''}</span>{b.minutes ? <span className="n">{duree(b.minutes)}</span> : null}</span>
              {(l.quoi || l.numero != null) && <b>{l.numero != null && <span className="no n">{l.numero} </span>}{l.quoi}</b>}
            </button>
          )
        })}
        {d.trop && <span className="trop">Dépasse la demi-journée</span>}
        <button className={`plus${d.defaut ? ' defaut' : ''}`} onClick={() => setFeuille({ nom, date, demi, defaut })}>
          {d.defaut ? `+ ${majuscule(typeDe(d.defaut)?.label || d.defaut)}` : d.libre ? `+ ${duree(d.libre)} libres` : d.blocs.length ? '+' : '+ Poser'}
        </button>
      </div>
    )
  }

  return (
    <div className="fx">
      <Head><title>Agenda — Maze Project</title></Head>
      <style>{STYLE_FICHE}</style>
      <div className="fx-page">
        <header className="fx-entete">
          <div>
            <h1>Agenda</h1>
            <p className="fx-resume-liste">
              <span>Semaine {numeroSemaine(du)}, {jourMois(du)} – {jourMois(au)}</span>
              <span>{resume.blocs ? `${resume.blocs} bloc${resume.blocs > 1 ? 's' : ''}` : 'Rien de posé'}</span>
              {resume.dehors > 0 && <span>{resume.dehors} demi-journée{resume.dehors > 1 ? 's' : ''} dehors</span>}
            </p>
          </div>
          <div className="fx-actions">
            <a className="fx-btn g" href="/agenda" style={{ textDecoration: 'none' }}>Ancienne page</a>
            {isAdmin && <button className="fx-btn g" aria-expanded={semaineTypeOuverte} onClick={() => setSemaineTypeOuverte(v => !v)}>Semaine type</button>}
          </div>
        </header>

        <div className="fx-filtres">
          <span className="fx-seg" role="group" aria-label="Changer de semaine">
            <button aria-label="Semaine précédente" onClick={() => changerSemaine(-1)}>‹</button>
            <button aria-pressed={surCetteSemaine} onClick={revenir}>Cette semaine</button>
            <button aria-label="Semaine suivante" onClick={() => changerSemaine(1)}>›</button>
          </span>
          {mobile && (
            <span className="fx-seg" role="group" aria-label="Jour">
              {jours.map(j => <button key={j} aria-pressed={visibles[0] === j} onClick={() => setJourMobile(j)}>{nomJour(j).slice(0, 3)}. {versD(j).getDate()}</button>)}
            </span>
          )}
        </div>

        {isAdmin && semaineTypeOuverte && <SemaineType personnes={personnes} valeur={semaineType} onEnregistre={() => rechargerST()} />}

        <div className="fx-ag" style={{ '--jours': visibles.length }}>
          <div className="fx-ag-ligne">
            <span />
            {visibles.map(j => (
              <div key={j} className={`fx-ag-tete${j === aujourdhui ? ' auj' : ''}`}>
                {majuscule(nomJour(j))}<b className="n">{versD(j).getDate()}</b>
                {feries[j] && <small>{feries[j]}</small>}
              </div>
            ))}
          </div>
          {personnes.length === 0 && <p className="fx-note">Aucune personne à afficher.</p>}
          {personnes.map(nom => (
            <div key={nom} className="fx-ag-ligne">
              <div className="fx-ag-qui">{nom}{!parJourDe[nom] && <small>Contrat inconnu</small>}</div>
              {visibles.map(j => (
                <div key={j} className={`fx-ag-jour${j === aujourdhui ? ' auj' : ''}${j < aujourdhui ? ' passe' : ''}`}>
                  {DEMIS.map(demi => <Demi key={demi} nom={nom} date={j} demi={demi} />)}
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className="fx-legende">
          {Object.entries(NOMS_FAMILLES).map(([k, v]) => <span key={k}><i style={{ background: COULEUR[k] }} />{v}</span>)}
        </p>
        <p className="fx-note" style={{ marginTop: 8 }}>Les congés viennent des <Link href="/schedule" style={{ color: 'inherit' }}>horaires</Link>, la charge de l’atelier se lit dans le <Link href="/planning" style={{ color: 'inherit' }}>planning</Link>.</p>
      </div>

      {feuille && <Feuille ctx={feuille} projets={projets} activites={activites} onFerme={() => setFeuille(null)} onEnregistre={() => mutate()} />}
    </div>
  )
}
