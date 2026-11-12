// Édition d'une entrée de sous-traitance.
//
// La route PUT /api/tasks/[id] remplace `category_data` en bloc : c'est au
// client de fusionner. Une modification ne doit donc jamais faire disparaître
// l'état du cycle de vie (prêt, récupéré, lieu de stockage, tâche de
// récupération liée) — d'où le `...data` en tête de l'objet reconstruit.

/** Champs éditables d'une sous-traitance, remplis depuis la tâche existante. */
export function champsSousTraitance(task) {
  const data = task?.category_data || {}
  return {
    title: task?.title || '',
    subcontractor: data.subcontractor || '',
    drop_date: data.drop_date || '',
    expected_pickup_date: data.expected_pickup_date || '',
    responsible: task?.responsible || '',
  }
}

/** Corps du PUT correspondant au formulaire, l'avancement préservé. */
export function majSousTraitance(task, form) {
  const data = task?.category_data || {}
  const dropDate = form.drop_date || null
  const pickupDate = form.expected_pickup_date || null
  return {
    title: (form.title || '').trim(),
    responsible: form.responsible,
    execution_date: pickupDate || dropDate || null,
    category_data: {
      ...data,
      subcontractor: (form.subcontractor || '').trim() || null,
      drop_date: dropDate,
      expected_pickup_date: pickupDate,
    },
  }
}

// ── Cycle d'une sous-traitance ──────────────────────────────────────────────
// Chez le sous-traitant → prête à récupérer (une tâche de récupération naît
// pour Arnaud) → à l'atelier (rangée quelque part). Les corps de requête
// reprennent à l'octet ceux de la fiche actuelle.

/** Corps du POST d'une nouvelle sous-traitance. */
export function nouvelleSousTraitance(form, projectId) {
  return {
    title: (form.title || '').trim(),
    responsible: form.responsible,
    execution_date: form.expected_pickup_date || form.drop_date || null,
    project_id: projectId,
    category: 'sous_traitance',
    category_data: {
      subcontractor: (form.subcontractor || '').trim() || null,
      drop_date: form.drop_date || null,
      expected_pickup_date: form.expected_pickup_date || null,
    },
  }
}

/** Où en est une sous-traitance : 'chez' | 'pret' | 'atelier'. */
export function etatSousTraitance(task) {
  const data = task?.category_data || {}
  if (task?.status === 'completed' || data.picked_up_at) return 'atelier'
  if (data.ready_at) return 'pret'
  return 'chez'
}

/** La tâche de récupération qui naît quand le travail est prêt. */
export function tacheRecuperation(task, jour) {
  const data = task.category_data || {}
  return {
    title: `Récupérer ${task.title}${data.subcontractor ? ` chez ${data.subcontractor}` : ''}`,
    responsible: 'Arnaud',
    execution_date: jour,
    project_id: task.project_id,
    category: 'logistique',
    category_data: { source_task_id: task.id, kind: 'pickup' },
  }
}

export function pretARecuperer(task, { qui, jour, recuperationId }) {
  return {
    prev_status: task.status,
    category_data: { ...(task.category_data || {}), ready_at: jour, ready_by: qui, pickup_task_id: recuperationId || null },
  }
}

export function recupere(task, { lieu, qui, jour }) {
  return {
    status: 'completed',
    prev_status: task.status,
    category_data: { ...(task.category_data || {}), picked_up_at: jour, picked_up_by: qui, storage_location: lieu || null },
  }
}

/** Remet la sous-traitance chez le sous-traitant (la tâche de récupération est supprimée à part). */
export function rouvrirSousTraitance(task) {
  return {
    status: 'active',
    prev_status: task.status,
    category_data: { ...(task.category_data || {}), picked_up_at: null, picked_up_by: null, ready_at: null, ready_by: null, pickup_task_id: null, storage_location: null },
  }
}
