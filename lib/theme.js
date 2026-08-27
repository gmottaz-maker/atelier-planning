// Design tokens — design system Amazing Lab (handoff v2, 24 août 2026).
// Valeurs finales (hifi). Utilisées en inline-style dans les pages/composants,
// conformément à la convention du codebase (pas de CSS-in-JS séparé).
//
// Les clés de `C` sont volontairement CELLES DE LA REFONTE DE JUILLET : les 17
// fichiers qui importent ce module continuent de compiler, et basculent sur la
// nouvelle identité par le seul changement de valeur. Les clés qui n'ont plus
// de rôle dans le système v2 (`faint*`, `pageBg`, `inkTertiary`…) sont
// remappées sur le rôle v2 le plus proche et marquées ci-dessous : elles
// disparaîtront écran par écran, pas d'un coup.
//
// Trois règles du système qu'aucun jeton ne peut faire respecter à ta place :
//   1. aucune ombre, aucun dégradé — la profondeur vient de l'inversion de fond ;
//   2. deux radius seulement, R.panel et R.pill — rien entre les deux ;
//   3. le corail est un accent TYPOGRAPHIQUE, jamais un aplat, et jamais
//      sous 24px sur blanc (3.2:1, il ne passe pas).

// ── Palette brute du design system ───────────────────────────────────────────
export const AL = {
  black: '#0C0C0C',
  white: '#FFFFFF',
  coral: '#FF4D6D',
  pink:  '#FFB2C0',
  grey:  '#888888',
}

// ── Rôles ────────────────────────────────────────────────────────────────────
export const C = {
  // Texte et surfaces
  ink:          AL.black,   // texte principal, panneaux inversés, sidebar, pills actives
  inkSecondary: AL.grey,    // (v1: #6b5f65) le système n'a qu'un gris secondaire
  inkTertiary:  AL.black,   // (v1: #4a3e44) le corps de texte long est noir
  muted:        AL.grey,    // texte secondaire, labels mono, compteurs
  surface:      AL.white,
  pageBg:       AL.white,   // (v1: #fdfcfc) plus de fond cassé

  // Accent — typographique uniquement
  accent:       AL.coral,
  accentSoft:   AL.pink,    // surface secondaire, fond des placeholders d'image
  accentBg:     'rgba(255,77,109,.10)', // fond de chip accent
  accentOnDark: AL.pink,    // texte rose sur fond noir

  // Filets. Une seule vraie bordure : outline, 1.5px.
  outline:      AL.black,
  border:       'rgba(12,12,12,.08)', // filet interne fort (séparateur de ligne)
  divider:      'rgba(12,12,12,.06)', // filet interne faible
  faint:        AL.grey,              // (v1: #bfb2b8)
  faintBorder:  AL.black,             // (v1: #d3c5cb) les cases à cocher sont en outline
  faintChevron: AL.grey,              // (v1: #d9cdd2)

  // Survols
  hover:        'rgba(12,12,12,.05)',   // sur surface blanche
  hoverOnDark:  'rgba(255,255,255,.08)', // dans la sidebar
  dividerOnDark:'rgba(255,255,255,.12)',
  navInactive:  'rgba(255,255,255,.68)', // items de nav inactifs (≈10.6:1)

  // Statuts. Le premier handoff v2 donnait ici les valeurs de juillet
  // (#3E8E6E / #A26A1F / #C03D2E) ; le handoff dédié à la liste de projets,
  // plus récent, revient aux jetons du design system — et c'est lui qui fait
  // référence. Les alphas de fond viennent de son tableau de badges.
  success:   '#1B7A5A',
  successBg: 'rgba(27,122,90,.10)',
  warning:   '#A66300',
  warningBg: 'rgba(166,99,0,.12)',
  danger:    '#C4002B',
  dangerBg:  'rgba(196,0,43,.10)',
  violet:    '#7A4FA0',
  violetBg:  '#F0E8F7',
  // Le seul bleu du système. Il n'a pas de rôle sémantique propre : c'est la
  // couleur de la chip d'Arnaud, réutilisée partout où une catégorie a besoin
  // d'un quatrième ton (groupe « cette semaine », facture envoyée, transport).
  info:      '#3E6D9E',
  infoBg:    'rgba(62,109,158,.12)',
  // Fond des badges neutres et des pills sans couleur.
  neutralBg: 'rgba(12,12,12,.06)',
}

// ── Typographie ──────────────────────────────────────────────────────────────
// Famille unique. Les .woff2 sont servis depuis /public/fonts (cf. globals.css).
export const FONT = "'Apercu Pro', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
// Réservée aux micro-labels, numéros de pièce, compteurs, IBAN et heures.
export const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

// ── Radius : deux valeurs, rien d'autre ──────────────────────────────────────
export const R = {
  panel: 15,  // cartes, panneaux, images, champs
  pill:  999, // tout ce qui est cliquable
  none:  0,   // bandes structurelles pleine largeur
}

// ── Espacement, base 8 ───────────────────────────────────────────────────────
export const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 }

// ── Couleurs par personne (chips) ────────────────────────────────────────────
export const PERSON = {
  Guillaume: { fg: AL.black,  bg: 'rgba(12,12,12,.08)' },
  Arnaud:    { fg: '#3E6D9E', bg: '#E5ECF4' },
  Gabin:     { fg: '#7A4FA0', bg: '#F0E8F7' },
}
export const personChip = (name) => PERSON[name] || { fg: C.muted, bg: C.hover }

// ── Catégories d'agenda Google ───────────────────────────────────────────────
export const CAL_CAT = {
  'Montage extérieur': { fg: C.accent,  bg: C.accentBg,  label: 'MONTAGE EXTÉRIEUR' },
  'Entretien':         { fg: C.success, bg: C.successBg, label: 'ENTRETIEN' },
  'Production atelier':{ fg: C.warning, bg: C.warningBg, label: 'PRODUCTION ATELIER' },
  'Visite et meeting': { fg: C.violet,  bg: C.violetBg,  label: 'VISITE ET MEETING' },
}

// ── Initiales pour avatars ───────────────────────────────────────────────────
export const initials = (name = '') =>
  name.trim().slice(0, 2).toUpperCase() || '?'
