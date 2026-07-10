import { useState } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import { computeQuoteTotal } from '../lib/quoteTotals'
import { quoteStatusMeta } from '../lib/quoteStatus'
import { C, FONT, MONO } from '../lib/theme'

// ─── Helpers ────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtCHF(n) {
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n || 0))
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}
function daysTo(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(); t.setHours(0,0,0,0)
  return Math.ceil((new Date(y, m-1, d) - t) / 86400000)
}
function dueBadge(inv) {
  if (inv.status === 'paid') return { text: 'PAYÉ', fg: C.success, bg: C.successBg }
  const d = daysTo(inv.due_date)
  if (d == null) return { text: 'SANS ÉCHÉANCE', fg: C.muted, bg: C.divider }
  if (d < 0)   return { text: `RETARD ${-d}J`, fg: C.danger, bg: C.dangerBg }
  if (d <= 7)  return { text: `DANS ${d}J`, fg: C.warning, bg: C.warningBg }
  return { text: `DANS ${d}J`, fg: C.inkSecondary, bg: C.divider }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Finances() {
  const [year, setYear] = useState(new Date().getFullYear())
  const { data: projects = [] } = useSWR('/api/projects')
  const { data: invoices = [], isLoading } = useSWR(`/api/customer-invoices?year=${year}`)
  const { data: suppliers = [] } = useSWR('/api/supplier-invoices')

  const projList  = Array.isArray(projects) ? projects : []
  const invList   = Array.isArray(invoices) ? invoices : []
  const supList   = Array.isArray(suppliers) ? suppliers : []
  const today     = todayStr()

  // ── Devis (offres) ──
  const invoicedProjectIds = new Set(invList.filter(i => i.project_id).map(i => String(i.project_id)))
  const offers = projList
    .filter(p => p.quote_data && p.quote_data.status)
    .map(p => ({ p, status: p.quote_data.status, total: computeQuoteTotal(p.quote_data), invoiced: invoicedProjectIds.has(String(p.id)) }))
  const devisEnvoyes     = offers.filter(o => o.status === 'envoye')
  const accepteAFacturer = offers.filter(o => o.status === 'accepte' && !o.invoiced)

  // ── Factures émises ──
  const notCancelled = invList.filter(i => i.status !== 'cancelled')
  const totalFacture = notCancelled.reduce((s, i) => s + (i.amount || 0), 0)
  const encaisse     = notCancelled.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0)
  const impayees     = notCancelled.filter(i => i.status !== 'paid')
  const enRetard     = impayees.filter(i => i.due_date && i.due_date < today)
  const enAttente    = impayees.filter(i => !(i.due_date && i.due_date < today))
  const montantRetard  = enRetard.reduce((s, i) => s + (i.amount || 0), 0)
  const montantAttente = enAttente.reduce((s, i) => s + (i.amount || 0), 0)

  // ── Fournisseurs à payer ──
  const fournAPayer = supList.filter(s => s.status !== 'paid')
  const montantFourn = fournAPayer.reduce((s, i) => s + (i.amount || 0), 0)

  const impayeesSorted = [...impayees].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))

  const tiles = [
    { label: 'Devis envoyés',        value: fmtCHF(devisEnvoyes.reduce((s, o) => s + o.total, 0)),     sub: `${devisEnvoyes.length} en attente de réponse` },
    { label: 'Accepté à facturer',   value: fmtCHF(accepteAFacturer.reduce((s, o) => s + o.total, 0)), sub: `${accepteAFacturer.length} offre${accepteAFacturer.length > 1 ? 's' : ''}`, color: C.violet },
    { label: 'Facturé',              value: fmtCHF(totalFacture), sub: `${notCancelled.length} facture${notCancelled.length > 1 ? 's' : ''}` },
    { label: 'Encaissé',             value: fmtCHF(encaisse),     sub: `${notCancelled.filter(i => i.status === 'paid').length} payée${notCancelled.filter(i => i.status === 'paid').length > 1 ? 's' : ''}`, color: C.success },
    { label: 'En attente',           value: fmtCHF(montantAttente), sub: `${enAttente.length} facture${enAttente.length > 1 ? 's' : ''}` },
    { label: 'En retard',            value: fmtCHF(montantRetard), sub: `${enRetard.length} facture${enRetard.length > 1 ? 's' : ''}`, danger: true },
  ]

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Finances — Maze Project</title></Head>

      <main style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.4px' }}>Finances</span>
            <span style={{ font: `11.5px ${MONO}`, color: C.muted }}>SUIVI DEVIS · FACTURES · PAIEMENTS · {year}</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y, i) => (
              <button key={y} onClick={() => setYear(y)}
                style={{ padding: '6px 14px', cursor: 'pointer', border: 'none', borderLeft: i ? `1px solid ${C.border}` : 'none', font: `${year === y ? 600 : 400} 12px ${FONT}`,
                  background: year === y ? C.ink : C.surface, color: year === y ? '#fff' : C.inkSecondary }}>
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {tiles.map(t => (
            <div key={t.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ font: `600 22px ${MONO}`, color: t.danger && montantRetard > 0 ? C.danger : (t.color || C.ink) }}>{t.value} <span style={{ fontSize: 12, fontWeight: 400, color: C.muted }}>CHF</span></span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{t.label}</span>
              <span style={{ font: `10px ${MONO}`, color: C.muted }}>{t.sub.toUpperCase()}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Factures à encaisser */}
          <section style={{ flex: '1.4 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Factures à encaisser</span>
              <span style={{ font: `11px ${MONO}`, color: C.muted }}>{impayees.length} · {fmtCHF(montantAttente + montantRetard)} CHF</span>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 16px' }}>
              {isLoading ? (
                <p style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Chargement…</p>
              ) : impayeesSorted.length === 0 ? (
                <p style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Aucune facture en attente 🎉</p>
              ) : impayeesSorted.map((inv, i) => {
                const b = dueBadge(inv)
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: i === impayeesSorted.length - 1 ? 'none' : `1px solid ${C.divider}` }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.client_name}
                        {inv.projects?.name && <span style={{ fontWeight: 400, color: C.muted }}> — {inv.projects.name}</span>}
                      </span>
                      <span style={{ font: `10.5px ${MONO}`, color: C.muted }}>{inv.invoice_number} · ÉCHÉANCE {fmtDate(inv.due_date)}</span>
                    </div>
                    <span style={{ font: `600 13px ${MONO}`, color: C.ink, whiteSpace: 'nowrap' }}>{fmtCHF(inv.amount)} {inv.currency || 'CHF'}</span>
                    <span style={{ font: `10px ${MONO}`, color: b.fg, background: b.bg, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', flex: 'none' }}>{b.text}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Colonne droite : devis + fournisseurs */}
          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Devis à suivre */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Devis à suivre</span>
                <span style={{ font: `11px ${MONO}`, color: C.muted }}>{devisEnvoyes.length + accepteAFacturer.length}</span>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 16px' }}>
                {devisEnvoyes.length + accepteAFacturer.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Rien à relancer.</p>
                ) : [...accepteAFacturer, ...devisEnvoyes].map((o, i, arr) => {
                  const m = quoteStatusMeta(o.status)
                  return (
                    <Link key={o.p.id} href={`/projects/${o.p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${C.divider}`, textDecoration: 'none', color: C.ink }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.p.name}</span>
                        <span style={{ font: `10.5px ${MONO}`, color: C.muted }}>{o.p.client}{o.status === 'accepte' ? ' · À FACTURER' : ''}</span>
                      </div>
                      <span style={{ font: `600 13px ${MONO}`, whiteSpace: 'nowrap' }}>{fmtCHF(o.total)}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: o.status === 'accepte' ? C.success : C.violet, background: o.status === 'accepte' ? C.successBg : C.violetBg, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{m.label}</span>
                    </Link>
                  )
                })}
              </div>
            </section>

            {/* Fournisseurs à payer */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Fournisseurs à payer</span>
                <span style={{ font: `11px ${MONO}`, color: C.muted }}>{fournAPayer.length} · {fmtCHF(montantFourn)} CHF</span>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 16px' }}>
                {fournAPayer.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Aucune facture fournisseur en attente.</p>
                ) : [...fournAPayer].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).map((inv, i, arr) => {
                  const b = dueBadge(inv)
                  return (
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${C.divider}` }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.supplier_name}</span>
                      <span style={{ font: `600 13px ${MONO}`, whiteSpace: 'nowrap' }}>{fmtCHF(inv.amount)}</span>
                      <span style={{ font: `10px ${MONO}`, color: b.fg, background: b.bg, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', flex: 'none' }}>{b.text}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
