import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import ContactPicker from '../components/ContactPicker'
import CatalogPicker, { toPurchaseRow, toRateRow } from '../components/CatalogPicker'
import SendDocumentModal from '../components/SendDocumentModal'
import { pdfFilename } from '../lib/pdfFilename'
import { invoiceCopyBody } from '../lib/duplicateDoc'
import { fmtCHF as fmtMontant } from '../lib/money'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import { factureArchivee } from '../lib/autoArchive'
import { effectiveStatus, correspondAuFiltre } from '../lib/customerStatus'
import ButtonPill from '../components/ButtonPill'

const PINK = AL.black
const STATUS_LABELS = { created: 'Créée', sent: 'Envoyée', pending: 'En attente', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' }
// Un statut, une couleur, partout dans l'application.
// « Envoyée » est BLEUE — c'est le même bleu que la chip d'Arnaud et que le
// groupe « cette semaine » des tâches, le seul rôle catégoriel du système.
// Surlignage d'une facture en retard : toute la ligne, en rouge très clair.
// Assez pour la repérer d'un coup d'œil dans la liste, assez faible pour que le
// texte noir garde son contraste.
const RETARD_BG        = 'rgba(196,0,43,.06)'
const RETARD_BG_SURVOL = 'rgba(196,0,43,.11)'
export const SENT_BLUE    = C.info 
export const SENT_BLUE_BG = C.infoBg
const STATUS_COLORS = { created: C.muted, sent: SENT_BLUE, pending: C.warning, paid: C.success, overdue: C.danger, cancelled: C.muted }
const STATUS_BG     = { created: C.neutralBg, sent: SENT_BLUE_BG, pending: C.warningBg, paid: C.successBg, overdue: C.dangerBg, cancelled: C.neutralBg }

function fmtCHF(n) {
  if (n == null) return '—'
  return fmtMontant(n)
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

// ── Snapshot de devis ──────────────────────────────────────────────
// Nouveau format (groupé par item) vs ancien format plat.
const _num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const _uid = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
// Escompte par ligne : % puis montant CHF, sur le montant facturé (borné à 0).
const applyDiscount = (amt, r) => Math.max(0, amt * (1 - _num(r.discount) / 100) - _num(r.discount_amount))
function isGroupedQuote(q) {
  return !!q && (Array.isArray(q.items) || Array.isArray(q.management))
}
// Aplatit un devis groupé { management, items, subcontracting, logistics } en
// lignes plates { purchases, labor, logistics } — marges résolues dans les
// montants facturables (pour le total et l'éditeur de lignes).
function flattenQuote(q) {
  q = q || {}
  const gm = q.general_margin ?? ''
  const effMargin = r => (r?.margin !== '' && r?.margin != null ? _num(r.margin) : _num(gm))
  if (!isGroupedQuote(q)) {
    return {
      purchases: (q.purchases || []).map(r => ({ ...r, _uid: r._uid || _uid() })),
      labor:     (q.labor     || []).map(r => ({ ...r, _uid: r._uid || _uid() })),
      logistics: (q.logistics || []).map(r => ({ ...r, _uid: r._uid || _uid() })),
    }
  }
  const purchases = []
  const labor = (q.management || []).map(r => ({
    ...r, item: r.item || 'Gestion de projet / visuel', _uid: r._uid || _uid(),
  }))
  for (const it of (q.items || [])) {
    const itemName = it.name || 'Item'
    for (const r of (it.purchases || [])) {
      purchases.push({
        ...r, item: itemName,
        margin: r.margin !== '' && r.margin != null ? r.margin : gm,
        _uid: r._uid || _uid(),
      })
    }
    for (const r of (it.labor || [])) labor.push({ ...r, item: itemName, _uid: r._uid || _uid() })
  }
  for (const r of (q.subcontracting || [])) {
    labor.push({
      ...r,
      item: r.item ? `Sous-traitance · ${r.item}` : 'Sous-traitance',
      rate: (_num(r.rate) * (1 + effMargin(r) / 100)).toFixed(2),
      _uid: r._uid || _uid(),
    })
  }
  // Logistique : marge propre à la ligne sinon 0 (jamais la marge générale) —
  // cohérent avec buildQuoteSections/l'offre.
  const marginLog = r => (r?.margin !== '' && r?.margin != null ? _num(r.margin) : 0)
  const logistics = (q.logistics || []).map(r => ({
    ...r, rate: (_num(r.rate) * (1 + marginLog(r) / 100)).toFixed(2), _uid: r._uid || _uid(),
  }))
  return { purchases, labor, logistics }
}


export default function FacturesEmises() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null
  const [invoices, setInvoices] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [year, setYear]         = useState(new Date().getFullYear())
  const [filter, setFilter]     = useState('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [createForProject, setCreateForProject] = useState(null)

  // ?from=projectId (ancien lien) → page complète de création pré-remplie
  useEffect(() => {
    if (router.query.from) router.replace(`/factures-emises/new?from=${router.query.from}`)
  }, [router.query.from])

  async function load() {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      adminFetch(`/api/customer-invoices?year=${year}`).then(r => r.json()),
      adminFetch('/api/projects').then(r => r.json()),
    ])
    setInvoices(Array.isArray(r1) ? r1 : [])
    setProjects(Array.isArray(r2) ? r2.filter(p => p.status === 'active') : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [year])

  // Le PDF se télécharge par un LIEN, pas par un fetch suivi d'un clic
  // programmatique sur un <a download>.
  //
  // Pourquoi : la génération prend plusieurs secondes. Quand le clic simulé
  // finit par partir, le geste utilisateur a expiré et Chrome classe le
  // téléchargement comme « automatique ». Au deuxième, il demande l'autorisation
  // « Télécharger plusieurs fichiers ? » — et tant qu'elle n'est pas accordée,
  // il bloque SILENCIEUSEMENT tous les suivants pour cette origine. D'où le
  // symptôme : le premier PDF passe, aucun autre ensuite, et seule une purge
  // des données du site débloque.
  //
  // Une navigation vers l'URL, elle, est un téléchargement demandé par
  // l'utilisateur : pas de permission, pas de blocage, et rien à révoquer.
  const pdfHref = (inv) =>
    `/api/customer-invoices/${inv.id}/pdf?download=1&n=${encodeURIComponent(pdfFilename('facture', inv.projects?.name || inv.object || inv.client_name))}`

  // Duplique une facture : nouveau numéro, dates du jour, statut « créée ».
  async function duplicate(inv) {
    if (!confirm(`Dupliquer la facture ${inv.invoice_number} ?\n\nUne nouvelle facture sera créée avec le même contenu, un nouveau numéro et la date du jour.`)) return
    try {
      const r = await adminFetch('/api/customer-invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceCopyBody(inv)),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      router.push(`/factures-emises/${d.id}`)
    } catch (e) { alert('Duplication impossible : ' + e.message) }
  }

  // Mise à jour d'une facture depuis la liste (statut, dates) — optimiste, avec
  // resynchronisation seulement en cas d'échec.
  async function patchInvoice(inv, patch) {
    setInvoices(prev => prev.map(x => x.id === inv.id ? { ...x, ...patch } : x))
    try {
      const r = await adminFetch(`/api/customer-invoices/${inv.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
    } catch (e) {
      alert('Enregistrement impossible : ' + e.message)
      load()
    }
  }

  // Changer le statut renseigne la date correspondante si elle manque, pour ne
  // pas avoir à la saisir à la main dans le cas courant.
  function changeStatus(inv, status) {
    const patch = { status }
    const now = new Date().toISOString().slice(0, 10)
    if (status === 'sent' && !inv.sent_at) patch.sent_at = now
    if (status === 'paid' && !inv.paid_at) patch.paid_at = now
    patchInvoice(inv, patch)
  }

  // La date affichée suit le statut : date de paiement si payée, sinon d'envoi.
  const dateFieldOf = inv => (inv.status === 'paid' ? 'paid_at' : 'sent_at')
  const [sendDoc, setSendDoc] = useState(null)
  function openSend(inv) {
    const proj = projects.find(p => String(p.id) === String(inv.project_id))
    setSendDoc({ type: 'facture', docId: inv.id, contactId: proj?.client_contact_id, projectName: proj?.name || inv.object || inv.client_name, number: inv.invoice_number })
  }

  // Archivage automatique de fin de mois (cf. lib/autoArchive.js) : une facture
  // payée quitte la liste courante le premier jour du mois suivant.
  const archivees = invoices.filter(inv => factureArchivee(inv))
  const courantes = invoices.filter(inv => !factureArchivee(inv))

  const visible = filter === 'archived' ? archivees
    : filter === 'all' ? courantes
    : courantes.filter(inv => correspondAuFiltre(inv, filter))

  // « En attente » et « en retard » répondaient à la même question — combien
  // reste-t-il à rentrer ? — en la coupant en deux. Un seul champ, « à
  // encaisser », et le retard se lit sur les lignes concernées.
  const totals = invoices.reduce((acc, inv) => {
    const st = effectiveStatus(inv)
    acc.total += parseFloat(inv.amount || 0)
    if (st === 'pending' || st === 'overdue' || st === 'sent') acc.aEncaisser += parseFloat(inv.amount || 0)
    if (st === 'overdue') acc.overdue += parseFloat(inv.amount || 0)
    if (st === 'paid')    acc.paid    += parseFloat(inv.amount || 0)
    return acc
  }, { total: 0, aEncaisser: 0, overdue: 0, paid: 0 })

  // Grille de colonnes du handoff : n° · client · projet · émise le · échéance
  // · montant · statut · actions.
  const COLS = '.8fr 1.3fr 1.7fr .9fr .9fr 1fr 1.1fr 1.4fr'
  const enTete = { display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '0 4px 10px',
    fontSize: 10.5, fontWeight: 500, fontFamily: MONO, letterSpacing: '.08em',
    textTransform: 'uppercase', color: C.muted }
  const ligne = { display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center',
    padding: '13px 4px', borderTop: `1px solid ${C.border}`, transition: 'background .15s ease' }
  const lienAction = { background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontFamily: FONT, fontSize: 12, color: C.muted, transition: 'color .15s ease' }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: AL.black }}>
      <Head><title>Maze Project — Factures émises</title></Head>

      <NavBar title="Factures émises" />

      <main className="w-full" style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>Factures sortantes</h1>
            <p style={{ fontSize: 18, color: C.muted, margin: '12px 0 0' }}>{visible.length} facture{visible.length > 1 ? 's' : ''} · {year}</p>
          </div>
          <ButtonPill onClick={() => router.push('/factures-emises/new')}>+ nouvelle facture</ButtonPill>
        </div>

        {/* Quatre totaux en cartes outline */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { label: 'total année', value: totals.total,      color: AL.black },
            { label: 'à encaisser', value: totals.aEncaisser, color: C.warning,
              sub: totals.overdue > 0 ? `dont ${fmtCHF(totals.overdue)} en retard` : null },
            { label: 'encaissé',    value: totals.paid,       color: C.success },
          ].map(st => (
            <div key={st.label} style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10.5, fontWeight: 500, fontFamily: MONO, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted }}>{st.label}</span>
              <span style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.1, color: st.color, fontVariantNumeric: 'tabular-nums' }}>
                {fmtCHF(st.value)} <span style={{ fontSize: 12, fontWeight: 400, color: C.muted }}>CHF</span>
              </span>
              {st.sub && <span style={{ fontSize: 12, color: C.danger }}>{st.sub}</span>}
            </div>
          ))}
        </div>

        {/* Année + filtres de statut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ fontFamily: FONT, fontSize: 13, padding: '8px 16px', borderRadius: R.pill,
              border: `1.5px solid ${C.outline}`, background: C.surface, color: AL.black, cursor: 'pointer' }}>
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {['all', 'created', 'sent', 'pending', 'overdue', 'paid', 'cancelled', 'archived'].map(f2 => {
            const actif = filter === f2
            return (
              <button key={f2} onClick={() => setFilter(f2)}
                style={{ fontFamily: FONT, fontSize: 13, fontWeight: actif ? 500 : 400, padding: '8px 16px', borderRadius: R.pill,
                  cursor: 'pointer', border: actif ? '1.5px solid transparent' : `1.5px solid ${C.outline}`,
                  background: actif ? AL.black : C.surface, color: actif ? AL.white : C.muted }}>
                {f2 === 'all' ? 'toutes' : f2 === 'archived' ? `archivées ${archivees.length}` : STATUS_LABELS[f2].toLowerCase()}
              </button>
            )
          })}
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: C.muted, padding: '48px 0', textAlign: 'center' }}>Chargement…</p>
        ) : visible.length === 0 ? (
          <p style={{ fontSize: 13, color: C.muted, padding: '48px 0', textAlign: 'center' }}>Aucune facture.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
            <div style={{ ...enTete, minWidth: 1080 }}>
              <span>n°</span><span>client</span><span>projet</span><span>émise le</span><span>échéance</span>
              <span style={{ textAlign: 'right' }}>montant</span><span>statut</span><span style={{ textAlign: 'right' }}>actions</span>
            </div>
            {visible.map(inv => {
              const st = effectiveStatus(inv)
              return (
                <div key={inv.id} style={{ ...ligne, minWidth: 1080, cursor: 'pointer', background: st === 'overdue' ? RETARD_BG : 'transparent' }}
                  onClick={() => router.push(`/factures-emises/${inv.id}`)}
                  onMouseEnter={e => { e.currentTarget.style.background = st === 'overdue' ? RETARD_BG_SURVOL : C.hover }}
                  onMouseLeave={e => { e.currentTarget.style.background = st === 'overdue' ? RETARD_BG : 'transparent' }}>

                  <span style={{ fontSize: 12.5, fontFamily: MONO, color: C.muted }}>{inv.invoice_number}</span>
                  <span style={{ fontSize: 13.5, color: AL.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.client_name}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: AL.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.projects?.name || inv.object || '—'}</span>
                  <span style={{ fontSize: 12.5, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(inv.issue_date)}</span>
                  <span style={{ fontSize: 12.5, color: st === 'overdue' ? C.danger : C.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(inv.due_date)}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, textAlign: 'right', color: AL.black, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCHF(inv.amount)} <span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>{inv.currency}</span>
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }} onClick={e => e.stopPropagation()}>
                    <select value={inv.status || 'created'} onChange={e => changeStatus(inv, e.target.value)} title="Changer le statut"
                      style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px',
                        borderRadius: R.pill, border: 'none', cursor: 'pointer', outline: 'none',
                        background: STATUS_BG[st], color: STATUS_COLORS[st] }}>
                      {['created', 'sent', 'pending', 'paid', 'cancelled'].map(k => (
                        <option key={k} value={k} style={{ color: AL.black, background: C.surface }}>{STATUS_LABELS[k]}</option>
                      ))}
                    </select>
                    <input type="date"
                      value={inv[dateFieldOf(inv)] ? String(inv[dateFieldOf(inv)]).slice(0, 10) : ''}
                      onChange={e => patchInvoice(inv, { [dateFieldOf(inv)]: e.target.value || null })}
                      title={inv.status === 'paid' ? 'Date de paiement' : "Date d'envoi"}
                      style={{ width: 124, fontFamily: FONT, fontSize: 11, color: C.muted, padding: '4px 10px',
                        borderRadius: R.pill, border: `1px solid ${C.border}`, background: C.surface, outline: 'none' }} />
                  </div>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <a href={pdfHref(inv)} title="Télécharger le PDF (avec QR-bill)"
                      style={{ ...lienAction, textDecoration: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                      onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>pdf</a>
                    {[
                      { label: 'envoyer',   title: 'Envoyer la facture par e-mail',                   act: () => openSend(inv) },
                      { label: 'dupliquer', title: 'Créer une nouvelle facture avec le même contenu', act: () => duplicate(inv) },
                    ].map(b => (
                      <button key={b.label} title={b.title} onClick={b.act} style={lienAction}
                        onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {sendDoc && (
        <SendDocumentModal
          type={sendDoc.type} docId={sendDoc.docId} mode={sendDoc.mode}
          contactId={sendDoc.contactId} projectName={sendDoc.projectName} number={sendDoc.number}
          onClose={() => setSendDoc(null)} onSent={() => load()} />
      )}
    </div>
  )
}
