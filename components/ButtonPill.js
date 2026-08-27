import { AL, C, FONT, R } from '../lib/theme'

// ButtonPill du design system Amazing Lab (components/core/ButtonPill.jsx).
// Repris à l'identique de la source du _ds : pill outline sur fond de surface,
// qui s'inverse COMPLÈTEMENT au survol — fond et texte en même temps, en
// 0.3s cubic-bezier(.645,.045,.355,1), sans teinte intermédiaire ni changement
// d'échelle. C'est la seule transition du système sur un bouton.
export default function ButtonPill({ children, disabled = false, onClick, href, type = 'button', style: extra, ...rest }) {
  const Tag = href ? 'a' : 'button'
  const base = {
    fontFamily: FONT,
    fontSize: '1.1rem',
    fontWeight: 400,
    lineHeight: 1,
    background: C.surface,
    color: disabled ? C.muted : AL.black,
    border: `1.5px solid ${C.outline}`,
    borderRadius: R.pill,
    padding: '0.6rem 1.2rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    transition: 'background-color .3s cubic-bezier(.645,.045,.355,1), color .3s cubic-bezier(.645,.045,.355,1)',
    ...extra,
  }
  const enter = (e) => {
    if (disabled) return
    e.currentTarget.style.background = AL.black
    e.currentTarget.style.color = AL.white
  }
  const leave = (e) => {
    if (disabled) return
    e.currentTarget.style.background = C.surface
    e.currentTarget.style.color = AL.black
  }
  return (
    <Tag
      href={href}
      type={href ? undefined : type}
      disabled={href ? undefined : disabled}
      onClick={disabled ? undefined : onClick}
      style={base}
      onMouseEnter={enter}
      onMouseLeave={leave}
      {...rest}
    >
      {children}
    </Tag>
  )
}
