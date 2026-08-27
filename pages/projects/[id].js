import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '../_app'
import NavBar from '../../components/NavBar'
import { useResponsibles } from '../../lib/useResponsibles'
import useIsAdmin from '../../lib/useIsAdmin'
import { TASK_CATEGORIES } from '../../lib/taskCategories'
import { QUOTE_STATUSES, quoteStatusMeta } from '../../lib/quoteStatus'
import TaskFormDrawer from '../../components/TaskFormDrawer'
import AutocompleteInput from '../../components/AutocompleteInput'
import { useSuggestions } from '../../lib/useSuggestions'
import AddressInput, { mapsViewUrl, mapsDirectionsUrl } from '../../components/AddressInput'
import CatalogPicker, { toPurchaseRow, toRateRow } from '../../components/CatalogPicker'
import QuoteEditor from '../../components/QuoteEditor'
import { AL, C, FONT, MONO, R, initials as themeInitials, personChip } from '../../lib/theme'
import { statutProjet, libelleStatut } from '../../lib/projectStatus'
import ButtonPill from '../../components/ButtonPill'
import {
  genLogUid, TYPES_WITH_DATE, today, toDateStr, isCompletedToday, fmtDate,
  getDaysRemaining, getProjectColor, ensureUid, initLogistics,
  parseTimeRange, combineTime, fmtTimeDisplay, fmtTaskDate,
} from '../../lib/projectHelpers'
import { fmtCHF } from '../../lib/money'

const PINK = AL.black

// Champ quantité : step natif 0.5, mais le passage vide/0 → 0.5 (premier clic up) saute directement à 1
const PERSON_COLORS = {
  Arnaud: C.info,
  Gabin: C.violet,
  Guillaume: PINK,
  'Sous-traitant': C.muted,
}
// Liste par défaut — surchargée par useResponsibles() depuis l'API au runtime
// Micro-label de section : mono capitales du système. Les capitales sont ici
// une exception assumée à la règle des minuscules — le handoff excepte
// explicitement les labels de groupe et les en-têtes.
const microLabel = {
  fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em',
  textTransform: 'uppercase', color: C.muted,
}
// Titre de section. 22px : c'est la valeur du prototype de la page projet,
// le README général annonçait 26px pour les h2 en général.
const h2Style = { fontSize: 22, fontWeight: 500, margin: 0, color: AL.black }

const DEFAULT_RESPONSIBLE = 'non défini'

const LOGISTICS_TYPES = [
  { key: 'montage',      label: 'Montage',      icon: '🔨' },
  { key: 'demontage',    label: 'Démontage',    icon: '🔧' },
  { key: 'livraison',    label: 'Livraison',    icon: '🚚' },
  { key: 'recuperation', label: 'Récupération', icon: '↩️' },
  { key: 'envoi_dhl',    label: 'Envoi DHL',    icon: '✈️' },
  { key: 'envoi_ete',    label: 'Envoi ETE',    icon: '📦' },
]
const LOGISTICS_ASSIGNEES = ['Arnaud', 'Guillaume', 'Gabin', 'Coople']
const VEHICLES = ['Vito', 'Master', 'Autre']

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
      <circle cx="20" cy="20" r="3" fill={PINK} />
    </svg>
  )
}

// ─── TimeRangeInput ───────────────────────────────────────────────────────────
function TimeRangeInput({ value, onChange }) {
  const { start, end } = parseTimeRange(value)
  const inp = "flex-1 px-2 py-1.5 border u-line u-panel text-sm u-surface"
  return (
    <div className="flex items-center gap-1.5">
      <input type="time" value={start}
        onChange={e => onChange(combineTime(e.target.value, end))}
        className={inp} style={{ fontSize: 14 }} />
      <span className="u-muted text-xs">–</span>
      <input type="time" value={end}
        onChange={e => onChange(combineTime(start, e.target.value))}
        className={inp} style={{ fontSize: 14 }} />
    </div>
  )
}

