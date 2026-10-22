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

// ── Cycle d'une commande ────────────────────────────────────────────────────
// Les corps de requête de la nouvelle fiche projet. Ils reprennent à l'octet
// ceux de la fiche actuelle (pages/projects/[id].js), sortis ici pour être
// testés et ne pas être recopiés une troisième fois.

/** Corps du POST d'une nouvelle commande. */
export function nouvelleCommande(form, projectId) {
  return {
    title: (form.article || '').trim(),
    responsible: form.responsible,
    execution_date: form.expected_date || form.order_date || null,
    project_id: projectId,
    category: 'commande',
    category_data: {
      quantity: (form.quantity || '').trim() || null,
      vendor: (form.vendor || '').trim() || null,
      order_date: form.order_date || null,
      expected_date: form.expected_date || null,
    },
  }
}

/** Réceptionnée aujourd'hui, par qui, rangée où. */
export function receptionCommande(task, { lieu, qui, jour }) {
  return {
    status: 'completed',
    prev_status: task.status,
    category_data: { ...(task.category_data || {}), received_at: jour, received_by: qui, storage_location: lieu || null },
  }
}

/** Annule la réception : la commande redevient attendue. */
export function rouvrirCommande(task) {
  return {
    status: 'active',
    prev_status: task.status,
    category_data: { ...(task.category_data || {}), received_at: null, received_by: null, storage_location: null },
  }
}

export const LIEUX_RANGEMENT = ['Entrée', 'Étagère de réception', 'Économat', 'Rack à panneaux']
