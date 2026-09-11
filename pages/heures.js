// Heures imputées — qui a fait quoi, sur quel projet, pour quelle activité.
//
// Une journée à la fois, parce que c'est ainsi qu'on les note : la feuille
// manuscrite est quotidienne, et la saisie à l'écran sert autant à la remplir
// qu'à corriger ce que le scan en aura lu. La bande de la semaine au-dessus
// montre d'un coup d'œil les jours oubliés.
//
// Chacun voit et saisit SES heures ; le serveur l'impose quoi que la page
// envoie. L'admin choisit la personne, exporte, et gère les activités.
import { useState } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import { useResponsibles } from '../lib/useResponsibles'
import NavBar from '../components/NavBar'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import { dateDuJour } from '../lib/aujourdhui'
import { formatDuree, duree, totalPar, FAMILLES } from '../lib/heures'
import { estJourTravaille } from '../lib/joursOuvres'

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
const LIBELLES_FAMILLE = {
  atelier: 'Atelier', finitions: 'Finitions', logistique: 'Logistique',
  chantier: 'Chantier', gestion: 'Gestion', interne: 'Hors projet',
}

const versDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const decaler = (s, n) => { const d = versDate(s); d.setDate(d.getDate() + n); return dateDuJour(d) }
const lundiDe = s => { const d = versDate(s); return decaler(s, -((d.getDay() + 6) % 7)) }
const hhmm = t => String(t || '').slice(0, 5)
const fmtJour = s => { const d = versDate(s); return `${JOURS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}` }

const champ = {
  padding: '7px 12px', borderRadius: R.pill, border: `1px solid ${C.border}`,
  font: `13px ${FONT}`, color: AL.black, background: C.surface, outline: 'none',
}
const lien = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  font: `13px ${FONT}`, color: C.muted,
}
const microLabel = { fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }

const formVide = { debut: '', fin: '', project_id: '', activite: '', note: '' }

