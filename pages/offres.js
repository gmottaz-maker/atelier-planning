import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import { QUOTE_STATUSES, quoteStatusMeta } from '../lib/quoteStatus'
import { computeQuoteTotal } from '../lib/quoteTotals'
import { offerCopy } from '../lib/duplicateDoc'
import SendDocumentModal from '../components/SendDocumentModal'
import { fmtCHF } from '../lib/money'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import { offreArchivee } from '../lib/autoArchive'
import ButtonPill from '../components/ButtonPill'

export default function Offres() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])

  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [dupSource, setDupSource] = useState(null)   // offre à recopier vers un projet
  const [sendDoc, setSendDoc]   = useState(null)   // { type, docId, mode, contactId, projectName, number }

  async function load() {
    setLoading(true)
    const [p, i] = await Promise.all([
      adminFetch('/api/projects').then(r => r.json()),
      adminFetch(`/api/customer-invoices?year=${new Date().getFullYear()}`).then(r => r.json()),
    ])
    setProjects(Array.isArray(p) ? p : [])
    setInvoices(Array.isArray(i) ? i : [])
    setLoading(false)
  }
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  if (user && !isAdmin) return null

  function hasQuote(p) {
    const q = p.quote_data
    if (!q) return false
    if (q.status) return true
    const lines = (q.management?.length || 0) + (q.items?.length || 0) + (q.subcontracting?.length || 0) + (q.logistics?.length || 0)
    return lines > 0
  }

  const offers = projects.filter(hasQuote).map(p => {
    const status = p.quote_data.status || 'brouillon'
    return {
      p,
      total:    computeQuoteTotal(p.quote_data),
      status,
      number:   p.quote_data.number,
      archivedManuel: !!p.quote_data.archived,
      // « Envoyée » : date d'envoi renseignée, ou statut au-delà du brouillon
      sent:     !!p.quote_data.sent_date || status !== 'brouillon',
      invoice:  invoices.find(inv => String(inv.project_id) === String(p.id)),
    }
  }).map(o => ({ ...o, archived: offreArchivee({ archived: o.archivedManuel, invoice: o.invoice }) }))
    .sort((a, b) => (a.p.deadline || '').localeCompare(b.p.deadline || ''))

  // « archived » couvre l'archivage manuel ET l'archivage automatique de fin de
  // mois (cf. lib/autoArchive.js) : une offre facturée reste dans la liste
  // courante jusqu'au dernier jour du mois de la facture.
  const active = offers.filter(o => !o.archived)
  const archivedOffers = offers.filter(o => o.archived)
  const sentCount = active.filter(o => o.sent).length
  const unsentCount = active.filter(o => !o.sent).length
  const shown = filter === 'archived' ? archivedOffers
    : filter === 'sent' ? active.filter(o => o.sent)
    : filter === 'unsent' ? active.filter(o => !o.sent)
    : filter === 'all' ? active
    : active.filter(o => o.status === filter)

  const byStatus = QUOTE_STATUSES.reduce((m, s) => { m[s.key] = active.filter(o => o.status === s.key).length; return m }, {})
  // « Accepté à facturer » est une liste de choses À FAIRE : elle se compte sur
  // les offres courantes. « Facturé » et « encaissé » sont des CUMULS de
  // l'année : les compter sur les seules offres courantes les remettrait à zéro
  // au premier du mois, à mesure que l'archivage automatique fait son travail.
  const totalAccepted = active.filter(o => o.status === 'accepte').reduce((s, o) => s + o.total, 0)
  const totalInvoiced = offers.filter(o => o.invoice).reduce((s, o) => s + (o.invoice.amount || 0), 0)
  const totalPaid     = offers.filter(o => o.invoice && o.invoice.status === 'paid').reduce((s, o) => s + (o.invoice.amount || 0), 0)

  // Duplique une offre vers un AUTRE projet : une offre vit dans le projet
  // (projects.quote_data), il n'y en a qu'une par projet.
  async function duplicateOfferTo(source, targetProject) {
    if (hasQuote(targetProject) &&
        !confirm(`« ${targetProject.name} » a déjà une offre. La remplacer par une copie de celle de « ${source.p.name} » ?`)) return
    const quote_data = offerCopy(source.p.quote_data)
    setDupSource(null)
    try {
      const r = await adminFetch(`/api/projects/${targetProject.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...targetProject, quote_data }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      load()
      router.push(`/projects/${targetProject.id}`)
    } catch (e) { alert('Duplication impossible : ' + e.message) }
  }

  async function changeOfferStatus(o, status) {
    setProjects(prev => prev.map(pr => pr.id === o.p.id ? { ...pr, quote_data: { ...pr.quote_data, status } } : pr))
    await adminFetch(`/api/projects/${o.p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...o.p, quote_data: { ...o.p.quote_data, status } }),
    }).catch(() => load())
  }
  // Enregistre un champ arbitraire dans le quote_data du projet (date d'envoi, archivage…)
  async function patchQuote(o, patch) {
    const quote_data = { ...o.p.quote_data, ...patch }
    setProjects(prev => prev.map(pr => pr.id === o.p.id ? { ...pr, quote_data } : pr))
    await adminFetch(`/api/projects/${o.p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...o.p, quote_data }),
    }).catch(() => load())
  }
  const changeOfferSentDate = (o, d) => patchQuote(o, { sent_date: d || null })
  const changeOfferArchived = (o, archived) => patchQuote(o, { archived })
  // L'archivage automatique n'est pas réversible depuis la liste : c'est une
  // conséquence du calendrier, pas un état qu'on bascule.

  // La table HTML devient une grille CSS : le prototype aligne les colonnes en
  // `fr`, et un tableau ne sait pas faire ça sans se battre avec les largeurs.
  const COLS = '2.2fr .9fr 1fr 1.3fr .8fr .9fr .8fr'
  const enTete = { display: 'grid', gridTemplateColumns: COLS, gap: 16, padding: '0 4px 10px',
    fontSize: 10.5, fontWeight: 500, fontFamily: MONO, letterSpacing: '.08em',
    textTransform: 'uppercase', color: C.muted }
  const ligne = { display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center',
    padding: '14px 4px', borderTop: `1px solid ${C.border}` }
  const pilule = (actif) => ({ fontFamily: FONT, fontSize: 13, fontWeight: actif ? 500 : 400,
    padding: '8px 16px', borderRadius: R.pill, cursor: 'pointer',
    border: actif ? '1.5px solid transparent' : `1.5px solid ${C.outline}`,
    background: actif ? AL.black : C.surface, color: actif ? AL.white : C.muted })
  const selectPilule = (meta) => ({ fontFamily: FONT, fontSize: 11, fontWeight: 500, letterSpacing: '.04em',
    padding: '3px 10px', borderRadius: R.pill, border: 'none', cursor: 'pointer',
    background: meta.bg, color: meta.color, outline: 'none' })
  const lienAction = { background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontFamily: FONT, fontSize: 12, color: C.muted, transition: 'color .15s ease' }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: AL.black }}>
      <Head><title>Offres — Maze Project</title></Head>
      <NavBar title="Offres" />

      <main className="w-full" style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>Suivi des offres</h1>
          <p style={{ fontSize: 18, color: C.muted, margin: '12px 0 0' }}>{active.length} offre{active.length > 1 ? 's' : ''} en cours</p>
        </div>

        {/* Quatre cartes outline. Le chiffre est coloré par son rôle ; le fond
            reste blanc — l'accent est typographique, jamais un aplat. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'accepté (à facturer)', value: fmtCHF(totalAccepted) + ' CHF', sub: `${byStatus.accepte || 0} offre(s)`, color: C.success },
            { label: 'facturé',              value: fmtCHF(totalInvoiced) + ' CHF', sub: `${offers.filter(o => o.invoice).length} facture(s)`, color: C.violet },
            { label: 'encaissé',             value: fmtCHF(totalPaid) + ' CHF',     sub: 'payé', color: C.success },
            { label: 'en cours',             value: `${(byStatus.brouillon || 0) + (byStatus.envoye || 0)}`, sub: 'brouillon + envoyé', color: AL.black },
          ].map((c, i) => (
            <div key={i} style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10.5, fontWeight: 500, fontFamily: MONO, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted }}>{c.label}</span>
              <span style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.1, color: c.color }}>{c.value}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{c.sub}</span>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { key: 'all',    label: 'toutes' },
            { key: 'sent',   label: 'envoyées',     count: sentCount },
            { key: 'unsent', label: 'non envoyées', count: unsentCount },
          ].map(sf => (
            <button key={sf.key} onClick={() => setFilter(sf.key)} style={pilule(filter === sf.key)}>
              {sf.label}{sf.count != null && ` ${sf.count}`}
            </button>
          ))}
          <span style={{ width: 1, height: 20, background: C.border, margin: '0 6px' }} />
          {[...QUOTE_STATUSES, { key: 'archived', label: 'Archivées' }].map(sf => (
            <button key={sf.key} onClick={() => setFilter(sf.key)} style={pilule(filter === sf.key)}>
              {sf.label.toLowerCase()} {sf.key === 'archived' ? archivedOffers.length : (byStatus[sf.key] || 0)}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Chargement…</p>
        ) : shown.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Aucune offre.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
            <div style={{ ...enTete, minWidth: 940 }}>
              <span>client / projet</span><span>n°</span><span style={{ textAlign: 'right' }}>montant</span>
              <span>statut / envoi offre</span><span>offre</span><span>facture</span><span style={{ textAlign: 'right' }}>actions</span>
            </div>
            {shown.map(o => {
              const sm = quoteStatusMeta(o.status)
              const autoRef = `${new Date().getFullYear()}-${String(o.p.id).slice(-4).toUpperCase()}`
              const inv = o.invoice
              return (
                <div key={o.p.id} style={{ ...ligne, minWidth: 940 }}>

                  <Link href={`/projects/${o.p.id}`} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, textDecoration: 'none' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 500, color: AL.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.p.name}</span>
                    <span style={{ fontSize: 12.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.p.client}</span>
                  </Link>

                  <span style={{ fontSize: 12.5, fontFamily: MONO, color: C.muted }}>{o.number || autoRef}</span>

                  <span style={{ fontSize: 14, fontWeight: 500, textAlign: 'right', color: AL.black, fontVariantNumeric: 'tabular-nums' }}>{fmtCHF(o.total)}</span>

                  {/* Statut empilé sur la date d'envoi, comme le veut le handoff */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', minWidth: 0 }}>
                    <select value={o.status} onChange={e => changeOfferStatus(o, e.target.value)} style={selectPilule(sm)}>
                      {QUOTE_STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                    </select>
                    <input type="date" value={o.p.quote_data.sent_date || ''} onChange={e => changeOfferSentDate(o, e.target.value)}
                      title="Date d'envoi de l'offre"
                      style={{ fontFamily: FONT, fontSize: 11, color: C.muted, padding: '4px 10px', borderRadius: R.pill,
                        border: `1px solid ${C.border}`, background: C.surface, outline: 'none', maxWidth: 140 }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <a href={`/projects/${o.p.id}/devis`} target="_blank" rel="noopener" style={{ ...lienAction, textDecoration: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.color = AL.black }} onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>pdf</a>
                    <button onClick={() => setSendDoc({ type: 'devis', docId: o.p.id, mode: 'detail', contactId: o.p.client_contact_id, projectName: o.p.name, number: o.number || autoRef })}
                      title="Envoyer l'offre par e-mail" style={lienAction}
                      onMouseEnter={e => { e.currentTarget.style.color = AL.black }} onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>envoyer</button>
                  </div>

                  {/* Deux états, et deux seulement : tant que la facture
                      n'existe pas, on propose de la créer ; dès qu'elle existe,
                      la ligne dit « facturé » et se tait. Le détail de la
                      facture (numéro, statut, envoi, PDF) vit dans l'écran
                      Factures sortantes, pas en double ici. */}
                  <div style={{ minWidth: 0 }}>
                    {inv ? (
                      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px',
                        borderRadius: R.pill, background: C.successBg, color: C.success, textTransform: 'uppercase',
                        whiteSpace: 'nowrap' }}>facturé</span>
                    ) : o.status === 'accepte' ? (
                      <Link href={`/factures-emises/new?from=${o.p.id}`}
                        style={{ fontFamily: FONT, fontSize: 12, padding: '6px 13px', borderRadius: R.pill,
                          border: `1.5px solid ${C.outline}`, color: AL.black, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        créer la facture
                      </Link>
                    ) : (
                      <span style={{ color: C.muted, fontSize: 13 }}>—</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => setDupSource(o)} title="Dupliquer cette offre vers un autre projet" style={lienAction}
                      onMouseEnter={e => { e.currentTarget.style.color = AL.black }} onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>dupliquer</button>
                    <button onClick={() => changeOfferArchived(o, !o.archived)} title={o.archived ? 'Désarchiver' : 'Archiver'} style={lienAction}
                      onMouseEnter={e => { e.currentTarget.style.color = AL.black }} onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                      {o.archived ? 'désarchiver' : 'archiver'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Choix du projet vers lequel recopier l'offre */}
      {dupSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.35)' }}
          onClick={e => e.target === e.currentTarget && setDupSource(null)}>
          <div className="w-full flex flex-col" style={{ maxWidth: 520, maxHeight: '80vh', background: C.surface, borderRadius: R.panel, border: `1.5px solid ${C.outline}` }}>
            <div className="px-6 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10.5, fontWeight: 500, fontFamily: MONO, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 2px' }}>Dupliquer l'offre</p>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: AL.black, margin: 0 }}>{dupSource.p.name}</h2>
              <p style={{ fontSize: 12.5, color: C.muted, margin: '6px 0 0' }}>
                Choisis le projet qui recevra une copie de cette offre. Elle y repartira en brouillon,
                sans numéro ni date d'envoi.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {projects.filter(pr => String(pr.id) !== String(dupSource.p.id)).map(pr => (
                <button key={pr.id} onClick={() => duplicateOfferTo(dupSource, pr)}
                  className="w-full text-left px-6 py-3 flex items-center gap-3"
                  style={{ border: 'none', borderTop: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.hover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate" style={{ fontSize: 14, fontWeight: 500, color: AL.black }}>{pr.name}</span>
                    <span className="block truncate" style={{ fontSize: 12.5, color: C.muted }}>{pr.client}</span>
                  </span>
                  {hasQuote(pr) && (
                    <span className="flex-shrink-0"
                      style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px', borderRadius: R.pill, background: C.warningBg, color: C.warning }}>a déjà une offre</span>
                  )}
                </button>
              ))}
              {projects.filter(pr => String(pr.id) !== String(dupSource.p.id)).length === 0 && (
                <p className="px-6 py-8 text-center" style={{ fontSize: 13, color: C.muted }}>Aucun autre projet actif.</p>
              )}
            </div>
            <div className="px-6 py-3 text-right" style={{ borderTop: `1px solid ${C.border}` }}>
              <ButtonPill onClick={() => setDupSource(null)} style={{ fontSize: 13, padding: '0.45rem 1rem' }}>annuler</ButtonPill>
            </div>
          </div>
        </div>
      )}

      {sendDoc && (
        <SendDocumentModal
          type={sendDoc.type} docId={sendDoc.docId} mode={sendDoc.mode}
          contactId={sendDoc.contactId} projectName={sendDoc.projectName} number={sendDoc.number}
          onClose={() => setSendDoc(null)} onSent={() => load()} />
      )}
    </div>
  )
}
