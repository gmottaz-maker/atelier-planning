import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import { verifierTailleFichier, lireReponse } from '../lib/uploadLimit'
import { fmtCHF as fmtMontant } from '../lib/money'
import { AL, C, FONT } from '../lib/theme'

const PINK = AL.black
const PERSON_COLORS = { Arnaud: C.info, Gabin: C.violet, Guillaume: AL.black }
const PAYMENT_LABELS  = { personal: 'Perso (à rembourser)', company: 'Société (carte)' }
const PAYMENT_COLORS  = { personal: C.warning, company: C.info }

function fmtCHF(n) {
  if (n == null) return '—'
  return fmtMontant(n)
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export default function Justificatifs() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null

  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear]     = useState(new Date().getFullYear())
  const [filter, setFilter] = useState('all') // all | personal | company
  const [person, setPerson] = useState('all')
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState([])
  const [editing, setEditing] = useState(null)
  const [dropMode, setDropMode] = useState('company') // mode appliqué aux prochains imports
  const [accounts, setAccounts] = useState([])  // comptes de charge (catégorie comptable)

  useEffect(() => {
    adminFetch('/api/accounts').then(r => r.json()).then(d => {
      setAccounts((d.accounts || []).filter(a => a.kind === 'charge'))
    }).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ year: String(year) })
    if (filter !== 'all') params.set('payment_method', filter)
    const r = await adminFetch(`/api/expenses/all?${params}`)
    const data = await r.json()
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [year, filter])

  // ── Drop global sur la page ────────────────────────────────────────────────
  useEffect(() => {
    function onDragOver(e) {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault()
        setDragging(true)
      }
    }
    function onDragLeave(e) {
      if (e.clientX === 0 && e.clientY === 0) setDragging(false)
    }
    function onDrop(e) {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer?.files)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const uid = () => `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  // Nature du fichier déposé. Un HEIC (photo iPhone) n'est pas décodable par
  // Claude : on le convertit en JPEG côté navigateur. Détection par type MIME
  // ET par extension (les navigateurs ne renseignent pas toujours le type).
  function fileKind(file) {
    const name = (file.name || '').toLowerCase()
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
    if (file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/.test(name)) return 'heic'
    if (file.type.startsWith('image/')) return 'image'
    return 'unsupported'
  }

  async function toJpegIfHeic(file, kind) {
    if (kind !== 'heic') return file
    const heic2any = (await import('heic2any')).default
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
    const blob = Array.isArray(out) ? out[0] : out
    return new File([blob], (file.name || 'photo').replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
  }

  // Importe UN reçu détecté. `split` = le document en contient plusieurs,
  // auquel cas on n'archive que les pages de celui-ci.
  async function importScanned(id, rec, base64, file, split) {
    const body = {
      userName:        user?.name || 'Guillaume',
      date:            rec.date || new Date().toISOString().slice(0, 10),
      amount:          rec.amount ?? null,
      amount_net:      rec.amount_net ?? null,
      vat_rate:        rec.vat_rate ?? null,
      vat_amount:      rec.vat_amount ?? null,
      vat_breakdown:   Array.isArray(rec.vat_breakdown) && rec.vat_breakdown.length > 0 ? rec.vat_breakdown : null,
      currency:        rec.currency || 'CHF',
      category:        rec.category || 'Autre',
      merchant:        rec.merchant || null,
      description:     rec.description || null,
      receiptBase64:   base64,
      receiptMimeType: file.type,
      receiptFilename: file.name,
      page_from:       split ? rec.page_from ?? null : null,
      page_to:         split ? rec.page_to ?? null : null,
      payment_method:  dropMode,
    }
    const multiVat = Array.isArray(rec.vat_breakdown) && rec.vat_breakdown.length > 1
    try {
      const r = await adminFetch('/api/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // Un 409 (doublon) est une réponse ATTENDUE, et toujours en JSON. Tout
      // autre échec passe par lireReponse, qui sait qu'un refus de l'hébergeur
      // arrive en texte brut et non en JSON.
      const d = r.status === 409 ? await r.json() : await lireReponse(r)
      if (r.status === 409) {
        setProcessing(p => p.map(x => x.id === id ? {
          ...x, status: 'duplicate', duplicate: d.duplicate_of,
          retry: async () => {
            setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'uploading' } : xx))
            const r2 = await adminFetch('/api/expenses', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...body, force: true }),
            })
            let d2 = null, echec = null
            try { d2 = await lireReponse(r2) } catch (e2) { echec = e2.message }
            if (echec) setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'error', error: echec } : xx))
            else {
              setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'done', reconcile: d2.reconcile } : xx))
              load()
            }
          },
        } : x))
        return
      }
      if (d.error) throw new Error(d.error)
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'done', multiVat, vatBreakdown: rec.vat_breakdown, reconcile: d.reconcile } : x))
      load()
    } catch (e) {
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'error', error: e.message } : x))
    }
  }

  async function processDroppedFile(file, kind) {
    if (!file) return
    const id = uid()
    setProcessing(p => [...p, { id, name: file.name, status: 'reading' }])
    try {
      // HEIC → JPEG avant tout (Claude ne décode pas le HEIC)
      let usable = file
      if (kind === 'heic') {
        setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'converting' } : x))
        try { usable = await toJpegIfHeic(file, kind) }
        catch { throw new Error('Conversion HEIC échouée — convertis la photo en JPEG et réessaie') }
      }
      // Sur le fichier RÉELLEMENT envoyé : un HEIC converti en JPEG n'a plus la
      // taille de l'original, dans un sens comme dans l'autre.
      const taille = verifierTailleFichier(usable)
      if (!taille.ok) throw new Error(taille.message)
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = e => resolve(e.target.result.split(',')[1])
        r.onerror = reject
        r.readAsDataURL(usable)
      })
      // Scan IA — un même document peut contenir plusieurs reçus
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'scanning' } : x))
      const scanRes = await adminFetch('/api/expenses/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: usable.type }),
      })
      const scan = await lireReponse(scanRes)
      const found = Array.isArray(scan.receipts) ? scan.receipts : [scan]
      const list  = found.length > 0 ? found : [{}]
      const split = list.length > 1

      const items = list.map((rec, i) => ({
        id: split ? `${id}_${i}` : id,
        name: split ? `${i + 1}/${list.length} · ${rec.merchant || 'Reçu'}` : file.name,
        rec,
      }))

      // Contrôle de couverture : sur un PDF multi-tickets, vérifier qu'aucune
      // page n'a été oubliée par l'IA. Si des pages ne sont attribuées à aucun
      // reçu, on l'affiche pour que rien ne se perde en silence.
      let coverage = null
      if (split && scan.page_count) {
        const covered = new Set()
        for (const rec of list) {
          const a = parseInt(rec.page_from, 10), b = parseInt(rec.page_to, 10)
          if (a >= 1 && b >= a) for (let pg = a; pg <= b; pg++) covered.add(pg)
        }
        const missing = []
        for (let pg = 1; pg <= scan.page_count; pg++) if (!covered.has(pg)) missing.push(pg)
        if (missing.length) coverage = { pageCount: scan.page_count, missing }
      }

      setProcessing(p => [
        ...p.filter(x => x.id !== id),
        ...items.map(it => ({ id: it.id, name: it.name, status: 'uploading' })),
        ...(coverage ? [{ id: `${id}_cov`, name: file.name, status: 'warning',
          warning: `PDF de ${coverage.pageCount} pages : page(s) ${coverage.missing.join(', ')} attribuée(s) à aucun reçu — vérifie qu'aucun ticket n'a été oublié.` }] : []),
      ])

      // En série : chaque POST fait un upload kDrive et un pré-rapprochement qui
      // doit voir les frais précédents déjà insérés.
      for (const it of items) await importScanned(it.id, it.rec, base64, file, split)
    } catch (e) {
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'error', error: e.message } : x))
    }
  }

  // Point d'entrée d'un lot déposé : trie les fichiers, signale ceux qui ne sont
  // pas pris en charge, et traite le reste par groupes de 3 (évite de saturer
  // l'API et garde une progression lisible).
  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    const queue = []
    for (const file of files) {
      const kind = fileKind(file)
      if (kind === 'unsupported') {
        setProcessing(p => [...p, { id: uid(), name: file.name, status: 'skipped',
          error: `Format non pris en charge (${file.type || 'type inconnu'}). Dépose un PDF, un JPEG ou un PNG.` }])
        continue
      }
      queue.push({ file, kind })
    }
    let i = 0
    const worker = async () => { while (i < queue.length) { const it = queue[i++]; await processDroppedFile(it.file, it.kind) } }
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker))
  }

  async function togglePaymentMethod(row) {
    const next = row.payment_method === 'company' ? 'personal' : 'company'
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, payment_method: next } : r))
    await adminFetch(`/api/expenses?id=${row.id}&userName=${encodeURIComponent(row.user_name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_method: next }),
    })
  }

  const visible = rows.filter(r => person === 'all' || r.user_name === person)
  const totals = visible.reduce((acc, r) => {
    const amt = parseFloat(r.amount || 0)
    acc.total += amt
    if (r.payment_method === 'personal') acc.toReimburse += amt
    if (r.payment_method === 'company')  acc.company += amt
    return acc
  }, { total: 0, toReimburse: 0, company: 0 })

  // Par personne (uniquement perso pour le récap des remboursements)
  const reimbursementsByPerson = rows
    .filter(r => r.payment_method === 'personal')
    .reduce((acc, r) => {
      acc[r.user_name] = (acc[r.user_name] || 0) + parseFloat(r.amount || 0)
      return acc
    }, {})

  const allPeople = Array.from(new Set(rows.map(r => r.user_name))).sort()

  return (
    <div className="min-h-screen" style={{ background: AL.white }}>
      <Head><title>Maze Project — Justificatifs</title></Head>
      <NavBar title="Justificatifs de dépense">
        <div className="flex items-center gap-1.5 u-fill u-pill p-0.5 mr-2">
          <button onClick={() => setDropMode('personal')}
            className="px-2.5 py-1 rounded text-xs font-semibold transition-colors"
            style={dropMode === 'personal'
              ? { background: 'white', color: C.warning, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
              : { background: 'transparent', color: C.muted }}>
            💳 Perso
          </button>
          <button onClick={() => setDropMode('company')}
            className="px-2.5 py-1 rounded text-xs font-semibold transition-colors"
            style={dropMode === 'company'
              ? { background: 'white', color: C.info, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
              : { background: 'transparent', color: C.muted }}>
            🏢 Société
          </button>
        </div>
        <label className="px-4 py-2 text-sm font-medium u-pill text-white cursor-pointer" style={{ background: PINK }}>
          📁 Importer
          <input type="file" multiple accept="image/*,application/pdf,.heic,.heif" className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
        </label>
      </NavBar>

      {/* Overlay drop fullscreen */}
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(17, 24, 39, 0.55)' }}>
          <div className="u-surface u-panel px-10 py-8 text-center shadow-2xl border-2 border-dashed" style={{ borderColor: AL.black }}>
            <div className="text-5xl mb-3">📥</div>
            <p className="font-semibold u-ink" style={{ fontSize: 18 }}>
              Déposez votre justificatif ici
            </p>
            <p className="text-sm mt-1" style={{ color: dropMode === 'personal' ? C.warning : C.info }}>
              Mode : {dropMode === 'personal' ? '💳 Perso (à rembourser)' : '🏢 Société (carte)'}
            </p>
            <p className="text-xs u-muted mt-2">JPG · PNG · PDF — l'IA va l'analyser</p>
          </div>
        </div>
      )}

      {/* Panneau d'import — persiste jusqu'à ce qu'on l'efface, pour que rien ne
          disparaisse en silence. Récapitulatif en tête, une ligne par fichier. */}
      {processing.length > 0 && (() => {
        const busy   = processing.filter(p => ['reading', 'converting', 'scanning', 'uploading'].includes(p.status)).length
        const done   = processing.filter(p => p.status === 'done').length
        const errors = processing.filter(p => p.status === 'error').length
        const skipped= processing.filter(p => p.status === 'skipped').length
        const dups   = processing.filter(p => p.status === 'duplicate').length
        const warns  = processing.filter(p => p.status === 'warning').length
        const attention = errors + skipped + dups + warns
        return (
          <div className="fixed bottom-5 right-5 z-30 w-96 max-w-[92vw] u-surface u-panel shadow-xl border u-line flex flex-col" style={{ maxHeight: '72vh' }}>
            <div className="px-4 py-3 border-b u-line flex items-center justify-between gap-2">
              <div className="text-sm font-semibold u-ink">
                {busy > 0 ? `Import en cours… ${done}/${processing.length - warns}` : 'Import terminé'}
                <span className="ml-2 font-normal u-muted text-xs">
                  {done} importé{done > 1 ? 's' : ''}
                  {attention > 0 && ` · ${attention} à vérifier`}
                </span>
              </div>
              {busy === 0 && (
                <button onClick={() => setProcessing([])}
                  className="text-xs font-medium u-muted hover:u-ink">Tout effacer</button>
              )}
            </div>
            <div className="overflow-y-auto divide-y u-divide">
              {processing.map(p => (
                <div key={p.id} className="px-4 py-2.5 flex items-start gap-3">
                  {p.status === 'done' ? <span className="u-ok mt-0.5">✓</span>
                    : p.status === 'error' ? <span className="u-ko mt-0.5">✕</span>
                    : p.status === 'skipped' ? <span className="u-muted mt-0.5">⨯</span>
                    : (p.status === 'duplicate' || p.status === 'warning') ? <span className="u-warn mt-0.5">⚠</span>
                    : <div className="w-4 h-4 mt-0.5 u-pill border-2 animate-spin flex-shrink-0" style={{ borderColor: C.border, borderTopColor: AL.black }} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium u-ink truncate">{p.name}</p>
                    <p className="text-xs u-muted">
                      {p.status === 'reading'    && 'Lecture…'}
                      {p.status === 'converting' && 'Conversion HEIC…'}
                      {p.status === 'scanning'   && 'Analyse IA…'}
                      {p.status === 'uploading'  && 'Sauvegarde…'}
                      {p.status === 'done' && (
                        <>
                          {p.multiVat ? (
                            <span className="u-warn">Importé ✓ — ⚠ Plusieurs taux TVA ({p.vatBreakdown?.map(b => b.rate + '%').join(' + ')})</span>
                          ) : 'Importé ✓'}
                          {p.reconcile?.status === 'matched'   && <span className="u-ok"> · rapproché à un débit</span>}
                          {p.reconcile?.status === 'ambiguous' && <span className="u-info"> · paiement probable, à valider</span>}
                        </>
                      )}
                      {p.status === 'error'   && <span className="u-ko">Erreur : {p.error}</span>}
                      {p.status === 'skipped' && <span className="u-muted">{p.error}</span>}
                      {p.status === 'warning' && <span className="u-warn">{p.warning}</span>}
                      {p.status === 'duplicate' && (
                        <>
                          Doublon détecté ({p.duplicate?.amount} CHF, {p.duplicate?.date}){' '}
                          <button onClick={p.retry} className="ml-1 underline u-warn hover:u-warn">Importer quand même</button>
                          {' · '}
                          <button onClick={() => setProcessing(pp => pp.filter(xx => xx.id !== p.id))}
                            className="underline u-muted hover:u-ink">Ignorer</button>
                        </>
                      )}
                    </p>
                  </div>
                  {['error', 'skipped', 'warning'].includes(p.status) && (
                    <button onClick={() => setProcessing(pp => pp.filter(xx => xx.id !== p.id))}
                      className="u-muted hover:u-muted text-sm flex-shrink-0" title="Retirer">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-6" style={{ maxWidth: 1600, margin: '0 auto' }}>

        {/* Stats globales */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="u-surface u-panel border u-line px-4 py-3">
            <div className="text-xs u-muted mb-1">Total année</div>
            <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: AL.black, letterSpacing: '-0.02em' }}>
              {fmtCHF(totals.total)} <span className="text-xs font-normal u-muted">CHF</span>
            </div>
          </div>
          <div className="u-surface u-panel border u-line px-4 py-3">
            <div className="text-xs u-warn mb-1">À rembourser (perso)</div>
            <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: C.warning, letterSpacing: '-0.02em' }}>
              {fmtCHF(totals.toReimburse)} <span className="text-xs font-normal u-muted">CHF</span>
            </div>
          </div>
          <div className="u-surface u-panel border u-line px-4 py-3">
            <div className="text-xs u-info mb-1">Carte société</div>
            <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: C.info, letterSpacing: '-0.02em' }}>
              {fmtCHF(totals.company)} <span className="text-xs font-normal u-muted">CHF</span>
            </div>
          </div>
        </div>

        {/* Récap remboursements par personne */}
        {Object.keys(reimbursementsByPerson).length > 0 && (
          <div className="u-surface u-panel border u-line p-4">
            <div className="text-xs font-semibold uppercase tracking-wider u-muted mb-2">Remboursements dûs ({year})</div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(reimbursementsByPerson).map(([name, amt]) => (
                <div key={name} className="flex items-center gap-2 px-3 py-1.5 u-warn-bg border u-line u-pill">
                  <div className="w-6 h-6 u-pill flex items-center justify-center text-white text-xs font-semibold"
                    style={{ background: PERSON_COLORS[name] || C.muted }}>
                    {name?.[0]}
                  </div>
                  <span className="text-sm font-medium u-ink">{name}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: C.warning }}>{fmtCHF(amt)} CHF</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-1.5 border u-line u-pill text-sm u-surface">
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {[
            { k: 'all',      label: 'Tous' },
            { k: 'personal', label: 'Perso (à rembourser)' },
            { k: 'company',  label: 'Carte société' },
          ].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className="px-3 py-1.5 u-pill text-xs font-medium"
              style={filter === f.k ? { background: AL.black, color: 'white' } : { background: C.neutralBg, color: C.muted }}>
              {f.label}
            </button>
          ))}
          {allPeople.length > 1 && (
            <select value={person} onChange={e => setPerson(e.target.value)}
              className="px-3 py-1.5 border u-line u-pill text-sm u-surface">
              <option value="all">Toutes personnes</option>
              {allPeople.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm u-muted py-12 text-center">Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="u-surface u-panel border u-line p-12 text-center">
            <p className="text-sm u-muted">Aucun justificatif.</p>
            <p className="text-xs u-muted mt-1">Les frais sont saisis depuis la page Horaires par chaque utilisateur.</p>
          </div>
        ) : (
          <div className="u-surface u-panel border u-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="u-fill border-b u-line">
                  <th className="px-4 py-3 text-left font-semibold u-ink" style={{ fontSize: 11 }}>Date</th>
                  <th className="px-4 py-3 text-left font-semibold u-ink" style={{ fontSize: 11 }}>Personne</th>
                  <th className="px-4 py-3 text-left font-semibold u-ink" style={{ fontSize: 11 }}>Commerçant</th>
                  <th className="px-4 py-3 text-left font-semibold u-ink" style={{ fontSize: 11 }}>Catégorie</th>
                  <th className="px-4 py-3 text-left font-semibold u-ink" style={{ fontSize: 11 }}>Mode</th>
                  <th className="px-4 py-3 text-right font-semibold u-ink" style={{ fontSize: 11 }}>Montant</th>
                  <th className="px-4 py-3 text-center font-semibold u-ink" style={{ fontSize: 11 }}>Rapproché</th>
                  <th className="px-4 py-3 text-center font-semibold u-ink" style={{ fontSize: 11 }}>Reçu</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} onClick={() => setEditing(r)}
                    className="border-t u-line hover:u-fill cursor-pointer">
                    <td className="px-4 py-3 u-ink tabular-nums">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 u-pill flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                          style={{ background: PERSON_COLORS[r.user_name] || C.muted }}>
                          {r.user_name?.[0]}
                        </div>
                        <span className="text-sm">{r.user_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium u-ink">{r.merchant || '—'}</td>
                    <td className="px-4 py-3 u-ink text-xs">
                      <div>{r.category}</div>
                      {r.account
                        ? <div className="u-muted tabular-nums">{r.account}</div>
                        : r.payment_method === 'company' && <div className="u-warn">compte à définir</div>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); togglePaymentMethod(r) }}
                        className="px-2 py-0.5 u-pill text-xs font-semibold inline-block hover:opacity-80 transition-opacity"
                        title="Cliquer pour basculer perso ↔ société"
                        style={{ background: (PAYMENT_COLORS[r.payment_method || 'personal']) + '18',
                                 color: PAYMENT_COLORS[r.payment_method || 'personal'] }}>
                        {PAYMENT_LABELS[r.payment_method || 'personal']}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums u-ink">
                      {fmtCHF(r.amount)} <span className="text-xs font-normal u-muted">{r.currency || 'CHF'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.matched_transaction ? (
                        <span className="px-2 py-0.5 u-pill text-xs font-semibold inline-block"
                          style={{ background: C.successBg, color: C.success }}
                          title={`Débit du ${fmtDate(String(r.matched_transaction.date).slice(0,10))}`}>
                          ✓ payé
                        </span>
                      ) : r.payment_method === 'company' ? (
                        <span className="text-xs u-muted">à rapprocher</span>
                      ) : <span className="text-xs u-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.receipt_url ? (
                        <a href={r.receipt_url} target="_blank" rel="noopener"
                          onClick={e => e.stopPropagation()}
                          className="text-xs u-muted hover:u-ink underline">voir</a>
                      ) : r.kdrive_file_id ? (
                        <a href={`/api/kdrive/download?fileId=${r.kdrive_file_id}`} target="_blank" rel="noopener"
                          onClick={e => e.stopPropagation()}
                          className="text-xs u-muted hover:u-ink underline">voir</a>
                      ) : <span className="text-xs u-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editing && (
        <JustificatifDrawer
          row={editing}
          people={allPeople.length ? allPeople : ['Arnaud', 'Gabin', 'Guillaume']}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Drawer édition justificatif ───────────────────────────────────────────

const CATEGORIES = ['Repas', 'Transport', 'Hébergement', 'Fournitures', 'Matériel', 'Autre']

function JustificatifDrawer({ row, people, accounts = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    date:           row.date,
    amount:         row.amount ?? '',
    amount_net:     row.amount_net ?? '',
    vat_rate:       row.vat_rate ?? '',
    vat_amount:     row.vat_amount ?? '',
    currency:       row.currency || 'CHF',
    category:       row.category || 'Autre',
    account:        row.account || '',
    merchant:       row.merchant || '',
    description:    row.description || '',
    payment_method: row.payment_method || 'personal',
    user_name:      row.user_name,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-calcul HT + TVA quand on change TTC ou taux
  function recomputeFromGross(gross, rate) {
    const g = parseFloat(gross), r = parseFloat(rate)
    if (isNaN(g) || isNaN(r) || r < 0) return
    const net = g / (1 + r / 100)
    setForm(f => ({ ...f, amount_net: net.toFixed(2), vat_amount: (g - net).toFixed(2) }))
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setSaving(true); setError('')
    try {
      const params = new URLSearchParams({ id: String(row.id), userName: row.user_name })
      const r = await adminFetch(`/api/expenses?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          amount:     form.amount     === '' ? null : parseFloat(form.amount),
          amount_net: form.amount_net === '' ? null : parseFloat(form.amount_net),
          vat_rate:   form.vat_rate   === '' ? null : parseFloat(form.vat_rate),
          vat_amount: form.vat_amount === '' ? null : parseFloat(form.vat_amount),
          category: form.category,
          account: form.account,
          merchant: form.merchant,
          description: form.description,
          payment_method: form.payment_method,
        }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      onSaved()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function del() {
    if (!confirm('Supprimer ce justificatif et son reçu ?')) return
    const params = new URLSearchParams({ id: String(row.id), userName: row.user_name })
    await adminFetch(`/api/expenses?${params}`, { method: 'DELETE' })
    onSaved()
  }

  const inputCls = "w-full px-3 py-2 border u-line u-pill text-sm u-surface focus:u-line focus:outline-none"
  // Rayon panneau (15px) pour les champs multilignes : à 999px les deux coins
  // se rejoignent et le champ devient une ellipse. Dérivé, pour ne pas diverger.
  const textareaCls = inputCls.replace('u-pill', 'u-panel')

  return (
    <>
      <style>{`@keyframes drawerSlide { from { transform: translateX(100%);} to { transform: translateX(0);} }`}</style>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(15,23,42,0.35)' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="fixed top-0 right-0 bottom-0 u-surface flex flex-col shadow-2xl"
          style={{ width: '100%', maxWidth: 560, animation: 'drawerSlide 0.2s ease both', fontFamily: FONT }}>

          <div className="flex items-center justify-between px-8 py-5 border-b u-line">
            <div>
              <p className="text-xs uppercase tracking-wider u-muted mb-0.5">Justificatif · {form.user_name}</p>
              <h2 className="font-semibold u-ink" style={{ fontSize: 20 }}>{form.merchant || 'Sans commerçant'}</h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center u-pill u-muted hover:u-fill" style={{ fontSize: 22 }}>×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {row.receipt_url ? (
              <div className="u-panel overflow-hidden border u-line u-fill">
                <a href={row.receipt_url} target="_blank" rel="noopener" className="block">
                  <img src={row.receipt_url} alt="reçu" style={{ maxHeight: 280, width: '100%', objectFit: 'contain' }}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                </a>
                <div className="px-3 py-2 border-t u-line flex items-center justify-between">
                  <span className="text-xs u-muted">Reçu attaché</span>
                  <a href={row.receipt_url} target="_blank" rel="noopener" className="text-xs u-ink underline">Ouvrir en grand</a>
                </div>
              </div>
            ) : row.kdrive_file_id ? (
              <a href={`/api/kdrive/download?fileId=${row.kdrive_file_id}`} target="_blank" rel="noopener"
                className="block w-full text-center px-4 py-2 u-pill text-sm font-medium border u-line u-ink hover:u-line">
                📎 Ouvrir le justificatif ({row.kdrive_filename || 'kDrive'})
              </a>
            ) : null}
            {row.matched_transaction && (
              <div className="u-pill px-3 py-2 text-xs" style={{ background: C.successBg, color: C.success }}>
                ✓ Rapproché à un débit du {fmtDate(String(row.matched_transaction.date).slice(0,10))} ({fmtCHF(Math.abs(row.matched_transaction.amount))} CHF)
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium u-muted mb-1">Date</label>
                <input type="date" className={inputCls} value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1">Total TTC</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount}
                  onChange={e => {
                    set('amount', e.target.value)
                    if (form.vat_rate) recomputeFromGross(e.target.value, form.vat_rate)
                  }} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1">TVA</label>
                <select className={inputCls} value={form.vat_rate}
                  onChange={e => {
                    set('vat_rate', e.target.value)
                    if (form.amount) recomputeFromGross(form.amount, e.target.value)
                  }}>
                  <option value="">—</option>
                  <option value="8.1">8.1% (normal)</option>
                  <option value="2.6">2.6% (réduit)</option>
                  <option value="3.8">3.8% (hébergement)</option>
                  <option value="0">0% (exempt)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1">Montant HT</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount_net}
                  onChange={e => set('amount_net', e.target.value)}
                  placeholder="auto si TTC + taux" />
              </div>
              <div className="col-span-2 -mt-1">
                <p className="text-xs u-muted">
                  TVA : <span className="font-semibold u-ink tabular-nums">{form.vat_amount ? `${form.vat_amount} ${form.currency}` : '—'}</span>
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium u-muted mb-1">Commerçant</label>
                <input className={inputCls} value={form.merchant} onChange={e => set('merchant', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1">Catégorie</label>
                <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1">
                  Catégorie comptable
                  {row.account && !form.account && <span className="u-muted font-normal"> · apprise</span>}
                </label>
                <select className={inputCls} value={form.account} onChange={e => set('account', e.target.value)}>
                  <option value="">— à définir —</option>
                  {accounts.map(a => <option key={a.number} value={a.number}>{a.number} · {a.label}</option>)}
                </select>
                {form.merchant && (
                  <p className="text-xs u-muted mt-1">Retenu pour « {form.merchant} » aux prochains tickets.</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium u-muted mb-1">Description</label>
                <textarea rows={2} className={textareaCls} value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium u-muted mb-2">Mode de paiement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => set('payment_method', 'personal')}
                    className="py-2.5 u-pill text-sm font-medium border"
                    style={form.payment_method === 'personal'
                      ? { borderColor: C.warning, background: C.warningBg, color: C.warning }
                      : { borderColor: C.border, background: 'white', color: C.muted }}>
                    💳 Compte perso
                    <span className="block text-[10px] opacity-75 font-normal">à rembourser</span>
                  </button>
                  <button type="button"
                    onClick={() => set('payment_method', 'company')}
                    className="py-2.5 u-pill text-sm font-medium border"
                    style={form.payment_method === 'company'
                      ? { borderColor: C.info, background: C.infoBg, color: C.info }
                      : { borderColor: C.border, background: 'white', color: C.muted }}>
                    🏢 Carte société
                    <span className="block text-[10px] opacity-75 font-normal">déjà payé</span>
                  </button>
                </div>
              </div>
            </div>

            {error && <p className="text-xs u-ko">{error}</p>}
          </div>

          <div className="px-8 py-4 border-t u-line flex items-center justify-between gap-3">
            <button onClick={del} className="text-sm font-medium u-ko hover:u-ko">Supprimer</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 u-pill text-sm font-medium u-ink hover:u-fill">Annuler</button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 u-pill text-white font-medium text-sm disabled:opacity-50"
                style={{ background: AL.black }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
