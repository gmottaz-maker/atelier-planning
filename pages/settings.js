import { useState } from 'react'
import Head from 'next/head'
import { useAuth } from './_app'
import { supabase } from '../lib/supabase'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const currentUser = user?.name || ''
  const isAdmin = currentUser === 'Guillaume'

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
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Paramètres — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          input:focus { border-color: #9ca3af !important; box-shadow: 0 0 0 3px rgba(17,24,39,0.06) !important; outline: none; }
        `}</style>
      </Head>

      <NavBar title="Paramètres" />

      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">

        {/* Compte */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Compte</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ background: '#111827' }}>
                {currentUser?.[0] || '?'}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{currentUser}</p>
                <p className="text-xs text-gray-500">{user?.email || ''}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Responsables (admin only) */}
        {isAdmin && <ResponsiblesSection />}

        {/* Sécurité */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Sécurité</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900 text-sm mb-4">Changer le mot de passe</h3>
            {status === 'success' && (
              <div className="mb-4 px-4 py-3 rounded-md text-sm" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                Mot de passe mis à jour.
              </div>
            )}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Nouveau mot de passe</label>
                <input type="password" required value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setStatus(null) }}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirmer le mot de passe</label>
                <input type="password" required value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setStatus(null) }}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white" />
              </div>
              {(status === 'error' || errorMsg) && <p className="text-sm text-red-500">{errorMsg}</p>}
              <button type="submit" disabled={status === 'loading'}
                className="px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-50"
                style={{ background: '#111827' }}>
                {status === 'loading' ? 'Enregistrement…' : 'Mettre à jour'}
              </button>
            </form>
          </div>
        </section>

        {/* Session */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Session</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Se déconnecter</p>
              <p className="text-xs text-gray-500 mt-0.5">Fermer la session sur cet appareil</p>
            </div>
            <button onClick={() => signOut()}
              className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors">
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
        <h2 className="text-sm font-semibold text-gray-900">Responsables de projet</h2>
        {dirty && (
          <div className="flex items-center gap-2">
            <button onClick={cancel} className="text-xs text-gray-500 hover:text-gray-900">Annuler</button>
            <button onClick={commit} disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-md text-white disabled:opacity-60"
              style={{ background: '#111827' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {!loaded ? (
          <p className="px-6 py-5 text-sm text-gray-400">Chargement…</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {list.map((name, idx) => (
                <li key={name} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-900">{name}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                      className="text-gray-400 hover:text-gray-900 disabled:opacity-30">↑</button>
                    <button onClick={() => moveItem(idx, 1)} disabled={idx === list.length - 1}
                      className="text-gray-400 hover:text-gray-900 disabled:opacity-30">↓</button>
                    <button onClick={() => removeItem(idx)} className="text-gray-500 hover:text-red-600">Supprimer</button>
                  </div>
                </li>
              ))}
              {list.length === 0 && (
                <li className="px-6 py-4 text-sm text-gray-400">Aucun responsable.</li>
              )}
            </ul>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                placeholder="Nouveau responsable…"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm bg-white" />
              <button onClick={addItem}
                className="px-3 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400">
                Ajouter
              </button>
            </div>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Modifications visibles uniquement après avoir cliqué sur Enregistrer.
      </p>
    </section>
  )
}
