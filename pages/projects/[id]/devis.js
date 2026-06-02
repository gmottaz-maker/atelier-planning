import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function purchaseTotal(r)  { return num(r.unit_price) * num(r.quantity) }
function purchaseBilled(r) { return purchaseTotal(r) * (1 + num(r.margin) / 100) }
function serviceTotal(r)   { return num(r.rate) * num(r.quantity) }
function fmtCHF(n) { return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

function fmtDateLong(d) {
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function DevisPage() {
  const router = useRouter()
  const { id } = router.query
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(p => { if (p && !p.error) setProject(p) })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 40, fontFamily: 'Inter, sans-serif' }}>Chargement…</div>
  if (!project) return <div style={{ padding: 40, fontFamily: 'Inter, sans-serif' }}>Projet introuvable</div>

  // Normalisation : migre l'ancien format { purchases, labor, logistics } vers { management, items, logistics }
  const rawQ = project.quote_data || {}
  const q = (Array.isArray(rawQ.items) || Array.isArray(rawQ.management))
    ? { management: rawQ.management || [], items: rawQ.items || [], logistics: rawQ.logistics || [] }
    : {
        management: [],
        items: (rawQ.purchases?.length || rawQ.labor?.length)
          ? [{ name: 'Général', purchases: rawQ.purchases || [], labor: rawQ.labor || [] }]
          : [],
        logistics: rawQ.logistics || [],
      }
  const managementTotal = (q.management || []).reduce((s, r) => s + serviceTotal(r), 0)
  const itemsTotal      = (q.items || []).reduce((s, it) => {
    const p = (it.purchases || []).reduce((a, r) => a + purchaseBilled(r), 0)
    const l = (it.labor     || []).reduce((a, r) => a + serviceTotal(r), 0)
    return s + p + l
  }, 0)
  const logisticsTotal  = (q.logistics || []).reduce((s, r) => s + serviceTotal(r), 0)
  const grandTotal      = managementTotal + itemsTotal + logisticsTotal

  const today = new Date()
  const ref   = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(project.id).slice(-4).toUpperCase()}`

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

      {/* Bouton imprimer (visible à l'écran) */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 10, display: 'flex', gap: 8 }}>
        <button
          onClick={() => router.back()}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'white', border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          ← Retour
        </button>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', borderRadius: 8, background: '#111827', color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Imprimer / PDF
        </button>
      </div>

      <div className="devis-page" style={{
        maxWidth: 800, margin: '24px auto', background: 'white',
        padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        fontSize: 11, lineHeight: 1.5,
      }}>

        {/* ── Header ── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111827', paddingBottom: 16, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Amazing Lab</div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>Rue de l'Ecluse 30 · 1201 Genève · CH</div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>hello@amazinglab.ch · amazinglab.ch</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>DEVIS</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Réf. {ref}</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>{fmtDateLong(today)}</div>
          </div>
        </header>

        {/* ── Info client / projet ── */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Pour</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{project.client || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Objet</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{project.name}</div>
            {project.short_description && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{project.short_description}</div>
            )}
            {project.deadline && (
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>Livraison prévue : {fmtDateLong(new Date(project.deadline))}</div>
            )}
          </div>
        </section>

        {/* ── Gestion de projet / visuel ── */}
        {(q.management || []).length > 0 && (
          <DevisTable
            title="Gestion de projet / visuel"
            columns={[
              { label: 'Item',        width: '18%', align: 'left'  },
              { label: 'Description', width: 'auto',align: 'left'  },
              { label: 'Prix',        width: '11%', align: 'right' },
              { label: 'Qté',         width: '7%',  align: 'right' },
              { label: 'Total',       width: '13%', align: 'right' },
            ]}
            rows={q.management.map(r => [
              r.item, r.description,
              fmtCHF(num(r.rate)), num(r.quantity), fmtCHF(serviceTotal(r)),
            ])}
            subtotalLabel="Sous-total gestion"
            subtotal={managementTotal}
          />
        )}

        {/* ── Items (Bar, Backbar, etc.) ── */}
        {(q.items || []).map((it, idx) => {
          const purchSub = (it.purchases || []).reduce((s, r) => s + purchaseBilled(r), 0)
          const laborSub = (it.labor || []).reduce((s, r) => s + serviceTotal(r), 0)
          const subTotal = purchSub + laborSub
          if (subTotal === 0 && (it.purchases || []).length === 0 && (it.labor || []).length === 0) return null
          return (
            <section key={idx} style={{ marginBottom: 26 }}>
              <h2 style={{
                fontSize: 13, fontWeight: 700, color: '#111827',
                marginBottom: 10, paddingBottom: 6,
                borderBottom: '1.5px solid #111827',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <span>{it.name || `Item ${idx + 1}`}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCHF(subTotal)} CHF
                </span>
              </h2>
              {(it.purchases || []).length > 0 && (
                <DevisTable
                  title="Achats / matériel"
                  columns={[
                    { label: 'Description', width: 'auto',align: 'left'  },
                    { label: 'Dimension',   width: '14%', align: 'left'  },
                    { label: 'P.U.',        width: '10%', align: 'right' },
                    { label: 'Qté',         width: '7%',  align: 'right' },
                    { label: 'Total',       width: '13%', align: 'right' },
                  ]}
                  rows={it.purchases.map(r => [
                    r.description, r.dimension,
                    fmtCHF(num(r.unit_price)), num(r.quantity), fmtCHF(purchaseBilled(r)),
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
                    { label: 'Prix',        width: '11%', align: 'right' },
                    { label: 'Qté',         width: '7%',  align: 'right' },
                    { label: 'Total',       width: '13%', align: 'right' },
                  ]}
                  rows={it.labor.map(r => [
                    r.description,
                    fmtCHF(num(r.rate)), num(r.quantity), fmtCHF(serviceTotal(r)),
                  ])}
                  subtotalLabel="Sous-total main d'œuvre"
                  subtotal={laborSub}
                />
              )}
            </section>
          )
        })}

        {/* ── Logistique ── */}
        {(q.logistics || []).length > 0 && (
          <DevisTable
            title="Logistique"
            columns={[
              { label: 'Item',        width: '16%', align: 'left'  },
              { label: 'Description', width: 'auto',align: 'left'  },
              { label: 'Prix',        width: '11%', align: 'right' },
              { label: 'Qté',         width: '7%',  align: 'right' },
              { label: 'Total',       width: '13%', align: 'right' },
            ]}
            rows={q.logistics.map(r => [
              r.trajet, r.description,
              fmtCHF(num(r.rate)), num(r.quantity), fmtCHF(serviceTotal(r)),
            ])}
            subtotalLabel="Sous-total logistique"
            subtotal={logisticsTotal}
          />
        )}

        {/* ── Total général ── */}
        <div style={{
          marginTop: 24, padding: '14px 18px',
          background: '#111827', color: 'white',
          borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>Total HT</span>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCHF(grandTotal)} <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>CHF</span>
          </span>
        </div>

        {/* ── Conditions ── */}
        <footer style={{ marginTop: 36, fontSize: 9, color: '#6b7280', lineHeight: 1.6, borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
          <p style={{ marginBottom: 4 }}><strong style={{ color: '#374151' }}>Validité :</strong> 30 jours à compter de la date d'émission.</p>
          <p style={{ marginBottom: 4 }}><strong style={{ color: '#374151' }}>Conditions de paiement :</strong> 30% à la commande, solde à la livraison.</p>
          <p style={{ marginBottom: 4 }}><strong style={{ color: '#374151' }}>TVA :</strong> Prix indiqués hors taxes.</p>
          <p style={{ marginTop: 10, color: '#9ca3af' }}>Devis généré le {fmtDateLong(today)} · Amazing Lab Sàrl</p>
        </footer>

      </div>
    </>
  )
}

function DevisTable({ title, columns, rows, subtotalLabel, subtotal }) {
  if (rows.length === 0) return null
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{title}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #111827' }}>
            {columns.map((c, i) => (
              <th key={i} style={{
                padding: '6px 6px',
                textAlign: c.align,
                fontSize: 9.5, fontWeight: 600, color: '#374151',
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
                  padding: '7px 6px',
                  verticalAlign: 'top',
                  textAlign: columns[j].align,
                  color: j === 0 ? '#111827' : '#374151',
                  fontWeight: j === 0 ? 500 : 400,
                  fontVariantNumeric: columns[j].align === 'right' ? 'tabular-nums' : undefined,
                }}>{cell || ''}</td>
              ))}
            </tr>
          ))}
          <tr>
            <td colSpan={columns.length - 1} style={{ padding: '8px 6px', textAlign: 'right', fontSize: 10, color: '#6b7280', fontWeight: 500 }}>{subtotalLabel}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtCHF(subtotal)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
