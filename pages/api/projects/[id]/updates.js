import { getSupabaseServer } from '../../../../lib/supabase-server'

const supabase = getSupabaseServer()
import { ensureProjectFolder, upload, del } from '../../../../lib/kdrive'
import { validerFichier, nomSur, TYPES_DUMP, TYPES_AUDIO } from '../../../../lib/fileType'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { MAX_FICHIER_OCTETS } from '../../../../lib/uploadLimit'
import { extraireUrl, estSeulementUnLien, lireLien } from '../../../../lib/lienExterne'
import { transcrire } from '../../../../lib/transcription'

// Vercel refuse tout corps au-delà de 4,5 Mo avant même le démarrage de la
// fonction ; annoncer davantage ici ne ferait que promettre l'impossible.
export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } }

const CHAMPS = `id, author, content, file_kdrive_id, file_filename, file_mime_type,
  image_kdrive_id, image_filename, image_mime_type,
  url, url_titre, url_extrait, transcription, transcription_etat, created_at`

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('project_updates')
      .select(CHAMPS)
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/updates' })
    return res.status(200).json(data.map(normaliser))
  }

  // ── POST ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    // `image` reste accepté : un onglet ouvert avant le déploiement continue
    // de fonctionner.
    const { author, content, file, image } = req.body || {}
    const piece = file || image
    const texte = String(content || '').trim()
    if (!author) return res.status(400).json({ error: 'author requis' })

    // Un lien collé seul EST le dépôt ; un lien cité dans une note reste une
    // note. La distinction évite d'aller chercher une page à chaque fois que
    // quelqu'un mentionne une URL au fil d'une phrase.
    const lienSeul = estSeulementUnLien(texte) ? extraireUrl(texte) : null

    if (!texte && !piece) return res.status(400).json({ error: 'Rien à déposer' })

    let file_kdrive_id = null
    let file_filename  = null
    let file_mime_type = null
    let transcription = null
    let transcription_etat = null
    let raison_transcription = null

    if (piece?.base64 && piece?.filename) {
      // Type et taille déduits du contenu, pas de ce qu'annonce le navigateur.
      const buffer = Buffer.from(piece.base64, 'base64')
      const check = validerFichier(buffer, { maxOctets: MAX_FICHIER_OCTETS, types: TYPES_DUMP })
      if (!check.ok) return res.status(check.status).json({ error: check.error })

      const dossier = await dossierProjet(id)
      if (dossier.error) return res.status(dossier.status).json({ error: dossier.error })

      try {
        const kfile = await upload(dossier.folderId, nomSur(piece.filename, check.mime), buffer, check.mime)
        file_kdrive_id = kfile.id
        file_filename  = kfile.name
        file_mime_type = check.mime
      } catch (e) {
        return res.status(500).json({ error: 'kDrive upload: ' + e.message })
      }

      // Transcription du vocal. Non bloquante : un vocal sans texte reste un
      // vocal déposé et réécoutable, et `transcription_etat` dit pourquoi.
      if (TYPES_AUDIO.includes(check.mime)) {
        const t = await transcrire(buffer, { filename: file_filename, mime: check.mime })
        transcription = t.texte
        transcription_etat = t.etat
        raison_transcription = t.raison
      }
    }

    // Lecture de la page déposée. Non bloquante elle aussi.
    let url = null, url_titre = null, url_extrait = null, raison_lien = null
    if (lienSeul) {
      const lu = await lireLien(lienSeul)
      url = lu.url
      url_titre = lu.titre
      url_extrait = lu.extrait
      raison_lien = lu.raison
    }

    const { data: row, error: insErr } = await supabase
      .from('project_updates')
      .insert({
        project_id: id,
        author,
        content: texte || null,
        file_kdrive_id, file_filename, file_mime_type,
        url, url_titre, url_extrait,
        transcription, transcription_etat,
      })
      .select(CHAMPS)
      .single()
    if (insErr) return erreurApi(req, res, 'internal', insErr, { route: 'projects/[id]/updates' })

    return res.status(200).json({
      ...normaliser(row),
      // Ce qui n'a pas marché sans empêcher le dépôt, dit une fois à l'écran.
      avertissement: raison_transcription || raison_lien || null,
    })
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { updateId } = req.body || {}
    if (!updateId) return res.status(400).json({ error: 'updateId requis' })

    // Filtré sur le projet de l'URL : sans cela, n'importe quel identifiant
    // envoyé dans le corps supprimait l'entrée d'un autre projet.
    const { data: row } = await supabase
      .from('project_updates')
      .select('id, file_kdrive_id, image_kdrive_id')
      .eq('id', updateId).eq('project_id', id).maybeSingle()
    if (!row) return res.status(404).json({ error: 'Entrée introuvable' })

    const kid = row.file_kdrive_id || row.image_kdrive_id
    if (kid) {
      try { await del(kid) }
      catch (e) { console.warn('kDrive delete failed:', e.message) }
    }

    const { error } = await supabase.from('project_updates').delete().eq('id', updateId).eq('project_id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/updates' })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}

/**
 * Les colonnes `image_*` d'avant le dump sont recopiées dans `file_*` par la
 * migration ; ce repli couvre la fenêtre où le code tourne avant qu'elle soit
 * jouée. L'écran ne connaît qu'un seul jeu de noms.
 */
function normaliser(row) {
  if (!row) return row
  const { image_kdrive_id, image_filename, image_mime_type, ...reste } = row
  return {
    ...reste,
    file_kdrive_id: reste.file_kdrive_id ?? image_kdrive_id ?? null,
    file_filename:  reste.file_filename  ?? image_filename  ?? null,
    file_mime_type: reste.file_mime_type ?? image_mime_type ?? null,
  }
}

/** Dossier kDrive du projet, créé au premier dépôt. */
async function dossierProjet(id) {
  const { data: project, error } = await supabase
    .from('projects').select('id, name, client, kdrive_folder_id').eq('id', id).single()
  if (error || !project) return { status: 404, error: 'Projet introuvable' }

  if (project.kdrive_folder_id) return { folderId: project.kdrive_folder_id }

  let folderId
  try {
    folderId = await ensureProjectFolder(project.client, project.name)
  } catch (e) {
    return { status: 500, error: 'kDrive folder error: ' + e.message }
  }
  await supabase.from('projects').update({ kdrive_folder_id: folderId }).eq('id', id)
  return { folderId }
}
