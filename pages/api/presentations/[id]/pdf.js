// Le PDF de la présentation : 1920 × 1080 par page, une page par écran.
//
// `?deposer=1` dépose en plus le fichier dans le dossier kDrive du projet et
// marque la présentation comme envoyée — c'est ce geste, et pas le
// téléchargement, qui fait d'un brouillon une pièce du dossier.
//
// ATTENTION : cette route DOIT figurer dans `outputFileTracingIncludes`
// (next.config.js) avec le binaire Chromium ET les polices Apercu. Sans cela
// le PDF sort en Helvetica, ou pas du tout, en production seulement.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { htmlToPdf } from '../../../../lib/htmlToPdf'
import { contentDisposition } from '../../../../lib/contentDisposition'
import { pdfFilename } from '../../../../lib/pdfFilename'
import { deckHtml, policesEmbarquees } from '../../../../lib/deckHtml'
import { hydraterImages } from '../../../../lib/presentation'
import { downloadStream, ensureProjectFolder, upload } from '../../../../lib/kdrive'

export const config = { maxDuration: 120 }

const supabase = getSupabaseServer()

/** Un visuel kDrive, en base64, pour qu'il voyage dans le document. */
async function telechargerVisuel(kdriveId) {
  const r = await downloadStream(kdriveId)
  const buffer = Buffer.from(await r.arrayBuffer())
  return { base64: buffer.toString('base64'), mime: r.headers.get('content-type') }
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query

  const { data: presentation, error } = await supabase
    .from('presentations').select('id, project_id, titre, contenu').eq('id', id).maybeSingle()
  if (error || !presentation) return res.status(404).json({ error: 'Présentation introuvable' })

  const { data: projet } = await supabase
    .from('projects').select('id, name, client, kdrive_folder_id').eq('id', presentation.project_id).maybeSingle()
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

  let pdf
  try {
    const contenu = await hydraterImages(presentation.contenu || {}, telechargerVisuel)
    // Tout est dans le document — police et visuels en data-URI : il n'y a
    // rien à attendre du réseau, mais beaucoup à dessiner (dix-sept pages de
    // 1920 × 1080). D'où `load` plutôt que l'inactivité réseau, et trois
    // minutes de patience au lieu de trente secondes.
    pdf = Buffer.from(await htmlToPdf(deckHtml(contenu, { polices: policesEmbarquees() }), null,
      { attendre: 'load', delai: 180000 }))
  } catch (e) {
    console.error('presentation pdf:', e)
    return res.status(500).json({ error: 'Génération PDF impossible : ' + e.message })
  }

  const nom = pdfFilename('presentation', projet.name)

  if (req.query.deposer) {
    try {
      let dossier = projet.kdrive_folder_id
      if (!dossier) {
        dossier = await ensureProjectFolder(projet.client, projet.name)
        await supabase.from('projects').update({ kdrive_folder_id: dossier }).eq('id', projet.id)
      }
      const fichier = await upload(dossier, nom, pdf, 'application/pdf')
      await supabase.from('presentations').update({
        kdrive_id: fichier.id, kdrive_nom: fichier.name, envoyee_le: new Date().toISOString(),
      }).eq('id', id)
      return res.status(200).json({ kdrive_id: fichier.id, kdrive_nom: fichier.name })
    } catch (e) {
      console.error('presentation depot:', e)
      return res.status(502).json({ error: 'Dépôt sur kDrive impossible' })
    }
  }

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', contentDisposition(nom, req.query.download ? 'attachment' : 'inline'))
  res.setHeader('Cache-Control', 'no-store')
  res.send(pdf)
}
