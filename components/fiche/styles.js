// Feuille de la nouvelle fiche projet. Une seule, posée par la page : les états
// de survol, les grilles qui se replient selon la largeur et les polices ne
// s'écrivent pas en style inline.
//
// Toutes les classes commencent par `fx-` : la feuille vit à côté de Tailwind
// et des styles des autres écrans, elle ne doit rien leur prendre.
import { N } from '../../lib/theme'

const t = N.tailles

export const STYLE_FICHE = `
@font-face{font-family:'General Sans';src:url('/fonts/general-sans-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'General Sans';src:url('/fonts/general-sans-500.woff2') format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:'General Sans';src:url('/fonts/general-sans-600.woff2') format('woff2');font-weight:600;font-display:swap}
@font-face{font-family:'General Sans';src:url('/fonts/general-sans-700.woff2') format('woff2');font-weight:700;font-display:swap}

.fx{background:${N.fond};color:${N.encre};font:400 ${t.corps}px/1.55 ${N.police};-webkit-font-smoothing:antialiased;min-height:100%;padding:40px 40px 96px}
.fx *,.fx *::before,.fx *::after{box-sizing:border-box}
:where(.fx) :is(h1,h2,h3,p,ol,ul){margin:0}
:where(.fx) :is(ol,ul){padding:0;list-style:none}
:where(.fx) button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
:where(.fx) button:disabled{cursor:default;opacity:.5}
:where(.fx) :is(input,select,textarea){font:inherit;color:inherit}
.fx :focus-visible{outline:2px solid ${N.cobalt};outline-offset:3px;border-radius:6px}
.fx ::selection{background:${N.cobalt};color:#fff}
.fx .n{font-variant-numeric:tabular-nums}
.fx svg.i{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.fx-page{max-width:1680px}

/* Boutons : pleins, ronds, deux variantes */
.fx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 18px;border-radius:999px;font-weight:600;font-size:${t.petit + 1}px;transition:background .15s,transform .1s;white-space:nowrap}
.fx-btn:active{transform:scale(.97)}
.fx-btn.p{background:${N.cobalt};color:#fff}
.fx-btn.p:hover:not(:disabled){background:#3340ff}
.fx-btn.g{background:${N.doux};color:${N.encre}}
.fx-btn.g:hover:not(:disabled){background:#e8eaee}
.fx-lien{color:${N.cobalt};font-weight:600;display:inline-flex;align-items:center;gap:6px}
.fx-lien:hover{text-decoration:underline;text-underline-offset:4px}
.fx-champ{width:100%;min-height:42px;padding:8px 12px;border-radius:8px;background:${N.doux};border:0;outline:none}
.fx-champ:focus{box-shadow:inset 0 0 0 2px ${N.cobalt};background:#fff}
.fx-etiquette{display:block;font-size:${t.petit}px;color:${N.gris};margin-bottom:4px}

/* ── En-tête ── */
.fx-entete{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;flex-wrap:wrap}
.fx-entete h1{font-size:${t.grand}px;line-height:1.1;font-weight:600;letter-spacing:-.025em}
.fx-entete h1 .no{color:${N.cobalt};margin-right:14px}
.fx-client{font-size:${t.titre}px;font-weight:500;margin-top:8px}
.fx-faits{display:flex;flex-wrap:wrap;gap:6px 28px;margin-top:14px;color:${N.gris}}
.fx-faits b{color:${N.encre};font-weight:600}
.fx-faits .rouge b{color:${N.rouge}}
.fx-actions{display:flex;gap:10px;flex-wrap:wrap}
.fx-resume-projet{margin-top:16px;max-width:90ch;white-space:pre-wrap}
.fx-edition{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px 20px;margin-top:20px;width:100%}

/* ── Frise + synthèse + à venir : même grille que l'offre ── */
.fx-etat{display:grid;grid-template-columns:minmax(0,1fr) 300px;grid-template-areas:"frise ." "synth avenir";gap:56px 96px;margin-top:48px}
.fx-frise{grid-area:frise;display:flex}
.fx-frise li{flex:1 1 0;min-width:0;position:relative;padding:28px 12px 0 0;color:${N.pale};font-weight:500}
.fx-frise li::before{content:"";position:absolute;top:6px;left:0;right:0;height:2px;background:${N.filet}}
.fx-frise li::after{content:"";position:absolute;top:0;left:0;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 2px ${N.filet}}
.fx-frise li.fait{color:${N.encre}}
.fx-frise li.fait::before{background:${N.encre}}
.fx-frise li.fait::after{background:${N.encre};box-shadow:none}
.fx-frise li.ici{color:${N.cobalt};font-weight:600}
.fx-frise li.ici::after{background:${N.cobalt};box-shadow:0 0 0 5px ${N.cobaltDoux}}
/* Le dernier point tombe pile au bout de la frise, à la même distance du
   précédent que tous les autres : l'élément n'a que la largeur du point, et
   son libellé déborde vers la gauche. */
.fx-frise li:last-child{flex:0 0 14px;padding-right:0}
.fx-frise li:last-child::before{display:none}
.fx-frise li:last-child .lib{position:absolute;right:0;top:28px;white-space:nowrap;text-align:right}
.fx-frise .lib{display:block}
.fx-etape{text-align:inherit;font:inherit;color:inherit;border-radius:6px}
.fx-etape:hover{color:${N.cobalt}}
.fx-etape:hover small{color:${N.cobalt}}
.fx-frise small{display:block;font-size:${t.petit}px;font-weight:400;color:${N.gris};margin-top:2px}
.fx-frise li.ici small{color:${N.cobalt}}

.fx-synth{grid-area:synth;min-width:0}
.fx h2{font-size:${t.titre}px;font-weight:600;letter-spacing:-.01em}
.fx-synth .texte{font-size:${t.lead}px;line-height:1.65;margin-top:14px}
.fx-synth .vide{color:${N.gris};margin-top:14px}
.fx-synth .liens{display:flex;gap:24px;flex-wrap:wrap;margin-top:14px}
.fx-rubriques{margin-top:20px;display:grid;gap:18px}
.fx-rubriques h3{font-size:${t.corps}px;font-weight:600}
.fx-rubriques li{padding-left:14px;position:relative}
.fx-rubriques li::before{content:"";position:absolute;left:0;top:.7em;width:5px;height:5px;border-radius:50%;background:${N.gris}}
.fx-maj{margin-top:20px;display:grid;gap:20px}
.fx-maj li{padding-left:16px;box-shadow:inset 2px 0 0 ${N.filet}}
.fx-maj .qui{display:flex;gap:12px;align-items:baseline;font-size:${t.petit}px;font-weight:600;color:${N.gris}}
.fx-maj .qui button{font-weight:500;margin-left:auto}
.fx-maj .qui button:hover{color:${N.rouge}}
.fx-maj p{white-space:pre-wrap}
.fx-composer{margin-top:28px;background:${N.doux};border-radius:${N.rayon}px;padding:6px 6px 6px 18px;width:var(--jusqua-fichiers,100%);max-width:100%}
.fx-composer.glisse{box-shadow:inset 0 0 0 2px ${N.cobalt}}
.fx-composer .ligne{display:flex;align-items:flex-start;gap:8px}
.fx-composer textarea{flex:1;min-width:0;border:0;background:none;font-size:${t.corps}px;outline:none;resize:none;min-height:40px;padding:9px 0;line-height:1.45}
.fx-composer textarea::placeholder{color:${N.gris}}
.fx-icone{width:40px;height:40px;display:grid;place-items:center;border-radius:8px;color:${N.gris};flex:none}
.fx-icone:hover{background:#e8eaee;color:${N.encre}}
.fx-composer .pied{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:4px 6px 6px 0}
.fx-composer .piece{font-size:${t.petit}px;background:#fff;border-radius:999px;padding:4px 6px 4px 12px;display:inline-flex;gap:6px;align-items:center}
.fx-composer .msg{font-size:${t.petit}px}
.fx-composer .msg.rouge{color:${N.rouge}}
.fx-composer .envoyer{margin-left:auto}
.fx-composer .dictee{width:100%}

.fx-avenir{grid-area:avenir}
.fx-avenir ol{margin-top:16px;display:grid;gap:16px}
.fx-avenir li{display:grid;grid-template-columns:70px minmax(0,1fr);gap:12px}
.fx-avenir .q{font-weight:600}
.fx-avenir small{display:block;color:${N.gris};font-size:${t.petit}px}
.fx-avenir .rien{color:${N.gris};margin-top:16px}

/* ── Onglets ── */
.fx-onglets{display:flex;gap:40px;margin-top:80px;box-shadow:inset 0 -1px 0 ${N.filet};flex-wrap:wrap}
.fx-onglet{padding:0 0 16px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;position:relative;text-align:left;color:${N.gris}}
.fx-onglet .nom{font-size:${t.lead}px;font-weight:600}
.fx-onglet .v{font-size:${t.petit}px}
.fx-onglet .v.rouge{color:${N.rouge};font-weight:600}
.fx-onglet:hover{color:${N.encre}}
.fx-onglet[aria-selected=true]{color:${N.encre}}
.fx-onglet[aria-selected=true]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;border-radius:3px;background:${N.cobalt}}
.fx-panneau{margin-top:40px;animation:fx-entre .22s cubic-bezier(.2,.7,.2,1) both}
@keyframes fx-entre{from{opacity:0;transform:translateY(8px)}}

/* ── Offre ── */
.fx-barre-offre{display:flex;justify-content:space-between;align-items:center;gap:16px 24px;margin-bottom:32px;flex-wrap:wrap}
.fx-barre-offre .gauche{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.fx-statut{appearance:none;border:0;border-radius:999px;padding:9px 34px 9px 30px;font-weight:600;background:${N.doux} no-repeat;cursor:pointer;
  background-image:radial-gradient(circle at 15px 50%, var(--pt) 4px, transparent 4.5px),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23111318' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-position:0 0,right 14px center}
.fx-numero{display:flex;align-items:center;gap:8px;color:${N.gris}}
.fx-numero input{width:130px;min-height:38px;padding:0 12px;border-radius:999px;background:${N.doux};border:0;outline:none;color:${N.encre}}
.fx-marge{display:flex;align-items:center;gap:8px;color:${N.gris}}
.fx-marge input{width:70px;min-height:38px;padding:0 10px;text-align:right;border-radius:999px;background:${N.doux};border:0;outline:none;color:${N.encre}}
.fx-seg{display:inline-flex;background:${N.doux};border-radius:999px;padding:4px}
.fx-seg button{min-height:34px;padding:0 16px;border-radius:999px;font-weight:600;font-size:${t.petit}px;color:${N.gris}}
.fx-seg button[aria-pressed=true]{background:${N.encre};color:#fff}
.fx-offre{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:96px}
.fx-sec+.fx-sec{margin-top:48px}
.fx-sec-t{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:8px}
.fx-sec-t h3{font-size:${t.titre}px;font-weight:600;letter-spacing:-.01em}
.fx-sec-t .tot{font-size:${t.lead}px;font-weight:600;white-space:nowrap}
.fx-dev{font-size:.78em;font-weight:500;color:${N.gris};margin-left:3px}
.fx-table{width:100%;border-collapse:collapse;table-layout:fixed}
.fx-table th{font-size:${t.petit}px;font-weight:500;color:${N.gris};text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid ${N.filet}}
.fx-table td{padding:14px 12px 14px 0;border-bottom:1px solid ${N.filet2};vertical-align:top}
.fx-table .r{text-align:right}
.fx-table col.c-act{width:180px}.fx-table col.c-q{width:84px}.fx-table col.c-pu{width:96px}.fx-table col.c-tot{width:136px}.fx-table col.c-vis{width:44px}
.fx-ligne{cursor:pointer}
.fx-ligne:hover td{background:#fafbfc}
.fx-ligne.ouverte td{background:#fafbfc;border-bottom-color:transparent}
.fx-ligne .desig small{display:block;color:${N.gris};font-size:${t.petit}px;margin-top:2px}
.fx-ligne .pu{color:${N.gris}}
.fx-ligne .tot{font-weight:600;white-space:nowrap}
.fx-act{color:${N.rouge};font-weight:500;text-align:left;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:top}
.fx-act .code{font-weight:600;margin-right:6px}
.fx-act.choisir{color:${N.gris};display:inline-flex;align-items:center;gap:6px}
.fx-act.choisir::before{content:"";width:7px;height:7px;border-radius:50%;box-shadow:inset 0 0 0 1.5px ${N.pale}}
.fx-act:hover{text-decoration:underline;text-underline-offset:3px}
.fx-vis{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:${N.gris};margin-top:-5px}
.fx-vis:hover{background:${N.doux};color:${N.encre}}
.fx-ligne.masquee .fx-vis{color:${N.encre}}
.fx-groupe td{padding-top:26px;font-weight:600;border-bottom:1px solid ${N.filet}}
.fx-groupe .titre{display:flex;align-items:center;gap:6px;min-width:0;cursor:pointer}
.fx-groupe .titre input{font-weight:600;border:0;background:none;outline:none;min-width:0;flex:1;padding:2px 4px;border-radius:6px}
.fx-groupe .titre input:focus{background:${N.doux}}
.fx-groupe.sous td{padding-top:16px;font-size:${t.corps}px}
.fx-groupe.sous .titre{padding-left:28px}
.fx-chev{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:6px;transition:transform .15s,background .15s;flex:none}
.fx-chev:hover{background:${N.doux}}
.fx-groupe.plie .fx-chev{transform:rotate(-90deg)}
.fx-act-cell{display:flex;align-items:flex-start;gap:4px;margin-left:-28px;min-width:0}
.fx-act-cell .fx-act{min-width:0}
.fx-poignee{width:24px;height:26px;display:inline-grid;place-items:center;border-radius:6px;color:${N.pale};cursor:grab;opacity:0;flex:none;transition:opacity .15s}
.fx-ligne:hover .fx-poignee,.fx-groupe:hover .fx-poignee,.fx-poignee:focus-visible{opacity:1}
.fx-poignee:hover{background:${N.doux};color:${N.encre}}
.fx-poignee:active{cursor:grabbing}
.fx-groupe .titre .fx-poignee{margin-left:-28px}
tr.cible-avant>td{box-shadow:inset 0 3px 0 ${N.cobalt}}
tr.cible-apres>td{box-shadow:inset 0 -3px 0 ${N.cobalt}}
@media (hover:none){.fx-poignee{display:none}.fx-act-cell,.fx-groupe .titre .fx-poignee{margin-left:0}}
.fx-groupe .outils{display:flex;gap:2px;margin-left:auto;flex:none;opacity:0;transition:opacity .15s}
.fx-groupe:hover .outils,.fx-groupe:focus-within .outils{opacity:1}
@media (hover:none){.fx-groupe .outils{opacity:1}}
.fx-groupe .outils .fx-vis{width:30px;height:30px;font-weight:400}
.fx-groupe td.r{white-space:nowrap}
.fx-ajouts{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;align-items:center}
.fx-ajouts.dans{margin:10px 0 4px}
.fx-detail td{padding:4px 12px 20px 0;border-bottom:1px solid ${N.filet2};background:#fafbfc}
.fx-detail .grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px 16px;padding:4px 0 0}
.fx-detail .grille .large{grid-column:span 2}
.fx-detail .pied{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:16px}
.fx-detail .pied .suppr{color:${N.rouge};font-weight:600;margin-left:auto}
.fx-detail .pied button:not(.fx-btn):hover{text-decoration:underline;text-underline-offset:4px}
.fx-menu{position:fixed;z-index:80;width:320px;max-height:380px;overflow-y:auto;background:#fff;border-radius:12px;padding:8px 0;box-shadow:0 12px 32px rgba(17,19,24,.16),0 2px 6px rgba(17,19,24,.06)}
.fx-menu .famille{padding:10px 16px 4px;font-size:${t.petit}px;color:${N.gris}}
.fx-menu button{display:flex;width:100%;gap:10px;align-items:baseline;padding:8px 16px;text-align:left}
.fx-menu button:hover{background:${N.doux}}
.fx-menu .code{font-weight:600;color:${N.rouge};width:24px}
.fx-menu .tarif{margin-left:auto;color:${N.gris};font-size:${t.petit}px}
.fx-menu .retirer{color:${N.gris}}

.fx-recap{position:sticky;top:24px;align-self:start}
.fx-recap .grand{font-size:${t.grand}px;font-weight:600;letter-spacing:-.025em;line-height:1.1;white-space:nowrap}
.fx-recap .grand .fx-dev{font-size:${t.titre}px}
.fx-recap .label{color:${N.gris}}
.fx-recap dl{margin:24px 0 0;display:grid;grid-template-columns:1fr auto;gap:12px 16px}
.fx-recap dt{color:${N.gris}}
.fx-recap dd{margin:0;text-align:right;font-weight:500;white-space:nowrap}
.fx-recap .ecart{margin-top:12px}
.fx-attente{margin-top:28px;background:${N.rougeDoux};border-radius:${N.rayon}px;padding:18px 20px}
.fx-attente b{color:${N.rouge};display:block}
.fx-attente p{font-size:${t.petit}px;margin:6px 0 12px}
.fx-attente button{color:${N.rouge};font-weight:600}
.fx-attente button:hover{text-decoration:underline;text-underline-offset:4px}
.fx-recap .btns{display:grid;gap:10px;margin-top:28px}
.fx-recap .etat-enr{font-size:${t.petit}px;color:${N.gris};text-align:center;margin-top:4px}
.fx-recap .etat-enr.modif{color:${N.rouge}}
.fx-client-doc{max-width:900px}
.fx-client-doc .sec{display:flex;justify-content:space-between;font-size:${t.titre}px;font-weight:600;padding:28px 0 8px;border-bottom:1px solid ${N.filet}}
.fx-client-doc .ln{display:grid;grid-template-columns:minmax(0,1fr) 90px 110px 136px;gap:12px;padding:12px 0;border-bottom:1px solid ${N.filet2}}
.fx-client-doc .ln.n1{font-weight:600}
.fx-client-doc .ln.n2{padding-left:24px}
.fx-client-doc .ln.n3{padding-left:48px;color:${N.gris}}
.fx-client-doc .ln small{display:block;color:${N.gris};font-weight:400;font-size:${t.petit}px}

.fx-consulting{display:flex;gap:24px;align-items:center;flex-wrap:wrap;justify-content:space-between;background:${N.doux};border-radius:${N.rayon}px;padding:18px 22px;margin:-8px 0 40px}
.fx-consulting p{margin-top:4px}
.fx-consulting small{display:block;color:${N.gris};font-size:${t.petit}px;margin-top:4px}

.fx-resume-liste{display:flex;flex-wrap:wrap;gap:4px 24px;margin-top:10px;color:${N.gris};font-size:${t.lead}px}
.fx-resume-liste .rouge{color:${N.rouge};font-weight:600}
.fx-filtres{display:flex;flex-wrap:wrap;gap:16px 24px;align-items:center;margin-top:40px}
.fx-cherche{display:flex;align-items:center;gap:10px;background:${N.doux};border-radius:999px;padding:0 18px;min-height:44px;flex:0 1 420px;color:${N.gris}}
.fx-cherche input{flex:1;min-width:0;border:0;background:none;outline:none;font-size:${t.corps}px;color:${N.encre}}
.fx-cherche:focus-within{box-shadow:inset 0 0 0 2px ${N.cobalt};background:#fff}
.fx-pastilles{display:flex;flex-wrap:wrap;gap:8px}
.fx-pastilles button{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 16px;border-radius:999px;background:${N.doux};font-weight:500}
.fx-pastilles button i{width:8px;height:8px;border-radius:50%}
.fx-pastilles button .n{color:${N.gris}}
.fx-pastilles button[aria-pressed=true]{background:${N.encre};color:#fff}
.fx-pastilles button[aria-pressed=true] .n{color:#c7cbd2}
.fx-filtres .fx-seg{margin-left:auto}
.fx-liste{margin-top:40px}
.fx-groupe-liste{margin-top:40px}
.fx-groupe-liste h2{padding-bottom:10px;border-bottom:1px solid ${N.filet}}
.fx-groupe-liste h2 .n{color:${N.gris};font-weight:500;margin-left:6px}
.fx-projet{display:grid;grid-template-columns:52px minmax(0,2.4fr) 160px 190px 130px minmax(0,1.5fr) 36px;gap:20px;align-items:center;min-height:72px;padding:12px 8px;border-bottom:1px solid ${N.filet2};color:inherit;text-decoration:none;border-radius:8px}
a.fx-projet:hover{background:#fafbfc}
.fx-projet.tete{min-height:0;padding-top:0;padding-bottom:10px;font-size:${t.petit}px;color:${N.gris};border-bottom:0}
.fx-projet .no{color:${N.cobalt};font-weight:600;font-size:${t.lead}px}
.fx-projet .nom b{display:block;font-weight:600;font-size:${t.lead}px;line-height:1.3}
.fx-projet small{display:block;color:${N.gris};font-size:${t.petit}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-projet .etape{display:flex;flex-direction:column;gap:6px}
.fx-projet .mot{font-weight:500}
.fx-projet .mot.gris{color:${N.gris}}
.fx-mini{display:flex;align-items:center;gap:3px}
.fx-mini i{width:20px;height:4px;border-radius:2px;background:${N.filet}}
.fx-mini i.fait{background:${N.encre}}
.fx-mini i.ici{background:${N.cobalt}}
.fx-projet .offre{display:flex;align-items:center;gap:8px;font-weight:500}
.fx-projet .offre i{width:8px;height:8px;border-radius:50%;flex:none}
.fx-projet .prochaine b,.fx-projet .livraison b{font-weight:600}
.fx-projet .prochaine small{white-space:normal;overflow:visible;line-height:1.35}
.fx-projet .livraison.rouge b,.fx-projet .livraison.rouge small{color:${N.rouge}}
.fx-projet .qui{width:34px;height:34px;border-radius:50%;background:${N.doux};display:grid;place-items:center;font-size:12px;font-weight:600}
.fx-projet.archive{color:${N.gris}}
.fx-projet.archive .no{color:${N.gris}}

.fx-kanban{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(240px,1fr);gap:16px;margin-top:40px;overflow-x:auto;padding-bottom:16px;align-items:start}
.fx-colonne{background:${N.doux};border-radius:${N.rayon + 2}px;padding:16px 12px 12px;min-height:240px;transition:background .15s,box-shadow .15s}
.fx-colonne h2{font-size:${t.corps}px;padding:0 6px}
.fx-colonne h2 .n{color:${N.gris};font-weight:500;margin-left:4px}
.fx-colonne .auto{font-size:${t.petit}px;color:${N.gris};padding:2px 6px 0}
.fx-colonne .cartes{display:grid;gap:8px;margin-top:12px}
.fx-colonne.survol{background:${N.cobaltDoux};box-shadow:inset 0 0 0 2px ${N.cobalt}}
.fx-colonne.ferme{opacity:.55}
.fx-carte{display:grid;gap:4px;background:#fff;border-radius:${N.rayon}px;padding:14px;color:inherit;text-decoration:none;cursor:grab}
.fx-carte:hover{box-shadow:0 2px 10px rgba(17,19,24,.08)}
.fx-carte .haut{display:flex;justify-content:space-between;align-items:center}
.fx-carte .no{color:${N.cobalt};font-weight:600}
.fx-carte .qui{width:28px;height:28px;border-radius:50%;background:${N.doux};display:grid;place-items:center;font-size:11px;font-weight:600}
.fx-carte b{font-weight:600;line-height:1.3}
.fx-carte small{color:${N.gris};font-size:${t.petit}px}
.fx-carte .bas{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;margin-top:8px}
.fx-carte .livraison b{font-weight:600}
.fx-carte .livraison small{display:block}
.fx-carte .livraison.rouge b,.fx-carte .livraison.rouge small{color:${N.rouge}}
.fx-carte .offre{display:flex;align-items:center;gap:6px;font-size:${t.petit}px;font-weight:500;white-space:nowrap}
.fx-carte .offre i{width:7px;height:7px;border-radius:50%}

.fx-semaine-bloc{margin-top:48px}
.fx-semaine-bloc h2 .dates{color:${N.gris};font-weight:500;margin-left:10px}
.fx-semaine{display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) repeat(2,minmax(0,.6fr));gap:8px;margin-top:16px}
.fx-jour{background:${N.doux};border-radius:${N.rayon}px;padding:14px 12px;min-height:180px;display:flex;flex-direction:column;gap:8px}
.fx-jour .tete{display:flex;align-items:baseline;gap:8px;color:${N.gris};font-size:${t.petit}px}
.fx-jour .tete b{font-size:${t.titre}px;color:${N.encre};font-weight:600}
.fx-jour.auj{background:${N.cobaltDoux};box-shadow:inset 0 0 0 2px ${N.cobalt}}
.fx-jour.auj .tete,.fx-jour.auj .tete b{color:${N.cobalt}}
.fx-jour.passe{opacity:.6}
.fx-jour.ferme{background:#fafbfc}
.fx-jour .rien{color:${N.pale};font-size:${t.petit}px}
.fx-ev{display:grid;gap:2px;background:#fff;border-radius:8px;padding:10px;color:inherit;text-decoration:none;font-size:${t.petit}px}
a.fx-ev:hover{box-shadow:0 2px 10px rgba(17,19,24,.08)}
.fx-ev .genre{display:flex;align-items:center;gap:6px;color:${N.gris}}
.fx-ev .genre i{width:7px;height:7px;border-radius:50%;flex:none}
.fx-ev b{font-weight:600;font-size:${t.corps - 1}px;line-height:1.3}
.fx-ev .no{color:${N.cobalt}}
.fx-ev small{color:${N.gris}}
.fx-ev.livraison{box-shadow:inset 3px 0 0 ${N.rouge}}
.fx-prochain{margin-top:16px;font-size:${t.lead}px}
.fx-prochain b{font-weight:600}
.fx-prochain .fx-lien{margin-left:6px}
.fx-legende{display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;color:${N.gris};font-size:${t.petit}px}
.fx-legende span{display:inline-flex;align-items:center;gap:6px}
.fx-legende i{width:7px;height:7px;border-radius:50%}
.fx-traiter{display:grid;grid-template-columns:10px minmax(0,1.4fr) minmax(0,1.6fr) 140px;gap:16px;align-items:center;min-height:56px;padding:10px 8px;border-bottom:1px solid ${N.filet2};color:inherit;text-decoration:none;border-radius:8px}
.fx-traiter:hover{background:#fafbfc}
.fx-traiter>i{width:8px;height:8px;border-radius:50%}
.fx-traiter b{font-weight:600}
.fx-traiter small{display:block;color:${N.gris};font-size:${t.petit}px}
.fx-traiter .no,.fx-etabli .no{color:${N.cobalt};font-weight:600}
.fx-traiter .detail{text-align:right;color:${N.gris}}
.fx-etabli{display:grid;grid-template-columns:48px minmax(0,2fr) 140px 200px;gap:16px;align-items:center;min-height:64px;padding:10px 8px;border-bottom:1px solid ${N.filet2};color:inherit;text-decoration:none;border-radius:8px}
.fx-etabli:hover{background:#fafbfc}
.fx-etabli .nom b{display:block;font-weight:600}
.fx-etabli small{display:block;color:${N.gris};font-size:${t.petit}px}
.fx-etabli .statut{display:flex;flex-direction:column;gap:6px;font-weight:500}
.fx-etabli .livraison b{font-weight:600}
.fx-etabli .livraison.rouge b,.fx-etabli .livraison.rouge small{color:${N.rouge}}
.fx-mes .fx-tache .fx-case{cursor:pointer}
.fx-mes-groupe{margin-top:16px}
.fx-mes-groupe h3{font-size:${t.corps}px;font-weight:600}
.fx-mes-groupe h3 .n{color:${N.gris};font-weight:500;margin-left:4px}

.fx-liste-taches{max-width:1100px}
.fx-groupe-liste h2.rouge{color:${N.rouge}}
.fx-groupe-liste h2 .no{color:${N.cobalt}}
.fx-tache-liste{grid-template-columns:28px minmax(0,1fr) auto;padding:14px 4px}
.fx-tache-liste .titre{font-size:${t.corps}px}
.fx-tache-liste small{margin-top:2px}
.fx-tache-liste .lien-projet{color:${N.encre};text-decoration:none;font-weight:500}
.fx-tache-liste .lien-projet .n{color:${N.cobalt}}
.fx-tache-liste .lien-projet:hover{text-decoration:underline;text-underline-offset:3px}
.fx-tache-liste .droite{display:grid;justify-items:end;gap:2px}
.fx-tache-liste .droite .fx-lien{font-size:${t.petit}px;opacity:0;transition:opacity .15s}
.fx-tache-liste:hover .droite .fx-lien,.fx-tache-liste .droite .fx-lien:focus-visible{opacity:1}
@media (hover:none){.fx-tache-liste .droite .fx-lien{opacity:1}}

/* ── Agenda ── */
.fx-ag{display:grid;gap:6px;margin-top:32px}
.fx-ag-ligne{display:grid;grid-template-columns:120px repeat(var(--jours),minmax(0,1fr));gap:6px}
.fx-ag-tete{color:${N.gris};font-size:${t.petit}px;padding:0 4px 4px}
.fx-ag-tete b{display:block;font-size:${t.titre}px;color:${N.encre};font-weight:600}
.fx-ag-tete small{display:block;color:${N.gris}}
.fx-ag-tete.auj,.fx-ag-tete.auj b{color:${N.cobalt}}
.fx-ag-qui{font-weight:600;padding:12px 4px 0;display:grid;align-content:start;gap:2px}
.fx-ag-qui small{color:${N.gris};font-weight:400;font-size:${t.petit}px}
.fx-ag-jour{display:grid;gap:4px}
.fx-demi{background:${N.doux};border-radius:8px;padding:6px;min-height:76px;display:flex;flex-direction:column;gap:4px}
.fx-ag-jour.passe{opacity:.55}
.fx-ag-jour.auj .fx-demi{background:${N.cobaltDoux}}
.fx-demi .quand{font-size:12px;color:${N.pale};padding:0 4px}
.fx-demi.absent{align-items:center;justify-content:center;background:repeating-linear-gradient(135deg,${N.doux} 0 6px,#fff 6px 12px);color:${N.gris};font-size:${t.petit}px}
.fx-bloc{display:grid;gap:1px;text-align:left;background:#fff;border-radius:6px;padding:7px 9px;font-size:${t.petit}px;box-shadow:inset 3px 0 0 var(--fam)}
.fx-bloc:hover{box-shadow:inset 3px 0 0 var(--fam),0 2px 10px rgba(17,19,24,.08)}
.fx-bloc .type{color:${N.gris};display:flex;gap:6px;justify-content:space-between}
.fx-bloc b{font-weight:600;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-bloc b .no{color:${N.cobalt}}
.fx-demi .plus{margin-top:auto;text-align:left;padding:4px;border-radius:6px;font-size:${t.petit}px;color:${N.pale}}
.fx-demi .plus:hover{color:${N.cobalt};background:#fff}
.fx-demi .plus.defaut{color:${N.gris}}
.fx-demi .trop{color:${N.rouge};font-size:12px;padding:0 4px}
.fx-voile{position:fixed;inset:0;z-index:60;background:rgba(17,19,24,.35);display:flex;justify-content:flex-end}
.fx-feuille{background:#fff;width:min(520px,100%);height:100%;overflow-y:auto;padding:32px 32px calc(32px + env(safe-area-inset-bottom));display:grid;align-content:start;gap:20px;animation:fx-glisse .22s cubic-bezier(.2,.7,.2,1) both}
.fx-feuille h2{font-size:${t.titre}px;font-weight:600}
.fx-feuille .sous{color:${N.gris};font-size:${t.petit}px;margin-top:2px}
.fx-feuille .deux{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fx-feuille .coche{display:flex;gap:10px;align-items:center;font-size:${t.petit + 1}px;color:${N.gris}}
.fx-feuille .erreur{color:${N.rouge};font-size:${t.petit}px}
@keyframes fx-glisse{from{transform:translateX(24px);opacity:0}}
.fx-st{display:grid;gap:24px;margin-top:24px;padding:24px;border-radius:${N.rayon}px;background:#fafbfc}
.fx-st-jours{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:10px}
.fx-st-jours > div{display:grid;gap:6px}
@media (max-width:860px){
  .fx-ag-ligne{grid-template-columns:96px minmax(0,1fr)}
  .fx-voile{align-items:flex-end}
  .fx-feuille{height:auto;max-height:92vh;border-radius:${N.rayon}px ${N.rayon}px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom))}
  .fx-st-jours{grid-template-columns:1fr 1fr}
}

/* ── Réunion ── */
.fx-reunion .fx-recap dl{margin-top:16px}
@media (max-width:1440px){.fx-reunion .fx-recap{order:-1}}
.fx-reunion .rouge{color:${N.rouge}}
.fx-reu-h4{font-size:${t.petit}px;font-weight:600;color:${N.gris};text-transform:uppercase;letter-spacing:.06em;margin:24px 0 4px}
.fx-reu-h4 .n{margin-left:6px;color:${N.pale}}
.fx-reu-statut:first-of-type .fx-reu-h4{margin-top:8px}
.fx-reu-projet .taches{display:grid;gap:2px}
.fx-reu-projet .taches b{font-weight:500}
.fx-reu-jour{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;padding:14px 8px;border-bottom:1px solid ${N.filet2}}
.fx-reu-jour .quand b{display:block;font-weight:600}
.fx-reu-jour .quand span{color:${N.gris};font-size:${t.petit}px}
.fx-reu-jour ul{display:grid;gap:8px}
.fx-reu-jour li{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline}
.fx-reu-jour li a{color:inherit;text-decoration:none;font-weight:600}
.fx-reu-jour li a .no{color:${N.cobalt}}
.fx-reu-jour li small{color:${N.gris};font-size:${t.petit}px}
.fx-reu-jour .genre{font-size:12px;font-weight:600;color:${N.gris};min-width:72px}
.fx-reu-jour .genre.livraison{color:${N.rouge}}
.fx-reu-jour .genre.surplace{color:${N.cobalt}}
@media (max-width:860px){
  .fx-reu-jour{grid-template-columns:1fr;gap:6px}
  .fx-reu-projet{grid-template-columns:40px minmax(0,1fr)}
  .fx-reu-projet .livraison,.fx-reu-projet .taches{grid-column:2}
}
@media print{
  .fx{padding:0}
  .sans-impression{display:none !important}
  .fx-offre{grid-template-columns:1fr;gap:24px}
  .fx-recap{position:static;order:-1}
  .fx-sec{break-inside:avoid-page}
  .fx-gestes,.fx-tache .droite .fx-lien{display:none !important}
}

/* ── Rentabilité ── */
.fx-note{color:${N.gris};font-size:${t.petit}px;margin:10px 0 0;max-width:90ch}
.fx-note.rouge{color:${N.rouge}}
.fx-recap .fx-note{margin-top:20px}
.fx-form-cout{display:grid;grid-template-columns:160px minmax(0,2fr) minmax(0,1fr) 130px 160px auto;gap:12px;align-items:end;margin-top:20px}
.fx-form-cout .fx-btn{min-height:42px}

/* ── Tâches ── */
.fx-taches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:56px 72px}
.fx-taches h3{font-size:${t.lead}px;font-weight:600;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;gap:12px}
.fx-taches h3 .cpt{color:${N.gris};font-weight:500;font-size:${t.corps}px}
.fx-tache{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;padding:12px 0;border-bottom:1px solid ${N.filet2};align-items:start}
.fx-tache .titre{text-align:left;width:100%}
.fx-tache .titre:hover{text-decoration:underline;text-underline-offset:3px}
.fx-tache.faite .titre{color:${N.gris};text-decoration:line-through}
.fx-case{width:20px;height:20px;border-radius:6px;box-shadow:inset 0 0 0 1.5px #b9bec7;margin-top:2px;display:grid;place-items:center;color:#fff}
.fx-case:hover{box-shadow:inset 0 0 0 1.5px ${N.encre}}
.fx-tache.faite .fx-case{background:${N.vert};box-shadow:none}
.fx-tache small{display:block;color:${N.gris};font-size:${t.petit}px}
.fx-tache .quand{font-weight:600;white-space:nowrap}
.fx-tache .quand.rouge{color:${N.rouge}}
.fx-rdv{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:16px;padding:16px 0;border-bottom:1px solid ${N.filet2};align-items:start}
.fx-rdv .j{font-size:${t.titre + 8}px;font-weight:600;line-height:1;letter-spacing:-.02em}
.fx-rdv .j small{display:block;font-size:${t.petit}px;font-weight:500;color:${N.gris};margin-top:4px;letter-spacing:0}
.fx-rdv .j.sans{font-size:${t.petit}px;color:${N.gris};font-weight:500}
.fx-rdv b{font-weight:600}
.fx-rdv p{color:${N.gris};font-size:${t.petit}px;margin-top:2px}
.fx-rdv a{color:${N.cobalt}}
.fx-form-rdv{padding:20px;border-radius:${N.rayon}px;background:#fafbfc;margin:8px 0 16px;display:grid;gap:14px}
.fx-form-rdv .deux{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fx-puces{display:flex;flex-wrap:wrap;gap:8px}
.fx-puces button{padding:7px 14px;border-radius:999px;background:${N.doux};font-weight:500}
.fx-puces button[aria-pressed=true]{background:${N.encre};color:#fff}
.fx-faites{margin-top:12px}
.fx-etat-pt{width:10px;height:10px;border-radius:50%;margin:6px 0 0 5px}
.fx-gestes{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.fx .fx-btn.petit{min-height:34px;padding:0 14px;font-size:${t.petit}px}
.fx .fx-lien.gris{color:${N.gris};font-weight:500}

/* ── Dossiers simples ── */
.fx-vide{max-width:64ch;padding:12px 0}
.fx-vide h3{font-size:${t.titre}px;font-weight:600}
.fx-vide p{font-size:${t.lead}px;line-height:1.6;margin:10px 0 22px}
.fx-fichiers{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:28px 32px}
.fx-fichiers li{display:flex;gap:14px;align-items:flex-start;min-width:0}
.fx-fichiers .ico{width:48px;height:56px;border-radius:8px;background:${N.doux};display:grid;place-items:center;color:${N.gris};flex:none;font-size:12px;font-weight:600;overflow:hidden}
.fx-fichiers .ico img{width:100%;height:100%;object-fit:cover}
.fx-fichiers b{font-weight:500;overflow-wrap:anywhere;display:block}
.fx-fichiers small{color:${N.gris};font-size:${t.petit}px}
.fx-fichiers button.nom{text-align:left}
.fx-fichiers button.nom:hover b{text-decoration:underline;text-underline-offset:3px}
.fx-depose{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:22px 24px;border-radius:${N.rayon}px;background:${N.doux};cursor:pointer;max-width:720px}
.fx-depose:hover,.fx-depose.glisse{background:${N.cobaltDoux}}
.fx-depose b{font-weight:600}
.fx-depose small{color:${N.gris};font-size:${t.petit}px}
.fx-fichiers .fx-lien{display:block;margin-top:2px}
.fx-chemin{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;color:${N.gris}}
.fx-chemin button:hover{color:${N.encre};text-decoration:underline}

/* Jusqu'à 1440 px, la colonne de droite passe sous le contenu : à côté, elle
   écrasait la désignation des lignes d'offre. */
@media (max-width:1440px){
  .fx-offre{grid-template-columns:1fr;gap:80px}
  .fx-recap{position:static;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 56px;align-items:start}
  .fx-recap>.grand,.fx-recap>.label,.fx-recap>dl{grid-column:1}
  .fx-recap>.fx-attente{grid-column:2;grid-row:1/span 3;margin-top:0}
  .fx-recap>.btns{grid-column:2;margin-top:20px}
  .fx-etat{grid-template-columns:1fr;grid-template-areas:"frise" "synth" "avenir"}
  .fx-avenir ol{grid-template-columns:repeat(4,minmax(0,1fr));gap:20px 32px}
  .fx-avenir li{grid-template-columns:1fr;gap:2px}
}
@media (max-width:1100px){
  .fx-semaine{grid-template-columns:repeat(4,minmax(0,1fr))}
  .fx-etabli{grid-template-columns:44px minmax(0,1fr) 120px 170px}
  .fx-projet{grid-template-columns:48px minmax(0,2fr) 140px 150px 120px 34px}
  .fx-projet .prochaine{display:none}
  .fx-filtres .fx-seg{margin-left:0}
  .fx{padding:32px 28px 80px}
  .fx-onglets{gap:28px}
}
@media (max-width:860px){
  .fx-semaine{grid-template-columns:1fr}
  .fx-jour{min-height:0}
  .fx-jour.passe:not(.auj),.fx-jour.vide:not(.auj){display:none}
  .fx-semaine-bloc .fx-sec-t{flex-wrap:wrap;align-items:center}
  .fx-semaine-bloc h2 .dates{display:block;margin:2px 0 0}
  .fx-traiter{grid-template-columns:10px minmax(0,1fr) auto;grid-template-areas:"pt quoi detail" "pt projet projet"}
  .fx-traiter>i{grid-area:pt}.fx-traiter .quoi{grid-area:quoi}.fx-traiter .projet{grid-area:projet}.fx-traiter .detail{grid-area:detail}
  .fx-etabli{grid-template-columns:40px minmax(0,1fr) auto}
  .fx-etabli .statut{display:none}
  .fx-projet{grid-template-columns:44px minmax(0,1fr) auto;grid-template-areas:"no nom liv" "no etape offre";gap:6px 12px}
  .fx-projet.tete{display:none}
  .fx-projet .no{grid-area:no}.fx-projet .nom{grid-area:nom}.fx-projet .livraison{grid-area:liv;text-align:right}
  .fx-projet .etape{grid-area:etape;min-width:0}.fx-projet .etape .fx-mini{display:none}.fx-projet .offre{grid-area:offre;justify-content:flex-end}
  .fx-projet .qui{display:none}
  .fx-cherche{flex:1 1 100%}
  .fx-form-cout{grid-template-columns:1fr 1fr}
  .fx-form-cout .large{grid-column:1/-1}
  .fx{padding:24px 16px 64px}
  .fx-entete h1{font-size:30px}
  .fx-frise{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));row-gap:24px}
  .fx-frise li:last-child{padding-right:12px}
  .fx-frise li:last-child::before{display:block}
  .fx-frise li:last-child .lib{position:static;white-space:normal;text-align:left}
  .fx-avenir ol{grid-template-columns:1fr 1fr}
  .fx-composer{width:100%}
  .fx-taches{grid-template-columns:1fr}
  .fx-onglets{gap:18px 24px}
  .fx-recap{display:block}
  .fx-recap>.fx-attente{margin-top:28px}
  /* Au doigt, une ligne d'offre devient une petite pile. */
  .fx-table,.fx-table tbody{display:block}
  .fx-table thead,.fx-table colgroup,.fx-table .c-act-td,.fx-table .pu{display:none}
  .fx-ligne{display:grid;grid-template-columns:minmax(0,1fr) auto auto 32px;gap:4px 14px;padding:14px 0;border-bottom:1px solid ${N.filet2}}
  .fx-ligne td{padding:0;border:0}
  .fx-ligne .desig .act-mobile{display:block}
  .fx-groupe,.fx-detail{display:block}
  .fx-groupe td{display:block;border:0;padding:20px 0 8px}
  .fx-groupe td:not(:first-child){display:none}
  .fx-detail td{display:block;padding:12px}
}
.fx .act-mobile{display:none;font-size:${t.petit}px;margin-bottom:2px}
@media (prefers-reduced-motion:reduce){.fx *{transition:none !important;animation:none !important}}
`
