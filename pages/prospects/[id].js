// Fiche prospect.
//
// Le journal occupe la colonne principale : c'est le cœur du démarchage, et ce
// qu'on vient lire en premier avant de décrocher son téléphone. La colonne de
// droite tient ce qu'on consulte sans lire — prochaine relance, personnes,
// coordonnées, provenance.
import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import useSWR from 'swr'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import NavBar from '../../components/NavBar'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import { dateDuJour } from '../../lib/aujourdhui'
import {
  ETAPES, CANAUX, SOURCES, etape, canal, source,
  prochaineRelance, retardJours, enRetard,
} from '../../lib/prospects'

const fmtJour = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}.${m}` : '' }
const fmtLong = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}.${m}.${y}` : '—' }

export default function FicheProspect() {
  const router = useRouter()
  const { id } = router.query
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const { data: p, isLoading, mutate } = useSWR(isAdmin && id ? `/api/prospects/${id}` : null)
  const [saisie, setSaisie] = useState(false)
  const [message, setMessage] = useState('')

  if (user && !isAdmin) { router.replace('/'); return null }

  async function appeler(url, options) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMessage(d.error || `Erreur ${r.status}`); return null }
    await mutate()
    return d
  }

  const patch = champs => appeler(`/api/prospects/${id}`, { method: 'PATCH', body: JSON.stringify(champs) })

  async function convertir() {
    if (!confirm(`Convertir « ${p.name} » en client ?\n\nUne société sera créée dans les contacts avec ses personnes. Le prospect sort de la liste, son journal reste consultable.`)) return
    const d = await appeler(`/api/prospects/${id}/convert`, { method: 'POST' })
    if (d?.contact_id) router.push(`/clients/${d.contact_id}`)
  }

  if (isLoading || !p) {
    return (
      <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT }}>
        <NavBar title="Prospect" />
        <main style={{ padding: 40 }}><p style={{ fontSize: 13, color: C.muted }}>Chargement…</p></main>
      </div>
    )
  }

  const echanges = [...(p.prospect_interactions || [])]
    .sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)))
  const relance = prochaineRelance(echanges)
  const retard = relance && enRetard(relance.follow_up_on)
  const e = etape(p.stage)
  const src = source(p.source)

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>{p.name} — Prospect</title></Head>
      <NavBar title="Prospect">
        <button onClick={convertir}
          style={{ padding: '8px 16px', borderRadius: R.pill, background: 'none', cursor: 'pointer',
            border: `1.5px solid ${C.success}`, color: C.success, font: `500 13px ${FONT}` }}>
          Convertir en client
        </button>
      </NavBar>

      <main style={{ padding: '32px 40px 104px', maxWidth: 1400, margin: '0 auto' }}>
        <Link href="/prospects" style={{ fontSize: 12.5, color: C.muted, textDecoration: 'none' }}>← tous les prospects</Link>

        {message && (
          <div style={{ margin: '14px 0 0', padding: '10px 16px', borderRadius: R.pill,
            background: C.dangerBg, color: C.danger, fontSize: 13 }}>
            {message} <button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer' }}>✕</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, margin: '14px 0 22px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <ChampTitre valeur={p.name} onValider={v => patch({ name: v })} />
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
              {[p.city, p.sector].filter(Boolean).join(' · ') || 'ville et secteur à compléter'}
            </div>
          </div>
          <select value={p.stage} onChange={ev => patch({ stage: ev.target.value })}
            style={{ padding: '7px 14px', borderRadius: R.pill, border: 'none', cursor: 'pointer',
              font: `500 12.5px ${FONT}`, color: e.fg, background: e.bg, outline: 'none' }}>
            {ETAPES.map(x => <option key={x.cle} value={x.cle}>{x.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 28, alignItems: 'start' }}>
          {/* ── Journal ── */}
          <div style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ margin: 0, font: `500 15px ${FONT}` }}>Journal des échanges</h3>
              <button onClick={() => setSaisie(v => !v)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  font: `500 12px ${FONT}`, color: C.violet }}>
                {saisie ? 'annuler' : '+ noter un échange'}
              </button>
            </div>

            {saisie && (
              <FormulaireEchange
                personnes={p.prospect_people || []}
                onAnnuler={() => setSaisie(false)}
                onEnregistrer={async corps => {
                  const ok = await appeler(`/api/prospects/${id}/interactions`, { method: 'POST', body: JSON.stringify(corps) })
                  if (ok) setSaisie(false)
                }} />
            )}

            <div style={{ padding: '4px 18px 14px' }}>
              {echanges.length === 0 && !saisie && (
                <p style={{ fontSize: 13, color: C.muted, padding: '18px 0' }}>
                  Aucun échange noté. Le premier contact se note ici — canal, interlocuteur, et quand relancer.
                </p>
              )}
              {echanges.map(x => (
                <Echange key={x.id} echange={x} personnes={p.prospect_people || []}
                  onBasculerRelance={() => appeler(`/api/prospects/${id}/interactions?iid=${x.id}`,
                    { method: 'PATCH', body: JSON.stringify({ follow_up_done: !x.follow_up_done }) })}
                  onSupprimer={() => confirm('Supprimer cet échange ?') &&
                    appeler(`/api/prospects/${id}/interactions?iid=${x.id}`, { method: 'DELETE' })} />
              ))}
            </div>
          </div>

          {/* ── Colonne de droite ── */}
          <div>
            {relance ? (
              <div style={{ borderRadius: R.panel, padding: '16px 18px',
                border: `1.5px solid ${retard ? C.danger : C.outline}`,
                background: retard ? C.dangerBg : C.surface }}>
                <div style={{ font: `500 10.5px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase',
                  color: retard ? C.danger : C.muted, marginBottom: 5 }}>Prochaine relance</div>
                <div style={{ font: `500 19px ${FONT}`, color: retard ? C.danger : AL.black }}>
                  {fmtLong(relance.follow_up_on)}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 3, color: retard ? C.danger : C.muted, opacity: retard ? .85 : 1 }}>
                  {retard ? `En retard de ${retardJours(relance.follow_up_on)} jour(s)` : 'À venir'}
                  {' · '}{canal(relance.channel).label.toLowerCase()} du {fmtJour(relance.occurred_on)}
                </div>
              </div>
            ) : (
              <div style={{ borderRadius: R.panel, padding: '16px 18px', border: `1px solid ${C.border}` }}>
                <div style={{ font: `500 10.5px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 5 }}>
                  Prochaine relance
                </div>
                <div style={{ fontSize: 13, color: C.muted }}>Aucune prévue — elle se pose en notant un échange.</div>
              </div>
            )}

            <Panneau titre="Personnes">
              {(p.prospect_people || []).map(x => (
                <Personne key={x.id} personne={x}
                  onSupprimer={() => confirm(`Retirer ${x.name} ?`) &&
                    appeler(`/api/prospects/${id}/people?pid=${x.id}`, { method: 'DELETE' })} />
              ))}
              <AjoutPersonne onAjouter={corps => appeler(`/api/prospects/${id}/people`, { method: 'POST', body: JSON.stringify(corps) })} />
            </Panneau>

            <Panneau titre="Coordonnées">
              {[['Adresse', 'street'], ['NPA', 'zip'], ['Ville', 'city'], ['Téléphone', 'phone'],
                ['Site', 'website'], ['Secteur', 'sector'], ['Suivi par', 'owner']].map(([label, cle]) => (
                <LigneEditable key={cle} label={label} valeur={p[cle]} onValider={v => patch({ [cle]: v })} />
              ))}
            </Panneau>

            <Panneau titre="D'où vient ce prospect">
              <select value={p.source || ''} onChange={ev => patch({ source: ev.target.value || null })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
                  font: `14px ${FONT}`, outline: 'none', background: C.surface }}>
                <option value="">— non renseignée —</option>
                {SOURCES.map(s => <option key={s.cle} value={s.cle}>{s.label}</option>)}
              </select>
              {src && (
                <LigneEditable label={src.demandeDetail ? `Précision (${src.exemple})` : 'Précision'}
                  valeur={p.source_detail} onValider={v => patch({ source_detail: v })} />
              )}
              {src?.demandeDetail && !p.source_detail && (
                <p style={{ fontSize: 12, color: C.warning, marginTop: 8 }}>
                  Sans la précision, cette source ne servira à rien le jour où tu rappelleras.
                </p>
              )}
            </Panneau>

            {p.stage === 'perdu' && (
              <Panneau titre="Pourquoi perdu">
                <LigneEditable label="Raison" valeur={p.lost_reason} onValider={v => patch({ lost_reason: v })} />
              </Panneau>
            )}

            <Panneau titre="Notes">
              <ZoneNotes valeur={p.notes} onValider={v => patch({ notes: v })} />
            </Panneau>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function Panneau({ titre, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '16px 18px', marginTop: 18 }}>
      <h4 style={{ margin: '0 0 12px', font: `500 10.5px ${MONO}`, letterSpacing: '.1em',
        textTransform: 'uppercase', color: C.muted }}>{titre}</h4>
      {children}
    </div>
  )
}

