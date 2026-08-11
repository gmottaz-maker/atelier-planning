// Sélecteur de peintures et vernis RUCO — aide au choix rapide.
//
// Outil autonome : aucun lien avec le catalogue ni les devis. Les données
// viennent de /public/ruco/products.json, extrait du shop ruco.ch et normalisé
// hors ligne (voir ~/ruco-selector). Pour rafraîchir le catalogue :
//   cd ~/ruco-selector && python3 scrape_ruco.py --refresh \
//     && python3 normalize_ruco.py && python3 export_to_maze.py
//
// Le fetch est volontairement fait à la main plutôt qu'avec SWR : le cache SWR
// de l'app est persisté en localStorage, et ce jeu de données (~1 Mo) y ferait
// sauter le quota, ce qui casserait silencieusement le cache de toutes les
// autres pages.
import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { C, FONT, MONO } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'

const DATA_URL = '/ruco/products.json'
const IMG_BASE = '/ruco/img/'
const MAX_RESULTS = 60

// Paliers du curseur « recouvrable en ». null = pas de contrainte.
const TIMES = [
  { v: 60, l: '1 h' }, { v: 120, l: '2 h' }, { v: 240, l: '4 h' },
  { v: 480, l: '8 h' }, { v: 600, l: '10 h' }, { v: 1440, l: '24 h' },
  { v: 4320, l: '3 jours' }, { v: null, l: 'peu importe' },
]

// Poids de chaque critère dans le score final.
const W = { sub: 30, env: 14, gloss: 22, app: 18, time: 14, med: 10, comp: 5 }

// Ordre métier : on parcourt un système du fond vers la finition.
const FAM_ORDER = ['fond', 'finition', 'vernis', 'bois', 'interieur', 'facade',
  'sol', 'effet', 'diluant', 'additif', 'pigment']
const famRank = g => { const i = FAM_ORDER.indexOf(g); return i < 0 ? 99 : i }

const MEDIA = [
  { k: 'eau', l: 'Hydrodiluable' },
  { k: 'solvant', l: 'Solvanté' },
  { k: 'sans_solvant', l: 'Sans solvant' },
]
const COMPS = [{ k: '1', l: '1 composant' }, { k: '2', l: '2 composants' }]

