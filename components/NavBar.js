/**
 * NavBar — barre supérieure simple (titre + actions).
 * La navigation entre pages est gérée par <Sidebar /> dans _app.js.
 *
 * Props:
 *   title    – nom de la page (ex: "projets", "horaires")
 *   children – boutons d'action à droite
 */
import { AL, C, FONT } from '../lib/theme'

export default function NavBar({ title, children }) {
  return (
    <header
      className="sticky top-0 z-20"
      style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        fontFamily: FONT,
      }}
    >
      <div className="w-full px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {title && (
            <h1 style={{ fontSize: 15, fontWeight: 500, color: AL.black, textTransform: 'lowercase', margin: 0 }}>
              {title}
            </h1>
          )}
        </div>

        {children && (
          <div className="flex items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </header>
  )
}