function Echange({ echange: x, personnes, onBasculerRelance, onSupprimer }) {
  const c = canal(x.channel)
  const qui = personnes.find(p => String(p.id) === String(x.person_id))
  const retard = x.follow_up_on && !x.follow_up_done && enRetard(x.follow_up_on)
  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: `1px solid ${C.border}` }} className="group">
      <div style={{ width: 52, flex: 'none', font: `12px ${MONO}`, color: C.muted, paddingTop: 1 }}>
        {fmtJour(x.occurred_on)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: R.pill, background: c.couleur, flex: 'none' }} />
          <b style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</b>
          <span style={{ fontSize: 12, color: C.muted }}>{x.direction === 'entrant' ? '· reçu' : ''}</span>
        </span>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
          {[qui && `avec ${qui.name}`, x.author && `par ${x.author}`].filter(Boolean).join(' · ')}
        </div>
        {x.notes && <div style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 5 }}>{x.notes}</div>}
        {x.follow_up_on && (
          <button onClick={onBasculerRelance}
            title={x.follow_up_done ? 'Relance faite — cliquer pour la rouvrir' : 'Marquer cette relance comme faite'}
            style={{ display: 'inline-block', marginTop: 7, padding: '3px 10px', borderRadius: R.pill,
              border: 'none', cursor: 'pointer', font: `500 11.5px ${FONT}`,
              ...(x.follow_up_done
                ? { background: C.neutralBg, color: C.muted, textDecoration: 'line-through' }
                : retard ? { background: C.dangerBg, color: C.danger } : { background: C.warningBg, color: C.warning }) }}>
            Relance {x.follow_up_done ? 'faite' : 'prévue'} le {fmtJour(x.follow_up_on)}
            {!x.follow_up_done && retard && ` — en retard de ${retardJours(x.follow_up_on)} j`}
          </button>
        )}
      </div>
      <button onClick={onSupprimer} title="Supprimer cet échange"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 13, flex: 'none' }}>✕</button>
    </div>
  )
}

