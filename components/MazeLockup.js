import { useCallback, useEffect, useRef } from 'react'
import { AL, C, FONT } from '../lib/theme'

// Lockup « maze / project » du handoff v2 : deux lignes empilées, alignées à
// gauche, qui doivent faire EXACTEMENT la même largeur — le « m » et le « e »
// de maze tombent sur le « p » et le « t » de PROJECT.
//
// Cet alignement n'est pas obtenable en CSS statique : la largeur naturelle des
// deux mots dépend de la police. On mesure, puis on étire « maze » en scaleX.
// Trois précautions, chacune pour un bug déjà vu :
//   - remettre `transform: none` AVANT de mesurer, sinon on mesure la largeur
//     déjà transformée et l'échelle dérive à chaque appel ;
//   - recalculer après `document.fonts.ready` — au premier rendu la police de
//     substitution est encore en place et la mesure est fausse ;
//   - recalculer au resize, parce que la sidebar peut changer de largeur.
export default function MazeLockup({ size = 24, color = AL.white }) {
  const mazeRef = useRef(null)
  const projectRef = useRef(null)

  const fit = useCallback(() => {
    const m = mazeRef.current, p = projectRef.current
    if (!m || !p) return
    m.style.transform = 'none'
    const natural = m.getBoundingClientRect().width
    const target = p.getBoundingClientRect().width
    if (natural) m.style.transform = `scaleX(${target / natural})`
  }, [])

  useEffect(() => {
    fit()
    if (document.fonts?.ready) document.fonts.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
      <span
        ref={mazeRef}
        style={{
          display: 'inline-block', fontFamily: FONT, fontSize: size, fontWeight: 500,
          lineHeight: 1, color, transformOrigin: 'left top',
        }}
      >
        maz<span style={{ color: C.accent }}>e</span>
      </span>
      <span
        ref={projectRef}
        style={{
          fontFamily: FONT, fontSize: Math.round(size * 10 / 24 * 10) / 10, fontWeight: 500,
          letterSpacing: '.16em', textTransform: 'uppercase', color: C.muted, lineHeight: 1,
        }}
      >
        project
      </span>
    </span>
  )
}
