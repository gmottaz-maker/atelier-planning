import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

// Même montage que tests/catalogRoute.test.js : la route appelle
// getSupabaseServer() au niveau MODULE, donc une seule fois à l'import.
let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

const kdrive = { upload: vi.fn(async () => ({ id: 42, name: 'depot.ogg' })), del: vi.fn(async () => {}) }
vi.mock('../lib/kdrive', () => ({
  upload: (...a) => kdrive.upload(...a),
  del: (...a) => kdrive.del(...a),
  ensureProjectFolder: async () => 7,
  downloadStream: async () => ({}),
}))

const transcription = { resultat: { etat: 'indisponible', texte: null, raison: null } }
vi.mock('../lib/transcription', () => ({ transcrire: async () => transcription.resultat }))

const lien = { resultat: { url: 'https://exemple.ch/a', titre: 'Devis', extrait: 'montage le 4', raison: null } }
vi.mock('../lib/lienExterne', async (vrai) => ({
  ...(await vrai()),
  lireLien: async () => lien.resultat,
}))

let entetes = {}
const PROJET = { projects: [{ id: 'p1', name: 'Expo', client: 'Manor', kdrive_folder_id: 7 }] }

beforeEach(() => {
  const c = connecter(ANONYME); base = c.base; entetes = c.headers
  kdrive.upload.mockClear(); kdrive.del.mockClear()
  transcription.resultat = { etat: 'indisponible', texte: null, raison: null }
})

const sous = (qui, tables = {}) => {
  const c = connecter(qui, { tables: { ...PROJET, ...tables } })
  base = c.base; entetes = c.headers
}

const appeler = async (options = {}) => {
  const mod = await import('../pages/api/projects/[id]/updates')
  const res = faireRes()
  await mod.default(faireReq({
    ...options,
    query: { id: 'p1', ...(options.query || {}) },
    headers: { ...entetes, ...(options.headers || {}) },
  }), res)
  return res
}

// Le banc d'essai n'applique AUCUNE contrainte : une colonne NOT NULL laissée
// vide y passe sans bruit. On inspecte donc ce qui part vers la base.
function capturerRequetes() {
  const vraiFrom = base.from.bind(base)
  const vues = []
  base.from = (nom) => { const q = vraiFrom(nom); vues.push({ nom, q }); return q }
  return vues
}
const insere = vues => vues.find(v => v.q._inserted)?.q._inserted?.[0]

// Une ligne déjà présente : le banc d'essai résout `.single()` sur un
// instantané pris AVANT l'insert, il lui faut donc de quoi répondre.
const SEMENCE = { project_updates: [
  { id: 0, project_id: 'p1', author: 'Guillaume', content: 'déjà là', created_at: '2026-01-01T00:00:00Z' },
] }

const ogg = Buffer.from('OggS' + '\0'.repeat(40)).toString('base64')
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(24),
]).toString('base64')