// Le canal est en premier et en gros : c'est la question à laquelle ce
// formulaire existe pour répondre.
function FormulaireEchange({ personnes, onAnnuler, onEnregistrer }) {
  const [f, setF] = useState({
    channel: 'telephone', direction: 'sortant', occurred_on: dateDuJour(),
    person_id: '', notes: '', follow_up_on: '',
  })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const champ = { padding: '8px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
    font: `13.5px ${FONT}`, outline: 'none', background: C.surface, width: '100%' }

  return (
    <div style={{ padding: '16px 18px', background: C.hover, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {CANAUX.map(c => (
          <button key={c.cle} onClick={() => set('channel', c.cle)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: R.pill, border: 'none', cursor: 'pointer', font: `500 12.5px ${FONT}`,
              ...(f.channel === c.cle ? { background: AL.black, color: AL.white } : { background: C.surface, color: C.muted }) }}>
            <span style={{ width: 7, height: 7, borderRadius: R.pill, background: f.channel === c.cle ? AL.white : c.couleur }} />
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 11.5, color: C.muted }}>Date
          <input type="date" value={f.occurred_on} onChange={ev => set('occurred_on', ev.target.value)} style={champ} />
        </label>
        <label style={{ fontSize: 11.5, color: C.muted }}>Interlocuteur
          <select value={f.person_id} onChange={ev => set('person_id', ev.target.value)} style={champ}>
            <option value="">—</option>
            {personnes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: C.muted }}>Sens
          <select value={f.direction} onChange={ev => set('direction', ev.target.value)} style={champ}>
            <option value="sortant">J'ai contacté</option>
            <option value="entrant">Ils m'ont contacté</option>
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: C.muted }}>Relancer le
          <input type="date" value={f.follow_up_on} onChange={ev => set('follow_up_on', ev.target.value)} style={champ} />
        </label>
      </div>

      <textarea rows={3} value={f.notes} onChange={ev => set('notes', ev.target.value)}
        placeholder="Ce qui s'est dit, ce qu'il faut retenir pour la prochaine fois…"
        style={{ ...champ, resize: 'vertical' }} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
        <button onClick={onAnnuler} style={{ background: 'none', border: 'none', cursor: 'pointer', font: `13px ${FONT}`, color: C.muted }}>annuler</button>
        <button onClick={() => onEnregistrer({ ...f, person_id: f.person_id || null, follow_up_on: f.follow_up_on || null })}
          style={{ padding: '8px 16px', borderRadius: R.pill, background: AL.black, color: AL.white,
            border: 'none', font: `500 13px ${FONT}`, cursor: 'pointer' }}>
          Noter l'échange
        </button>
      </div>
    </div>
  )
}

