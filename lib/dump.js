// Ce qu'une entrée du dump de projet est, vue de l'écran.
//
// Le fil mélange des notes, des photos, des PDF, des vocaux et des liens.
// Chacun se lit différemment — une photo s'affiche, un vocal s'écoute, un PDF
// se télécharge — et cette décision se prend au même endroit pour tous.

export const TYPES_AUDIO_LECTURE = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']

export function estAudio(mime) {
  return TYPES_AUDIO_LECTURE.includes(String(mime || ''))
}

export function estImage(mime) {
  return /^image\/(jpeg|png|webp)$/.test(String(mime || ''))
}

/** Nature de l'entrée, pour l'étiquette affichée. */
export function natureEntree(u) {
  if (!u) return 'note'
  if (estAudio(u.file_mime_type)) return 'vocal'
  if (u.url) return 'lien'
  if (estImage(u.file_mime_type)) return 'photo'
  if (u.file_kdrive_id) return 'fichier'
  return 'note'
}

const LIBELLES = {
  vocal: 'message vocal',
  lien: 'lien',
  photo: 'photo',
  fichier: 'document',
  note: 'note',
}

export function libelleEntree(u) {
  return LIBELLES[natureEntree(u)]
}

/** Pourquoi il n'y a pas de transcription sous un vocal, en une phrase. */
export function messageTranscription(etat) {
  if (etat === 'ok') return null
  if (etat === 'indisponible') return 'Pas de transcription : aucun service configuré.'
  if (etat === 'echec') return 'La transcription automatique n\'a pas abouti.'
  return null
}

/** Nom de fichier lisible : le préfixe technique du dépôt est retiré. */
export function nomLisible(nom) {
  return String(nom || '').replace(/^dump_\d+_/, '').replace(/^update_\d+_/, '')
}
