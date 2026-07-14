import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { pdfFilename } from '../../../lib/pdfFilename'

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function effectiveMargin(r, generalMargin) {
  if (r?.margin !== '' && r?.margin != null) return num(r.margin)
  return num(generalMargin)
}
function purchaseTotal(r)  { return num(r.unit_price) * num(r.quantity) }
function purchaseBilled(r, gm) { return purchaseTotal(r) * (1 + effectiveMargin(r, gm) / 100) }
function serviceTotal(r)   { return num(r.rate) * num(r.quantity) }
function serviceBilled(r, gm) { return serviceTotal(r) * (1 + effectiveMargin(r, gm) / 100) }
// La logistique n'hérite pas de la marge générale : 0 % sauf marge spécifique sur la ligne
function marginLogistics(r) { return (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0 }
function serviceBilledLogistics(r) { return serviceTotal(r) * (1 + marginLogistics(r) / 100) }
// Escompte par ligne : % puis montant CHF, sur le montant facturé (borné à 0).
function applyDisc(amt, r) { return Math.max(0, amt * (1 - num(r.discount) / 100) - num(r.discount_amount)) }
function purchaseNet(r, gm) { return applyDisc(purchaseBilled(r, gm), r) }
function laborNet(r)        { return applyDisc(serviceTotal(r), r) }
function serviceNet(r, gm)  { return applyDisc(serviceBilled(r, gm), r) }
function logisticsNet(r)    { return applyDisc(serviceBilledLogistics(r), r) }
function fmtCHF(n) { return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }
function discLabel(r) {
  const p = num(r.discount), a = num(r.discount_amount)
  const parts = []
  if (p) parts.push('−' + String(r.discount).replace('.', ',') + ' %')
  if (a) parts.push('−' + fmtCHF(a) + ' CHF')
  return parts.length ? '  ·  escompte ' + parts.join(' ') : ''
}

function fmtDateLong(d) {
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function DevisPage() {
  const router = useRouter()
  const { id, summary } = router.query
  // level: 'detail' (toutes les lignes) | 'summary' (uniquement les sections avec sous-totaux)
  const level = summary === '1' ? 'summary' : 'detail'
  const [project, setProject] = useState(null)
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(p => { if (p && !p.error) setProject(p) })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetch('/api/app-settings/company_info')
      .then(r => r.json())
      .then(d => { if (d?.value) setCompany(d.value) })
      .catch(() => {})
  }, [])

  async function downloadPdf() {
    try {
      const r = await fetch(`/api/projects/${id}/devis-pdf?mode=${level === 'summary' ? 'summary' : 'detailed'}`)
      if (!r.ok) {
        let msg = `Erreur ${r.status}`
        try { const j = await r.json(); if (j.error) msg = j.error } catch (_) {}
        throw new Error(msg)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFilename('devis', project?.name)
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { alert('Génération du PDF impossible : ' + e.message) }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'Inter, sans-serif' }}>Chargement…</div>
  if (!project) return <div style={{ padding: 40, fontFamily: 'Inter, sans-serif' }}>Projet introuvable</div>

  // Normalisation : migre l'ancien format { purchases, labor, logistics } vers { management, items, subcontracting, logistics }
  const rawQ = project.quote_data || {}
  const q = (Array.isArray(rawQ.items) || Array.isArray(rawQ.management))
    ? {
        management:     rawQ.management || [],
        items:          rawQ.items || [],
        subcontracting: rawQ.subcontracting || [],
        logistics:      rawQ.logistics || [],
      }
    : {
        management: [],
        items: (rawQ.purchases?.length || rawQ.labor?.length)
          ? [{ name: 'Général', purchases: rawQ.purchases || [], labor: rawQ.labor || [] }]
          : [],
        subcontracting: [],
        logistics: rawQ.logistics || [],
      }
  const gm = rawQ.general_margin ?? ''
  const managementTotal     = (q.management || []).reduce((s, r) => s + laborNet(r), 0)
  const itemsTotal          = (q.items || []).reduce((s, it) => {
    const p = (it.purchases || []).reduce((a, r) => a + purchaseNet(r, gm), 0)
    const l = (it.labor     || []).reduce((a, r) => a + laborNet(r), 0)
    return s + p + l
  }, 0)
  const subcontractingTotal = (q.subcontracting || []).reduce((s, r) => s + serviceNet(r, gm), 0)
  const logisticsTotal      = (q.logistics || []).reduce((s, r) => s + logisticsNet(r), 0)
  const grandTotal          = managementTotal + itemsTotal + subcontractingTotal + logisticsTotal

  const today = new Date()
  const ref   = project.quote_data?.number || `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(project.id).slice(-4).toUpperCase()}`

  // Infos entreprise (réglages) — fallback Amazing Lab si pas encore chargées
  const ci = company || {}
  const ciName    = ci.name || 'Amazing Lab'
  const ciAddr    = [ci.address, [ci.zip, ci.city].filter(Boolean).join(' '), ci.country]
                      .filter(Boolean).join(' · ') || "Rue de l'Ecluse 30 · 1201 Genève · CH"
  const ciContact = [ci.email, ci.website, ci.phone].filter(Boolean).join(' · ')

  return (
    <>
      <Head>
        <title>Devis · {project.name}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        @page { size: A4; margin: 14mm 14mm 18mm 14mm; }
        body { background: #f1f5f9; font-family: 'Inter', sans-serif; color: #111827; }
        .no-print { display: block; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .devis-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
        }
      `}</style>

      {/* Boutons de contrôle (visibles à l'écran) */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => router.back()}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'white', border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          ← Retour
        </button>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', background: 'white' }}>
          <button
            onClick={() => router.replace({ pathname: router.pathname, query: { id } })}
            style={{ padding: '8px 14px', background: level === 'detail' ? '#111827' : 'white', color: level === 'detail' ? 'white' : '#374151', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Détaillé
          </button>
          <button
            onClick={() => router.replace({ pathname: router.pathname, query: { id, summary: '1' } })}
            style={{ padding: '8px 14px', background: level === 'summary' ? '#111827' : 'white', color: level === 'summary' ? 'white' : '#374151', border: 'none', borderLeft: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Résumé
          </button>
        </div>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'white', color: '#374151', border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Imprimer
        </button>
        <button
          onClick={downloadPdf}
          style={{ padding: '8px 16px', borderRadius: 8, background: '#111827', color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Télécharger PDF
        </button>
      </div>

      <div className="devis-page" style={{
        maxWidth: 800, margin: '24px auto', background: 'white',
        padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        fontSize: 10, lineHeight: 1.5,
      }}>

        {/* ── Header ── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111827', paddingBottom: 18, marginBottom: 28 }}>
          <div>
            {ci.logo && (
              <img src={ci.logo} alt="" style={{ maxHeight: 46, maxWidth: 200, objectFit: 'contain', display: 'block', marginBottom: 8 }} />
            )}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{ciName}</div>
            <div style={{ fontSize: 9.5, color: '#6b7280' }}>{ciAddr}</div>
            {ciContact && <div style={{ fontSize: 9.5, color: '#6b7280' }}>{ciContact}</div>}
            {ci.vat_number && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{ci.vat_number}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Devis</div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Réf. {ref}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{fmtDateLong(today)}</div>
            {project.reference && <div style={{ fontSize: 10, color: '#374151', marginTop: 6 }}>Référence : {project.reference}</div>}
          </div>
        </header>

        {/* ── Info client / projet ── */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Pour</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{project.client || '—'}</div>
            {(project.client_address || '').split('\n').filter(Boolean).map((l, i) => (
              <div key={i} style={{ fontSize: 10, color: '#6b7280' }}>{l}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Objet</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{project.name}</div>
            {project.short_description && (
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{project.short_description}</div>
            )}
            {project.deadline && (
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>Livraison prévue : {fmtDateLong(new Date(project.deadline))}</div>
            )}
          </div>
        </section>

        {/* ── Gestion projet ── */}
        {(q.management || []).length > 0 && (
          <SectionHeader title="Gestion projet" total={managementTotal} />
        )}
        {level === 'detail' && (q.management || []).length > 0 && (
          <DevisTable
            columns={[
              { label: 'Item',        width: '18%', align: 'left'  },
              { label: 'Description', width: 'auto',align: 'left'  },
              { label: 'Qté',         width: '8%',  align: 'right' },
              { label: 'Unité',       width: '11%', align: 'left'  },
              { label: 'Total',       width: '14%', align: 'right' },
            ]}
            rows={q.management.map(r => [
              r.item, (r.description || '') + discLabel(r),
              num(r.quantity), r.unit || '', fmtCHF(laborNet(r)),
            ])}
          />
        )}

        {/* ── Fabrication (groupe d'items) ── */}
        {(q.items || []).length > 0 && (
          <>
            <SectionHeader title="Fabrication" total={itemsTotal} />

            {(q.items || []).map((it, idx) => {
              const purchSub = (it.purchases || []).reduce((s, r) => s + purchaseNet(r, gm), 0)
              const laborSub = (it.labor || []).reduce((s, r) => s + laborNet(r), 0)
              const subTotal = purchSub + laborSub
              if (subTotal === 0 && (it.purchases || []).length === 0 && (it.labor || []).length === 0) return null
              return (
                <section key={idx} style={{
                  marginBottom: level === 'detail' ? 20 : 4, marginLeft: 6, marginTop: level === 'detail' ? 12 : 0,
                  borderLeft: level === 'detail' ? '2px solid #d1d5db' : '2px solid transparent',
                  paddingLeft: level === 'detail' ? 16 : 8,
                }}>
                  <h3 style={{
                    fontSize: 12, fontWeight: 700, color: '#111827',
                    margin: level === 'detail' ? '0 0 8px' : 0,
                    padding: level === 'detail' ? '4px 8px' : 0,
                    background: level === 'detail' ? '#f3f4f6' : 'transparent', borderRadius: 4,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  }}>
                    <span>{it.name || `Item ${idx + 1}`}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCHF(subTotal)} CHF
                    </span>
                  </h3>
                  {level === 'detail' && ((it.purchases || []).length > 0 || (it.labor || []).length > 0) && (
                    <div>
                      {(it.purchases || []).length > 0 && (
                        <DevisTable
                          title="Achats / matériel"
                          columns={[
                            { label: 'Description', width: 'auto',align: 'left'  },
                            { label: 'Dimension',   width: '15%', align: 'left'  },
                            { label: 'Qté',         width: '7%',  align: 'right' },
                            { label: 'Unité',       width: '10%', align: 'left'  },
                            { label: 'Total',       width: '13%', align: 'right' },
                          ]}
                          rows={it.purchases.map(r => [
                            (r.description || '') + discLabel(r), r.dimension,
                            num(r.quantity), r.unit || '', fmtCHF(purchaseNet(r, gm)),
                          ])}
                          subtotalLabel="Sous-total achats"
                          subtotal={purchSub}
                        />
                      )}
                      {(it.labor || []).length > 0 && (
                        <DevisTable
                          title="Main d'œuvre"
                          columns={[
                            { label: 'Description', width: 'auto',align: 'left'  },
                            { label: 'Qté',         width: '8%',  align: 'right' },
                            { label: 'Unité',       width: '11%', align: 'left'  },
                            { label: 'Total',       width: '14%', align: 'right' },
                          ]}
                          rows={it.labor.map(r => [
                            (r.description || '') + discLabel(r),
                            num(r.quantity), r.unit || '', fmtCHF(laborNet(r)),
                          ])}
                          subtotalLabel="Sous-total main d'œuvre"
                          subtotal={laborSub}
                        />
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </>
        )}

        {/* ── Sous-traitance ── */}
        {(q.subcontracting || []).length > 0 && (
          <SectionHeader title="Sous-traitance" total={subcontractingTotal} />
        )}
        {level === 'detail' && (q.subcontracting || []).length > 0 && (
          <DevisTable
            columns={[
              { label: 'Item',        width: '16%', align: 'left'  },
              { label: 'Description', width: 'auto',align: 'left'  },
              { label: 'Qté',         width: '8%',  align: 'right' },
              { label: 'Unité',       width: '11%', align: 'left'  },
              { label: 'Total',       width: '14%', align: 'right' },
            ]}
            rows={q.subcontracting.map(r => [
              r.item, (r.description || '') + discLabel(r),
              num(r.quantity), r.unit || '', fmtCHF(serviceNet(r, gm)),
            ])}
          />
        )}

        {/* ── Logistique ── */}
        {(q.logistics || []).length > 0 && (
          <SectionHeader title="Logistique" total={logisticsTotal} />
        )}
        {level === 'detail' && (q.logistics || []).length > 0 && (
          <DevisTable
            columns={[
              { label: 'Trajet',      width: '16%', align: 'left'  },
              { label: 'Description', width: 'auto',align: 'left'  },
              { label: 'Qté',         width: '8%',  align: 'right' },
              { label: 'Unité',       width: '11%', align: 'left'  },
              { label: 'Total',       width: '14%', align: 'right' },
            ]}
            rows={q.logistics.map(r => [
              r.trajet, (r.description || '') + discLabel(r),
              num(r.quantity), r.unit || '', fmtCHF(logisticsNet(r)),
            ])}
          />
        )}

        {/* ── Total général ── */}
        <div style={{
          marginTop: 28, padding: '16px 20px',
          background: '#111827', color: 'white',
          borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Total HT</span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCHF(grandTotal)} <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginLeft: 4 }}>CHF</span>
          </span>
        </div>

        {/* ── Conditions ── */}
        <footer style={{ marginTop: 32, fontSize: 9, color: '#6b7280', lineHeight: 1.7, borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
          <p style={{ marginBottom: 3 }}><strong style={{ color: '#374151', fontWeight: 600 }}>Validité :</strong> 30 jours à compter de la date d'émission.</p>
          <p style={{ marginBottom: 3 }}><strong style={{ color: '#374151', fontWeight: 600 }}>Conditions de paiement :</strong> 30 % à la commande, solde à la livraison.</p>
          <p style={{ marginBottom: 3 }}><strong style={{ color: '#374151', fontWeight: 600 }}>TVA :</strong> prix indiqués hors taxes.</p>
          <p style={{ marginTop: 10, color: '#9ca3af' }}>Devis généré le {fmtDateLong(today)} · {ciName}</p>
        </footer>

      </div>
    </>
  )
}

function SectionHeader({ title, total }) {
  return (
    <h2 style={{
      fontSize: 13, fontWeight: 700, color: '#111827',
      marginTop: 22, marginBottom: 10, paddingBottom: 6,
      borderBottom: '2px solid #111827',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>
      <span>{title}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
        Sous-total : {fmtCHF(total)} CHF
      </span>
    </h2>
  )
}

function DevisTable({ title, columns, rows, subtotalLabel, subtotal }) {
  if (rows.length === 0) return null
  return (
    <section style={{ marginBottom: 18 }}>
      {title && (
        <h4 style={{ fontSize: 8, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>{title}</h4>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #d1d5db' }}>
            {columns.map((c, i) => (
              <th key={i} style={{
                padding: '6px 4px',
                textAlign: c.align,
                fontSize: 9, fontWeight: 600, color: '#6b7280',
                letterSpacing: '0.02em',
                width: c.width,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '6px 4px',
                  verticalAlign: 'top',
                  textAlign: columns[j].align,
                  color: j === 0 ? '#111827' : '#374151',
                  fontWeight: j === 0 ? 500 : 400,
                  fontVariantNumeric: columns[j].align === 'right' ? 'tabular-nums' : undefined,
                }}>{cell || ''}</td>
              ))}
            </tr>
          ))}
          {subtotalLabel && (
            <tr>
              <td colSpan={columns.length - 1} style={{ padding: '6px 4px', textAlign: 'right', fontSize: 9.5, color: '#6b7280', fontWeight: 500 }}>{subtotalLabel}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtCHF(subtotal)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