function fmtMin(min) {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${(Math.round(min / 6) / 10).toString().replace('.0', '')} h`
  return `${Math.round(min / 1440)} j`
}

// Délai retenu : borne haute de la plage annoncée (engagement prudent), avec
// repli sur le sec au toucher puis le hors-poussière si RUCO ne donne pas de
// délai de recouvrement.
function recoatMinutes(p) {
  const d = p.drying || {}
  const pick = d.recoat || d.touch || d.dust
  return pick ? pick[1] : null
}

export default function Peintures() {
  const isMobile = useIsMobile()
  const [db, setDb] = useState(null)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [open, setOpen] = useState(null)          // id du produit déplié

  const [q, setQ] = useState('')
  const [sub, setSub] = useState([])
  const [env, setEnv] = useState([])
  const [fam, setFam] = useState([])
  const [gloss, setGloss] = useState([])
  const [app, setApp] = useState([])
  const [med, setMed] = useState([])
  const [comp, setComp] = useState([])
  const [timeIdx, setTimeIdx] = useState(TIMES.length - 1)
  const [strict, setStrict] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(DATA_URL)
      .then(r => { if (!r.ok) throw new Error(`Chargement impossible (${r.status})`); return r.json() })
      .then(d => { if (!cancelled) setDb(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const meta = db?.meta
  const time = TIMES[timeIdx].v

  const L = useMemo(() => meta ? {
    sub: Object.fromEntries(meta.substrates.map(s => [s.key, s.label])),
    app: Object.fromEntries(meta.applications.map(a => [a.key, a.label])),
    env: Object.fromEntries(meta.environments.map(e => [e.key, e.label])),
    gloss: Object.fromEntries(meta.gloss.map(g => [g.key, g.label])),
    med: Object.fromEntries(MEDIA.map(m => [m.k, m.l])),
    rank: Object.fromEntries(meta.gloss.map(g => [g.key, g.rank])),
  } : null, [meta])

  const families = useMemo(() => {
    if (!db) return []
    const m = new Map(db.products.map(p => [p.familyGroup, p.family]))
    return [...m.entries()].map(([k, l]) => ({ k, l })).sort((a, b) => famRank(a.k) - famRank(b.k))
  }, [db])

  const hasCriteria = sub.length || env.length || gloss.length || app.length ||
    med.length || comp.length || time !== null
  const criteriaCount = sub.length + env.length + fam.length + gloss.length +
    app.length + med.length + comp.length + (time !== null ? 1 : 0)

  const results = useMemo(() => {
    if (!db || !L) return []

    const glossFit = (want, has) => {          // 1 = exact, .55 = voisin, .2 = à 2 crans
      let best = 0
      for (const w of want) for (const h of has) {
        const d = Math.abs(L.rank[w] - L.rank[h])
        best = Math.max(best, d === 0 ? 1 : d === 1 ? 0.55 : d === 2 ? 0.2 : 0)
      }
      return best
    }

    // Un critère non documenté par RUCO donne un crédit partiel et un badge
    // orange : on signale le trou plutôt que d'écarter le produit à tort.
    function score(p) {
      let got = 0, max = 0
      const why = []
      const add = (w, fit, ok, miss, unknown) => {
        max += w; got += w * fit
        if (fit >= 0.999) why.push(['hit', ok])
        else if (unknown) why.push(['soft', miss])
        else if (fit > 0) why.push(['soft', ok])
        else why.push(['miss', miss])
      }
      if (sub.length) {
        const hits = sub.filter(k => p.substrates.includes(k))
        if (!p.substrates.length) add(W.sub, 0.45, '', 'support non documenté', true)
        else add(W.sub, hits.length / sub.length,
          hits.map(k => L.sub[k]).join(' + '), 'support non couvert')
      }
      if (env.length) {
        const hits = env.filter(k => p.environments.includes(k))
        if (!p.environments.length) add(W.env, 0.45, '', 'int./ext. non précisé', true)
        else add(W.env, hits.length / env.length, hits.map(k => L.env[k]).join(' + '),
          p.environments.map(k => L.env[k]).join(' + ') + ' seulement')
      }
      if (gloss.length) {
        if (!p.gloss.length) add(W.gloss, 0.35, '', 'brillance non documentée', true)
        else add(W.gloss, glossFit(gloss, p.gloss), p.gloss.map(k => L.gloss[k]).join(' / '),
          'brillance ' + p.gloss.map(k => L.gloss[k]).join('/'))
      }
      if (app.length) {
        const hits = app.filter(k => p.applications.includes(k))
        if (!p.applications.length) add(W.app, 0.4, '', 'application non documentée', true)
        else add(W.app, hits.length ? 1 : 0, hits.map(k => L.app[k]).join(' + '),
          'pas en ' + app.map(k => L.app[k]).join('/'))
      }
      if (time !== null) {
        const r = recoatMinutes(p)
        if (r === null) add(W.time, 0.4, '', 'séchage non documenté', true)
        else add(W.time, r <= time ? 1 : r <= time * 1.5 ? 0.4 : 0,
          'recouvrable ' + fmtMin(r), 'recouvrable ' + fmtMin(r))
      }
      if (med.length) {
        if (!p.medium) add(W.med, 0.4, '', 'base non documentée', true)
        else add(W.med, med.includes(p.medium) ? 1 : 0, L.med[p.medium], L.med[p.medium])
      }
      if (comp.length) {
        if (!p.components) add(W.comp, 0.4, '', 'nb. composants inconnu', true)
        else add(W.comp, comp.includes(String(p.components)) ? 1 : 0,
          `${p.components}K`, `${p.components}K`)
      }
      return { pct: max ? Math.round(got / max * 100) : null, why }
    }

    function passesStrict(p) {
      if (!strict) return true
      if (sub.length && (!p.substrates.length || !sub.every(k => p.substrates.includes(k)))) return false
      if (env.length && (!p.environments.length || !env.some(k => p.environments.includes(k)))) return false
      if (app.length && (!p.applications.length || !app.some(k => p.applications.includes(k)))) return false
      if (med.length && (!p.medium || !med.includes(p.medium))) return false
      if (comp.length && (!p.components || !comp.includes(String(p.components)))) return false
      if (gloss.length && (!p.gloss.length || glossFit(gloss, p.gloss) < 1)) return false
      if (time !== null) { const r = recoatMinutes(p); if (r === null || r > time) return false }
      return true
    }

    const needle = q.trim().toLowerCase()
    const words = needle ? needle.split(/\s+/) : []
    let list = db.products.filter(p => {
      if (fam.length && !fam.includes(p.familyGroup)) return false
      if (!words.length) return true
      const hay = [p.name, p.family, p.subfamily, p.definition, p.usage, p.binder,
        p.tints, (p.claims || []).join(' ')].join(' ').toLowerCase()
      return words.every(w => hay.includes(w))
    }).filter(passesStrict)

    const scored = list.map(p => ({ p, ...score(p) }))
    if (hasCriteria) {
      scored.sort((a, b) => b.pct - a.pct || a.p.name.localeCompare(b.p.name))
    } else {
      scored.sort((a, b) => famRank(a.p.familyGroup) - famRank(b.p.familyGroup) ||
        a.p.name.localeCompare(b.p.name))
    }
    return scored
  }, [db, L, q, sub, env, fam, gloss, app, med, comp, time, strict, hasCriteria])

  function reset() {
    setSub([]); setEnv([]); setFam([]); setGloss([]); setApp([]); setMed([]); setComp([])
    setTimeIdx(TIMES.length - 1); setStrict(false); setQ(''); setOpen(null)
  }

  // ── styles partagés ────────────────────────────────────────────────────
  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }
  const legend = {
    font: `700 10px ${MONO}`, letterSpacing: '.12em', color: C.inkTertiary,
    textTransform: 'uppercase', marginBottom: 6,
  }
  // Puces de critère : toutes le même gabarit, quelle que soit la longueur du
  // texte — la grille donne la largeur, la hauteur est fixe.
  const chipStyle = on => ({
    border: `1px solid ${on ? C.ink : C.border}`, background: on ? C.ink : C.surface,
    color: on ? '#fff' : C.inkSecondary, borderRadius: 99, padding: '0 10px',
    fontFamily: FONT, fontSize: 12, fontWeight: on ? 600 : 400, lineHeight: 1.15,
    cursor: 'pointer',
    // Hauteur fixe + largeur de la grille : gabarit identique pour toutes. Les
    // libellés longs passent sur deux lignes au lieu d'être tronqués.
    height: 38, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', overflow: 'hidden',
  })
  const badgeStyle = kind => ({
    font: `${kind === 'hit' ? 600 : 400} 11px ${FONT}`, padding: '2px 7px', borderRadius: 99,
    background: kind === 'hit' ? C.successBg : kind === 'miss' ? C.dangerBg : C.warningBg,
    color: kind === 'hit' ? C.success : kind === 'miss' ? C.danger : C.warning,
  })

  const Chips = ({ items, value, onChange }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
      {items.map(it => {
        const on = value.includes(it.k)
        return (
          <button key={it.k} type="button" aria-pressed={on} style={chipStyle(on)} title={it.l}
            onClick={() => onChange(on ? value.filter(x => x !== it.k) : [...value, it.k])}>
            {it.l}
          </button>
        )
      })}
    </div>
  )

  // ── états de chargement ────────────────────────────────────────────────
  if (error) {
    return (
      <Shell>
        <div style={{ ...card, padding: 20, color: C.danger, font: `13px ${FONT}` }}>
          {error} — vérifiez que <code>public/ruco/products.json</code> est bien déployé.
        </div>
      </Shell>
    )
  }
  if (!db) {
    return <Shell><div style={{ ...card, padding: 20, color: C.muted, font: `13px ${FONT}` }}>Chargement du catalogue…</div></Shell>
  }

  const shown = results.slice(0, MAX_RESULTS)

  const filtersPanel = (
    <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><div style={legend}>Support à peindre</div>
        <Chips items={meta.substrates.map(s => ({ k: s.key, l: s.label }))} value={sub} onChange={setSub} /></div>
      <div><div style={legend}>Situation</div>
        <Chips items={meta.environments.map(e => ({ k: e.key, l: e.label }))} value={env} onChange={setEnv} /></div>
      <div><div style={legend}>Rôle dans le système</div>
        <Chips items={families} value={fam} onChange={setFam} /></div>
      <div><div style={legend}>Brillance visée</div>
        <Chips items={meta.gloss.map(g => ({ k: g.key, l: g.label }))} value={gloss} onChange={setGloss} /></div>
      <div><div style={legend}>Mode d'application</div>
        <Chips items={meta.applications.map(a => ({ k: a.key, l: a.label }))} value={app} onChange={setApp} /></div>
      <div>
        <div style={{ ...legend, marginBottom: 2 }}>Délai avant recouvrement</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', font: `12px ${FONT}`, color: C.muted, marginBottom: 4 }}>
          <span>Recouvrable en</span><b style={{ color: C.ink, font: `600 12px ${MONO}` }}>{TIMES[timeIdx].l}</b>
        </div>
        <input type="range" min={0} max={TIMES.length - 1} step={1} value={timeIdx}
          onChange={e => setTimeIdx(+e.target.value)}
          style={{ width: '100%', accentColor: C.ink }} />
      </div>
      <div><div style={legend}>Base</div><Chips items={MEDIA} value={med} onChange={setMed} /></div>
      <div><div style={legend}>Composants</div><Chips items={COMPS} value={comp} onChange={setComp} /></div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={reset}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.inkSecondary, font: `13px ${FONT}`, cursor: 'pointer' }}>
          Réinitialiser
        </button>
        <button type="button" aria-pressed={strict} onClick={() => setStrict(s => !s)}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', font: `${strict ? 600 : 400} 13px ${FONT}`, border: `1px solid ${strict ? C.ink : C.border}`, background: strict ? C.ink : C.surface, color: strict ? '#fff' : C.inkSecondary }}>
          {strict ? 'Strict ✓' : 'Filtrer strict'}
        </button>
      </div>
    </div>
  )

  return (
    <Shell
      right={
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
          style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, font: `13px ${FONT}`, background: C.surface, minWidth: isMobile ? 140 : 220 }} />
      }
      count={`${db.meta.count} produits · ${db.meta.skuCount} réf.`}
    >
      {isMobile && (
        <button type="button" onClick={() => setShowFilters(s => !s)}
          style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.ink, font: `600 13px ${FONT}`, cursor: 'pointer', alignSelf: 'flex-start' }}>
          {showFilters ? 'Masquer les critères' : 'Critères'}{hasCriteria ? ' •' : ''}
        </button>
      )}

      {/* Colonne des critères : elle suit la largeur de l'écran (bornée) au lieu
          d'être figée, sinon les puces s'y empilent et la colonne paraît étriquée
          à côté des résultats. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'clamp(320px, 28%, 440px) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* Les deux colonnes ont la même structure — une ligne d'en-tête puis le
            contenu — pour que leurs cartes démarrent exactement à la même hauteur. */}
        {(!isMobile || showFilters) && (
          <div style={isMobile ? undefined : { position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!isMobile && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ font: `600 13px ${FONT}` }}>Critères</span>
                <span style={{ font: `11px ${MONO}`, color: C.muted }}>
                  {criteriaCount > 0 ? `${criteriaCount} actif${criteriaCount > 1 ? 's' : ''}` : 'aucun'}
                </span>
              </div>
            )}
            {filtersPanel}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ font: `600 13px ${FONT}` }}>
              {hasCriteria && results.length > shown.length
                ? `${shown.length} meilleurs résultats sur ${results.length}`
                : `${results.length} produit${results.length > 1 ? 's' : ''}`}
              {hasCriteria ? ' — classés par pertinence' : ''}
            </span>
            <span style={{ font: `11px ${MONO}`, color: C.muted }}>
              {hasCriteria
                ? (strict ? 'Strict : uniquement les produits documentés et conformes'
                  : 'Critères non documentés signalés en orange')
                : 'Choisissez vos critères'}
            </span>
          </div>

          {!shown.length && (
            <div style={{ ...card, padding: 28, textAlign: 'center', color: C.muted, font: `13px ${FONT}` }}>
              Aucun produit ne correspond.<br />Élargissez un critère ou désactivez le filtrage strict.
            </div>
          )}

          {shown.map((s, i) => {
            const p = s.p
            const isOpen = open === p.id
            const top = i === 0 && hasCriteria && s.pct >= 70
            const badges = hasCriteria
              ? s.why.filter(w => w[1]).map((w, j) => <span key={j} style={badgeStyle(w[0])}>{w[1]}</span>)
              : [p.medium ? L.med[p.medium] : null, p.components ? `${p.components}K` : null,
              p.gloss.map(g => L.gloss[g]).join('/') || null]
                .filter(Boolean).map((t, j) => (
                  <span key={j} style={{ font: `11px ${FONT}`, padding: '2px 7px', borderRadius: 99, background: C.divider, color: C.inkSecondary }}>{t}</span>
                ))

            return (
              <article key={p.id} style={{ ...card, borderColor: top ? C.ink : C.border, overflow: 'hidden' }}>
                <div role="button" tabIndex={0} onClick={() => setOpen(isOpen ? null : p.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : p.id) } }}
                  style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', gap: 12, padding: 12, cursor: 'pointer', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: 48, height: 48 }}>
                    {p.imageFile ? (
                      <>
                        {/* fond blanc : les photos RUCO sont détourées sur blanc */}
                        <img src={IMG_BASE + p.imageFile} alt="" loading="lazy" width={48} height={48}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6, background: '#fff', border: `1px solid ${C.border}`, display: 'block' }} />
                        <span style={{ position: 'absolute', left: -5, top: -5, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 99, display: 'grid', placeItems: 'center', font: `700 10px ${MONO}`, background: top ? C.ink : C.surface, color: top ? '#fff' : C.muted, border: `1px solid ${top ? C.ink : C.border}` }}>{i + 1}</span>
                      </>
                    ) : (
                      <div style={{ width: '100%', height: '100%', borderRadius: 6, display: 'grid', placeItems: 'center', background: top ? C.ink : C.pageBg, color: top ? '#fff' : C.muted, border: `1px solid ${top ? C.ink : C.border}`, font: `700 15px ${MONO}` }}>{i + 1}</div>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: `600 14px ${FONT}`, color: C.ink }}>{p.name}</div>
                    <div style={{ font: `12px ${FONT}`, color: C.muted, marginTop: 1 }}>
                      {p.family}{p.subfamily ? ` · ${p.subfamily}` : ''}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{badges}</div>
                  </div>

                  {s.pct !== null && (
                    <div style={{ textAlign: 'right', minWidth: 58 }}>
                      <div style={{ font: `700 17px ${MONO}`, color: C.ink }}>{s.pct}</div>
                      <div style={{ font: `9px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>MATCH</div>
                      <div style={{ height: 3, background: C.divider, borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${s.pct}%`, height: '100%', background: top ? C.ink : C.accent }} />
                      </div>
                    </div>
                  )}
                </div>

                {isOpen && <Detail p={p} />}
              </article>
            )
          })}
        </div>
      </div>
    </Shell>
  )
}

// ── détail produit ────────────────────────────────────────────────────────
function Detail({ p }) {
  const h4 = { font: `700 10px ${MONO}`, letterSpacing: '.1em', color: C.muted, textTransform: 'uppercase', margin: '12px 0 3px' }
  const txt = { font: `13px ${FONT}`, color: C.inkTertiary, margin: 0, whiteSpace: 'pre-line' }
  const rows = [
    ['Liant', p.binder], ['Brillance', p.glossRaw], ['Supports', p.substratesRaw],
    ['Teintes', p.tints], ['Séchage', p.dryingRaw], ['Recouvrable', p.recoatRaw],
    ['Dilution / application', p.applicationRaw], ['Rendement', p.coverage],
    ['Conditions', p.conditions],
  ].filter(([, v]) => v)

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: '0 12px 14px' }}>
      {p.definition && <><div style={h4}>Définition</div><p style={txt}>{p.definition}</p></>}
      {!!p.claims?.length && (
        <><div style={h4}>Caractéristiques</div>
          <ul style={{ ...txt, paddingLeft: 16, margin: 0 }}>
            {p.claims.map((c, i) => <li key={i}>{c}</li>)}
          </ul></>
      )}
      {p.usage && <><div style={h4}>Domaines d'application</div><p style={txt}>{p.usage}</p></>}

      <div style={h4}>Données techniques</div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px', margin: 0, font: `13px ${FONT}` }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt style={{ color: C.muted }}>{k}</dt>
            <dd style={{ margin: 0, color: C.inkTertiary, whiteSpace: 'pre-line' }}>{v}</dd>
          </div>
        ))}
      </dl>

      {!!p.alsoIn?.length && <><div style={h4}>Aussi classé dans</div><p style={txt}>{p.alsoIn.join(' · ')}</p></>}
      {p.prep && <><div style={h4}>Traitement préalable</div><p style={txt}>{p.prep}</p></>}
      {p.topcoat && <><div style={h4}>Système de recouvrement</div><p style={txt}>{p.topcoat}</p></>}

      {!!p.articles?.length && (
        <>
          <div style={h4}>Références ({p.articles.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: `12px ${FONT}` }}>
              <thead>
                <tr>{['N° art.', 'Contenance', 'Teinte / base', 'Densité'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, font: `600 10px ${MONO}`, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {p.articles.map(a => (
                  <tr key={a.sku}>
                    {[a.sku, a.content, a.tint, a.density].map((v, i) => (
                      <td key={i} style={{ padding: '4px 6px', borderBottom: `1px solid ${C.divider}`, color: i === 0 ? C.ink : C.inkTertiary, fontFamily: i === 0 ? MONO : FONT }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <a href={p.url} target="_blank" rel="noopener noreferrer"
          style={{ font: `12px ${FONT}`, color: C.ink, textDecoration: 'none', border: `1px solid ${C.border}`, padding: '5px 10px', borderRadius: 6 }}>
          Fiche RUCO ↗
        </a>
        {(p.pdfs || []).map((u, i) => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer"
            style={{ font: `12px ${FONT}`, color: C.ink, textDecoration: 'none', border: `1px solid ${C.border}`, padding: '5px 10px', borderRadius: 6 }}>
            PDF {i + 1} ↗
          </a>
        ))}
      </div>
    </div>
  )
}

// ── coquille de page ──────────────────────────────────────────────────────
function Shell({ children, right, count }) {
  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Peintures — Maze Project</title></Head>
      {/* Plafonné en largeur, mais aligné à gauche : centrer (margin auto)
          creusait un vide entre la barre latérale et le volet des critères. */}
      <main style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1600, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ font: `700 22px ${FONT}`, margin: 0 }}>Peintures</h1>
          {count && <span style={{ font: `12px ${MONO}`, color: C.muted }}>{count}</span>}
          <div style={{ flex: 1 }} />
          {right}
        </div>
        {children}
      </main>
    </div>
  )
}
