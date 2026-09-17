// Une rangée de pastilles de filtre, avec le compte de chaque catégorie.
//
// Le même geste sur les trois listes qui s'allongent — projets, offres,
// factures : « combien en attendent une action de ma part ? », puis un clic
// pour ne voir que celles-là. Trois copies du même bouton avaient commencé à
// diverger en taille et en graisse ; le voici une fois.
//
// Deux comportements qui comptent :
//   — une catégorie VIDE n'est pas proposée (un bouton qui ne montre rien n'a
//     rien à faire là), sauf si elle est justement sélectionnée : sinon le
//     bouton actif disparaîtrait sous le doigt ;
//   — cliquer la pastille active revient à « tout », pour qu'on sorte du filtre
//     par où on y est entré.
import { AL, C, FONT, MONO, R } from '../lib/theme'

export default function PillsFiltre({ options = [], valeur, onChange, cleTout = 'tous' }) {
  const visibles = options.filter(o => o.n == null || o.n > 0 || o.key === valeur)
  if (visibles.length <= 1) return null

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
      {visibles.map(o => {
        const actif = valeur === o.key
        return (
          <button
            key={o.key}
            onClick={() => onChange(actif && o.key !== cleTout ? cleTout : o.key)}
            style={{
              fontFamily: FONT, fontSize: 12.5, fontWeight: actif ? 500 : 400,
              padding: '6px 14px', borderRadius: R.pill, cursor: 'pointer',
              border: `1px solid ${actif ? C.outline : C.border}`,
              background: actif ? AL.black : C.surface,
              color: actif ? AL.white : C.muted,
            }}
          >
            {o.label}
            {o.n != null && <span style={{ fontFamily: MONO, fontSize: 11 }}> {o.n}</span>}
          </button>
        )
      })}
    </div>
  )
}
