import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { pdfFilename } from '../../../lib/pdfFilename'
import { buildDevisBody, DEVIS_CSS, DEVIS_FONTS } from '../../../lib/devisHtml'

// Aperçu écran de l'offre. Le document lui-même vient de `buildDevisBody`,
// le même code que le PDF (lib/devisHtml.js) : cette page ne fait que
// l'encadrer avec la barre d'outils. Auparavant elle rejouait le design et
// les calculs en JSX, et les deux ont fini par diverger.
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

  if (loading) return <div style={{ padding: 40, fontFamily: 'IBM Plex Sans, sans-serif' }}>Chargement…</div>
  if (!project) return <div style={{ padding: 40, fontFamily: 'IBM Plex Sans, sans-serif' }}>Projet introuvable</div>

  const btn = { padding: '8px 14px', borderRadius: 8, background: 'white', border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }

  return (
    <>
      <Head>
        <title>Devis · {project.name}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href={DEVIS_FONTS} rel="stylesheet" />
      </Head>

      <style jsx global>{`
        body { background: #f1f5f9; margin: 0; }
        ${DEVIS_CSS}
        .devis-doc .page { margin: 24px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        /* Mêmes marges qu'à la génération du PDF : elles se répètent sur
           chaque page, contrairement à un padding. */
        @page { size: A4; margin: 18mm 18mm 16mm; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .devis-doc .page { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Boutons de contrôle (visibles à l'écran) */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'IBM Plex Sans, sans-serif' }}>
        <button onClick={() => router.back()} style={btn}>← Retour</button>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', background: 'white' }}>
          <button
            onClick={() => router.replace({ pathname: router.pathname, query: { id } })}
            style={{ ...btn, borderRadius: 0, border: 'none', background: level === 'detail' ? '#111827' : 'white', color: level === 'detail' ? 'white' : '#374151' }}>
            Détaillé
          </button>
          <button
            onClick={() => router.replace({ pathname: router.pathname, query: { id, summary: '1' } })}
            style={{ ...btn, borderRadius: 0, border: 'none', borderLeft: '1px solid #e5e7eb', background: level === 'summary' ? '#111827' : 'white', color: level === 'summary' ? 'white' : '#374151' }}>
            Résumé
          </button>
        </div>
        <button onClick={() => window.print()} style={btn}>Imprimer</button>
        <button onClick={downloadPdf} style={{ ...btn, background: '#111827', color: 'white', border: 'none', padding: '8px 16px' }}>
          Télécharger PDF
        </button>
      </div>

      <div dangerouslySetInnerHTML={{ __html: buildDevisBody(project, company, level) }} />
    </>
  )
}
