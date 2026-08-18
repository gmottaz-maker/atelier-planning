// Règles d'accès aux tâches privées, appliquées CÔTÉ SERVEUR.
//
// `is_private` n'était jusqu'ici qu'un filtre d'affichage : GET /api/tasks
// renvoyait toutes les tâches à tout le monde, et PUT/DELETE ne vérifiaient
// rien. Un membre voyait donc — et pouvait modifier — les tâches privées de
// ses collègues, y compris via les notifications et le cache local.
import { isAdminUser } from './requireAdmin'

export const isAdmin = user => isAdminUser(user)

/** Une tâche privée n'est visible que par l'admin et son responsable. */
export function canSeeTask(task, user) {
  if (!task?.is_private) return true
  return isAdmin(user) || task.responsible === user?.name
}

/** Filtre une liste de tâches pour un utilisateur. */
export function visibleTasks(tasks, user) {
  return (tasks || []).filter(t => canSeeTask(t, user))
}

/**
 * Responsable à enregistrer à la création. Seul l'admin peut créer une tâche
 * privée au nom de quelqu'un d'autre ; sinon on force l'utilisateur courant,
 * plutôt que de refuser — une tâche privée créée pour soi reste l'usage normal.
 */
export function resolvePrivateOwner(requested, user) {
  if (isAdmin(user)) return requested
  return requested === user?.name ? requested : user?.name
}