function Personne({ personne: x, onSupprimer }) {
  const initiales = String(x.name || '').split(/\s+/).map(m => m[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ width: 28, height: 28, borderRadius: R.pill, background: AL.black, color: AL.white, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', font: `500 10px ${FONT}` }}>{initiales || '?'}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{x.name}</div>
        <div style={{ fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[x.role, x.email, x.phone].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <button onClick={onSupprimer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 12 }}>✕</button>
    </div>
  )
}

function AjoutPersonne({ onAjouter }) {
  const [ouvert, setOuvert] = useState(false)
  const [f, setF] = useState({ name: '', role: '', email: '', phone: '' })
  const champ = { width: '100%', padding: '7px 11px', borderRadius: R.panel, border: `1px solid ${C.border}`,
    font: `13px ${FONT}`, outline: 'none', marginTop: 6 }
  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)}
        style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', font: `500 12px ${FONT}`, color: C.violet }}>
        + ajouter une personne
      </button>
    )
  }
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
      {[['name', 'Nom'], ['role', 'Fonction'], ['email', 'E-mail'], ['phone', 'Téléphone']].map(([k, ph]) => (
        <input key={k} value={f[k]} placeholder={ph} style={champ}
          onChange={ev => setF(x => ({ ...x, [k]: ev.target.value }))} />
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
        <button onClick={() => { setOuvert(false); setF({ name: '', role: '', email: '', phone: '' }) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', font: `12.5px ${FONT}`, color: C.muted }}>annuler</button>
        <button disabled={!f.name.trim()}
          onClick={async () => { await onAjouter(f); setOuvert(false); setF({ name: '', role: '', email: '', phone: '' }) }}
          style={{ padding: '6px 13px', borderRadius: R.pill, background: AL.black, color: AL.white,
            border: 'none', font: `500 12.5px ${FONT}`, cursor: 'pointer', opacity: f.name.trim() ? 1 : .4 }}>
          Ajouter
        </button>
      </div>
    </div>
  )
}

// Édition sur place : on clique, on tape, on quitte le champ. Un formulaire
// modal pour changer une ville serait disproportionné.
function LigneEditable({ label, valeur, onValider }) {
  const [v, setV] = useState(null)
  const courant = v ?? (valeur || '')
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: C.muted, flex: 'none' }}>{label}</span>
      <input value={courant} onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== null && v !== (valeur || '')) onValider(v); setV(null) }}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="—"
        style={{ flex: 1, minWidth: 0, textAlign: 'right', border: 'none', background: 'none',
          font: `13px ${FONT}`, color: AL.black, outline: 'none' }} />
    </div>
  )
}

function ZoneNotes({ valeur, onValider }) {
  const [v, setV] = useState(null)
  return (
    <textarea rows={4} value={v ?? (valeur || '')} onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== null && v !== (valeur || '')) onValider(v); setV(null) }}
      placeholder="Contexte, historique, ce qu'il ne faut pas oublier…"
      style={{ width: '100%', padding: '9px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
        font: `13px ${FONT}`, outline: 'none', resize: 'vertical', lineHeight: 1.45 }} />
  )
}

function ChampTitre({ valeur, onValider }) {
  const [v, setV] = useState(null)
  return (
    <input value={v ?? (valeur || '')} onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== null && v.trim() && v !== valeur) onValider(v.trim()); setV(null) }}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      style={{ width: '100%', border: 'none', background: 'none', outline: 'none',
        font: `500 28px ${FONT}`, letterSpacing: '-.02em', color: AL.black, padding: 0 }} />
  )
}
