// Sync unidirectionnel Maze → Todoist (REST API v2).
// Toutes les fonctions sont des no-op si TODOIST_API_TOKEN est absent (pas de crash).
// Les erreurs réseau sont avalées et loggées — le sync ne doit jamais bloquer une action Maze.

const BASE  = 'https://api.todoist.com/api/v1'
const TOKEN = process.env.TODOIST_API_TOKEN

// Utilisateur dont les tâches sont synchronisées (propriétaire du token Todoist)
export const TODOIST_SYNC_USER = 'Guillaume'

export function todoistEnabled() {
  return !!TOKEN
}

async function tfetch(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Todoist ${r.status}: ${t.substring(0, 150)}`)
  }
  // close/reopen/delete renvoient 204 sans body
  if (r.status === 204) return null
  return r.json()
}

// Contenu Todoist : titre + projet en préfixe discret si dispo
function buildContent(task) {
  const proj = task.projects?.name || task.project_name
  return proj ? `${task.title} [${proj}]` : task.title
}

/**
 * Crée une tâche dans l'inbox Todoist (pas de project_id → Inbox).
 * Retourne l'id Todoist (string) ou null si désactivé/échec.
 */
export async function createTask(task) {
  if (!TOKEN) return null
  try {
    const body = { content: buildContent(task) }
    if (task.execution_date) body.due_date = task.execution_date  // YYYY-MM-DD
    const created = await tfetch('/tasks', { method: 'POST', body: JSON.stringify(body) })
    return created?.id ? String(created.id) : null
  } catch (e) {
    console.warn('Todoist createTask:', e.message)
    return null
  }
}

export async function updateTask(todoistId, task) {
  if (!TOKEN || !todoistId) return
  try {
    const body = { content: buildContent(task) }
    // due_date: '' n'efface pas sur l'API v2 ; on n'envoie la date que si présente
    if (task.execution_date) body.due_date = task.execution_date
    await tfetch(`/tasks/${todoistId}`, { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    console.warn('Todoist updateTask:', e.message)
  }
}

export async function closeTask(todoistId) {
  if (!TOKEN || !todoistId) return
  try { await tfetch(`/tasks/${todoistId}/close`, { method: 'POST' }) }
  catch (e) { console.warn('Todoist closeTask:', e.message) }
}

export async function reopenTask(todoistId) {
  if (!TOKEN || !todoistId) return
  try { await tfetch(`/tasks/${todoistId}/reopen`, { method: 'POST' }) }
  catch (e) { console.warn('Todoist reopenTask:', e.message) }
}

export async function deleteTask(todoistId) {
  if (!TOKEN || !todoistId) return
  try { await tfetch(`/tasks/${todoistId}`, { method: 'DELETE' }) }
  catch (e) { console.warn('Todoist deleteTask:', e.message) }
}
