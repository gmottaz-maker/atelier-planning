// Un chiffre, son étiquette, sa précision.
//
// Vivait dans `pages/schedule.js`, d'où `/frais` l'a tiré en déménageant : la
// même carte, dessinée deux fois, aurait fini avec deux radius.
import { AL, C, R } from '../lib/theme'

export default function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }}>{label}</span>
      <span style={{ color: color || AL.black, fontSize: 26, fontWeight: 500, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 12.5, color: C.muted }}>{sub}</span>
    </div>
  )
}
