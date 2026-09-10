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
