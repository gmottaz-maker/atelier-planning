// Calculateur de prix d'impression 3D.
//
// On dépose un ou plusieurs fichiers (STL, 3MF), on règle quantités, matière
// et machine, et la page donne le prix à facturer, par pièce et par poste.
// Tout se passe dans le navigateur : aucun fichier n'est envoyé.
//
// La lecture des fichiers vit dans lib/maillage3d.js, le prix dans
// lib/impression3d.js ; cette page ne fait qu'afficher. La calibration (k_cal,
// a, b, prix matière) est PARTAGÉE dans `app_settings` : un plateau mesuré par
// l'un corrige les devis de tous. Lecture pour tous, écriture admin.
import { useState, useEffect, useRef, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { AL, C, FONT, MONO, R } from '../../lib/theme'
import { apiGet, apiPut } from '../../lib/api'
import { fmtCHF } from '../../lib/money'
import useIsAdmin from '../../lib/useIsAdmin'
import { lireFichier } from '../../lib/maillage3d'
import {
  chiffrer, calibrer, normaliserReglages, fmtHeures, tableauTexte, lireHeures, facteurTemps,
  REGLAGES_DEFAUT, GLOBAUX_DEFAUT, MACHINES, COUCHES, ALERTE_ELANCEMENT,
} from '../../lib/impression3d'

const CLE = '/api/app-settings/impression3d_reglages'

const champ = {
  padding: '7px 12px', borderRadius: R.pill, border: `1px solid ${C.border}`,
  font: `14px ${MONO}`, color: AL.black, background: C.surface, outline: 'none',
  textAlign: 'right', fontVariantNumeric: 'tabular-nums', width: '100%', boxSizing: 'border-box',
}
const microLabel = { fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }
const cellule = { padding: '10px 8px', fontSize: 13.5, borderTop: `1px solid ${C.border}`, verticalAlign: 'middle' }
const nombreCell = { ...cellule, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }
const th = { textAlign: 'left', padding: '10px 8px', fontWeight: 500, whiteSpace: 'nowrap' }
const bouton = {
  padding: '8px 16px', borderRadius: R.pill, border: `1.5px solid ${C.outline}`, background: C.surface,
  font: `500 13px ${FONT}`, color: AL.black, cursor: 'pointer',
}
const boutonPlein = { ...bouton, background: AL.black, color: AL.white }

let compteur = 0
const nouvelId = () => `r${++compteur}`

// ── Aperçu 3D ────────────────────────────────────────────────────────────────
// Un rendu à plat sur un canvas 2D, trié par profondeur : pour reconnaître une
// pièce, pas pour l'inspecter. Ça évite d'embarquer three.js pour une vignette.
// Glisser fait tourner la pièce.

const MAX_TRIANGLES_APERCU = 30000

function dessiner(canvas, tri, lacet) {
  const dpr = window.devicePixelRatio || 1
  const L = canvas.clientWidth, H = canvas.clientHeight
  canvas.width = L * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, L, H)
  const pas = Math.max(1, Math.ceil(tri.length / 9 / MAX_TRIANGLES_APERCU))
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < tri.length; i += 3) {
    x0 = Math.min(x0, tri[i]); x1 = Math.max(x1, tri[i])
    y0 = Math.min(y0, tri[i + 1]); y1 = Math.max(y1, tri[i + 1])
    z1 = Math.max(z1, tri[i + 2])
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = z1 / 2
  const ca = Math.cos(lacet), sa = Math.sin(lacet)
  const tangage = 0.45, cp = Math.cos(tangage), sp = Math.sin(tangage)
  const vue = (x, y, z) => {
    const xr = (x - cx) * ca - (y - cy) * sa
    const yr = (x - cx) * sa + (y - cy) * ca
    const zc = z - cz
    return [xr, yr * cp + zc * sp, -yr * sp + zc * cp]   // écran x, profondeur, écran y
  }
  const faces = []
  let rayon = 1
  for (let i = 0; i < tri.length; i += 9 * pas) {
    const a = vue(tri[i], tri[i + 1], tri[i + 2])
    const b = vue(tri[i + 3], tri[i + 4], tri[i + 5])
    const c = vue(tri[i + 6], tri[i + 7], tri[i + 8])
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (ny >= 0) continue                                   // face tournée vers l'arrière
    const n = Math.hypot(nx, ny, nz) || 1
    const lumiere = Math.max(0, (-ny * 0.75 + nz * 0.55 - nx * 0.35) / n)
    faces.push({ a, b, c, profondeur: a[1] + b[1] + c[1], gris: Math.round(150 + 95 * lumiere) })
    rayon = Math.max(rayon, Math.abs(a[0]), Math.abs(a[2]), Math.abs(b[0]), Math.abs(b[2]), Math.abs(c[0]), Math.abs(c[2]))
  }
  faces.sort((p, q) => q.profondeur - p.profondeur)
  const echelle = (Math.min(L, H) / 2 - 4) / rayon
  for (const f of faces) {
    ctx.beginPath()
    ctx.moveTo(L / 2 + f.a[0] * echelle, H / 2 - f.a[2] * echelle)
    ctx.lineTo(L / 2 + f.b[0] * echelle, H / 2 - f.b[2] * echelle)
    ctx.lineTo(L / 2 + f.c[0] * echelle, H / 2 - f.c[2] * echelle)
    ctx.closePath()
    const g = `rgb(${f.gris},${f.gris},${f.gris})`
    ctx.fillStyle = g; ctx.strokeStyle = g; ctx.lineWidth = 0.5
    ctx.fill(); ctx.stroke()
  }
}