export default function HeuresPage() {
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const { responsibles } = useResponsibles()

  const aujourdhui = dateDuJour()
  const [jour, setJour] = useState(aujourdhui)
  const [personneChoisie, setPersonneChoisie] = useState(null)
  const [form, setForm] = useState(formVide)
  const [edition, setEdition] = useState(null)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Le nom du profil arrive un instant APRÈS l'e-mail (cf. CLAUDE.md) : on ne
  // le fige donc pas dans l'état, on le relit à chaque rendu.
  const personne = (isAdmin && personneChoisie) || user?.name || ''
  const lundi = lundiDe(jour)
  const dimanche = decaler(lundi, 6)
  const cleSemaine = personne ? `/api/heures?from=${lundi}&to=${dimanche}&user=${encodeURIComponent(personne)}` : null

  const { data: semaineBrute, mutate } = useSWR(cleSemaine)
  const { data: activitesBrutes } = useSWR('/api/activites')
  const { data: projetsBruts } = useSWR('/api/projects?light=1')

  const semaine = Array.isArray(semaineBrute) ? semaineBrute : []
  const activites = Array.isArray(activitesBrutes) ? activitesBrutes : []
  const projets = (Array.isArray(projetsBruts) ? projetsBruts : [])
    .filter(p => p.numero != null)
    .sort((a, b) => b.numero - a.numero)
  const projetsActifs = projets.filter(p => p.status === 'active')

  const duJour = semaine.filter(h => h.date === jour).sort((a, b) => hhmm(a.debut).localeCompare(hhmm(b.debut)))
  const parJour = totalPar(semaine, h => h.date)
  const totalJour = parJour[jour] || 0
  const totalSemaine = Object.values(parJour).reduce((s, m) => s + m, 0)
  const actDe = code => activites.find(a => Number(a.code) === Number(code))
  const personnes = (responsibles || []).filter(r => r && r !== 'non défini' && r !== 'Sous-traitant')

  const dureeForm = duree(form.debut, form.fin)
  const dansLeFutur = jour > aujourdhui

  function editer(h) {
    setEdition(h.id)
    setErreur('')
    setForm({ debut: hhmm(h.debut), fin: hhmm(h.fin), project_id: h.project_id || '', activite: String(h.activite), note: h.note || '' })
  }
  function annuler() { setEdition(null); setErreur(''); setForm(formVide) }

  async function enregistrer(e) {
    e.preventDefault()
    if (envoi) return
    setEnvoi(true)
    setErreur('')
    const corps = {
      date: jour, debut: form.debut, fin: form.fin,
      project_id: form.project_id || null, activite: Number(form.activite), note: form.note,
      ...(isAdmin && !edition ? { user_name: personne } : {}),
    }
    try {
      const r = await fetch(edition ? `/api/heures/${edition}` : '/api/heures', {
        method: edition ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setErreur(data.error || `Erreur ${r.status}`); return }
      // Saisie à la suite : la ligne suivante commence où finit celle-ci, avec
      // le même projet et la même activité — c'est le cas le plus fréquent.
      setForm(edition ? formVide : { ...formVide, debut: form.fin, project_id: form.project_id, activite: form.activite })
      setEdition(null)
      mutate()
    } catch {
      setErreur('Enregistrement impossible — réseau ?')
    } finally {
      setEnvoi(false)
    }
  }

  async function supprimer(h) {
    if (!confirm(`Supprimer ${hhmm(h.debut)} – ${hhmm(h.fin)} ?`)) return
    const r = await fetch(`/api/heures/${h.id}`, { method: 'DELETE' })
    if (r.ok) { if (edition === h.id) annuler(); mutate() }
  }

  const libelleProjet = p => p ? `${p.numero} · ${p.client ? p.client + ' · ' : ''}${p.name}` : 'hors projet'

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Heures — Maze Project</title></Head>
      <NavBar title="Heures" />

      <main style={{ padding: '32px 24px 104px', maxWidth: 1100 }}>
        <h1 style={{ font: `500 34px ${FONT}`, letterSpacing: '-.02em', margin: '0 0 4px' }}>
          {isAdmin && personne !== user?.name ? <>heures de <span style={{ color: C.accent }}>{personne}</span></>
            : <>mes <span style={{ color: C.accent }}>heures</span></>}
        </h1>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 22px' }}>
          Semaine du {fmtJour(lundi)} : {formatDuree(totalSemaine)} imputées
        </p>

        {/* ── Personne et semaine ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {isAdmin && (
            <select value={personne} onChange={e => { setPersonneChoisie(e.target.value); annuler() }} style={champ}>
              {[...new Set([user?.name, ...personnes].filter(Boolean))].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <button style={lien} onClick={() => { setJour(decaler(jour, -7)); annuler() }}>← semaine</button>
          <button style={lien} onClick={() => { setJour(aujourdhui); annuler() }}>aujourd'hui</button>
          <button style={lien} onClick={() => { setJour(decaler(jour, 7)); annuler() }}>semaine →</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginBottom: 26 }}>
          {Array.from({ length: 7 }, (_, i) => decaler(lundi, i)).map(d => {
            const actif = d === jour
            const travaille = estJourTravaille(versDate(d))
            return (
              <button key={d} onClick={() => { setJour(d); annuler() }}
                style={{
                  padding: '10px 8px', borderRadius: R.panel, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${actif ? C.outline : 'transparent'}`,
                  background: actif ? C.surface : travaille ? C.neutralBg : 'transparent',
                  font: `13px ${FONT}`, color: travaille ? AL.black : C.muted,
                }}>
                <div style={{ fontWeight: 500 }}>{fmtJour(d)}{d === aujourdhui ? ' ·' : ''}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 2, color: parJour[d] ? AL.black : C.muted }}>
                  {parJour[d] ? formatDuree(parJour[d]) : '—'}
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Le jour ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ font: `500 20px ${FONT}`, margin: 0 }}>{fmtJour(jour)}</h2>
          <span style={{ fontFamily: MONO, fontSize: 13 }}>{formatDuree(totalJour)}</span>
        </div>

        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden', marginBottom: 14 }}>
          {duJour.length === 0 ? (
            <p style={{ margin: 0, padding: '16px 18px', fontSize: 13, color: C.muted }}>Rien d'imputé ce jour-là.</p>
          ) : duJour.map(h => {
            const a = actDe(h.activite)
            return (
              <div key={h.id} style={{
                display: 'grid', gridTemplateColumns: '110px 64px minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr) auto',
                gap: 12, alignItems: 'baseline', padding: '12px 18px', borderTop: `1px solid ${C.border}`,
                background: edition === h.id ? C.hover : 'transparent', fontSize: 13,
              }}>
                <span style={{ fontFamily: MONO }}>{hhmm(h.debut)} – {hhmm(h.fin)}</span>
                <span style={{ fontFamily: MONO, color: C.muted }}>{formatDuree(h.minutes)}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: h.projects ? AL.black : C.muted }}>
                  {libelleProjet(h.projects)}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: MONO }}>{h.activite}</span> · {a?.libelle || '?'}
                </span>
                <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.note || ''}{h.source === 'scan' ? ' · scan' : ''}
                </span>
                <span style={{ display: 'flex', gap: 12 }}>
                  <button style={lien} onClick={() => editer(h)}>modifier</button>
                  <button style={lien} onClick={() => supprimer(h)} aria-label="Supprimer">✕</button>
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Saisie ── */}
        <form onSubmit={enregistrer}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            padding: 14, border: `1.5px solid ${C.outline}`, borderRadius: R.panel, marginBottom: 8 }}>
          <input type="time" step={300} required value={form.debut} onChange={e => setForm(f => ({ ...f, debut: e.target.value }))}
            style={{ ...champ, fontFamily: MONO }} aria-label="Début" />
          <span style={{ color: C.muted }}>–</span>
          <input type="time" step={300} required value={form.fin} onChange={e => setForm(f => ({ ...f, fin: e.target.value }))}
            style={{ ...champ, fontFamily: MONO }} aria-label="Fin" />
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, minWidth: 48 }}>{dureeForm ? formatDuree(dureeForm) : ''}</span>

          <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
            style={{ ...champ, flex: '2 1 240px', minWidth: 0 }} aria-label="Projet">
            <option value="">hors projet</option>
            {projetsActifs.map(p => <option key={p.id} value={p.id}>{libelleProjet(p)}</option>)}
            {/* Un projet archivé reste proposé s'il est déjà sur la ligne qu'on corrige. */}
            {form.project_id && !projetsActifs.some(p => p.id === form.project_id) && projets.filter(p => p.id === form.project_id)
              .map(p => <option key={p.id} value={p.id}>{libelleProjet(p)} (archivé)</option>)}
          </select>

          <select required value={form.activite} onChange={e => setForm(f => ({ ...f, activite: e.target.value }))}
            style={{ ...champ, flex: '1 1 200px', minWidth: 0 }} aria-label="Activité">
            <option value="" disabled>activité…</option>
            {FAMILLES.map(fam => {
              const liste = activites.filter(a => a.famille === fam && (a.actif || String(a.code) === form.activite))
              return liste.length ? (
                <optgroup key={fam} label={LIBELLES_FAMILLE[fam]}>
                  {liste.map(a => <option key={a.code} value={a.code}>{a.code} · {a.libelle}</option>)}
                </optgroup>
              ) : null
            })}
          </select>

          <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="remarque"
            style={{ ...champ, flex: '1 1 140px', minWidth: 0 }} maxLength={500} />

          <button type="submit" disabled={envoi || dansLeFutur}
            style={{ padding: '8px 18px', borderRadius: R.pill, border: 'none', cursor: envoi || dansLeFutur ? 'not-allowed' : 'pointer',
              background: AL.black, color: AL.white, font: `500 13px ${FONT}`, opacity: envoi || dansLeFutur ? 0.5 : 1 }}>
            {envoi ? '…' : edition ? 'enregistrer' : 'ajouter'}
          </button>
          {edition && <button type="button" style={lien} onClick={annuler}>annuler</button>}
        </form>
        {erreur && <p style={{ margin: '0 0 8px', fontSize: 13, color: C.danger }}>{erreur}</p>}
        {dansLeFutur && <p style={{ margin: '0 0 8px', fontSize: 13, color: C.muted }}>On n'impute pas d'heures à l'avance.</p>}

        {isAdmin && <SectionAdmin activites={activites} personnes={personnes} aujourdhui={aujourdhui} />}
      </main>
    </div>
  )
}

