import { describe, it, expect } from 'vitest'
import { matiereEntree, assemblerMatiere, promptSynthese, MAX_CARACTERES_MATIERE } from '../lib/synthese'
import { estAudio, estImage, natureEntree, libelleEntree, messageTranscription, nomLisible } from '../lib/dump'
import { jourLocal } from '../lib/aujourdhui'

describe('matiereEntree', () => {
  it('prend le texte d\'une note', () => {
    expect(matiereEntree({ content: 'appel client' })).toBe('appel client')
  })
  it('prend la transcription d\'un vocal', () => {
    const m = matiereEntree({ file_filename: 'a.ogg', transcription: 'le montage est repoussé' })
    expect(m).toContain('le montage est repoussé')
  })
  it('ne compte pas deux fois un lien déposé seul', () => {
    const m = matiereEntree({ content: 'https://x.ch/a', url: 'https://x.ch/a', url_titre: 'Devis' })
    expect(m.match(/https:\/\/x\.ch\/a/g)).toHaveLength(1)
  })
  it('nomme la pièce jointe faute de mieux', () => {
    expect(matiereEntree({ file_filename: 'plan.pdf' })).toContain('plan.pdf')
  })
  it('rend null pour une entrée sans matière', () => {
    expect(matiereEntree({ content: '   ' })).toBe(null)
    expect(matiereEntree(null)).toBe(null)
  })
  it('lit encore les anciennes colonnes image_*', () => {
    expect(matiereEntree({ image_filename: 'photo.jpg' })).toContain('photo.jpg')
  })
})

describe('assemblerMatiere', () => {
  const e = (jour, content) => ({ author: 'Guillaume', content, created_at: `2026-09-${jour}T10:00:00Z` })

  it('ordonne du plus récent au plus ancien', () => {
    const { texte } = assemblerMatiere([e('01', 'vieux'), e('05', 'récent')], { jourLocal })
    expect(texte.indexOf('récent')).toBeLessThan(texte.indexOf('vieux'))
  })

  it('date chaque bloc en heure locale', () => {
    // 23h30 UTC le 4 septembre, c'est déjà le 5 en Suisse : une entrée datée
    // de la veille brouillerait la chronologie lue par le modèle.
    const { texte } = assemblerMatiere(
      [{ author: 'Gabin', content: 'x', created_at: '2026-09-04T23:30:00Z' }], { jourLocal })
    expect(texte).toContain('2026-09-05')
  })

  it('ignore les entrées vides et les compte comme telles', () => {
    const { retenues } = assemblerMatiere([e('01', 'utile'), e('02', '  ')], { jourLocal })
    expect(retenues).toBe(1)
  })

  it('plafonne la matière et dit combien d\'entrées sont laissées de côté', () => {
    const gros = 'x'.repeat(20_000)
    const entrees = Array.from({ length: 8 }, (_, i) =>
      ({ author: 'A', content: gros, created_at: `2026-09-0${i + 1}T10:00:00Z` }))
    const { texte, retenues, ignorees } = assemblerMatiere(entrees, { jourLocal })
    expect(texte.length).toBeLessThanOrEqual(MAX_CARACTERES_MATIERE)
    expect(retenues).toBeLessThan(8)
    expect(retenues + ignorees).toBe(8)
  })

  it('rend une matière vide sans entrée', () => {
    expect(assemblerMatiere([], { jourLocal })).toEqual({ texte: '', retenues: 0, ignorees: 0 })
    expect(assemblerMatiere(null, { jourLocal }).retenues).toBe(0)
  })
})

describe('promptSynthese', () => {
  it('avertit le modèle quand le fil est tronqué', () => {
    const p = promptSynthese({ projet: 'X', client: 'Y', matiere: 'm', ignorees: 3 })
    expect(p).toMatch(/3 entrées plus anciennes/)
  })
  it('n\'avertit de rien quand tout est fourni', () => {
    const p = promptSynthese({ projet: 'X', client: 'Y', matiere: 'm', ignorees: 0 })
    expect(p).not.toMatch(/plus anciennes/)
  })
  it('interdit explicitement d\'inventer', () => {
    expect(promptSynthese({ projet: 'X', matiere: 'm' })).toMatch(/N'invente rien/)
  })
})

describe('nature des entrées', () => {
  it('reconnaît les types', () => {
    expect(estAudio('audio/ogg')).toBe(true)
    expect(estAudio('application/pdf')).toBe(false)
    expect(estImage('image/png')).toBe(true)
    // Le HEIC n'est pas affichable par tous les navigateurs : il se télécharge.
    expect(estImage('image/heic')).toBe(false)
  })
  it('classe l\'entrée', () => {
    expect(natureEntree({ file_mime_type: 'audio/ogg', file_kdrive_id: 1 })).toBe('vocal')
    expect(natureEntree({ url: 'https://x.ch' })).toBe('lien')
    expect(natureEntree({ file_mime_type: 'image/jpeg', file_kdrive_id: 1 })).toBe('photo')
    expect(natureEntree({ file_mime_type: 'application/pdf', file_kdrive_id: 1 })).toBe('fichier')
    expect(natureEntree({ content: 'note' })).toBe('note')
    expect(libelleEntree({ url: 'https://x.ch' })).toBe('lien')
  })
  it('explique l\'absence de transcription', () => {
    expect(messageTranscription('ok')).toBe(null)
    expect(messageTranscription('indisponible')).toMatch(/aucun service/)
    expect(messageTranscription('echec')).toMatch(/n'a pas abouti/)
    expect(messageTranscription(null)).toBe(null)
  })
  it('retire le préfixe technique du nom de fichier', () => {
    expect(nomLisible('dump_1757500000000_plan_final.pdf')).toBe('plan_final.pdf')
    expect(nomLisible('update_1757500000000_photo.jpg')).toBe('photo.jpg')
    expect(nomLisible('plan.pdf')).toBe('plan.pdf')
  })
})