function Apercu({ triangles, taille = 64 }) {
  const ref = useRef(null)
  const [lacet, setLacet] = useState(0.6)
  const glisse = useRef(null)
  useEffect(() => { if (ref.current) dessiner(ref.current, triangles, lacet) }, [triangles, lacet])
  return (
    <canvas
      ref={ref}
      title="Glisser pour tourner"
      style={{ width: taille, height: taille, display: 'block', cursor: 'grab', touchAction: 'none' }}
      onPointerDown={e => { glisse.current = { x: e.clientX, l: lacet }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { if (glisse.current) setLacet(glisse.current.l + (e.clientX - glisse.current.x) / 40) }}
      onPointerUp={() => { glisse.current = null }}
    />
  )
}

// ── Vue de dessus d'un plateau ───────────────────────────────────────────────

function VuePlateau({ plateau, taille, numeros, numero }) {
  const [W, H] = taille
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
        <span style={{ fontWeight: 500 }}>plateau {numero}</span>
        <span style={{ color: C.muted, fontFamily: MONO }}>{plateau.pieces.length} p. · {Math.round(plateau.rempli * 100)} %</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} fill={C.surface} stroke={C.outline} strokeWidth={1.5} />
        {plateau.pieces.map(p => (
          <g key={p.id}>
            <rect x={p.x + 1} y={p.y + 1} width={Math.min(p.cote, W) - 2} height={Math.min(p.cote, H) - 2}
              fill={plateau.horsGabarit ? C.dangerBg : C.neutralBg} stroke={C.muted} strokeWidth={0.6} />
            <text x={p.x + Math.min(p.cote, W) / 2} y={p.y + Math.min(p.cote, H) / 2 + 4} textAnchor="middle"
              style={{ font: `11px ${MONO}`, fill: AL.black }}>{numeros[p.id.split(':').slice(0, -1).join(':')]}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Champs ───────────────────────────────────────────────────────────────────

function Reglage({ label, unite, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
      <span>{label}{unite && <span style={{ color: C.muted }}> · {unite}</span>}</span>
      {children}
    </label>
  )
}

const Selecteur = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ ...champ, textAlign: 'left', fontFamily: FONT, appearance: 'auto' }}>
    {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>
)

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Impression3D() {
  const isAdmin = useIsAdmin()
  const [references, setReferences] = useState([])
  const [ecartes, setEcartes] = useState([])
  const [erreurs, setErreurs] = useState([])
  const [lecture, setLecture] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [g, setG] = useState(GLOBAUX_DEFAUT)
  const [reglagesPartages, setReglagesPartages] = useState(REGLAGES_DEFAUT)
  const [reglages, setReglages] = useState(REGLAGES_DEFAUT)
  const [etatEnregistrement, setEtatEnregistrement] = useState(null)
  const [ouvert, setOuvert] = useState(null)       // 'reglages' | 'calibrer'
  const [mesures, setMesures] = useState([{ poids: '', pieces: '', heures: '' }])
  const [copie, setCopie] = useState(false)
  const entree = useRef(null)

  useEffect(() => {
    let annule = false
    apiGet(CLE)
      .then(d => { if (!annule && d?.value) { const r = normaliserReglages(d.value); setReglagesPartages(r); setReglages(r) } })
      .catch(() => { /* défauts conservés : un réglage absent ne bloque rien */ })
    return () => { annule = true }
  }, [])

  const set = (cle, v) => setG(x => ({ ...x, [cle]: v }))
  const majRef = (id, champs) => setReferences(rs => rs.map(r => (r.id === id ? { ...r, ...champs } : r)))

  async function deposer(fichiers) {
    setLecture(true)
    const nouvelles = [], ec = [], err = []
    for (const f of fichiers) {
      try {
        const { references: refs, ecartes: e } = await lireFichier(f.name, await f.arrayBuffer())
        if (refs.length === 0) err.push(`${f.name} : aucune pièce exploitable`)
        nouvelles.push(...refs.map(r => ({ ...r, id: nouvelId(), inclus: true, poidsReel: '', tempsReel: '' })))
        ec.push(...e.map(x => ({ ...x, fichier: f.name })))
      } catch (e) {
        err.push(`${f.name} : ${e.message}`)
      }
    }
    setReferences(rs => [...rs, ...nouvelles])
    setEcartes(x => [...x, ...ec])
    setErreurs(err)
    setLecture(false)
  }

  const devis = useMemo(() => chiffrer(references, g, reglages), [references, g, reglages])
  const machine = MACHINES[g.machine]
  const numeros = Object.fromEntries(references.map((r, i) => [r.id, i + 1]))
  const facteur = facteurTemps(g, reglages)
  const poste = devis.postes

  const calibration = calibrer(mesures.map(m => ({
    poids: Number(String(m.poids).replace(',', '.')), pieces: Number(m.pieces), heures: (lireHeures(m.heures) ?? 0) / facteur,
  })))

  const reglagesModifies = JSON.stringify(reglages) !== JSON.stringify(reglagesPartages)
  async function enregistrer() {
    const propre = normaliserReglages(reglages)
    setEtatEnregistrement('enregistrement')
    try {
      await apiPut(CLE, { value: propre })
      setReglagesPartages(propre); setReglages(propre)
      setEtatEnregistrement('ok')
      setTimeout(() => setEtatEnregistrement(null), 2500)
    } catch {
      setEtatEnregistrement('erreur')
    }
  }

  const majMatiere = (cle, valeur) => setReglages(r => ({
    ...r, matieres: { ...r.matieres, [g.matiere]: { ...r.matieres[g.matiere], [cle]: valeur } },
  }))
  const matiere = reglages.matieres[g.matiere]
  const nombreOu = (v, d) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d }

  async function copier() {
    try {
      await navigator.clipboard.writeText(tableauTexte(devis))
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch { setCopie(false) }
  }

  const visibles = devis.lignes
  const aucune = references.length === 0

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Impression 3D · Maze Project</title></Head>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 16px 64px' }}>
        <Link href="/outils" style={{ fontSize: 12.5, color: C.muted, textDecoration: 'none' }}>← outils</Link>
        <h1 style={{ font: `700 24px ${FONT}`, margin: '14px 0 4px' }}>Impression 3D</h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 22px', maxWidth: 720, lineHeight: 1.6 }}>
          Dépose les fichiers STL ou 3MF : chaque corps devient une référence, avec son poids, son temps machine et
          son prix à facturer. Tout se calcule dans le navigateur, <strong style={{ fontWeight: 500, color: AL.black }}>aucun
          fichier n'est envoyé</strong>.
        </p>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* ── Colonne principale ── */}
          <div style={{ flex: '1 1 640px', minWidth: 0 }}>

            <div
              onClick={() => entree.current?.click()}
              onDragOver={e => { e.preventDefault(); setSurvol(true) }}
              onDragLeave={() => setSurvol(false)}
              onDrop={e => { e.preventDefault(); setSurvol(false); deposer([...e.dataTransfer.files]) }}
              style={{
                border: `1.5px dashed ${survol ? C.outline : C.muted}`, borderRadius: R.panel,
                padding: aucune ? '44px 20px' : '18px 20px', textAlign: 'center', cursor: 'pointer',
                background: survol ? C.hover : C.surface, marginBottom: 18,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {lecture ? 'Lecture en cours…' : aucune ? 'Glisser des fichiers STL ou 3MF ici' : 'Ajouter des fichiers'}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>ou cliquer pour choisir · plusieurs fichiers à la fois</div>
              <input ref={entree} type="file" accept=".stl,.3mf" multiple style={{ display: 'none' }}
                onChange={e => { deposer([...e.target.files]); e.target.value = '' }} />
            </div>

            {erreurs.length > 0 && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '10px 14px', marginBottom: 14 }}>
                {erreurs.map(m => <p key={m} style={{ margin: '2px 0', fontSize: 13, color: C.danger }}>{m}</p>)}
              </div>
            )}

            {ecartes.length > 0 && (
              <details style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '10px 14px', marginBottom: 14 }}>
                <summary style={{ fontSize: 13, cursor: 'pointer' }}>
                  {ecartes.length} élément{ecartes.length > 1 ? 's' : ''} ignoré{ecartes.length > 1 ? 's' : ''} à la lecture
                </summary>
                {ecartes.map((e, i) => (
                  <p key={i} style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>
                    <span style={{ color: AL.black }}>{e.fichier}</span>{e.nom && e.nom !== e.fichier.replace(/\.\w+$/, '') ? ` · ${e.nom}` : ''} — {e.raison}
                  </p>
                ))}
              </details>
            )}

            {!aucune && (
              <>
                {/* ── Références ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={microLabel}>références · {devis.nbPieces} pièces</div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <button onClick={copier} style={{ ...bouton, padding: '6px 14px', fontSize: 12.5 }}>
                      {copie ? 'Copié' : 'Copier le tableau'}
                    </button>
                    <button onClick={() => { setReferences([]); setEcartes([]); setErreurs([]) }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', font: `12.5px ${FONT}`, color: C.muted }}>
                      tout retirer
                    </button>
                  </div>
                </div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflowX: 'auto', marginBottom: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        <th style={{ ...th, width: 28 }} />
                        <th style={{ ...th, width: 64 }} />
                        <th style={th}>référence</th>
                        <th style={{ ...th, textAlign: 'right' }}>qté</th>
                        <th style={{ ...th, textAlign: 'right' }}>g / pièce</th>
                        <th style={{ ...th, textAlign: 'right' }}>temps</th>
                        <th style={{ ...th, textAlign: 'right' }}>prix unit.</th>
                        <th style={{ ...th, textAlign: 'right' }}>total</th>
                        <th style={{ ...th, width: 28 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map(l => (
                        <tr key={l.id} style={{ opacity: l.inclus ? 1 : 0.45 }}>
                          <td style={{ ...cellule, fontFamily: MONO, color: C.muted, fontSize: 12 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
                              <input type="checkbox" checked={l.inclus} onChange={e => majRef(l.id, { inclus: e.target.checked })}
                                title="Inclure dans le devis" />
                              {numeros[l.id]}
                            </label>
                          </td>
                          <td style={{ ...cellule, padding: '4px 0' }}><Apercu triangles={l.triangles} /></td>
                          <td style={cellule}>
                            <input value={l.nom} onChange={e => majRef(l.id, { nom: e.target.value })}
                              style={{ border: 'none', outline: 'none', font: `500 13.5px ${FONT}`, color: AL.black, width: '100%', background: 'transparent', padding: 0 }} />
                            <div style={{ fontSize: 11.5, color: C.muted, fontFamily: MONO, marginTop: 2 }}>
                              {l.dimensions.map(d => Math.round(d)).join(' × ')} mm · {l.V.toFixed(1)} cm³
                            </div>
                            {l.elancee && (
                              <div style={{ fontSize: 11.5, color: C.warning, marginTop: 3 }}>
                                pièce haute sur petite base ({Math.round(l.hauteur)} sur {Math.round(l.empreinte)} mm) :
                                brim 10 mm recommandé, accélérations réduites
                              </div>
                            )}
                            {l.normalesInversees && (
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>normales inversées, corrigées</div>
                            )}
                          </td>
                          <td style={nombreCell}>
                            <input inputMode="numeric" value={references.find(r => r.id === l.id)?.quantite ?? 1}
                              onChange={e => majRef(l.id, { quantite: e.target.value })} style={{ ...champ, padding: '5px 9px', width: 52 }} />
                          </td>
                          <td style={nombreCell}>
                            <input inputMode="decimal" value={references.find(r => r.id === l.id)?.poidsReel ?? ''}
                              placeholder={String(Math.round(l.poids))} title="Poids du slicer, en g — vide : estimé"
                              onChange={e => majRef(l.id, { poidsReel: e.target.value })}
                              style={{ ...champ, padding: '5px 9px', width: 64 }} />
                            <div style={{ fontSize: 10.5, color: l.sourcePoids === 'slicer' ? AL.black : C.muted, marginTop: 2 }}>{l.sourcePoids}</div>
                          </td>
                          <td style={nombreCell}>
                            <input value={references.find(r => r.id === l.id)?.tempsReel ?? ''}
                              placeholder={fmtHeures(l.temps)} title="Temps du slicer (1h04, 1:04 ou 1,07) — vide : estimé"
                              onChange={e => majRef(l.id, { tempsReel: e.target.value })}
                              style={{ ...champ, padding: '5px 9px', width: 76 }} />
                            <div style={{ fontSize: 10.5, color: l.sourceTemps === 'slicer' ? AL.black : C.muted, marginTop: 2 }}>{l.sourceTemps}</div>
                          </td>
                          <td style={nombreCell}>{fmtCHF(l.prixUnitaire)}</td>
                          <td style={{ ...nombreCell, fontWeight: 500 }}>{l.inclus ? fmtCHF(l.total) : '—'}</td>
                          <td style={cellule}>
                            <button onClick={() => setReferences(rs => rs.filter(r => r.id !== l.id))} title="Retirer"
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, padding: 0 }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 28px', lineHeight: 1.6 }}>
                  Les champs grisés montrent l'estimation ; y coller le poids ou le temps du slicer la remplace.
                  Le modèle de temps est calibré sur des pièces décoratives creuses : pour une pièce pleine ou technique,
                  préfère le temps du slicer.
                </p>

                {/* ── Récapitulatif par poste ── */}
                <div style={{ ...microLabel, marginBottom: 10 }}>récapitulatif</div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden', marginBottom: 28 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Matière', `${poste.matiere.quantite.toFixed(2).replace('.', ',')} kg ${g.matiere} à ${fmtCHF(matiere.prixKg)} / kg`, poste.matiere.montant],
                        ['Machine', `${fmtHeures(poste.machine.quantite)} à ${fmtCHF(g.tarifMachine)} / h`, poste.machine.montant],
                        ['Ratés', `${Math.round(poste.rates.taux * 100)} % de matière et machine`, poste.rates.montant],
                        ['Manutention', `${poste.manutention.quantite} pièces × ${fmtCHF(g.manutention)}`, poste.manutention.montant, true],
                        ['Plateaux', `${poste.plateaux.quantite} × ${fmtCHF(g.forfaitPlateau)}`, poste.plateaux.montant],
                        ['Projet', `${poste.projet.quantite} h × ${fmtCHF(g.tarifProjet)}`, poste.projet.montant],
                      ].map(([nom, detail, montant, fort], i) => (
                        <tr key={nom} style={fort ? { background: C.hover } : undefined}>
                          <td style={{ ...cellule, borderTop: i ? cellule.borderTop : 'none', fontWeight: fort ? 500 : 400 }}>
                            {nom}<span style={{ color: C.muted, fontWeight: 400 }}> · {detail}</span>
                            {fort && devis.sousTotal > 0 && (
                              <span style={{ color: C.muted, fontWeight: 400 }}> — {Math.round(montant / devis.sousTotal * 100)} % du total, le levier principal</span>
                            )}
                          </td>
                          <td style={{ ...nombreCell, borderTop: i ? cellule.borderTop : 'none', fontWeight: fort ? 500 : 400 }}>{fmtCHF(montant)}</td>
                        </tr>
                      ))}
                      {Math.abs(devis.arrondis) >= 0.005 && (
                        <tr>
                          <td style={{ ...cellule, color: C.muted }}>Arrondis · prix unitaires au 0,05</td>
                          <td style={{ ...nombreCell, color: C.muted }}>{devis.arrondis < 0 ? '−' : ''}{fmtCHF(Math.abs(devis.arrondis))}</td>
                        </tr>
                      )}
                      {devis.remise > 0 && (
                        <tr>
                          <td style={cellule}>Remise quantité · {Math.round(devis.tauxRemise * 100)} %</td>
                          <td style={nombreCell}>−{fmtCHF(devis.remise)}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ ...cellule, fontWeight: 500, borderTop: `1.5px solid ${C.outline}` }}>Total HT</td>
                        <td style={{ ...nombreCell, fontWeight: 500, borderTop: `1.5px solid ${C.outline}` }}>{fmtCHF(devis.totalHT)}</td>
                      </tr>
                      <tr>
                        <td style={{ ...cellule, color: C.muted }}>TVA {(g.tva * 100).toFixed(1).replace('.', ',')} %</td>
                        <td style={{ ...nombreCell, color: C.muted }}>{fmtCHF(devis.tva)}</td>
                      </tr>
                      <tr>
                        <td style={{ ...cellule, fontWeight: 500, fontSize: 15 }}>Total TTC</td>
                        <td style={{ ...nombreCell, fontWeight: 500, fontSize: 15 }}>{fmtCHF(devis.totalTTC)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* ── Temps machine ── */}
                <div style={{ ...microLabel, marginBottom: 10 }}>temps machine</div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 28 }}>
                  <div>
                    <div style={{ font: `500 28px ${FONT}` }}>{fmtHeures(devis.heures)}</div>
                    <div style={{ fontSize: 12.5, color: C.muted }}>sur une machine · ±20 min par plateau</div>
                  </div>
                  <div style={{ width: 150 }}>
                    <Reglage label="Machines en parallèle">
                      <input inputMode="numeric" value={g.machinesParalleles}
                        onChange={e => set('machinesParalleles', Math.max(1, Math.round(nombreOu(e.target.value, 1))))} style={champ} />
                    </Reglage>
                  </div>
                  {g.machinesParalleles > 1 && (
                    <div>
                      <div style={{ font: `500 28px ${FONT}` }}>{fmtHeures(devis.enParallele)}</div>
                      <div style={{ fontSize: 12.5, color: C.muted }}>sur {g.machinesParalleles} machines, plateaux répartis</div>
                    </div>
                  )}
                </div>

                {/* ── Plateaux ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                  <div style={microLabel}>
                    plateaux · {devis.rangement.plateaux.length} estimé{devis.rangement.plateaux.length > 1 ? 's' : ''} sur {machine.plateau.join(' × ')} mm
                    {g.plateauxForces ? ` · ${devis.nbPlateaux} retenus à la main` : ''}
                  </div>
                  <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                    forcer à
                    <input inputMode="numeric" value={g.plateauxForces ?? ''} placeholder="—"
                      onChange={e => set('plateauxForces', e.target.value === '' ? null : e.target.value)}
                      style={{ ...champ, width: 64, padding: '5px 9px' }} />
                  </label>
                </div>
                {devis.rangement.tropGrandes.length > 0 && (
                  <p style={{ fontSize: 12.5, color: C.danger, margin: '0 0 10px' }}>
                    {devis.rangement.tropGrandes.length} pièce{devis.rangement.tropGrandes.length > 1 ? 's' : ''} plus grande{devis.rangement.tropGrandes.length > 1 ? 's' : ''} que
                    le plateau utile, comptée{devis.rangement.tropGrandes.length > 1 ? 's' : ''} sur un plateau chacune : à découper ou à changer de machine.
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 8 }}>
                  {devis.rangement.plateaux.map((pl, i) => (
                    <div key={i}>
                      <VuePlateau plateau={pl} taille={machine.plateau} numeros={numeros} numero={i + 1} />
                      <div style={{ fontSize: 11.5, color: C.muted, fontFamily: MONO, margin: '4px 4px 0' }}>
                        {fmtHeures(devis.dureesPlateaux[i])}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 8px', lineHeight: 1.6 }}>
                  Chaque pièce occupe un carré : sa plus grande largeur plus 4 mm de jeu. Une pièce haute sur petite base
                  compte aussi son brim, 2 × 10 mm autour de l'empreinte.
                  Les numéros renvoient au tableau.
                </p>
              </>
            )}
          </div>

          {/* ── Panneau latéral ── */}
          <aside style={{ flex: '1 1 280px', maxWidth: 330, minWidth: 260, position: 'sticky', top: 16 }}>
            <div style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!aucune && (
                <div style={{ paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                  <div style={microLabel}>total HT</div>
                  <div style={{ font: `500 30px ${FONT}`, fontVariantNumeric: 'tabular-nums' }}>{fmtCHF(devis.totalHT)}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>{fmtCHF(devis.totalTTC)} TTC · {devis.nbPieces} pièces · {devis.nbPlateaux} plateaux</div>
                </div>
              )}

              <Reglage label="Matière">
                <Selecteur value={g.matiere} onChange={v => set('matiere', v)} options={Object.keys(reglages.matieres)} />
              </Reglage>
              <Reglage label="Machine">
                <Selecteur value={g.machine} onChange={v => set('machine', v)} options={Object.keys(MACHINES)} />
              </Reglage>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Reglage label="Couche" unite="mm">
                  <Selecteur value={g.couche} onChange={v => set('couche', Number(v))}
                    options={Object.keys(COUCHES).map(c => ({ value: Number(c), label: Number(c).toFixed(2).replace('.', ',') }))} />
                </Reglage>
                <Reglage label="Parois">
                  <input inputMode="numeric" value={g.parois} onChange={e => set('parois', e.target.value)} style={champ} />
                </Reglage>
                <Reglage label="Rempl." unite="%">
                  <input inputMode="decimal" value={Math.round(g.remplissage * 1000) / 10}
                    onChange={e => set('remplissage', nombreOu(e.target.value, 0) / 100)} style={champ} />
                </Reglage>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 4 }}>
                <Reglage label="Tarif machine" unite="CHF/h">
                  <input inputMode="decimal" value={g.tarifMachine} onChange={e => set('tarifMachine', nombreOu(e.target.value, 0))} style={champ} />
                </Reglage>
                <Reglage label="Forfait plateau" unite="CHF">
                  <input inputMode="decimal" value={g.forfaitPlateau} onChange={e => set('forfaitPlateau', nombreOu(e.target.value, 0))} style={champ} />
                </Reglage>
              </div>
              <Reglage label="Manutention par pièce" unite="CHF — le levier principal">
                <input inputMode="decimal" value={g.manutention} onChange={e => set('manutention', nombreOu(e.target.value, 0))}
                  style={{ ...champ, border: `1.5px solid ${C.outline}`, fontSize: 16 }} />
              </Reglage>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Reglage label="Heures de projet" unite="h">
                  <input inputMode="decimal" value={g.heuresProjet} onChange={e => set('heuresProjet', e.target.value)} style={champ} />
                </Reglage>
                <Reglage label="Tarif projet" unite="CHF/h">
                  <input inputMode="decimal" value={g.tarifProjet} onChange={e => set('tarifProjet', nombreOu(e.target.value, 0))} style={champ} />
                </Reglage>
              </div>
              <p style={{ fontSize: 11.5, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                Préparation des fichiers, réglages, suivi, échanges client — saisies à la main, jamais déduites des fichiers.
              </p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={g.remise} onChange={e => set('remise', e.target.checked)} />
                Remise quantité <span style={{ color: C.muted }}>· 50+ −5 %, 200+ −10 %</span>
              </label>

              <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                <button onClick={() => setOuvert(o => (o === 'reglages' ? null : 'reglages'))}
                  style={ouvert === 'reglages' ? { ...boutonPlein, padding: '6px 14px', fontSize: 12.5 } : { ...bouton, padding: '6px 14px', fontSize: 12.5 }}>
                  Réglages
                </button>
                <button onClick={() => setOuvert(o => (o === 'calibrer' ? null : 'calibrer'))}
                  style={ouvert === 'calibrer' ? { ...boutonPlein, padding: '6px 14px', fontSize: 12.5 } : { ...bouton, padding: '6px 14px', fontSize: 12.5 }}>
                  Calibrer
                </button>
              </div>

              {ouvert === 'reglages' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={microLabel}>{g.matiere}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Reglage label="Prix" unite="CHF/kg">
                      <input inputMode="decimal" value={matiere.prixKg} onChange={e => majMatiere('prixKg', nombreOu(e.target.value, 0))} style={champ} />
                    </Reglage>
                    <Reglage label="Densité" unite="g/cm³">
                      <input inputMode="decimal" value={matiere.densite} onChange={e => majMatiere('densite', nombreOu(e.target.value, 0))} style={champ} />
                    </Reglage>
                    <Reglage label="Facteur temps">
                      <input inputMode="decimal" value={matiere.facteurTemps} onChange={e => majMatiere('facteurTemps', nombreOu(e.target.value, 0))} style={champ} />
                    </Reglage>
                    <Reglage label="Ratés" unite="%">
                      <input inputMode="decimal" value={Math.round(matiere.rates * 1000) / 10}
                        onChange={e => majMatiere('rates', nombreOu(e.target.value, 0) / 100)} style={champ} />
                    </Reglage>
                  </div>
                  <div style={microLabel}>modèle</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <Reglage label="k_cal">
                      <input inputMode="decimal" value={reglages.kCal} onChange={e => setReglages(r => ({ ...r, kCal: nombreOu(e.target.value, 0) }))} style={champ} />
                    </Reglage>
                    <Reglage label="a" unite="h/g">
                      <input inputMode="decimal" value={reglages.a} onChange={e => setReglages(r => ({ ...r, a: nombreOu(e.target.value, 0) }))} style={champ} />
                    </Reglage>
                    <Reglage label="b" unite="h">
                      <input inputMode="decimal" value={reglages.b} onChange={e => setReglages(r => ({ ...r, b: nombreOu(e.target.value, 0) }))} style={champ} />
                    </Reglage>
                  </div>
                  <p style={{ fontSize: 11.5, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                    Les prix au kg sont des valeurs de départ, à remplacer par les prix d'achat réels. Ces réglages sont
                    partagés avec toute l'équipe{isAdmin ? '' : ' ; seul un admin peut les enregistrer — ici, ils ne valent que pour ce devis'}.
                  </p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {isAdmin && reglagesModifies && (
                      <button onClick={enregistrer} disabled={etatEnregistrement === 'enregistrement'} style={{ ...boutonPlein, padding: '6px 14px', fontSize: 12.5 }}>
                        {etatEnregistrement === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer pour tous'}
                      </button>
                    )}
                    {reglagesModifies && (
                      <button onClick={() => setReglages(reglagesPartages)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', font: `12.5px ${FONT}`, color: C.muted }}>
                        annuler
                      </button>
                    )}
                    {etatEnregistrement === 'ok' && <span style={{ fontSize: 12.5, color: C.success }}>enregistré</span>}
                    {etatEnregistrement === 'erreur' && <span style={{ fontSize: 12.5, color: C.danger }}>échec de l'enregistrement</span>}
                  </div>
                </div>
              )}

              {ouvert === 'calibrer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.55 }}>
                    Pour quelques plateaux réels : le poids estimé, le nombre de pièces et le temps du slicer, imprimés
                    sur {g.machine}, couche {String(g.couche).replace('.', ',')} mm, {g.matiere}. L'outil refait la
                    régression <span style={{ fontFamily: MONO }}>temps = a × g + b × n</span>.
                  </p>
                  {!aucune && (
                    <button onClick={() => setMesures(devis.rangement.plateaux.map(pl => ({
                      poids: String(Math.round(pl.pieces.reduce((s, p) => s + (devis.lignes.find(l => l.id === p.id.split(':').slice(0, -1).join(':'))?.poids ?? 0), 0))),
                      pieces: String(pl.pieces.length), heures: '',
                    })))} style={{ ...bouton, padding: '6px 14px', fontSize: 12.5, alignSelf: 'flex-start' }}>
                      Reprendre les plateaux du devis
                    </button>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 18px', gap: 6, fontSize: 11, color: C.muted }}>
                    <span>poids (g)</span><span>pièces</span><span>temps</span><span />
                    {mesures.map((m, i) => (
                      [
                        ['poids', 'decimal'], ['pieces', 'numeric'], ['heures', 'text'],
                      ].map(([cle, mode]) => (
                        <input key={`${i}-${cle}`} inputMode={mode} value={m[cle]} placeholder={cle === 'heures' ? '5h19' : ''}
                          onChange={e => setMesures(ms => ms.map((x, j) => (j === i ? { ...x, [cle]: e.target.value } : x)))}
                          style={{ ...champ, padding: '5px 8px', fontSize: 12.5 }} />
                      )).concat(
                        <button key={`${i}-x`} onClick={() => setMesures(ms => ms.filter((_, j) => j !== i))}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, padding: 0 }}>×</button>
                      )
                    ))}
                  </div>
                  <button onClick={() => setMesures(ms => [...ms, { poids: '', pieces: '', heures: '' }])}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', font: `12.5px ${FONT}`, color: AL.black, alignSelf: 'flex-start', padding: 0 }}>
                    + plateau
                  </button>
                  {calibration ? (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                      <span style={{ fontFamily: MONO }}>a = {calibration.a.toFixed(4)} · b = {calibration.b.toFixed(3)}</span>
                      <span style={{ color: C.muted }}> (aujourd'hui {reglages.a} · {reglages.b}) · écart moyen {Math.round(calibration.rms * 60 * facteur)} min par plateau</span>
                      <div>
                        <button onClick={() => { setReglages(r => ({ ...r, a: Number(calibration.a.toFixed(4)), b: Number(calibration.b.toFixed(3)) })); setOuvert('reglages') }}
                          style={{ ...boutonPlein, padding: '6px 14px', fontSize: 12.5, marginTop: 6 }}>
                          Appliquer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                      Il faut au moins deux plateaux complets, avec des proportions poids / pièces différentes.
                    </p>
                  )}
                </div>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, margin: '10px 4px 0', lineHeight: 1.55 }}>
              Prix HT, arrondis au 0,05. Alerte « pièce haute » au-delà d'un rapport hauteur / empreinte de {ALERTE_ELANCEMENT}.
            </p>
          </aside>
        </div>
      </div>
    </div>
  )
}
