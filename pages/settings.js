import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useAuth } from './_app'
import { supabase } from '../lib/supabase'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'
import useIsAdmin from '../lib/useIsAdmin'
import { AL, C } from '../lib/theme'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const currentUser = user?.name || ''
  const isAdmin = useIsAdmin()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleChangePassword(e) {
    e.preventDefault()
    setErrorMsg('')
    if (newPassword.length < 6) { setErrorMsg('Le mot de passe doit faire au moins 6 caractères.'); return }
    if (newPassword !== confirmPassword) { setErrorMsg('Les mots de passe ne correspondent pas.'); return }
    setStatus('loading')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setErrorMsg(error.message || 'Une erreur est survenue.'); setStatus('error') }
    else { setStatus('success'); setNewPassword(''); setConfirmPassword('') }
  }

  return (
    <div className="min-h-screen" style={{ background: AL.white, fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Paramètres — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          input:focus { border-color: ${C.muted} !important; box-shadow: 0 0 0 3px rgba(17,24,39,0.06) !important; outline: none; }
        `}</style>
      </Head>

      <NavBar title="Paramètres" />

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-8 md:space-y-10">

        {/* Compte */}
        <section>
          <h2 className="text-sm font-semibold u-ink mb-4">Compte</h2>
          <div className="u-surface u-panel border u-line p-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 u-pill flex items-center justify-center text-white font-semibold text-sm" style={{ background: AL.black }}>
                {currentUser?.[0] || '?'}
              </div>
              <div>
                <p className="font-semibold u-ink text-sm">{currentUser}</p>
                <p className="text-xs u-muted">{user?.email || ''}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Responsables (admin only) */}
        {isAdmin && <ResponsiblesSection />}

        {/* Infos entreprise (admin only — pour les factures + QR-bill) */}
        {isAdmin && <CompanyInfoSection />}

        {/* Sécurité */}
        <section>
          <h2 className="text-sm font-semibold u-ink mb-4">Sécurité</h2>
          <div className="u-surface u-panel border u-line p-6">
            <h3 className="font-medium u-ink text-sm mb-4">Changer le mot de passe</h3>
            {status === 'success' && (
              <div className="mb-4 px-4 py-3 u-pill text-sm" style={{ background: 'rgba(27,122,90,.10)', color: C.success }}>
                Mot de passe mis à jour.
              </div>
            )}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Nouveau mot de passe</label>
                <input type="password" required value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setStatus(null) }}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border u-line u-pill text-sm u-surface" />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Confirmer le mot de passe</label>
                <input type="password" required value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setStatus(null) }}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border u-line u-pill text-sm u-surface" />
              </div>
              {(status === 'error' || errorMsg) && <p className="text-sm u-ko">{errorMsg}</p>}
              <button type="submit" disabled={status === 'loading'}
                className="px-4 py-2 u-pill text-white text-sm font-medium disabled:opacity-50"
                style={{ background: AL.black }}>
                {status === 'loading' ? 'Enregistrement…' : 'Mettre à jour'}
              </button>
            </form>
          </div>
        </section>

        {/* Session */}
        <section>
          <h2 className="text-sm font-semibold u-ink mb-4">Session</h2>
          <div className="u-surface u-panel border u-line p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium u-ink">Se déconnecter</p>
              <p className="text-xs u-muted mt-0.5">Fermer la session sur cet appareil</p>
            </div>
            <button onClick={() => signOut()}
              className="px-4 py-2 u-pill text-sm font-medium border u-line u-ink hover:u-line transition-colors">
              Déconnexion
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Responsibles section ────────────────────────────────────────────────────

function ResponsiblesSection() {
  const { responsibles, save, loaded } = useResponsibles()
  const [draft, setDraft] = useState(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const list = draft ?? responsibles
  const dirty = draft !== null

  function addItem() {
    const name = newName.trim()
    if (!name) return
    if (list.includes(name)) return
    setDraft([...list, name])
    setNewName('')
  }

  function removeItem(idx) {
    setDraft(list.filter((_, i) => i !== idx))
  }

  function moveItem(idx, dir) {
    const next = [...list]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setDraft(next)
  }

  async function commit() {
    if (!dirty) return
    setSaving(true)
    try {
      await save(list)
      setDraft(null)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(null)
    setNewName('')
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold u-ink">Responsables de projet</h2>
        {dirty && (
          <div className="flex items-center gap-2">
            <button onClick={cancel} className="text-xs u-muted hover:u-ink">Annuler</button>
            <button onClick={commit} disabled={saving}
              className="text-xs font-medium px-3 py-1.5 u-pill text-white disabled:opacity-60"
              style={{ background: AL.black }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      <div className="u-surface u-panel border u-line">
        {!loaded ? (
          <p className="px-6 py-5 text-sm u-muted">Chargement…</p>
        ) : (
          <>
            <ul className="divide-y u-divide">
              {list.map((name, idx) => (
                <li key={name} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-sm u-ink">{name}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                      className="u-muted hover:u-ink disabled:opacity-30">↑</button>
                    <button onClick={() => moveItem(idx, 1)} disabled={idx === list.length - 1}
                      className="u-muted hover:u-ink disabled:opacity-30">↓</button>
                    <button onClick={() => removeItem(idx)} className="u-muted hover:u-ko">Supprimer</button>
                  </div>
                </li>
              ))}
              {list.length === 0 && (
                <li className="px-6 py-4 text-sm u-muted">Aucun responsable.</li>
              )}
            </ul>
            <div className="px-6 py-4 border-t u-line flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                placeholder="Nouveau responsable…"
                className="flex-1 px-3 py-2 border u-line u-pill text-sm u-surface" />
              <button onClick={addItem}
                className="px-3 py-2 u-pill text-sm font-medium border u-line u-ink hover:u-line">
                Ajouter
              </button>
            </div>
          </>
        )}
      </div>
      <p className="mt-3 text-xs u-muted">
        Modifications visibles uniquement après avoir cliqué sur Enregistrer.
      </p>
    </section>
  )
}

// ─── Company info section ───────────────────────────────────────────────────

// Lit un fichier image et le renvoie en data URL, redimensionné (sauf SVG).
function fileToLogoDataUrl(file, maxDim = 600) {
  return new Promise((resolve, reject) => {
    if (file.size > 3 * 1024 * 1024) return reject(new Error('fichier trop lourd (> 3 Mo)'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('lecture impossible'))
    reader.onload = () => {
      const src = reader.result
      if (file.type === 'image/svg+xml') return resolve(src) // vectoriel, déjà léger
      const img = new Image()
      img.onerror = () => reject(new Error('image invalide'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png')) // PNG → préserve la transparence
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

function CompanyInfoSection() {
  const EMPTY = {
    name: '', address: '', zip: '', city: '', country: 'CH',
    iban: '', email: '', phone: '', website: '', vat_number: '',
    payment_terms: 'Paiement à 30 jours net.', logo: '',
  }
  const [form, setForm] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    fetch('/api/app-settings/company_info').then(r => r.json()).then(d => {
      if (d?.value) setForm(f => ({ ...EMPTY, ...d.value }))
      setLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function onLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      set('logo', await fileToLogoDataUrl(file))
    } catch (err) {
      setFeedback('Logo : ' + err.message)
    } finally {
      e.target.value = ''
    }
  }

  async function save() {
    setSaving(true); setFeedback('')
    try {
      const r = await fetch('/api/app-settings/company_info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: form }),
      })
      const d = await r.json()
      if (d.error) { setFeedback('Erreur : ' + d.error); return }
      setFeedback('Enregistré')
      setTimeout(() => setFeedback(''), 2000)
    } catch (e) { setFeedback('Erreur : ' + e.message) }
    finally { setSaving(false) }
  }

  const inputCls = "w-full px-3 py-2 border u-line u-pill text-sm u-surface focus:u-line focus:outline-none"

  return (
    <section>
      <h2 className="text-sm font-semibold u-ink mb-4">Informations entreprise (devis & factures)</h2>
      <p className="text-xs u-muted mb-4">
        Apparaissent en en-tête des devis et factures PDF, et dans la zone bénéficiaire du QR-bill suisse.
      </p>
      <div className="u-surface u-panel border u-line p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium u-muted mb-1">Logo (en-tête des devis & factures)</label>
            <div className="flex items-center gap-3">
              {form.logo ? (
                <img src={form.logo} alt="logo" className="h-12 w-auto max-w-[160px] object-contain border u-line u-pill u-surface p-1" />
              ) : (
                <div className="h-12 w-24 flex items-center justify-center border border-dashed u-line u-pill u-muted text-xs">Aucun</div>
              )}
              <label className="px-3 py-2 text-sm u-pill border u-line hover:u-line cursor-pointer transition-colors">
                {form.logo ? 'Changer' : 'Téléverser'}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={onLogoChange} />
              </label>
              {form.logo && (
                <button type="button" onClick={() => set('logo', '')} className="text-xs u-muted hover:u-ko">retirer</button>
              )}
            </div>
            <p className="text-xs u-muted mt-1">PNG ou SVG conseillé. Redimensionné automatiquement.</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium u-muted mb-1">Raison sociale *</label>
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Amazing Lab Sàrl" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium u-muted mb-1">Adresse *</label>
            <input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rue de l'Ecluse 30" />
          </div>
          <div>
            <label className="block text-xs font-medium u-muted mb-1">NPA *</label>
            <input className={inputCls} value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="1201" />
          </div>
          <div>
            <label className="block text-xs font-medium u-muted mb-1">Ville *</label>
            <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Genève" />
          </div>
          <div>
            <label className="block text-xs font-medium u-muted mb-1">Pays</label>
            <input className={inputCls} value={form.country} onChange={e => set('country', e.target.value)} placeholder="CH" maxLength={2} />
          </div>
          <div>
            <label className="block text-xs font-medium u-muted mb-1">N° TVA</label>
            <input className={inputCls} value={form.vat_number} onChange={e => set('vat_number', e.target.value)} placeholder="CHE-123.456.789 TVA" />
          </div>
          <div className="col-span-2 pt-2 border-t u-line">
            <label className="block text-xs font-medium u-muted mb-1">IBAN (QR-IBAN recommandé pour QR-bill)</label>
            <input className={inputCls} value={form.iban} onChange={e => set('iban', e.target.value)} placeholder="CH00 0000 0000 0000 0000 0" style={{ fontFamily: 'monospace' }} />
            <p className="text-xs u-muted mt-1">Un QR-IBAN commence par CH suivi de 30-31. Demande à ta banque s'il faut l'activer.</p>
          </div>
          <div>
            <label className="block text-xs font-medium u-muted mb-1">Email</label>
            <input className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} placeholder="hello@amazinglab.ch" />
          </div>
          <div>
            <label className="block text-xs font-medium u-muted mb-1">Téléphone</label>
            <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+41 22 ..." />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium u-muted mb-1">Site web</label>
            <input className={inputCls} value={form.website} onChange={e => set('website', e.target.value)} placeholder="amazinglab.ch" />
          </div>
          <div className="col-span-2 pt-2 border-t u-line">
            <label className="block text-xs font-medium u-muted mb-1">Conditions de paiement (pied de facture)</label>
            <textarea rows={2} className={inputCls} value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t u-line">
          <span className="text-xs u-muted">{feedback}</span>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 u-pill text-sm font-medium text-white disabled:opacity-50"
            style={{ background: AL.black }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </section>
  )
}