// ─── Admin : export et activités ─────────────────────────────────────────────
function SectionAdmin({ activites, personnes, aujourdhui }) {
  const [du, setDu] = useState(`${aujourdhui.slice(0, 7)}-01`)
  const [au, setAu] = useState(aujourdhui)
  const [qui, setQui] = useState('')
  const [nouvelle, setNouvelle] = useState({ code: '', libelle: '', famille: 'atelier' })
  const [erreur, setErreur] = useState('')
  const { mutate } = useSWR('/api/activites')

  const params = new URLSearchParams({ from: du, to: au, ...(qui ? { user: qui } : {}) }).toString()

  async function envoyer(methode, corps) {
    setErreur('')
    const r = await fetch('/api/activites', {
      method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(data.error || `Erreur ${r.status}`); return false }
    mutate()
    return true
  }

  return (
    <section style={{ marginTop: 48, display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <div>
        <div style={{ ...microLabel, marginBottom: 10 }}>export</div>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>
          Une ligne par heure imputée, à plat — pour le tableur ou l'outil de rentabilité.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={du} onChange={e => setDu(e.target.value)} style={champ} aria-label="Du" />
          <span style={{ color: C.muted }}>→</span>
          <input type="date" value={au} onChange={e => setAu(e.target.value)} style={champ} aria-label="Au" />
          <select value={qui} onChange={e => setQui(e.target.value)} style={champ} aria-label="Personne">
            <option value="">toute l'équipe</option>
            {personnes.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <a href={`/api/heures/export?${params}`}
            style={{ padding: '8px 18px', borderRadius: R.pill, background: AL.black, color: AL.white,
              font: `500 13px ${FONT}`, textDecoration: 'none' }}>
            télécharger le CSV
          </a>
          <a href={`/api/heures/export?${params}&format=json`} target="_blank" rel="noopener"
            style={{ ...lien, alignSelf: 'center', textDecoration: 'none' }}>
            voir en JSON
          </a>
        </div>
      </div>

      <div>
        <div style={{ ...microLabel, marginBottom: 10 }}>activités</div>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>
          Un code ne change jamais et n'est jamais repris : une feuille scannée doit garder son sens des années
          plus tard. Une activité qui ne sert plus se désactive.
        </p>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden' }}>
          {activites.map(a => (
            <div key={a.code} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 90px auto', gap: 10,
              alignItems: 'baseline', padding: '8px 14px', borderTop: `1px solid ${C.border}`, fontSize: 13,
              color: a.actif ? AL.black : C.muted }}>
              <span style={{ fontFamily: MONO }}>{a.code}</span>
              <span style={{ textDecoration: a.actif ? 'none' : 'line-through' }}>{a.libelle}</span>
              <span style={{ color: C.muted, fontSize: 12 }}>{LIBELLES_FAMILLE[a.famille] || a.famille}</span>
              <button style={lien} onClick={() => envoyer('PATCH', { code: a.code, actif: !a.actif })}>
                {a.actif ? 'désactiver' : 'réactiver'}
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={async e => { e.preventDefault(); if (await envoyer('POST', { ...nouvelle, code: Number(nouvelle.code) })) setNouvelle({ code: '', libelle: '', famille: nouvelle.famille }) }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input type="number" min={1} max={99} required placeholder="n°" value={nouvelle.code}
            onChange={e => setNouvelle(n => ({ ...n, code: e.target.value }))} style={{ ...champ, width: 70, fontFamily: MONO }} />
          <input required placeholder="libellé" value={nouvelle.libelle} maxLength={60}
            onChange={e => setNouvelle(n => ({ ...n, libelle: e.target.value }))} style={{ ...champ, flex: '1 1 140px', minWidth: 0 }} />
          <select value={nouvelle.famille} onChange={e => setNouvelle(n => ({ ...n, famille: e.target.value }))} style={champ}>
            {FAMILLES.map(f => <option key={f} value={f}>{LIBELLES_FAMILLE[f]}</option>)}
          </select>
          <button type="submit" style={{ ...lien, color: AL.black }}>+ ajouter</button>
        </form>
        {erreur && <p style={{ margin: '8px 0 0', fontSize: 13, color: C.danger }}>{erreur}</p>}
      </div>
    </section>
  )
}
