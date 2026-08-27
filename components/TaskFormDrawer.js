import { useState, useEffect } from 'react'
import { useResponsibles } from '../lib/useResponsibles'
import { TASK_CATEGORIES } from '../lib/taskCategories'
import { AL, C, FONT } from '../lib/theme'

const PERSON_COLORS = { Arnaud: C.info, Gabin: C.violet, Guillaume: AL.black }

function colorForName(name) {
  if (!name) return C.muted
  if (PERSON_COLORS[name]) return PERSON_COLORS[name]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 48%)`
}

function toDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

export default function TaskFormDrawer({
  task,
  projects = [],
  currentUser,
  defaultProjectId = null,
  defaultCategory = null,
  hideProjectSelector = false,
  onSave,
  onClose,
}) {
  const { responsibles } = useResponsibles()
  const isEdit = !!task?.id
  const [form, setForm] = useState({
    title:          task?.title || '',
    project_id:     task?.project_id || defaultProjectId || '',
    category:       task?.category || defaultCategory || 'bureau',
    responsible:    task?.responsible || currentUser || 'non défini',
    execution_date: task?.execution_date || '',
    due_date:       task?.due_date || '',
    is_private:     task?.is_private || false,
    notes:          task?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const body = {
      ...form,
      project_id: form.project_id || null,
      execution_date: form.execution_date || null,
      due_date: form.due_date || null,
    }
    await onSave(body, isEdit ? task.id : null)
    setSaving(false)
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const inputCls = "w-full px-3 py-2 border u-line u-pill text-sm u-surface focus:u-line focus:outline-none transition-colors"

  return (
    <>
      <style>{`
        @keyframes drawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes drawerFade  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(15,23,42,0.35)', animation: 'drawerFade 0.15s ease-out both' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div
          className="fixed top-0 right-0 bottom-0 u-surface flex flex-col shadow-2xl"
          style={{ width: '100%', maxWidth: 520, animation: 'drawerSlide 0.2s cubic-bezier(0.4,0,0.2,1) both', fontFamily: FONT }}>

          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b u-line">
            <div>
              <p className="text-xs uppercase tracking-wider u-muted mb-0.5">{isEdit ? 'Modifier' : 'Nouvelle tâche'}</p>
              <h2 className="font-semibold u-ink tracking-tight" style={{ fontSize: 20 }}>
                {isEdit ? task.title : 'Créer une tâche'}
              </h2>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center u-pill u-muted hover:u-fill hover:u-ink transition-colors"
              style={{ fontSize: 22 }}>×</button>
          </div>

          {/* Body */}
          <form id="task-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

            {/* Titre */}
            <div>
              <label className="block text-xs font-medium u-muted mb-1.5">Titre</label>
              <input type="text" required autoFocus
                value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="Ex : Découpe panneaux bar" className={inputCls} />
            </div>

            {/* Catégorie */}
            <div>
              <label className="block text-xs font-medium u-muted mb-2">Catégorie</label>
              <div className="flex gap-1.5 flex-wrap">
                {TASK_CATEGORIES.map(c => {
                  const active = form.category === c.key
                  return (
                    <button key={c.key} type="button"
                      onClick={() => set('category', c.key)}
                      className="px-3 py-1.5 u-pill text-xs font-semibold transition-colors border inline-flex items-center gap-1.5"
                      style={active
                        ? { background: c.color + '15', borderColor: c.color, color: c.color }
                        : { background: 'white', borderColor: C.border, color: C.muted }}>
                      <span>{c.icon}</span>
                      <span>{c.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Projet */}
            {!hideProjectSelector && (
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Projet lié</label>
                <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inputCls}>
                  <option value="">— Aucun projet —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>)}
                </select>
              </div>
            )}

            {/* Responsable */}
            <div>
              <label className="block text-xs font-medium u-muted mb-2">Responsable</label>
              <div className="flex gap-2 flex-wrap">
                {responsibles.map(p => {
                  const color = colorForName(p)
                  const active = form.responsible === p
                  return (
                    <button key={p} type="button"
                      onClick={() => set('responsible', p)}
                      className="px-3 py-1.5 u-pill text-sm font-medium transition-colors border"
                      style={active
                        ? { background: color + '15', borderColor: color, color: color }
                        : { background: 'white', borderColor: C.border, color: C.muted }}>
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Date d'exécution</label>
                <input type="date" value={form.execution_date}
                  onChange={e => set('execution_date', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Échéance (optionnel)</label>
                <input type="date" value={form.due_date}
                  onChange={e => set('due_date', e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium u-muted mb-1.5">Note</label>
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Détail ou info utile…" className={inputCls}
                style={{ resize: 'vertical' }} />
            </div>

            {/* Privée */}
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <div onClick={() => set('is_private', !form.is_private)}
                className="u-pill transition-colors flex items-center px-0.5 flex-shrink-0"
                style={{ background: form.is_private ? AL.black : C.muted, width: 36, height: 20 }}>
                <div className="w-4 h-4 u-surface u-pill shadow transition-transform"
                  style={{ transform: form.is_private ? 'translateX(16px)' : 'translateX(0)' }} />
              </div>
              <div>
                <p className="text-sm font-medium u-ink">Tâche privée</p>
                <p className="text-xs u-muted">Visible uniquement par toi</p>
              </div>
            </label>
          </form>

          {/* Footer */}
          <div className="px-8 py-4 border-t u-line flex items-center justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 u-pill text-sm font-medium u-ink hover:u-fill transition-colors">
              Annuler
            </button>
            <button type="submit" form="task-form" disabled={saving || !form.title.trim()}
              className="px-5 py-2 u-pill text-white font-medium text-sm transition-opacity disabled:opacity-50"
              style={{ background: AL.black }}>
              {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer la tâche'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
