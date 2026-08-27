// Statut visuel d'un projet — badge ET liseré haut de carte.
//
// Les deux sont deux facettes du MÊME état : ils ne peuvent pas diverger, donc
// une seule fonction les rend. Elle vit ici plutôt que dans une page parce que
// la liste de projets et la page projet l'utilisent toutes les deux.
//
// Les seuils viennent des données de la maquette du handoff : au-delà d'un mois
// l'échéance est « lointaine » (success), sous une semaine elle est critique
// (error), et entre les deux elle est neutre — noire sur fond gris, sans
// dramatiser une échéance qui n'a rien d'urgent.
import { AL, C } from './theme'
import { phaseMeta } from './projectPhase'

export function joursRestants(deadline) {
  if (!deadline) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(deadline); d.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / 86400000)
}

export function statutProjet(project) {
  if (!project) return { fg: C.muted, bg: C.neutralBg, stripe: C.muted, text: '' }
  if (project.suspended) return { fg: C.muted, bg: C.neutralBg, stripe: C.muted, text: 'EN PAUSE' }

  const pm = phaseMeta(project.phase)
  if (pm) {
    const text = pm.label.toUpperCase()
    if (pm.key === 'demontage') return { fg: C.warning, bg: C.warningBg, stripe: C.warning, text }
    if (pm.key === 'termine')   return { fg: C.success, bg: C.successBg, stripe: C.success, text }
    return { fg: AL.black, bg: C.neutralBg, stripe: C.success, text }   // en cours
  }

  if (!project.deadline) return { fg: C.muted, bg: C.neutralBg, stripe: C.muted, text: 'SANS DATE' }

  const d = joursRestants(project.deadline)
  if (d < 0)   return { fg: C.danger,  bg: C.dangerBg,  stripe: C.danger,  text: `RETARD ${-d}J` }
  if (d === 0) return { fg: C.danger,  bg: C.dangerBg,  stripe: C.danger,  text: "AUJOURD'HUI" }
  if (d <= 7)  return { fg: C.danger,  bg: C.dangerBg,  stripe: C.danger,  text: `DANS ${d}J` }
  if (d <= 30) return { fg: AL.black,  bg: C.neutralBg, stripe: C.success, text: `DANS ${d}J` }
  return { fg: C.success, bg: C.successBg, stripe: C.success, text: `DANS ${d}J` }
}

// Libellé en clair du statut, pour la ligne « statut » de la page projet.
export function libelleStatut(project) {
  if (!project) return ''
  if (project.status !== 'active') return 'Archivé'
  if (project.suspended) return 'En pause'
  const pm = phaseMeta(project.phase)
  return pm ? pm.label : 'En préparation'
}
