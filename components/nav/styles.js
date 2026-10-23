// Feuille de la navigation d'essai. Classes `nv-` : elle vit à côté de la
// feuille des pages (`fx-`) et des anciens écrans, sans rien leur prendre.
import { N } from '../../lib/theme'

const t = N.tailles
export const LARGEUR_RAIL = 88

export const STYLE_NAV = `
@font-face{font-family:'General Sans';src:url('/fonts/general-sans-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'General Sans';src:url('/fonts/general-sans-500.woff2') format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:'General Sans';src:url('/fonts/general-sans-600.woff2') format('woff2');font-weight:600;font-display:swap}
.nv,.nv *{box-sizing:border-box}
.nv{font:400 ${t.corps}px/1.4 ${N.police};color:${N.encre};-webkit-font-smoothing:antialiased}
.nv a{color:inherit;text-decoration:none}
.nv button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.nv :focus-visible{outline:2px solid ${N.cobalt};outline-offset:2px;border-radius:8px}
.nv .nv-i{flex:none}
.nv .n{font-variant-numeric:tabular-nums}

/* Une entrée de navigation, dans les trois essais */
.nv-lien{display:flex;align-items:center;gap:12px;min-height:40px;padding:0 12px;border-radius:8px;color:${N.gris};font-weight:500;transition:background .12s,color .12s}
.nv-lien:hover{background:${N.doux};color:${N.encre}}
.nv-lien[aria-current=page]{background:${N.cobaltDoux};color:${N.cobalt};font-weight:600}
.nv-lien .compte{margin-left:auto;font-size:${t.petit}px;color:${N.pale};font-weight:500}
.nv-lien[aria-current=page] .compte{color:${N.cobalt}}
.nv-chercher{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 12px;border-radius:8px;background:${N.doux};color:${N.gris};width:100%}
.nv-chercher:hover{color:${N.encre}}
.nv-palette kbd{margin-left:auto;font:500 12px ${N.police};color:${N.pale};background:#fff;border-radius:6px;padding:2px 6px}
.nv-avatar{width:32px;height:32px;border-radius:50%;background:${N.encre};color:#fff;display:grid;place-items:center;font-size:12px;font-weight:600;flex:none}
.nv-version{font-size:12px;color:${N.pale};padding:0 12px}

/* ── Le rail ── */
.nv-rail{position:fixed;inset:0 auto 0 0;width:${LARGEUR_RAIL}px;background:${N.encre};color:#fff;display:flex;flex-direction:column;align-items:center;gap:4px;padding:20px 8px 16px;z-index:30;overflow-y:auto;scrollbar-width:none}
.nv-rail .logo{font-weight:600;font-size:${t.titre}px;letter-spacing:-.02em;margin-bottom:16px}
.nv-rail .logo span{color:#ff5a6e}
.nv .nv-case{display:flex;flex-direction:column;align-items:center;gap:4px;width:72px;padding:8px 0;border-radius:10px;color:rgba(255,255,255,.62);font-size:12px;font-weight:500;position:relative}
.nv-case:hover,.nv-case[aria-expanded=true]{background:rgba(255,255,255,.1);color:#fff}
.nv-case[aria-current=page],.nv-case.actif{background:#fff;color:${N.encre}}
.nv-case .pastille{position:absolute;top:4px;right:10px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:${N.cobalt};color:#fff;font-size:11px;line-height:18px;font-weight:600}
.nv-rail .sep{width:40px;height:1px;background:rgba(255,255,255,.14);margin:8px 0}
.nv-rail .bas{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:4px}
.nv-rail .nv-avatar{background:#fff;color:${N.encre}}
.nv-volet{position:fixed;top:0;bottom:0;left:${LARGEUR_RAIL}px;width:300px;background:#fff;color:${N.encre};box-shadow:12px 0 40px rgba(17,19,24,.12);padding:28px 16px;overflow-y:auto;z-index:29;display:grid;align-content:start;gap:20px;animation:nv-glisse .16s ease-out both}
.nv-volet h3{font-size:${t.titre}px;font-weight:600;padding:0 12px}
.nv-volet h4{font-size:${t.petit}px;font-weight:600;color:${N.gris};margin:0 0 4px 12px}
.nv-volet .nv-lien{min-height:38px}
@keyframes nv-entre{from{opacity:0;transform:translateY(-4px)}}
@keyframes nv-glisse{from{opacity:0;transform:translateX(-8px)}}

/* ── Sélecteur d'essai ── */
.nv-feuille{color:${N.encre}}

/* ── Recherche ⌘K ── */
.nv-palette-voile{position:fixed;inset:0;z-index:80;background:rgba(17,19,24,.35);display:flex;justify-content:center;align-items:flex-start;padding:12vh 16px 16px}
.nv-palette{width:min(640px,100%);background:#fff;color:${N.encre};border-radius:14px;box-shadow:0 24px 80px rgba(17,19,24,.3);overflow:hidden;animation:nv-entre .14s ease-out both}
.nv-palette-champ{display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid ${N.filet};color:${N.gris}}
.nv .nv-palette-champ input:focus-visible{outline:none}
.nv-palette-champ input{flex:1;min-width:0;border:0;outline:0;font:400 ${t.lead}px ${N.police};color:${N.encre};padding:20px 0;background:none}
.nv-palette ul{list-style:none;margin:0;padding:8px;max-height:56vh;overflow-y:auto}
.nv-palette li button{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:baseline;width:100%;text-align:left;padding:12px;border-radius:8px}
.nv-palette li[aria-selected=true] button{background:${N.cobaltDoux}}
.nv-palette .genre{font-size:12px;font-weight:600;color:${N.pale}}
.nv-palette .nom{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nv-palette .no{color:${N.cobalt};font-weight:600}
.nv-palette .detail{font-size:${t.petit}px;color:${N.gris};white-space:nowrap}
.nv-palette-vide{padding:20px;color:${N.gris};font-size:${t.petit}px;margin:0}

/* ── Téléphone : barre du bas ── */
.nv-bas{position:fixed;inset:auto 0 0 0;z-index:40;background:#fff;border-top:1px solid ${N.filet};display:flex;padding-bottom:env(safe-area-inset-bottom)}
.nv-bas > a,.nv-bas > button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;height:64px;font-size:12px;font-weight:500;color:${N.gris}}
.nv-bas > [aria-current=page],.nv-bas > button[aria-expanded=true]{color:${N.cobalt}}
.nv-feuille-voile{position:fixed;inset:0;z-index:41;background:rgba(17,19,24,.35);display:flex;align-items:flex-end}
.nv-feuille{width:100%;max-height:82vh;overflow-y:auto;background:#fff;border-radius:16px 16px 0 0;padding:12px 16px calc(80px + env(safe-area-inset-bottom));display:grid;gap:20px;animation:nv-monte .18s ease-out both}
.nv-feuille .poignee{width:36px;height:4px;border-radius:2px;background:${N.filet};margin:0 auto}
.nv-feuille h4{font-size:${t.petit}px;font-weight:600;color:${N.gris};margin:0 0 4px 12px}
.nv-feuille .nv-lien{min-height:48px;font-size:${t.corps}px}
@keyframes nv-monte{from{transform:translateY(24px);opacity:0}}
@media (prefers-reduced-motion:reduce){.nv *{animation:none !important;transition:none !important}}
`
