// Modèle de la prospection commerciale.
//
// Tout ce qui se calcule vit ici plutôt que dans les écrans : la prochaine
// relance et le tri de la liste sont la raison d'être de cette fonctionnalité,
// et ils doivent être testables sans navigateur.
import { C, AL } from './theme'
import { dateDuJour } from './aujourdhui'

// ── Le cycle ────────────────────────────────────────────────────────────────
// Liste FERMÉE, volontairement : c'est ce qui garde la liste des prospects
// exacte. Un tag libre laisserait « Prospect » et « Client » coexister sur la
// même fiche, et on ne saurait plus qui reste à démarcher.
//
// Il n'y a pas d'étape « offre envoyée » : le démarchage se fait avec une
// PRÉSENTATION. L'offre vient après, quand le prospect est devenu client et a
// un projet — elle vit alors dans la fiche projet, pas ici.
export const ETAPES = [
  { cle: 'a_contacter',  label: 'À contacter',          fg: AL.black,  bg: C.neutralBg, actif: true },
  { cle: 'contacte',     label: 'Contacté',             fg: C.info,    bg: C.infoBg,    actif: true },
  { cle: 'presentation', label: 'Présentation envoyée', fg: C.violet,  bg: C.violetBg,  actif: true },
  { cle: 'discussion',   label: 'En discussion',        fg: C.warning, bg: C.warningBg, actif: true },
  { cle: 'perdu',        label: 'Perdu',                fg: C.muted,   bg: C.neutralBg, actif: false },
]
export const etape = (cle) => ETAPES.find(e => e.cle === cle) || ETAPES[0]

// Les étapes qui demandent encore du travail. « Perdu » en est exclu, mais la
// fiche reste dans la table : la raison d'une perte se relit, et un prospect
// perdu se réveille parfois.
export const ETAPES_ACTIVES = ETAPES.filter(e => e.actif).map(e => e.cle)

// ── Les canaux ──────────────────────────────────────────────────────────────
// Le canal appartient à l'ÉCHANGE, pas au prospect : on appelle, puis on
// relance par mail. C'est aussi ce qui dit ce qui marche pour cette société.
export const CANAUX = [
  { cle: 'telephone', label: 'Téléphone', couleur: C.success },
  { cle: 'email',     label: 'E-mail',    couleur: C.info },
  { cle: 'linkedin',  label: 'LinkedIn',  couleur: C.violet },
  { cle: 'whatsapp',  label: 'WhatsApp',  couleur: C.warning },
  { cle: 'visite',    label: 'Visite',    couleur: AL.black },
  { cle: 'courrier',  label: 'Courrier',  couleur: C.muted },
  { cle: 'autre',     label: 'Autre',     couleur: C.muted },
]
export const canal = (cle) => CANAUX.find(c => c.cle === cle) || CANAUX[CANAUX.length - 1]

// ── Les sources ─────────────────────────────────────────────────────────────
// D'où vient le prospect. `demandeDetail` marque celles où le détail est ce qui
// compte vraiment : une recommandation sans le nom de qui l'a faite ne sert à
// rien le jour où on rappelle.
export const SOURCES = [
  { cle: 'internet',        label: 'Internet',        demandeDetail: false, exemple: 'recherche Google' },
  { cle: 'linkedin',        label: 'LinkedIn',        demandeDetail: false, exemple: 'prospection directe' },
  { cle: 'recommandation',  label: 'Recommandation',  demandeDetail: true,  exemple: 'par qui ?' },
  { cle: 'appel_entrant',   label: 'Appel entrant',   demandeDetail: false, exemple: 'a trouvé le site' },
  { cle: 'salon',           label: 'Salon',           demandeDetail: true,  exemple: 'lequel ?' },
  { cle: 'client_existant', label: 'Client existant', demandeDetail: true,  exemple: 'lequel ?' },
  { cle: 'autre',           label: 'Autre',           demandeDetail: true,  exemple: 'préciser' },
]
export const source = (cle) => SOURCES.find(s => s.cle === cle) || null

// ── Relances ────────────────────────────────────────────────────────────────

const jour = (v) => String(v || '').slice(0, 10)

/**
 * La prochaine relance à faire : la plus PROCHE parmi celles non honorées.
 *
 * La plus proche et non la plus ancienne : deux relances en retard ne se
 * traitent pas en parallèle, et c'est celle qu'on aurait dû faire en premier
 * qui doit remonter.
 */
export function prochaineRelance(interactions) {
  const dues = (interactions || [])
    .filter(i => i && jour(i.follow_up_on) && !i.follow_up_done)
    .sort((a, b) => jour(a.follow_up_on).localeCompare(jour(b.follow_up_on)))
  return dues[0] || null
}

/** Le dernier échange, quel qu'il soit. */
export function dernierEchange(interactions) {
  const l = (interactions || [])
    .filter(Boolean)
    .sort((a, b) => jour(b.occurred_on).localeCompare(jour(a.occurred_on)))
  return l[0] || null
}

/**
 * Jours de retard d'une relance. 0 le jour même, négatif si elle est à venir.
 *
 * Comparaison de chaînes YYYY-MM-DD comme partout ailleurs : `new Date('…')`
 * est du UTC et ferait basculer une relance dès la veille au soir.
 */
export function retardJours(dateRelance, today = dateDuJour()) {
  const d = jour(dateRelance)
  if (!d) return null
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)
  return Math.round(ms / 86400000)
}

export const enRetard = (dateRelance, today = dateDuJour()) => (retardJours(dateRelance, today) ?? -1) > 0

// ── Tri de la liste ─────────────────────────────────────────────────────────
/**
 * Ordre de travail, pas ordre alphabétique : ce qui est en retard d'abord, du
 * plus ancien au plus récent, puis ce qui vient, puis ce qui n'a pas de relance
 * — dont les « à contacter », qu'on n'a encore jamais touchés, et les perdus.
 *
 * `interactionsDe(p)` rend les échanges d'un prospect : la liste et la fiche
 * les stockent différemment, la fonction ne présume pas de la forme.
 */
export function trierProspects(prospects, interactionsDe, today = dateDuJour()) {
  return [...(prospects || [])].sort((a, b) => {
    const ra = prochaineRelance(interactionsDe(a))
    const rb = prochaineRelance(interactionsDe(b))
    if (ra && rb) return jour(ra.follow_up_on).localeCompare(jour(rb.follow_up_on))
    if (ra) return -1
    if (rb) return 1
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

/** Compteurs de l'en-tête. */
export function resumeProspects(prospects, interactionsDe, today = dateDuJour()) {
  let actifs = 0, retard = 0, aVenir = 0
  for (const p of prospects || []) {
    if (p.converted_to_contact_id) continue
    if (ETAPES_ACTIVES.includes(p.stage)) actifs++
    const r = prochaineRelance(interactionsDe(p))
    if (!r) continue
    if (enRetard(r.follow_up_on, today)) retard++
    else aVenir++
  }
  return { actifs, retard, aVenir }
}