describe('POST /api/projects/[id]/updates — dépôt dans le dump', () => {
  it('refuse un anonyme', async () => {
    const res = await appeler({ method: 'POST', body: { author: 'X', content: 'y' } })
    expect(res.statusCode).toBe(401)
  })

  it('accepte une note simple', async () => {
    sous(MEMBRE, SEMENCE)
    const vues = capturerRequetes()
    const res = await appeler({ method: 'POST', body: { author: 'Gabin', content: '  appel client  ' } })
    expect(res.statusCode).toBe(200)
    expect(insere(vues)).toMatchObject({ project_id: 'p1', author: 'Gabin', content: 'appel client' })
  })

  it('refuse un dépôt entièrement vide', async () => {
    sous(MEMBRE)
    const res = await appeler({ method: 'POST', body: { author: 'Gabin', content: '   ' } })
    expect(res.statusCode).toBe(400)
  })

  // Un vocal ou un PDF déposé sans commentaire n'a rien à mettre dans
  // `content` : la colonne a perdu son NOT NULL, encore faut-il que la route
  // envoie null et non la chaîne vide.
  it('accepte un fichier sans texte, et envoie content null', async () => {
    sous(MEMBRE, SEMENCE)
    const vues = capturerRequetes()
    const res = await appeler({ method: 'POST', body: {
      author: 'Gabin', content: '', file: { base64: png, filename: 'photo.png' },
    } })
    expect(res.statusCode).toBe(200)
    expect(insere(vues).content).toBe(null)
    expect(insere(vues).file_kdrive_id).toBe(42)
  })

  it('refuse un type que le dump n\'accepte pas', async () => {
    sous(MEMBRE)
    const zip = Buffer.from('PK\x03\x04' + '\0'.repeat(32)).toString('base64')
    const res = await appeler({ method: 'POST', body: {
      author: 'Gabin', content: '', file: { base64: zip, filename: 'a.zip' },
    } })
    expect(res.statusCode).toBe(415)
    expect(kdrive.upload).not.toHaveBeenCalled()
  })

  // Sans service de transcription, le vocal doit quand même être déposé : c'est
  // tout l'intérêt d'avoir rendu la transcription facultative.
  it('dépose un vocal même sans service de transcription', async () => {
    sous(MEMBRE, SEMENCE)
    const vues = capturerRequetes()
    const res = await appeler({ method: 'POST', body: {
      author: 'Gabin', content: '', file: { base64: ogg, filename: 'vocal.ogg' },
    } })
    expect(res.statusCode).toBe(200)
    expect(insere(vues)).toMatchObject({ transcription: null, transcription_etat: 'indisponible' })
  })

  it('enregistre la transcription quand elle aboutit', async () => {
    transcription.resultat = { etat: 'ok', texte: 'le montage est repoussé', raison: null }
    sous(MEMBRE, SEMENCE)
    const vues = capturerRequetes()
    await appeler({ method: 'POST', body: {
      author: 'Gabin', content: '', file: { base64: ogg, filename: 'vocal.ogg' },
    } })
    expect(insere(vues)).toMatchObject({ transcription: 'le montage est repoussé', transcription_etat: 'ok' })
  })

  it('va lire un lien collé seul', async () => {
    sous(MEMBRE, SEMENCE)
    const vues = capturerRequetes()
    await appeler({ method: 'POST', body: { author: 'Gabin', content: 'https://exemple.ch/a' } })
    expect(insere(vues)).toMatchObject({ url: 'https://exemple.ch/a', url_titre: 'Devis' })
  })

  // Aller chercher une page à chaque fois qu'une note cite une URL ferait
  // partir une requête sortante pour rien, à chaque phrase.
  it('ne va PAS lire un lien cité au fil d\'une note', async () => {
    sous(MEMBRE, SEMENCE)
    const vues = capturerRequetes()
    await appeler({ method: 'POST', body: { author: 'Gabin', content: 'cf https://exemple.ch/a pour le prix' } })
    expect(insere(vues).url).toBe(null)
  })
})

describe('DELETE /api/projects/[id]/updates', () => {
  // Le filtre sur le projet manquait : un identifiant envoyé dans le corps
  // supprimait l'entrée de n'importe quel autre projet.
  it('refuse de supprimer l\'entrée d\'un autre projet', async () => {
    sous(ADMIN, { project_updates: [{ id: 9, project_id: 'AUTRE', file_kdrive_id: 5 }] })
    const res = await appeler({ method: 'DELETE', body: { updateId: 9 } })
    expect(res.statusCode).toBe(404)
    expect(kdrive.del).not.toHaveBeenCalled()
  })

  it('supprime l\'entrée du projet et son fichier', async () => {
    sous(ADMIN, { project_updates: [{ id: 9, project_id: 'p1', file_kdrive_id: 5 }] })
    const res = await appeler({ method: 'DELETE', body: { updateId: 9 } })
    expect(res.statusCode).toBe(200)
    expect(kdrive.del).toHaveBeenCalledWith(5)
  })
})

describe('GET /api/projects/[id]/updates', () => {
  // L'écran ne connaît qu'un seul jeu de noms ; les lignes d'avant la migration
  // portent encore image_*.
  it('replie les anciennes colonnes image_* sur file_*', async () => {
    sous(MEMBRE, { project_updates: [
      { id: 1, project_id: 'p1', author: 'Gabin', content: 'x', created_at: '2026-09-01T10:00:00Z',
        image_kdrive_id: 3, image_filename: 'vieille.jpg', image_mime_type: 'image/jpeg' },
    ] })
    const res = await appeler({ method: 'GET' })
    expect(res.body[0]).toMatchObject({ file_kdrive_id: 3, file_filename: 'vieille.jpg', file_mime_type: 'image/jpeg' })
    expect(res.body[0].image_kdrive_id).toBeUndefined()
  })
})
