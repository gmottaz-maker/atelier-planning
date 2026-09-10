// Édition d'une commande de projet.
//
// Même contrainte que la sous-traitance : la route PUT /api/tasks/[id] remplace
// `category_data` en bloc, donc la fusion se fait ici. Une modification ne doit
// pas effacer la réception (date, qui, lieu de stockage).

/** Champs éditables d'une commande, remplis depuis la tâche existante. */
export function champsCommande(task) {
  const data = task?.category_data || {}
  return {
    article: task?.title || '',
    quantity: data.quantity || '',
    vendor: data.vendor || '',
    order_date: data.order_date || '',
    expected_date: data.expected_date || '',
    responsible: task?.responsible || '',
  }
}

/** Corps du PUT correspondant au formulaire, la réception préservée. */
export function majCommande(task, form) {
  const data = task?.category_data || {}
  const orderDate = form.order_date || null
  const expectedDate = form.expected_date || null
  return {
    title: (form.article || '').trim(),
    responsible: form.responsible,
    execution_date: expectedDate || orderDate || null,
    category_data: {
      ...data,
      quantity: (form.quantity || '').trim() || null,
      vendor: (form.vendor || '').trim() || null,
      order_date: orderDate,
      expected_date: expectedDate,
    },
  }
}