// ─── EditTaskModal ────────────────────────────────────────────────────────────
function EditTaskModal({ task, currentUser, onSave, onDelete, onClose }) {
  const { responsibles } = useResponsibles()
  const [form, setForm] = useState({
    title: task.title || '',
    responsible: task.responsible || DEFAULT_RESPONSIBLE,
    execution_date: task.execution_date || toDateStr(today()),
    category: task.category || 'bureau',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...form, title: form.title.trim(), prev_status: task.status }),
      })
      const updated = await res.json()
      if (updated.id) { onSave(updated); onClose() }
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette tâche ?')) return
    setDeleting(true)
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } })
      onDelete(task.id)
      onClose()
    } catch (err) { console.error(err) }
    setDeleting(false)
  }

  const inp = "w-full px-3 py-2 border u-line u-panel text-sm u-surface focus:u-line focus:outline-none"

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md u-surface rounded-t-3xl sm:u-panel shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold u-ink">Modifier la tâche</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center u-pill u-muted hover:u-ink" style={{ background: C.neutralBg }}>✕</button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium u-muted mb-1">Titre</label>
            <input
              autoFocus type="text" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inp}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium u-muted mb-1">Responsable</label>
              <select value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} className={inp}>
                {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium u-muted mb-1">Date</label>
              <input type="date" value={form.execution_date}
                onChange={e => setForm(f => ({ ...f, execution_date: e.target.value }))}
                className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium u-muted mb-1">Catégorie</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
              {TASK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDelete} disabled={deleting}
            className="px-4 py-2.5 u-panel text-sm font-semibold border"
            style={{ borderColor: C.dangerBg, color: C.danger, background: C.dangerBg }}>
            {deleting ? '…' : 'Supprimer'}
          </button>
          <button
            onClick={handleSave} disabled={saving || !form.title.trim()}
            className="flex-1 px-4 py-2.5 u-panel text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: PINK }}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TaskItem ─────────────────────────────────────────────────────────────────
function TaskItem({ task, onToggle, onEdit }) {
  const completed  = task.status === 'completed'
  const respColor  = PERSON_COLORS[task.responsible] || C.muted
  const dateInfo   = !completed && fmtTaskDate(task.execution_date)
  return (
    <div
      className="flex items-center gap-3 py-3 px-2 -mx-2 border-b last:border-b-0 group u-pill hover:u-fill transition-colors"
      style={{ borderColor: C.border, cursor: onEdit ? 'pointer' : 'default' }}
      onClick={() => onEdit && onEdit(task)}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle(task) }}
        className="w-5 h-5 u-pill border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
        style={{ borderColor: completed ? C.success : C.muted, background: completed ? C.success : 'white' }}>
        {completed && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`leading-snug ${completed ? 'u-muted line-through' : 'u-ink font-medium'}`}
          style={{ fontSize: 14 }}>
          {task.title}
        </p>
      </div>

      {task.responsible && (
        <span className="text-xs font-medium px-2 py-0.5 u-pill flex-shrink-0"
          style={{ background: respColor + '15', color: respColor }}>
          {task.responsible}
        </span>
      )}

      {dateInfo && (
        <span className="text-xs font-medium tabular-nums flex-shrink-0"
          style={{ color: dateInfo.color }}>
          {dateInfo.label}
        </span>
      )}

      {onEdit && !completed && (
        <svg className="w-3.5 h-3.5 u-muted group-hover:u-muted flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}

// ─── AddCommandeForm ──────────────────────────────────────────────────────────
function AddCommandeForm({ projectId, currentUser, onAdd, onCancel }) {
  const { responsibles } = useResponsibles()
  const vendorSuggestions = useSuggestions('vendor')
  const [form, setForm] = useState({
    article: '',
    quantity: '',
    vendor: '',
    order_date: '',
    expected_date: '',
    responsible: currentUser || DEFAULT_RESPONSIBLE,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.article.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          title: form.article.trim(),
          responsible: form.responsible,
          execution_date: form.expected_date || form.order_date || null,
          project_id: projectId,
          category: 'commande',
          category_data: {
            quantity: form.quantity.trim() || null,
            vendor: form.vendor.trim() || null,
            order_date: form.order_date || null,
            expected_date: form.expected_date || null,
          },
        }),
      })
      const task = await res.json()
      if (task.id) onAdd(task)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const inp = "px-2.5 py-1.5 border u-line u-panel text-sm u-surface w-full"
  const lbl = "block text-[10px] u-muted mb-0.5"
  return (
    <form onSubmit={handleSubmit} className="pt-2 pb-1 space-y-2">
      <div>
        <label className={lbl}>Article *</label>
        <input autoFocus type="text" value={form.article}
          onChange={e => setForm(f => ({ ...f, article: e.target.value }))}
          placeholder="ex: Vis M6 inox" className={inp} style={{ fontSize: 14 }} />
      </div>
      <div className="flex gap-2">
        <div className="w-24">
          <label className={lbl}>Quantité</label>
          <input type="text" value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            placeholder="ex: 10" className={inp} style={{ fontSize: 14 }} />
        </div>
        <div className="flex-1">
          <label className={lbl}>Vendeur</label>
          <AutocompleteInput
            value={form.vendor}
            onChange={v => setForm(f => ({ ...f, vendor: v }))}
            suggestions={vendorSuggestions}
            placeholder="Nom du vendeur (autocomplete)"
            className={inp}
            style={{ fontSize: 14 }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={lbl}>Commandé le</label>
          <input type="date" value={form.order_date}
            onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
        <div className="flex-1">
          <label className={lbl}>Réception prévue</label>
          <input type="date" value={form.expected_date}
            onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
      </div>
      <div>
        <label className={lbl}>Responsable</label>
        <select value={form.responsible}
          onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
          className={inp} style={{ fontSize: 14 }}>
          {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !form.article.trim()}
          className="px-3 py-1.5 u-panel text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: PINK }}>
          {saving ? '…' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 u-panel text-xs font-semibold u-muted border u-line">
          Annuler
        </button>
      </div>
    </form>
  )
}

// ─── CommandeItem ─────────────────────────────────────────────────────────────
const STORAGE_LOCATIONS = ['Entrée', 'Étagère de réception', 'Économat', 'Rack à panneaux']

function CommandeItem({ task, currentUser, onUpdate, onDelete }) {
  const data = task.category_data || {}
  const isReceived = task.status === 'completed' || !!data.received_at
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  async function confirmReceived(storageLocation) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          status: 'completed',
          prev_status: task.status,
          category_data: {
            ...data,
            received_at: toDateStr(today()),
            received_by: currentUser,
            storage_location: storageLocation || null,
          },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
      setShowPicker(false)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function reopen() {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          status: 'active',
          prev_status: task.status,
          category_data: { ...data, received_at: null, received_by: null, storage_location: null },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function remove() {
    if (!confirm('Supprimer cette commande ?')) return
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } })
    onDelete(task.id)
  }

  return (
    <>
      <div className="py-3 border-b last:border-b-0" style={{ borderColor: C.border }}>
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 u-pill mt-1.5 flex-shrink-0"
            style={{ background: isReceived ? C.success : C.muted }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-sm font-medium ${isReceived ? 'u-muted line-through' : 'u-ink'}`}>
                {task.title}
              </span>
              {data.quantity && (
                <span className="text-xs u-muted">· {data.quantity}</span>
              )}
              {data.vendor && (
                <span className="text-xs u-muted">· {data.vendor}</span>
              )}
            </div>
            <div className="text-xs u-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {data.order_date && <span>Commandé {fmtDate(data.order_date)}</span>}
              {data.expected_date && <span>Réception prévue {fmtDate(data.expected_date)}</span>}
              {data.received_at && <span style={{ color: C.success }}>Reçu {fmtDate(data.received_at)}{data.received_by ? ` par ${data.received_by}` : ''}</span>}
              {data.storage_location && <span style={{ color: C.success }}>Rangé : {data.storage_location}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isReceived ? (
              <button onClick={() => setShowPicker(true)} disabled={saving}
                className="text-xs font-medium px-3 py-1.5 u-pill text-white disabled:opacity-50"
                style={{ background: AL.black }}>
                Réceptionné
              </button>
            ) : (
              <button onClick={reopen} disabled={saving}
                className="text-xs u-muted hover:u-ink">
                Annuler
              </button>
            )}
            <button onClick={remove} className="text-xs u-muted hover:u-ko">✕</button>
          </div>
        </div>
      </div>
      {showPicker && (
        <StorageLocationPicker
          onConfirm={confirmReceived}
          onCancel={() => setShowPicker(false)}
          saving={saving}
        />
      )}
    </>
  )
}

function StorageLocationPicker({ onConfirm, onCancel, saving }) {
  const suggestions = useSuggestions('storage')
  const [picked, setPicked] = useState('')
  const [customValue, setCustomValue] = useState('')
  const isAutres = picked === 'Autres'

  // Suggestions supplémentaires (anciennes valeurs custom)
  const extra = suggestions.filter(s => !STORAGE_LOCATIONS.includes(s))

  function handleConfirm() {
    const value = isAutres ? customValue.trim() : picked
    if (!value) return
    onConfirm(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={onCancel}>
      <div className="u-surface u-panel w-full sm:max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold u-ink text-base mb-1">Lieu de stockage</h3>
        <p className="text-xs u-muted mb-4">Où as-tu rangé cette commande ?</p>
        <div className="space-y-1.5 mb-4">
          {STORAGE_LOCATIONS.map(loc => (
            <button key={loc}
              onClick={() => setPicked(loc)}
              className="w-full text-left px-4 py-2.5 u-pill text-sm transition-colors border"
              style={{
                borderColor: picked === loc ? AL.black : C.border,
                background: picked === loc ? AL.black : 'white',
                color: picked === loc ? 'white' : AL.black,
                fontWeight: picked === loc ? 600 : 500,
              }}>
              {loc}
            </button>
          ))}
          {extra.map(loc => (
            <button key={loc}
              onClick={() => { setPicked('Autres'); setCustomValue(loc) }}
              className="w-full text-left px-4 py-2.5 u-pill text-sm transition-colors border"
              style={{
                borderColor: picked === 'Autres' && customValue === loc ? AL.black : C.border,
                background: picked === 'Autres' && customValue === loc ? AL.black : 'white',
                color: picked === 'Autres' && customValue === loc ? 'white' : AL.black,
                fontWeight: picked === 'Autres' && customValue === loc ? 600 : 500,
              }}>
              {loc}
            </button>
          ))}
          <button
            onClick={() => setPicked('Autres')}
            className="w-full text-left px-4 py-2.5 u-pill text-sm transition-colors border"
            style={{
              borderColor: isAutres ? AL.black : C.border,
              background: isAutres ? C.hover : 'white',
              color: AL.black,
              fontWeight: isAutres ? 600 : 500,
            }}>
            Autres…
          </button>
          {isAutres && (
            <input autoFocus type="text" value={customValue}
              onChange={e => setCustomValue(e.target.value)}
              placeholder="Préciser le lieu de stockage"
              className="w-full px-3 py-2 border u-line u-pill text-sm" />
          )}
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button onClick={onCancel} className="text-sm u-muted hover:u-ink">Annuler</button>
          <button onClick={handleConfirm} disabled={saving || (!picked || (isAutres && !customValue.trim()))}
            className="px-4 py-2 u-pill text-sm font-medium text-white disabled:opacity-50"
            style={{ background: AL.black }}>
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AddSousTraitanceForm ─────────────────────────────────────────────────────
function AddSousTraitanceForm({ projectId, currentUser, onAdd, onCancel }) {
  const { responsibles } = useResponsibles()
  const subSuggestions = useSuggestions('subcontractor')
  const [form, setForm] = useState({
    title: '',
    subcontractor: '',
    drop_date: '',
    expected_pickup_date: '',
    responsible: currentUser || DEFAULT_RESPONSIBLE,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          title: form.title.trim(),
          responsible: form.responsible,
          execution_date: form.expected_pickup_date || form.drop_date || null,
          project_id: projectId,
          category: 'sous_traitance',
          category_data: {
            subcontractor: form.subcontractor.trim() || null,
            drop_date: form.drop_date || null,
            expected_pickup_date: form.expected_pickup_date || null,
          },
        }),
      })
      const task = await res.json()
      if (task.id) onAdd(task)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const inp = "px-2.5 py-1.5 border u-line u-panel text-sm u-surface w-full"
  return (
    <form onSubmit={handleSubmit} className="pt-2 pb-1 space-y-2">
      <input autoFocus type="text" value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        placeholder="Que sous-traiter ? (ex: Découpe panneaux)" className={inp} style={{ fontSize: 14 }} />
      <AutocompleteInput
        value={form.subcontractor}
        onChange={v => setForm(f => ({ ...f, subcontractor: v }))}
        suggestions={subSuggestions}
        placeholder="Sous-traitant"
        className={inp}
        style={{ fontSize: 14 }}
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] u-muted mb-0.5">Dépose</label>
          <input type="date" value={form.drop_date}
            onChange={e => setForm(f => ({ ...f, drop_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] u-muted mb-0.5">Récupération prévue</label>
          <input type="date" value={form.expected_pickup_date}
            onChange={e => setForm(f => ({ ...f, expected_pickup_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
      </div>
      <select value={form.responsible}
        onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
        className={inp} style={{ fontSize: 14 }}>
        {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !form.title.trim()}
          className="px-3 py-1.5 u-panel text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: PINK }}>
          {saving ? '…' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 u-panel text-xs font-semibold u-muted border u-line">
          Annuler
        </button>
      </div>
    </form>
  )
}

// ─── SousTraitanceItem ────────────────────────────────────────────────────────
function SousTraitanceItem({ task, currentUser, onUpdate, onDelete, onAddTask }) {
  const data = task.category_data || {}
  const isReady = !!data.ready_at
  const isDone = task.status === 'completed' || !!data.picked_up_at
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  async function transition(payload) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ prev_status: task.status, ...payload }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
      return updated
    } catch (err) { console.error(err); return null }
    finally { setSaving(false) }
  }

  async function markReady() {
    if (saving) return
    setSaving(true)
    try {
      // 1. Créer la tâche de récupération pour Arnaud
      const pickupTitle = `Récupérer ${task.title}${data.subcontractor ? ` chez ${data.subcontractor}` : ''}`
      const pickupRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          title: pickupTitle,
          responsible: 'Arnaud',
          execution_date: toDateStr(today()),
          project_id: task.project_id,
          category: 'logistique',
          category_data: { source_task_id: task.id, kind: 'pickup' },
        }),
      })
      const pickupTask = await pickupRes.json()

      // 2. Marquer la sous-traitance comme prête à récupérer (avec lien vers la tâche pickup)
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          prev_status: task.status,
          category_data: {
            ...data,
            ready_at: toDateStr(today()),
            ready_by: currentUser,
            pickup_task_id: pickupTask?.id || null,
          },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
      if (pickupTask?.id && onAddTask) onAddTask(pickupTask)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function confirmPickedUp(storageLocation) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          status: 'completed',
          prev_status: task.status,
          category_data: {
            ...data,
            picked_up_at: toDateStr(today()),
            picked_up_by: currentUser,
            storage_location: storageLocation || null,
          },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)

      // Compléter aussi la tâche de récupération liée si elle existe
      if (data.pickup_task_id) {
        try {
          const pickupRes = await fetch(`/api/tasks/${data.pickup_task_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
            body: JSON.stringify({ status: 'completed', prev_status: 'active' }),
          })
          const pickupUpdated = await pickupRes.json()
          if (pickupUpdated.id) onUpdate(pickupUpdated)
        } catch (err) { /* tâche supprimée ou inaccessible — non bloquant */ }
      }
      setShowPicker(false)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function reopen() {
    // Supprime la tâche pickup si elle existe et est encore active
    if (data.pickup_task_id) {
      try {
        await fetch(`/api/tasks/${data.pickup_task_id}`, {
          method: 'DELETE',
          headers: { 'x-actor': currentUser },
        })
        onDelete && onDelete(data.pickup_task_id)
      } catch (_) {}
    }
    transition({
      status: 'active',
      category_data: { ...data, picked_up_at: null, picked_up_by: null, ready_at: null, ready_by: null, pickup_task_id: null, storage_location: null },
    })
  }

  async function remove() {
    if (!confirm('Supprimer cette sous-traitance ?')) return
    if (data.pickup_task_id) {
      try { await fetch(`/api/tasks/${data.pickup_task_id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } }) } catch (_) {}
      onDelete && onDelete(data.pickup_task_id)
    }
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } })
    onDelete(task.id)
  }

  const stateLabel = isDone ? 'À l\'atelier' : isReady ? 'Prêt à récupérer' : 'Chez le sous-traitant'
  const stateColor = isDone ? C.success : isReady ? C.warning : C.muted

  return (
    <>
    <div className="py-3 border-b last:border-b-0" style={{ borderColor: C.border }}>
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 u-pill mt-1.5 flex-shrink-0" style={{ background: stateColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isDone ? 'u-muted line-through' : 'u-ink'}`}>
              {task.title}
            </span>
            {data.subcontractor && (
              <span className="text-xs u-muted">· {data.subcontractor}</span>
            )}
            <span className="text-xs font-medium" style={{ color: stateColor }}>· {stateLabel}</span>
          </div>
          <div className="text-xs u-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {data.drop_date && <span>Dépose {fmtDate(data.drop_date)}</span>}
            {data.expected_pickup_date && <span>Récup prévue {fmtDate(data.expected_pickup_date)}</span>}
            {data.ready_at && !isDone && <span style={{ color: C.warning }}>Prêt depuis {fmtDate(data.ready_at)}</span>}
            {data.picked_up_at && <span style={{ color: C.success }}>À l'atelier {fmtDate(data.picked_up_at)}{data.picked_up_by ? ` (${data.picked_up_by})` : ''}</span>}
            {data.storage_location && <span style={{ color: C.success }}>Rangé : {data.storage_location}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isReady && !isDone && (
            <button onClick={markReady} disabled={saving}
              className="text-xs font-medium px-3 py-1.5 u-pill text-white disabled:opacity-50"
              style={{ background: C.warning }}>
              {saving ? '…' : 'Prêt à récupérer'}
            </button>
          )}
          {isReady && !isDone && (
            <button onClick={() => setShowPicker(true)} disabled={saving}
              className="text-xs font-medium px-3 py-1.5 u-pill text-white disabled:opacity-50"
              style={{ background: AL.black }}>
              À l'atelier
            </button>
          )}
          {isDone && (
            <button onClick={reopen} disabled={saving}
              className="text-xs u-muted hover:u-ink">
              Annuler
            </button>
          )}
          <button onClick={remove} className="text-xs u-muted hover:u-ko">✕</button>
        </div>
      </div>
    </div>
    {showPicker && (
      <StorageLocationPicker
        onConfirm={confirmPickedUp}
        onCancel={() => setShowPicker(false)}
        saving={saving}
      />
    )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectPage() {
  const router = useRouter()
  const { id } = router.query
  const { user, signOut } = useAuth()
  const currentUser = user?.name || ''
  const { responsibles } = useResponsibles()
  const isAdmin = useIsAdmin()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  // Logistics state (array of items)
  const [logistics, setLogistics] = useState([])
  const [logisticsDirty, setLogisticsDirty] = useState(false)
  const [logisticsSaving, setLogisticsSaving] = useState(false)
  const [expandedLogIdx, setExpandedLogIdx] = useState(null)
  const [addingLogistics, setAddingLogistics] = useState(false)

  // Task state
  const [addingCategory, setAddingCategory] = useState(null) // 'commande' | 'sous_traitance' (inline)
  const [drawerCategory, setDrawerCategory] = useState(null) // catégorie pour le drawer générique
  const [editingTask, setEditingTask]       = useState(null) // task object being edited

  // Files state
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Updates state
  const [updates, setUpdates] = useState([])
  const [newUpdate, setNewUpdate] = useState('')
  const [newUpdateImage, setNewUpdateImage] = useState(null) // { base64, mime_type, filename, preview }
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [updateDragging, setUpdateDragging] = useState(false)

  // Quote state — structure: { management:[], items:[{ _uid, name, purchases:[], labor:[] }], subcontracting:[], logistics:[], general_margin:'' }
  // general_margin (%) s'applique aux achats / sous-traitance sauf si une marge spécifique est définie sur la ligne (PAS la logistique)
  // Nouveau devis → pré-rempli avec un modèle par défaut (gestion + logistique)
  const [quote, setQuote] = useState(() => defaultQuote())
  const [quoteDirty, setQuoteDirty] = useState(false)
  const [quoteSaving, setQuoteSaving] = useState(false)
  const [quoteExpanded, setQuoteExpanded] = useState(false)
  // Collapse state — uid → true si replié (par défaut: tout est déplié)
  const [collapsedItems, setCollapsedItems] = useState({})
  const [collapsedSections, setCollapsedSections] = useState({}) // 'management' | 'fabrication' | 'subcontracting' | 'logistics'
  function toggleCollapsedItem(uid) { setCollapsedItems(s => ({ ...s, [uid]: !s[uid] })) }
  function toggleCollapsedSection(name) { setCollapsedSections(s => ({ ...s, [name]: !s[name] })) }

  // kDrive preview state
  const [kdriveItems, setKdriveItems] = useState([])
  const [kdrivePath, setKdrivePath]   = useState([])   // [{ id, name }]
  const [kdriveLoading, setKdriveLoading] = useState(false)
  const [kdriveError, setKdriveError] = useState('')

  // Site visit state
  const EMPTY_VISIT = {
    date: '', participants: [],
    address: '', surface: '', ceiling_height: '', floor_type: '',
    access_notes: '', access_hours: '',
    electricity: '', lighting: '', wifi: '',
    contacts: '', constraints: '', observations: '',
  }
  const [siteVisit, setSiteVisit] = useState(EMPTY_VISIT)
  const [visitDirty, setVisitDirty] = useState(false)
  const [visitSaving, setVisitSaving] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [visitSummary, setVisitSummary] = useState('')
  const [visitExpanded, setVisitExpanded] = useState(false)

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !currentUser) return
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json()),
      fetch(`/api/projects/${id}/files`).then(r => r.json()),
      fetch(`/api/projects/${id}/updates`).then(r => r.json()),
    ]).then(([proj, allTasks, fileList, updateList]) => {
      if (Array.isArray(updateList)) setUpdates(updateList)
      if (proj && !proj.error) {
        setProject(proj)
        setLogistics(initLogistics(proj))
        if (proj.site_visit_data && Object.keys(proj.site_visit_data).length > 0) {
          setSiteVisit(v => ({ ...v, ...proj.site_visit_data }))
          setVisitExpanded(true)
        }
        if (proj.site_visit_summary) setVisitSummary(proj.site_visit_summary)
        if (proj.quote_data) {
          const q = proj.quote_data
          // Nouveau format : { management, items, subcontracting, logistics }
          if (Array.isArray(q.items) || Array.isArray(q.management)) {
            const totalLines = (q.management?.length || 0) + (q.items?.length || 0)
              + (q.subcontracting?.length || 0) + (q.logistics?.length || 0)
            if (totalLines > 0) {
              setQuote({
                management:     q.management || [],
                items:          q.items || [],
                subcontracting: q.subcontracting || [],
                logistics:      q.logistics || [],
                general_margin: q.general_margin ?? '',
                status:         q.status || 'brouillon',
                number:         q.number || '',
              })
              setQuoteExpanded(true)
            }
          // Migration silencieuse depuis l'ancien format { purchases, labor, logistics }
          } else if (q.purchases?.length || q.labor?.length || q.logistics?.length) {
            const migrated = {
              management: [],
              items: (q.purchases?.length || q.labor?.length)
                ? [{
                    _uid: `i_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                    name: 'Général',
                    purchases: q.purchases || [],
                    labor:     q.labor || [],
                  }]
                : [],
              subcontracting: [],
              logistics: q.logistics || [],
              general_margin: '',
              status: q.status || 'brouillon',
              number: q.number || '',
            }
            setQuote(migrated)
            setQuoteDirty(true)  // forcer un re-save dans le nouveau format
            setQuoteExpanded(true)
          }
        }
      }
      if (Array.isArray(allTasks)) {
        setTasks(allTasks.filter(t => String(t.project_id) === String(id)))
      }
      if (Array.isArray(fileList)) setFiles(fileList)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [id, currentUser])

  // Charger l'aperçu kDrive dès que le projet est chargé
  useEffect(() => {
    if (project && project.kdrive_folder_id) {
      setKdrivePath([])
      loadKdrive(null)
    }
  }, [project?.id, project?.kdrive_folder_id])

  // ── Logistics helpers ────────────────────────────────────────────────────
  function updateLogItem(idx, field, value) {
    setLogistics(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
    setLogisticsDirty(true)
  }
  function removeLogItem(idx) {
    setLogistics(prev => prev.filter((_, i) => i !== idx))
    if (expandedLogIdx === idx) setExpandedLogIdx(null)
    else if (expandedLogIdx > idx) setExpandedLogIdx(expandedLogIdx - 1)
    setLogisticsDirty(true)
  }
  function addLogItem(type) {
    const newItem = {
      uid: genLogUid(),
      type, date: '', address: '', time: '', contact: '', notes: '',
      assignees: [],
      coople_contact: { name: '', phone: '' },
      vehicle: '',
    }
    setLogistics(prev => {
      const next = [...prev, newItem]
      setExpandedLogIdx(next.length - 1)
      return next
    })
    setAddingLogistics(false)
    setLogisticsDirty(true)
  }

  async function saveLogistics(logisticsToSave) {
    setLogisticsSaving(true)
    const data = logisticsToSave ?? logistics
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...project, logistics_data: data }),
      })
      const updated = await res.json()
      if (updated && !updated.error) {
        setProject(updated)
        setLogisticsDirty(false)
        await syncLogisticsTasks(data)
      }
    } catch (err) { console.error(err) }
    setLogisticsSaving(false)
  }

  // Synchronise les tâches associées aux points logistiques (1 tâche par personne assignée)
  async function syncLogisticsTasks(currentItems) {
    const tasksRes = await fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json()).catch(() => null)
    if (!Array.isArray(tasksRes)) return
    const existingLogTasks = tasksRes.filter(t =>
      String(t.project_id) === String(id) &&
      t.category === 'logistique' &&
      t.category_data?.source_logistics_uid
    )

    for (const item of currentItems) {
      if (!item.uid) continue
      const type = LOGISTICS_TYPES.find(t => t.key === item.type)
      const label = type?.label || item.type
      const assignees = Array.isArray(item.assignees) ? item.assignees : []
      const tasksForItem = existingLogTasks.filter(t => t.category_data?.source_logistics_uid === item.uid)
      const existingPeople = new Set(tasksForItem.map(t => t.responsible))
      const desiredPeople = new Set(assignees)

      // Créer les manquantes
      for (const person of assignees) {
        if (existingPeople.has(person)) continue
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
          body: JSON.stringify({
            title: `${label} — ${project.name}`,
            responsible: person,
            execution_date: item.date || toDateStr(today()),
            project_id: id,
            category: 'logistique',
            category_data: {
              source_logistics_uid: item.uid,
              logistics_type: item.type,
              vehicle: item.vehicle || null,
            },
            notes: item.notes || null,
          }),
        }).catch(console.error)
      }

      // Supprimer celles dont la personne n'est plus dans la liste
      for (const t of tasksForItem) {
        if (desiredPeople.has(t.responsible)) continue
        await fetch(`/api/tasks/${t.id}`, {
          method: 'DELETE',
          headers: { 'x-actor': currentUser },
        }).catch(console.error)
      }
    }

    // Supprimer aussi les tâches dont l'item logistique a été supprimé
    const validUids = new Set(currentItems.map(i => i.uid).filter(Boolean))
    for (const t of existingLogTasks) {
      const uid = t.category_data?.source_logistics_uid
      if (!validUids.has(uid)) {
        await fetch(`/api/tasks/${t.id}`, {
          method: 'DELETE',
          headers: { 'x-actor': currentUser },
        }).catch(console.error)
      }
    }

    // Recharger les tâches de ce projet
    try {
      const fresh = await fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json())
      if (Array.isArray(fresh)) {
        setTasks(fresh.filter(t => String(t.project_id) === String(id)))
      }
    } catch (_) {}
  }

  // ── Task helpers ─────────────────────────────────────────────────────────
  async function toggleTask(task) {
    const newStatus = task.status === 'completed' ? 'active' : 'completed'
    const now = new Date().toISOString()
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? now : null }
      : t
    ))
    try {
      const { projects: _p, ...taskData } = task
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...taskData, status: newStatus, prev_status: task.status, completed_at: newStatus === 'completed' ? now : null }),
      })
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }
  }

  function handleTaskAdded(newTask) {
    setTasks(prev => [...prev, newTask])
    setAddingCategory(null)
  }

  function handleTaskUpdated(updated) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  function handleTaskDeleted(id) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  // ── Site visit helpers ────────────────────────────────────────────────────
  function setVisitField(field, value) {
    setSiteVisit(prev => ({ ...prev, [field]: value }))
    setVisitDirty(true)
  }
  function toggleParticipant(name) {
    setSiteVisit(prev => {
      const list = prev.participants || []
      const next = list.includes(name) ? list.filter(n => n !== name) : [...list, name]
      return { ...prev, participants: next }
    })
    setVisitDirty(true)
  }

  async function saveVisit() {
    setVisitSaving(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...project, logistics_data: logistics, site_visit_data: siteVisit, site_visit_summary: visitSummary || undefined }),
      })
      const updated = await res.json()
      if (updated && !updated.error) { setProject(updated); setVisitDirty(false) }
    } catch (err) { console.error(err) }
    setVisitSaving(false)
  }

  async function generateSummary() {
    setSummaryLoading(true)
    // Save first
    await saveVisit()
    try {
      const res = await fetch('/api/site-visit-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitData: siteVisit, projectName: project.name }),
      })
      const data = await res.json()
      if (data.summary) {
        setVisitSummary(data.summary)
        // Persist summary
        await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
          body: JSON.stringify({ ...project, logistics_data: logistics, site_visit_data: siteVisit, site_visit_summary: data.summary }),
        })
      }
    } catch (err) { console.error(err) }
    setSummaryLoading(false)
  }

  // ── Quote helpers ────────────────────────────────────────────────────────
  function genRowUid() { return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  // Marge effective : marge spécifique de la ligne si définie, sinon marge générale du devis
  function effectiveMargin(r) {
    if (r?.margin !== '' && r?.margin != null) return num(r.margin)
    return num(quote.general_margin)
  }
  function purchaseTotal(r)  { return num(r.unit_price) * num(r.quantity) }
  function purchaseBilled(r) { return purchaseTotal(r) * (1 + effectiveMargin(r) / 100) }
  function serviceTotal(r)   { return num(r.rate) * num(r.quantity) }
  function serviceBilled(r)  { return serviceTotal(r) * (1 + effectiveMargin(r) / 100) }
  // La logistique n'hérite PAS de la marge générale : 0 % sauf marge spécifique sur la ligne
  function effectiveMarginLogistics(r) { return (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0 }
  function serviceBilledLogistics(r)   { return serviceTotal(r) * (1 + effectiveMarginLogistics(r) / 100) }
  // Escompte par ligne : % puis montant CHF, sur le montant facturé (borné à 0).
  function applyDiscount(amt, r) { return Math.max(0, amt * (1 - num(r.discount) / 100) - num(r.discount_amount)) }
  function purchaseNet(r)   { return applyDiscount(purchaseBilled(r), r) }
  function laborNet(r)      { return applyDiscount(serviceTotal(r), r) }
  function serviceNet(r)    { return applyDiscount(serviceBilled(r), r) }
  function logisticsNet(r)  { return applyDiscount(serviceBilledLogistics(r), r) }

  const QUOTE_UNITS = ['heure(s)', 'jour(s)', 'ml', 'm²', 'km', 'PAN', 'pce']

  // Modèle par défaut d'un nouveau devis (gestion projet + logistique pré-remplies)
  function defaultQuote() {
    return {
      management: [
        { _uid: genRowUid(), item: 'Projet',                  description: 'Gestion de projet générale, correspondances, commandes', rate: '120', quantity: '', unit: 'heure(s)' },
        { _uid: genRowUid(), item: 'Visuels & développement', description: 'Création de visuels, plans et développement tests',       rate: '140', quantity: '', unit: 'heure(s)' },
        { _uid: genRowUid(), item: 'Visite sur place',        description: 'Visite sur place',                                          rate: '100', quantity: '', unit: 'heure(s)' },
      ],
      items: [],
      subcontracting: [],
      logistics: [
        { _uid: genRowUid(), trajet: 'Trajet',    description: '', rate: '3',   quantity: '', unit: 'km',       margin: '' },
        { _uid: genRowUid(), trajet: 'Montage',   description: '', rate: '100', quantity: '', unit: 'heure(s)', margin: '' },
        { _uid: genRowUid(), trajet: 'Démontage', description: '', rate: '100', quantity: '', unit: 'heure(s)', margin: '' },
      ],
      general_margin: '20',
      status: 'brouillon',
      number: '',
    }
  }

  // ── Gestion (lignes de main d'œuvre globales) ──

  // ── Logistique ──

  // ── Sous-traitance ──

  // ── Items (Bar, Backbar, etc.) ──

  // ── Ajout de lignes pré-remplies depuis le catalogue ──
  function itemTotal(it) {
    const p = (it.purchases || []).reduce((s, r) => s + purchaseNet(r), 0)
    const l = (it.labor || []).reduce((s, r) => s + laborNet(r), 0)
    return p + l
  }

  async function saveQuote() {
    setQuoteSaving(true)
    try {
      const r = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...project, quote_data: quote }),
      })
      if (r.ok) setQuoteDirty(false)
    } finally {
      setQuoteSaving(false)
    }
  }

  // Auto-save: 5 min après une modification, on enregistre silencieusement
  const latestQuote   = useRef(quote)
  const latestProject = useRef(project)
  useEffect(() => { latestQuote.current   = quote   }, [quote])
  useEffect(() => { latestProject.current = project }, [project])
  useEffect(() => {
    if (!quoteDirty || !project) return
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
          body: JSON.stringify({ ...latestProject.current, quote_data: latestQuote.current }),
        })
        if (r.ok) setQuoteDirty(false)
      } catch (e) { console.warn('Auto-save quote failed:', e?.message) }
    }, 5 * 60 * 1000)
    return () => clearTimeout(t)
  }, [quoteDirty, project, id, currentUser])

  // ── kDrive preview helpers ───────────────────────────────────────────────
  const KDRIVE_DRIVE_ID = 1936508 // pour bâtir les liens externes (drive Infomaniak)

  // La descente dans un sous-dossier se fait par jeton signé renvoyé par le
  // listing : le serveur n'accepte plus un identifiant de dossier arbitraire.
  async function loadKdrive(folderToken) {
    setKdriveLoading(true); setKdriveError('')
    try {
      const url = folderToken
        ? `/api/projects/${id}/kdrive-listing?folderToken=${encodeURIComponent(folderToken)}`
        : `/api/projects/${id}/kdrive-listing`
      const r = await fetch(url)
      const data = await r.json()
      if (data.error) { setKdriveError(data.error); setKdriveItems([]); return }
      setKdriveItems(data.items || [])
    } catch (e) {
      setKdriveError('Erreur kDrive')
      setKdriveItems([])
    } finally {
      setKdriveLoading(false)
    }
  }

  function enterKdriveFolder(folder) {
    setKdrivePath(p => [...p, { id: folder.id, name: folder.name, token: folder.token }])
    loadKdrive(folder.token)
  }

  function kdriveGoTo(index) {
    const next = kdrivePath.slice(0, index + 1)
    setKdrivePath(next)
    loadKdrive(next.length > 0 ? next[next.length - 1].token : null)
  }

  function fmtSize(b) {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Updates helpers ──────────────────────────────────────────────────────
  async function pickUpdateImage(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setUpdateError('Image uniquement'); return }
    if (file.size > 10 * 1024 * 1024) { setUpdateError('Image trop grande (max 10 MB)'); return }
    setUpdateError('')
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = e => resolve(e.target.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
    setNewUpdateImage({
      base64: dataUrl.split(',')[1],
      mime_type: file.type,
      filename: `update_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      preview: dataUrl,
    })
  }

  async function postUpdate() {
    if (!newUpdate.trim()) return
    setPostingUpdate(true)
    setUpdateError('')
    try {
      const body = {
        author: currentUser || 'Inconnu',
        content: newUpdate.trim(),
        image: newUpdateImage ? {
          base64: newUpdateImage.base64,
          mime_type: newUpdateImage.mime_type,
          filename: newUpdateImage.filename,
        } : null,
      }
      const r = await fetch(`/api/projects/${id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (data.error) { setUpdateError(data.error); return }
      setUpdates(prev => [data, ...prev])
      setNewUpdate('')
      setNewUpdateImage(null)
    } catch (e) {
      setUpdateError('Erreur lors de la publication')
    } finally {
      setPostingUpdate(false)
    }
  }

  async function deleteUpdate(updateId) {
    if (!confirm('Supprimer cette mise à jour ?')) return
    setUpdates(prev => prev.filter(u => u.id !== updateId))
    await fetch(`/api/projects/${id}/updates`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateId }),
    })
  }

  function fmtRelative(iso) {
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60)      return `à l'instant`
    if (diff < 3600)    return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400)   return `il y a ${Math.floor(diff / 3600)} h`
    if (diff < 172800)  return `hier`
    if (diff < 604800)  return `il y a ${Math.floor(diff / 86400)} j`
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
  }

  // ── File helpers ─────────────────────────────────────────────────────────
  async function uploadFile(file) {
    const ALLOWED = ['image/jpeg','image/png','image/gif','image/webp','application/pdf']
    if (!ALLOWED.includes(file.type)) { setUploadError('Format non supporté (JPG, PNG, GIF, WEBP, PDF uniquement)'); return }
    if (file.size > 20 * 1024 * 1024) { setUploadError('Fichier trop grand (max 20 MB)'); return }
    setUploadError('')
    setUploading(true)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`/api/projects/${id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type, base64, size: file.size }),
      })
      const data = await res.json()
      if (data.error) { setUploadError(data.error); return }
      setFiles(prev => [data, ...prev])
    } catch (err) { setUploadError('Erreur lors de l\'upload') }
    setUploading(false)
  }

  async function deleteFile(file) {
    setFiles(prev => prev.filter(f => f.id !== file.id))
    await fetch(`/api/projects/${id}/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: file.id, storagePath: file.storage_path }),
    })
  }

  function handleDrop(e) {
    e.preventDefault(); setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    dropped.forEach(uploadFile)
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: AL.white }}>
      <div className="w-6 h-6 u-pill border-2 animate-spin" style={{ borderColor: C.border, borderTopColor: PINK }} />
    </div>
  )
  if (!project || project.error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: AL.white }}>
      <p className="u-muted">Projet introuvable.</p>
      <Link href="/" className="text-sm u-info underline">← Retour</Link>
    </div>
  )

  const color = getProjectColor(project)
  const daysLeft = getDaysRemaining(project.deadline)
  const activeTasks = tasks.filter(t => t.status === 'active')

  const inp = "w-full px-2.5 py-1.5 border u-line u-panel text-sm u-surface focus:u-line focus:outline-none transition-colors"

  return (
    <>
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>{project.name} — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          input[type=time]::-webkit-calendar-picker-indicator { opacity: 0.4; }
          @media print {
            body { background: white !important; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            header, footer { display: none !important; }
            .print-form { display: block !important; }
          }
          .print-only { display: none; }
          .print-form { display: none; }
        `}</style>
      </Head>

      <div className="w-full" style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* Fil d'Ariane */}
        <Link href="/" className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase',
          color: C.muted, textDecoration: 'none' }}>
          ← projets <span>/</span> <span style={{ color: AL.black }}>{project.name}</span>
        </Link>


        {/* ── Carte d'en-tête ──────────────────────────────────────────────
            Liseré haut de 3px coloré par le statut, comme les cartes de la
            liste : c'est la même fonction qui rend les deux, elles ne peuvent
            pas diverger. Pas de bordure, pas d'ombre. */}
        <div style={{ background: C.surface, borderRadius: R.panel, borderTop: `3px solid ${statutProjet(project).stripe}`,
          padding: '32px 32px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 280, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={microLabel}>projet</span>
              <h1 style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>{project.name}</h1>
              {project.client && <span style={{ fontSize: 15, color: C.muted }}>{project.client}</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28, flexWrap: 'wrap', marginTop: 4 }}>
              {project.deadline && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={microLabel}>deadline</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{fmtDate(project.deadline)}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px',
                      borderRadius: R.pill, color: statutProjet(project).fg, background: statutProjet(project).bg }}>
                      {statutProjet(project).text}
                    </span>
                  </div>
                </div>
              )}
              {project.delivery_type && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={microLabel}>mode</span>
                  <span style={{ fontSize: 15 }}>{project.delivery_type}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={microLabel}>statut</span>
                <span style={{ fontSize: 15, fontWeight: 500, color: statutProjet(project).fg }}>{libelleStatut(project)}</span>
              </div>
              {project.reference && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={microLabel}>référence</span>
                  <span style={{ fontSize: 15 }}>{project.reference}</span>
                </div>
              )}
              {activeTasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={microLabel}>tâches actives</span>
                  <span style={{ fontSize: 15 }}>{activeTasks.length}</span>
                </div>
              )}
            </div>

            {project.description && (
              <div style={{ marginTop: 10, paddingTop: 18, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={microLabel}>résumé</span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: AL.black, whiteSpace: 'pre-wrap' }}>{project.description}</p>
              </div>
            )}
          </div>

          {/* Responsable + progression */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 40, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={microLabel}>responsable</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: project.responsible ? AL.black : C.muted }}>{project.responsible || 'non défini'}</span>
                <div style={{ width: 26, height: 26, borderRadius: R.pill, background: AL.black, color: AL.white,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, flex: 'none' }}>
                  {themeInitials(project.responsible)}
                </div>
              </div>
            </div>
            {(() => {
              const done = tasks.filter(t => t.status === 'completed').length
              const total = tasks.length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 140 }}>
                  <span style={microLabel}>progression</span>
                  <div style={{ width: 140, height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
                    {total > 0 && pct > 0 && <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: AL.black }} />}
                  </div>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {total === 0 ? 'aucune tâche' : `${done} / ${total} tâche${total > 1 ? 's' : ''} · ${pct}%`}
                  </span>
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Mises à jour ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={h2Style}>Mises à jour</h2>
            <span style={{ fontSize: 12, color: C.muted }}>{updates.length} note{updates.length > 1 ? 's' : ''}</span>
          </div>

          {/* Zone de saisie : une seule bordure, le filet outline de 1.5px */}
          <div
            style={{ background: updateDragging ? C.hover : C.surface, border: `1.5px solid ${C.outline}`,
              borderRadius: R.panel, padding: 16, transition: 'background .15s ease' }}
            onDragOver={e => { e.preventDefault(); setUpdateDragging(true) }}
            onDragLeave={() => setUpdateDragging(false)}
            onDrop={e => {
              e.preventDefault(); setUpdateDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file && file.type.startsWith('image/')) pickUpdateImage(file)
            }}>
            <textarea
              value={newUpdate}
              onChange={e => setNewUpdate(e.target.value)}
              placeholder="Téléphone client, mail, changement de scope, photo chantier… (glisser-déposer une image OK)"
              rows={3}
              style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', minHeight: 64,
                fontFamily: FONT, fontSize: 14, lineHeight: 1.45, color: AL.black, background: 'transparent' }}
            />
            {newUpdateImage && (
              <div className="mt-3 relative inline-block">
                <img src={newUpdateImage.preview} alt="" style={{ maxHeight: 160, borderRadius: R.panel }} />
                <button
                  onClick={() => setNewUpdateImage(null)}
                  className="absolute top-1 right-1 w-6 h-6 u-pill bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black"
                  type="button">×</button>
              </div>
            )}
            {updateError && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.danger }}>{updateError}</p>}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <label style={{ fontSize: 13, color: C.muted, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                joindre une image
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { pickUpdateImage(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              <ButtonPill onClick={postUpdate} disabled={postingUpdate || !newUpdate.trim()}>
                {postingUpdate ? 'publication…' : 'publier'}
              </ButtonPill>
            </div>
          </div>

          {/* Timeline */}
          {updates.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Aucune mise à jour. Note ici les téléphones, mails ou décisions au fil du projet.</p>
          ) : (
            <ol className="space-y-3">
              {updates.map(u => {
                const initials = (u.author || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                const c = PERSON_COLORS[u.author] || C.muted
                return (
                  <li key={u.id} className="u-surface u-panel border u-line p-4 md:p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 u-pill flex items-center justify-center text-white font-semibold flex-shrink-0"
                        style={{ background: c, fontSize: 13 }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-semibold u-ink" style={{ fontSize: 14 }}>{u.author}</span>
                            <span className="text-xs u-muted">{fmtRelative(u.created_at)}</span>
                          </div>
                          {isAdmin && (
                            <button onClick={() => deleteUpdate(u.id)}
                              className="text-xs u-muted hover:u-ko flex-shrink-0">
                              Supprimer
                            </button>
                          )}
                        </div>
                        <p className="mt-1.5 u-ink whitespace-pre-wrap leading-relaxed" style={{ fontSize: 14 }}>
                          {u.content}
                        </p>
                        {u.image_kdrive_id && (
                          <div className="mt-3">
                            <a href={`/api/update-image?updateId=${u.id}`} target="_blank" rel="noopener">
                              <img src={`/api/update-image?updateId=${u.id}`} alt={u.image_filename || ''}
                                style={{ maxHeight: 320, maxWidth: '100%', borderRadius: R.panel, border: `1px solid ${C.border}` }} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* ── Two columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-start">

          {/* ════ LEFT: Tâches groupées ════ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={h2Style}>Tâches</h2>
              {(() => {
                const totalActive = tasks.filter(t => t.status === 'active').length
                return totalActive > 0 ? (
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {totalActive} tâche{totalActive > 1 ? 's' : ''} active{totalActive > 1 ? 's' : ''}
                  </span>
                ) : null
              })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TASK_CATEGORIES.map(cat => {
                const catTasks = tasks.filter(t =>
                  (t.category === cat.key || (!t.category && cat.key === 'bureau')) &&
                  (t.status === 'active' || isCompletedToday(t))
                )
                const activeCount = catTasks.filter(t => t.status === 'active').length
                const isAdding = addingCategory === cat.key
                const isEmpty = catTasks.length === 0 && !isAdding

                const isSpecial = cat.key === 'commande' || cat.key === 'sous_traitance'
                const openAdd = () => isSpecial ? setAddingCategory(cat.key) : setDrawerCategory(cat.key)

                // Catégorie vide → ligne discrète repliée
                if (isEmpty) {
                  return (
                    <button key={cat.key} onClick={openAdd}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                        padding: '14px 18px', background: C.surface, border: `1.5px solid ${C.outline}`,
                        borderRadius: R.panel, cursor: 'pointer', fontFamily: FONT }}>
                      <div style={{ width: 3, height: 16, borderRadius: 2, background: cat.color, flex: 'none' }} />
                      <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: AL.black }}>{cat.label}</span>
                      <span style={{ fontSize: 13, color: C.muted }}>+ Ajouter</span>
                    </button>
                  )
                }

                return (
                  <div key={cat.key} style={{ background: C.surface, border: `1.5px solid ${C.outline}`, borderRadius: R.panel, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div style={{ width: 3, height: 16, borderRadius: 2, background: cat.color, flex: 'none' }} />
                        <span style={{ fontSize: 14.5, fontWeight: 500, color: AL.black }}>{cat.label}</span>
                        {activeCount > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: R.pill,
                            background: C.neutralBg, color: AL.black }}>
                            {activeCount}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => isSpecial ? setAddingCategory(isAdding ? null : cat.key) : openAdd()}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontFamily: FONT, color: C.muted }}
                        onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                        {isAdding ? 'Annuler' : '+ Ajouter'}
                      </button>
                    </div>

                    <div className="px-5 py-1">
                      {catTasks.map(t => {
                        if (t.category === 'commande') {
                          return <CommandeItem key={t.id} task={t} currentUser={currentUser}
                            onUpdate={handleTaskUpdated} onDelete={handleTaskDeleted} />
                        }
                        if (t.category === 'sous_traitance') {
                          return <SousTraitanceItem key={t.id} task={t} currentUser={currentUser}
                            onUpdate={handleTaskUpdated} onDelete={handleTaskDeleted} onAddTask={handleTaskAdded} />
                        }
                        return <TaskItem key={t.id} task={t} onToggle={toggleTask} onEdit={t => setEditingTask(t)} />
                      })}
                      {isAdding && cat.key === 'commande' && (
                        <AddCommandeForm
                          projectId={project.id}
                          currentUser={currentUser}
                          onAdd={handleTaskAdded}
                          onCancel={() => setAddingCategory(null)}
                        />
                      )}
                      {isAdding && cat.key === 'sous_traitance' && (
                        <AddSousTraitanceForm
                          projectId={project.id}
                          currentUser={currentUser}
                          onAdd={handleTaskAdded}
                          onCancel={() => setAddingCategory(null)}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ════ RIGHT: Logistique ════ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <h2 style={h2Style}>Logistique</h2>
              {logisticsDirty && (
                <ButtonPill onClick={() => saveLogistics()} disabled={logisticsSaving} style={{ fontSize: 13, padding: '0.45rem 1rem' }}>
                  {logisticsSaving ? 'enregistrement…' : 'enregistrer'}
                </ButtonPill>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logistics.map((item, idx) => {
                const type = LOGISTICS_TYPES.find(t => t.key === item.type) || { label: item.type }
                const hasContent = item.date || item.address || item.time || item.contact || item.notes
                const isEditing = expandedLogIdx === idx || !hasContent

                if (isEditing) {
                  return (
                    <div key={idx} className="u-surface u-panel border u-line overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b u-line u-fill">
                        <span className="text-xs font-semibold uppercase tracking-wider u-muted">
                          {hasContent ? 'Modifier' : 'Nouveau point logistique'}
                        </span>
                        <div className="flex items-center gap-3 text-xs">
                          {hasContent && (
                            <button onClick={() => setExpandedLogIdx(null)}
                              className="font-medium u-ink hover:u-ink">
                              Terminer
                            </button>
                          )}
                          <button onClick={() => removeLogItem(idx)}
                            className="u-muted hover:u-ko">
                            Supprimer
                          </button>
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs u-muted mb-1">Type</label>
                            <select value={item.type}
                              onChange={e => updateLogItem(idx, 'type', e.target.value)}
                              className={inp} style={{ fontSize: 14 }}>
                              {LOGISTICS_TYPES.map(t => (
                                <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs u-muted mb-1">Date</label>
                            <input type="date" value={item.date || ''} style={{ fontSize: 14 }}
                              onChange={e => updateLogItem(idx, 'date', e.target.value)}
                              className={inp} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs u-muted mb-1">Adresse</label>
                          <AddressInput
                            value={item.address || ''}
                            onChange={v => updateLogItem(idx, 'address', v)}
                            placeholder="Rue, ville…"
                            className={inp}
                            style={{ fontSize: 14 }}
                          />
                          {item.address && (
                            <div className="mt-2 flex items-center gap-3 text-xs">
                              <a href={mapsViewUrl(item.address)} target="_blank" rel="noopener"
                                className="u-muted hover:u-ink underline">Voir sur Maps</a>
                              <a href={mapsDirectionsUrl(item.address)} target="_blank" rel="noopener"
                                className="font-medium u-ink hover:underline">Itinéraire →</a>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs u-muted mb-1">Heure prévue</label>
                          <TimeRangeInput value={item.time || ''} onChange={v => updateLogItem(idx, 'time', v)} />
                        </div>
                        <div>
                          <label className="block text-xs u-muted mb-1">Contact</label>
                          <input type="text" value={item.contact || ''} placeholder="Nom + téléphone" style={{ fontSize: 14 }}
                            onChange={e => updateLogItem(idx, 'contact', e.target.value)}
                            className={inp} />
                        </div>
                        <div>
                          <label className="block text-xs u-muted mb-1">Notes</label>
                          <textarea rows={2} value={item.notes || ''} placeholder="Accès, remarques…" style={{ fontSize: 14, resize: 'none' }}
                            onChange={e => updateLogItem(idx, 'notes', e.target.value)}
                            className={inp} />
                        </div>

                        {/* Personnes assignées */}
                        <div>
                          <label className="block text-xs u-muted mb-2">Personnes</label>
                          <div className="flex flex-wrap gap-2">
                            {LOGISTICS_ASSIGNEES.map(name => {
                              const active = (item.assignees || []).includes(name)
                              const color = PERSON_COLORS[name] || C.muted
                              return (
                                <button key={name} type="button"
                                  onClick={() => {
                                    const list = Array.isArray(item.assignees) ? item.assignees : []
                                    const next = list.includes(name) ? list.filter(n => n !== name) : [...list, name]
                                    updateLogItem(idx, 'assignees', next)
                                  }}
                                  className="text-xs font-medium px-3 py-1.5 u-pill border transition-colors"
                                  style={{
                                    borderColor: active ? color : C.border,
                                    background: active ? color + '14' : 'white',
                                    color: active ? color : C.muted,
                                  }}>
                                  {name}
                                </button>
                              )
                            })}
                          </div>
                          {(item.assignees || []).includes('Coople') && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 u-pill border u-line u-fill">
                              <div>
                                <label className="block text-xs u-muted mb-1">Coople — Nom et prénom</label>
                                <input type="text" value={item.coople_contact?.name || ''} style={{ fontSize: 14 }}
                                  onChange={e => updateLogItem(idx, 'coople_contact', { ...(item.coople_contact || {}), name: e.target.value })}
                                  className={inp} placeholder="Jean Dupont" />
                              </div>
                              <div>
                                <label className="block text-xs u-muted mb-1">Téléphone</label>
                                <input type="tel" value={item.coople_contact?.phone || ''} style={{ fontSize: 14 }}
                                  onChange={e => updateLogItem(idx, 'coople_contact', { ...(item.coople_contact || {}), phone: e.target.value })}
                                  className={inp} placeholder="079 123 45 67" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Véhicule */}
                        <div>
                          <label className="block text-xs u-muted mb-2">Véhicule</label>
                          <div className="flex flex-wrap gap-2">
                            {VEHICLES.map(v => {
                              const active = item.vehicle === v
                              return (
                                <button key={v} type="button"
                                  onClick={() => updateLogItem(idx, 'vehicle', active ? '' : v)}
                                  className="text-xs font-medium px-3 py-1.5 u-pill border transition-colors"
                                  style={{
                                    borderColor: active ? AL.black : C.border,
                                    background: active ? AL.black : 'white',
                                    color: active ? 'white' : C.muted,
                                  }}>
                                  {v}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                // ─── Carte info (mode lecture) ───
                return (
                  <div key={idx} className="u-surface u-panel border u-line overflow-hidden hover:u-line transition-colors">
                    <div className="flex items-baseline justify-between gap-3 px-5 py-3 border-b u-line">
                      <div className="flex items-baseline gap-3 min-w-0">
                        <span className="font-semibold u-ink" style={{ fontSize: 15 }}>{type.label}</span>
                        {item.date && (
                          <span className="text-sm u-muted">{fmtDate(item.date)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-shrink-0">
                        <button onClick={() => setExpandedLogIdx(idx)}
                          className="font-medium u-ink hover:u-ink">
                          Modifier
                        </button>
                        <button onClick={() => removeLogItem(idx)}
                          className="u-muted hover:u-ko">
                          Supprimer
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3" style={{ fontSize: 13 }}>
                        {item.address && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs uppercase tracking-wider u-muted mb-0.5">Adresse</dt>
                            <dd className="u-ink">{item.address}</dd>
                            <dd className="mt-1.5 flex items-center gap-3 text-xs">
                              <a href={mapsViewUrl(item.address)} target="_blank" rel="noopener"
                                className="u-muted hover:u-ink underline">Voir sur Maps</a>
                              <a href={mapsDirectionsUrl(item.address)} target="_blank" rel="noopener"
                                className="font-medium u-ink hover:underline">Itinéraire →</a>
                            </dd>
                          </div>
                        )}
                        {item.time && (
                          <div>
                            <dt className="text-xs uppercase tracking-wider u-muted mb-0.5">Heure</dt>
                            <dd className="u-ink tabular-nums">{fmtTimeDisplay(item.time)}</dd>
                          </div>
                        )}
                        {item.contact && (
                          <div>
                            <dt className="text-xs uppercase tracking-wider u-muted mb-0.5">Contact</dt>
                            <dd className="u-ink">{item.contact}</dd>
                          </div>
                        )}
                        {Array.isArray(item.assignees) && item.assignees.length > 0 && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs uppercase tracking-wider u-muted mb-1.5">Personnes</dt>
                            <dd className="flex flex-wrap gap-1.5">
                              {item.assignees.map(name => {
                                const color = PERSON_COLORS[name] || C.muted
                                return (
                                  <span key={name}
                                    className="text-xs font-medium px-2 py-0.5 u-pill"
                                    style={{ background: color + '14', color }}>
                                    {name}
                                  </span>
                                )
                              })}
                            </dd>
                            {item.assignees.includes('Coople') && (item.coople_contact?.name || item.coople_contact?.phone) && (
                              <dd className="mt-2 text-xs u-ink">
                                <span className="u-muted">Coople : </span>
                                {item.coople_contact?.name}
                                {item.coople_contact?.phone && <> · <a href={`tel:${item.coople_contact.phone}`} className="u-ink hover:underline">{item.coople_contact.phone}</a></>}
                              </dd>
                            )}
                          </div>
                        )}
                        {item.vehicle && (
                          <div>
                            <dt className="text-xs uppercase tracking-wider u-muted mb-0.5">Véhicule</dt>
                            <dd className="u-ink">{item.vehicle}</dd>
                          </div>
                        )}
                        {item.notes && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs uppercase tracking-wider u-muted mb-0.5">Notes</dt>
                            <dd className="u-ink whitespace-pre-wrap leading-relaxed">{item.notes}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </div>
                )
              })}

              {/* Add logistics item */}
              {addingLogistics ? (
                <div className="u-surface u-panel border u-line px-5 py-4">
                  <p className="text-xs uppercase tracking-wider font-semibold u-muted mb-3">Choisir un type</p>
                  <div className="flex flex-wrap gap-2">
                    {LOGISTICS_TYPES.map(t => (
                      <button key={t.key} onClick={() => addLogItem(t.key)}
                        className="text-xs font-medium px-3 py-2 u-pill border u-line hover:u-line hover:u-ink u-ink transition-colors">
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setAddingLogistics(false)}
                    className="mt-3 text-xs u-muted hover:u-ink">Annuler</button>
                </div>
              ) : (
                <button onClick={() => setAddingLogistics(true)}
                  style={{ width: '100%', padding: 18, textAlign: 'center', background: 'none',
                    border: `1.5px dashed ${C.outline}`, borderRadius: R.panel, cursor: 'pointer',
                    fontFamily: FONT, fontSize: 13, color: C.muted, transition: 'color .15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                  + Ajouter un point logistique
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ── Visite sur site ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setVisitExpanded(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
              <span style={h2Style}>Visite sur site</span>
              {visitSummary && !visitExpanded && (
                <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px',
                  borderRadius: R.pill, color: C.success, background: C.successBg }}>COMPLÉTÉE</span>
              )}
              {/* Chevron unique, pivoté de 180° à l'ouverture — le handoff
                  proscrit d'alterner deux glyphes différents. */}
              <span style={{ fontSize: 12, color: C.muted, display: 'inline-block',
                transform: visitExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>▾</span>
            </button>
            {visitExpanded && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {visitDirty && (
                  <ButtonPill onClick={saveVisit} disabled={visitSaving} style={{ fontSize: 13, padding: '0.45rem 1rem' }}>
                    {visitSaving ? 'enregistrement…' : 'enregistrer'}
                  </ButtonPill>
                )}
                <ButtonPill onClick={generateSummary} disabled={summaryLoading} style={{ fontSize: 13, padding: '0.45rem 1rem' }}>
                  {summaryLoading ? 'génération…' : 'résumé ia'}
                </ButtonPill>
                <ButtonPill onClick={() => window.print()} className="no-print" style={{ fontSize: 13, padding: '0.45rem 1rem' }}>
                  imprimer
                </ButtonPill>
              </div>
            )}
          </div>

          {visitExpanded && (
            <div className="space-y-4">
              {/* ── Form grid ── */}
              <div className="u-surface u-panel border u-line p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Date */}
                  <div>
                    <label className="block text-xs u-muted mb-1">Date de visite</label>
                    <input type="date" value={siteVisit.date} style={{ fontSize: 14 }}
                      onChange={e => setVisitField('date', e.target.value)} className={inp} />
                  </div>

                  {/* Participants */}
                  <div>
                    <label className="block text-xs u-muted mb-1">Participants</label>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {responsibles.filter(r => r !== 'non défini' && r !== 'Sous-traitant').map(name => {
                        const active = (siteVisit.participants || []).includes(name)
                        return (
                          <button key={name} type="button" onClick={() => toggleParticipant(name)}
                            className="text-xs font-semibold px-2.5 py-1 u-pill border transition-all"
                            style={{
                              borderColor: active ? PERSON_COLORS[name] : C.border,
                              background: active ? PERSON_COLORS[name] + '18' : 'white',
                              color: active ? PERSON_COLORS[name] : C.muted,
                            }}>{name}</button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs u-muted mb-1">Adresse du lieu</label>
                    <input type="text" value={siteVisit.address} placeholder="Rue, ville..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('address', e.target.value)} className={inp} />
                  </div>

                  {/* Space dimensions */}
                  <div>
                    <label className="block text-xs u-muted mb-1">Surface (m²)</label>
                    <input type="text" value={siteVisit.surface} placeholder="ex: 120" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('surface', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs u-muted mb-1">Hauteur sous plafond (m)</label>
                    <input type="text" value={siteVisit.ceiling_height} placeholder="ex: 3.5" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('ceiling_height', e.target.value)} className={inp} />
                  </div>

                  {/* Floor type */}
                  <div>
                    <label className="block text-xs u-muted mb-1">Type de sol</label>
                    <select value={siteVisit.floor_type} onChange={e => setVisitField('floor_type', e.target.value)}
                      className={inp} style={{ fontSize: 14 }}>
                      <option value="">— Choisir —</option>
                      {['Parquet', 'Carrelage', 'Béton', 'Moquette', 'Résine', 'Marbre', 'Autre'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Access */}
                  <div>
                    <label className="block text-xs u-muted mb-1">Accès livraison</label>
                    <input type="text" value={siteVisit.access_notes} placeholder="Monte-charge, quai, escalier..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('access_notes', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs u-muted mb-1">Horaires d'accès</label>
                    <input type="text" value={siteVisit.access_hours} placeholder="ex: 08h00 – 18h00" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('access_hours', e.target.value)} className={inp} />
                  </div>

                  {/* Technical */}
                  <div>
                    <label className="block text-xs u-muted mb-1">Électricité</label>
                    <input type="text" value={siteVisit.electricity} placeholder="ex: 2×16A, triphasé, nb prises..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('electricity', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs u-muted mb-1">Éclairage</label>
                    <input type="text" value={siteVisit.lighting} placeholder="ex: naturel + spots, modifiable..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('lighting', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs u-muted mb-1">Réseau / Wifi</label>
                    <input type="text" value={siteVisit.wifi} placeholder="ex: Wifi disponible, code: xxx" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('wifi', e.target.value)} className={inp} />
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-xs u-muted mb-1">Contact sur place</label>
                    <input type="text" value={siteVisit.contacts} placeholder="Nom + téléphone" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('contacts', e.target.value)} className={inp} />
                  </div>

                  {/* Constraints */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs u-muted mb-1">Contraintes particulières</label>
                    <textarea rows={2} value={siteVisit.constraints} style={{ fontSize: 14, resize: 'none' }}
                      placeholder="Horaires imposés, règles du lieu, travaux en cours..."
                      onChange={e => setVisitField('constraints', e.target.value)} className={inp} />
                  </div>

                  {/* Observations */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs u-muted mb-1">Observations générales</label>
                    <textarea rows={3} value={siteVisit.observations} style={{ fontSize: 14, resize: 'none' }}
                      placeholder="Points d'attention, remarques de l'équipe..."
                      onChange={e => setVisitField('observations', e.target.value)} className={inp} />
                  </div>

                </div>
              </div>

              {/* ── AI Summary ── */}
              {(visitSummary || summaryLoading) && (
                <div className="u-surface u-panel border overflow-hidden" style={{ borderColor: PINK + '44' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: PINK + '22', background: PINK + '08' }}>
                    <span className="text-sm">✨</span>
                    <span className="text-xs font-bold u-ink">Analyse IA</span>
                    {visitSummary && (
                      <button onClick={generateSummary} disabled={summaryLoading}
                        className="ml-auto text-xs u-muted hover:u-ink transition-colors disabled:opacity-50">
                        {summaryLoading ? '⏳' : '↻ Regénérer'}
                      </button>
                    )}
                  </div>
                  <div className="px-4 py-4">
                    {summaryLoading && !visitSummary ? (
                      <div className="flex items-center gap-2 text-sm u-muted">
                        <div className="w-4 h-4 u-pill border-2 animate-spin flex-shrink-0"
                          style={{ borderColor: C.border, borderTopColor: PINK }} />
                        Analyse en cours...
                      </div>
                    ) : (
                      <div className="text-sm u-ink leading-relaxed whitespace-pre-wrap">{visitSummary}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Offre ── */}
        <div className="no-print">
          {(() => {
            const managementTotal     = quote.management.reduce((s, r) => s + laborNet(r), 0)
            const itemsTotal          = quote.items.reduce((s, it) => s + itemTotal(it), 0)
            const subcontractingTotal = (quote.subcontracting || []).reduce((s, r) => s + serviceNet(r), 0)
            const logisticsTotal      = quote.logistics.reduce((s, r) => s + logisticsNet(r), 0)
            const grandTotal          = managementTotal + itemsTotal + subcontractingTotal + logisticsTotal
            const autoRef             = `${new Date().getFullYear()}-${String(project?.id || '').slice(-4).toUpperCase()}`
            const statusMeta          = quoteStatusMeta(quote.status)

            const numCell = "px-2 py-1.5 text-sm bg-transparent text-right tabular-nums w-full focus:outline-none focus:u-surface focus:u-line rounded"
            const txtCell = "px-2 py-1.5 text-sm bg-transparent w-full focus:outline-none focus:u-surface focus:u-line rounded"
            const th = "px-3 py-2 text-left text-xs font-semibold u-ink u-fill"
            const td = "border-t u-line align-middle"
            const tdRO = "px-3 py-1.5 text-sm text-right u-ink tabular-nums"

            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <button onClick={() => setQuoteExpanded(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                      <span style={h2Style}>Offre</span>
                      <span style={{ fontSize: 12, color: C.muted, display: 'inline-block',
                        transform: quoteExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>▾</span>
                      {!quoteExpanded && grandTotal > 0 && (
                        <span style={{ fontSize: 13, color: C.muted, marginLeft: 4 }}>· Total {fmtCHF(grandTotal)} CHF</span>
                      )}
                    </button>
                    {quoteExpanded ? (
                      <>
                        {/* Le statut est un select, mais il porte le costume d'une
                            pill outline : c'est un contrôle, donc radius 999. */}
                        <select
                          value={quote.status || 'brouillon'}
                          onChange={e => { setQuote(q => ({ ...q, status: e.target.value })); setQuoteDirty(true) }}
                          style={{ fontFamily: FONT, fontSize: 13, padding: '0.45rem 1rem', borderRadius: R.pill,
                            border: `1.5px solid ${C.outline}`, background: C.surface, color: AL.black, cursor: 'pointer' }}>
                          {QUOTE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>
                          <span>N°</span>
                          <input
                            value={quote.number || ''}
                            placeholder={autoRef}
                            onChange={e => { setQuote(q => ({ ...q, number: e.target.value })); setQuoteDirty(true) }}
                            style={{ width: 112, padding: '6px 12px', borderRadius: R.pill, border: `1.5px solid ${C.border}`,
                              fontFamily: FONT, fontSize: 13, color: AL.black, outline: 'none' }} />
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px',
                        borderRadius: R.pill, background: C.neutralBg, color: AL.black, textTransform: 'uppercase' }}>
                        {statusMeta.label}
                      </span>
                    )}
                  </div>
                  {quoteExpanded && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {quoteDirty && <span style={{ fontSize: 12, color: C.warning }}>non enregistré</span>}
                      <ButtonPill onClick={saveQuote} disabled={!quoteDirty || quoteSaving} style={{ fontSize: 13, padding: '0.45rem 1rem' }}>
                        {quoteSaving ? 'enregistrement…' : 'enregistrer'}
                      </ButtonPill>
                      <ButtonPill href={`/projects/${id}/devis`} target="_blank" rel="noopener"
                        style={{ fontSize: 13, padding: '0.45rem 1rem' }}
                        title={quoteDirty ? 'Enregistre d\'abord pour inclure les dernières modifs' : 'Aperçu et PDF de l\'offre'}>
                        offre pdf
                      </ButtonPill>
                      {isAdmin && (
                        <ButtonPill href={`/factures-emises/new?from=${id}`}
                          style={{ fontSize: 13, padding: '0.45rem 1rem' }}
                          title={quoteDirty ? 'Enregistre d\'abord' : 'Convertir en facture officielle avec QR-bill'}>
                          convertir en facture
                        </ButtonPill>
                      )}
                    </div>
                  )}
                </div>

                {quoteExpanded && (
                  <div className="space-y-6">
                    {/* Destinataire (société + personne + adresse) : édité via « Modifier » le projet. */}
                    {(project.client || project.client_address) && (
                      <div style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: '18px 20px' }}>
                        <span style={microLabel}>destinataire — offre &amp; facture</span>
                        <div style={{ fontSize: 15, fontWeight: 500, marginTop: 6, color: AL.black }}>{project.client || '—'}</div>
                        {(project.client_address || '').split('\n').filter(Boolean).map((l, i) => (
                          <div key={i} style={{ fontSize: 13, color: C.muted }}>{l}</div>
                        ))}
                        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>Modifier via « Modifier » le projet (choix entreprise + personne).</p>
                      </div>
                    )}

                    <QuoteEditor
                      value={quote}
                      onChange={q => { setQuote(q); setQuoteDirty(true) }}
                    />
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {/* ── Aperçu dossier kDrive ── */}
        <div className="no-print">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={h2Style}>Dossier kDrive</h2>
            {project.kdrive_folder_id && (
              <a
                href={`https://kdrive.infomaniak.com/app/drive/${KDRIVE_DRIVE_ID}/files/${kdrivePath.length > 0 ? kdrivePath[kdrivePath.length - 1].id : project.kdrive_folder_id}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                Ouvrir sur kDrive ↗
              </a>
            )}
          </div>

          {!project.kdrive_folder_id ? (
            <div style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, padding: 24, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Aucun dossier kDrive lié à ce projet.</p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.muted }}>Modifie le projet pour le lier à un dossier existant sur kDrive.</p>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1.5px solid ${C.outline}`, borderRadius: R.panel, overflow: 'hidden' }}>
              {/* Breadcrumb */}
              {kdrivePath.length > 0 && (
                <div className="px-5 py-3 border-b u-line flex items-center flex-wrap gap-1 text-xs">
                  <button onClick={() => kdriveGoTo(-1)}
                    className="px-1.5 py-0.5 rounded u-muted hover:u-ink">
                    📁 Racine
                  </button>
                  {kdrivePath.map((p, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="u-muted">/</span>
                      <button onClick={() => kdriveGoTo(i)}
                        className={`px-1.5 py-0.5 rounded ${i === kdrivePath.length - 1 ? 'font-semibold u-ink' : 'u-muted hover:u-ink'}`}>
                        {p.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Grid */}
              <div className="p-4">
                {kdriveLoading ? (
                  <p className="text-center text-sm u-muted py-8">Chargement…</p>
                ) : kdriveError ? (
                  <p className="text-center text-sm u-ko py-8">{kdriveError}</p>
                ) : kdriveItems.length === 0 ? (
                  <p className="text-center text-sm u-muted py-8">Dossier vide</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {kdriveItems.map(item => {
                      if (item.type === 'dir') {
                        return (
                          <button key={item.id} onClick={() => enterKdriveFolder(item)}
                            className="group flex flex-col items-center text-center p-3 u-panel border u-line hover:u-line hover:u-fill transition-colors">
                            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                            </svg>
                            <span className="mt-2 text-xs u-ink truncate w-full">{item.name}</span>
                          </button>
                        )
                      }
                      const isImage = item.mime_type?.startsWith('image/')
                      const isPdf = item.mime_type === 'application/pdf'
                      return (
                        <a key={item.id}
                          href={`https://kdrive.infomaniak.com/app/drive/${KDRIVE_DRIVE_ID}/preview/${item.id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="group block u-panel border u-line hover:u-line overflow-hidden transition-colors">
                          <div className="w-full h-28 u-fill flex items-center justify-center overflow-hidden">
                            {item.has_thumbnail ? (
                              <img
                                src={`/api/kdrive/thumbnail?fileId=${item.id}&token=${encodeURIComponent(item.token || '')}`}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                              />
                            ) : isPdf ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-3xl">📄</span>
                                <span className="text-xs u-muted font-medium">PDF</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <p className="text-xs u-ink truncate" title={item.name}>{item.name}</p>
                            <p className="text-[10px] u-muted">{fmtSize(item.size)}</p>
                          </div>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Fichiers du projet ── */}
        <div className="no-print">
          <h2 style={{ ...h2Style, marginBottom: 20 }}>Fichiers</h2>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{ borderRadius: R.panel, border: `1.5px dashed ${C.outline}`, marginBottom: 16, cursor: 'pointer',
              background: isDragging ? C.hover : C.surface, transition: 'background .15s ease' }}
            onClick={() => document.getElementById('file-input-hidden').click()}>
            <input id="file-input-hidden" type="file" multiple accept="image/*,.pdf"
              className="hidden"
              onChange={e => Array.from(e.target.files).forEach(uploadFile)} />
            <div className="flex flex-col items-center justify-center py-10 gap-1.5">
              {uploading ? (
                <div className="w-6 h-6 u-pill border-2 animate-spin" style={{ borderColor: C.border, borderTopColor: AL.black }} />
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 13.5, color: AL.black }}>Glisser des fichiers ici ou <span style={{ textDecoration: 'underline' }}>parcourir</span></p>
                  <p style={{ margin: 0, fontSize: 12.5, color: C.muted }}>Images (JPG, PNG, WEBP) · PDF · max 10 MB</p>
                </>
              )}
            </div>
          </div>

          {uploadError && (
            <p className="text-xs u-ko mb-2">{uploadError}</p>
          )}

          {/* File grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {files.map(f => {
                const isImage = f.mime_type?.startsWith('image/')
                const isPdf = f.mime_type === 'application/pdf'
                return (
                  <div key={f.id} className="group relative u-surface u-panel border u-line overflow-hidden">
                    {/* Thumbnail */}
                    <a href={f.url} target="_blank" rel="noreferrer" className="block">
                      {isImage ? (
                        <img src={f.url} alt={f.filename}
                          className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 flex flex-col items-center justify-center gap-1 u-fill">
                          <span className="text-3xl">📄</span>
                          <span className="text-xs u-muted font-medium">PDF</span>
                        </div>
                      )}
                    </a>
                    {/* Label + delete */}
                    <div className="px-2 py-1.5 flex items-center gap-1">
                      <p className="text-xs u-ink truncate flex-1">{f.filename}</p>
                      <button onClick={() => deleteFile(f)}
                        className="flex-shrink-0 u-muted hover:u-ko transition-colors text-xs opacity-0 group-hover:opacity-100">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Print form (hidden on screen, shown on print) ── */}
        <div className="print-form" style={{ padding: '2cm', fontFamily: 'Inter, sans-serif' }}>
          {/* Header */}
          <div style={{ borderBottom: `2px solid ${AL.black}`, paddingBottom: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: AL.black, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Amazing Lab — Visite sur site</p>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: AL.black, margin: 0 }}>{project.name}</h1>
                {project.client && <p style={{ fontSize: '14px', color: C.muted, margin: '4px 0 0 0' }}>{project.client}</p>}
              </div>
              {project.deadline && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' }}>Deadline</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: AL.black }}>{fmtDate(project.deadline)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Form fields */}
          {[
            ['Date de visite', ''],
            ['Participants', ''],
            ['Adresse du lieu', ''],
          ].map(([label]) => (
            <PrintField key={label} label={label} />
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <PrintField label="Surface (m²)" />
            <PrintField label="Hauteur sous plafond (m)" />
            <PrintField label="Type de sol" />
          </div>

          {[
            'Accès livraison',
            'Horaires d\'accès',
            'Électricité',
            'Éclairage',
            'Réseau / Wifi',
            'Contact sur place',
          ].map(label => (
            <PrintField key={label} label={label} />
          ))}

          <PrintField label="Contraintes particulières" tall />
          <PrintField label="Observations générales" tall />

          <div style={{ marginTop: '32px', borderTop: `1px solid ${C.border}`, paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '10px', color: C.muted }}>Amazing Lab © {new Date().getFullYear()}</p>
            <p style={{ fontSize: '10px', color: C.muted }}>amazinglab.ch</p>
          </div>
        </div>

      </div>
    </div>

    {/* ── Edit task modal ── */}
    {editingTask && (
      <EditTaskModal
        task={editingTask}
        currentUser={currentUser}
        onSave={handleTaskUpdated}
        onDelete={handleTaskDeleted}
        onClose={() => setEditingTask(null)}
      />
    )}

    {/* ── Create task drawer (catégories génériques) ── */}
    {drawerCategory && (
      <TaskFormDrawer
        currentUser={currentUser}
        defaultProjectId={project.id}
        defaultCategory={drawerCategory}
        hideProjectSelector
        onSave={async (body) => {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
            body: JSON.stringify(body),
          })
          const created = await res.json()
          // Ne pas avaler l'erreur : sinon un refus côté base passe pour une
          // tâche qui « ne s'affiche pas ».
          if (!res.ok || created.error) {
            alert('Création impossible : ' + (created.error || `erreur ${res.status}`))
            return
          }
          handleTaskAdded(created)
          setDrawerCategory(null)
        }}
        onClose={() => setDrawerCategory(null)}
      />
    )}
    </>
  )
}

// ── PrintField helper ──────────────────────────────────────────────────────────
function PrintField({ label, tall }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ fontSize: '9px', fontWeight: 700, color: AL.black, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</p>
      <div style={{
        borderBottom: tall ? 'none' : `1px solid ${C.muted}`,
        border: tall ? `1px solid ${C.muted}` : undefined,
        borderRadius: tall ? '6px' : undefined,
        minHeight: tall ? '60px' : '24px',
        width: '100%',
      }} />
    </div>
  )
}
