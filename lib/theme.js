// Design tokens — refonte « Dashboard unifié » (handoff tours 11/12).
// Valeurs finales (hifi). Utilisées en inline-style dans les pages/composants,
// conformément à la convention du codebase (pas de CSS-in-JS séparé).

export const C = {
  ink:          '#241a20', // texte principal, boutons primaires, nav active, avatars
  inkSecondary: '#6b5f65', // texte secondaire, nav inactive
  inkTertiary:  '#4a3e44', // corps de texte long
  muted:        '#9a8d93', // métadonnées, labels mono, compteurs
  faint:        '#bfb2b8',
  faintBorder:  '#d3c5cb', // bordures de checkbox
  faintChevron: '#d9cdd2', // chevrons, placeholders
  accent:       '#e0506e', // rose Amazing Lab — accent seul
  accentBg:     '#fbe7ec', // fond des badges accent
  accentOnDark: '#ffb7c5', // texte rose sur fond ink
  pageBg:       '#fdfcfc',
  surface:      '#ffffff',
  border:       '#ece3e6', // bordures cartes / séparateurs forts
  divider:      '#f2eaed', // séparateurs de lignes, pills neutres
  success:      '#3e8e6e',
  successBg:    '#e2f1ea',
  danger:       '#c03d2e',
  dangerBg:     '#f9e7e4',
  warning:      '#a26a1f',
  warningBg:    '#f5ecda',
  violet:       '#7a4fa0',
  violetBg:     '#f0e8f7',
}

// Couleurs par personne (chips) — cf. 12a
export const PERSON = {
  Guillaume: { fg: '#241a20', bg: '#ece7ea' },
  Arnaud:    { fg: '#3e6d9e', bg: '#e5ecf4' },
  Gabin:     { fg: '#7a4fa0', bg: '#f0e8f7' },
}
export const personChip = (name) => PERSON[name] || { fg: C.inkSecondary, bg: C.divider }

// Catégories d'agenda Google (11a / 12b)
export const CAL_CAT = {
  'Montage extérieur':  { fg: C.accent,  bg: C.accentBg,  label: 'MONTAGE EXTÉRIEUR' },
  'Entretien':          { fg: C.success, bg: C.successBg, label: 'ENTRETIEN' },
  'Production atelier':  { fg: C.warning, bg: C.warningBg, label: 'PRODUCTION ATELIER' },
  'Visite et meeting':  { fg: C.violet,  bg: C.violetBg,  label: 'VISITE ET MEETING' },
}

export const FONT = "'Space Grotesk', sans-serif"
export const MONO = "'IBM Plex Mono', monospace"

// Logo « anneau de progression » (option 8c)
export function RingLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flex: 'none' }}>
      <circle cx="20" cy="20" r="19" fill="#E0506E" />
      <circle cx="20" cy="20" r="11" stroke="#FDF7F2" strokeWidth="2.6"
        strokeLinecap="round" strokeDasharray="52 70" transform="rotate(-90 20 20)" />
      <circle cx="20" cy="20" r="3" fill="#FDF7F2" />
    </svg>
  )
}

// Initiales pour avatars
export const initials = (name = '') =>
  name.trim().slice(0, 2).toUpperCase() || '?'
