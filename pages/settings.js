import { useState } from 'react'
import Head from 'next/head'
import { useAuth } from './_app'
import { supabase } from '../lib/supabase'
import NavBar from '../components/NavBar'

const PINK = '#FF4D6D'
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: PINK,
  'Sous-traitant': '#64748b',
}

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

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const currentUser = user?.name || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  async function handleChangePassword(e) {
    e.preventDefault()
    setErrorMsg('')

    if (newPassword.length < 6) {
      setErrorMsg('Le mot de passe doit faire au moins 6 caractères.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Les mots de passe ne correspondent pas.')
      return
    }

    setStatus('loading')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setErrorMsg(error.message || 'Une erreur est survenue.')
      setStatus('error')
    } else {
      setStatus('success')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Paramètres — Amazing Lab</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          input:focus { border-color: ${PINK} !important; box-shadow: 0 0 0 3px ${PINK}22 !important; outline: none; }
          input { font-size: 16px !important; }
        `}</style>
      </Head>

      <NavBar title="paramètres">
        <button
          onClick={() => signOut()}
          className="px-3 py-1.5 rounded-full text-xs font-semibold text-white"
          style={{ background: PERSON_COLORS[currentUser] || PINK }}>
          {currentUser}
        </button>
      </NavBar>

      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Compte */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Compte</h2>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ background: PERSON_COLORS[currentUser] || PINK }}>
                {currentUser?.[0] || '?'}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{currentUser}</p>
                <p className="text-xs text-gray-400">{user?.email || ''}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Changer le mot de passe */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Sécurité</h2>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-4">Changer le mot de passe</h3>

            {status === 'success' && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium"
                style={{ background: '#f0fdf4', color: '#16a34a' }}>
                ✓ Mot de passe mis à jour avec succès.
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setStatus(null) }}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setStatus(null) }}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm bg-white transition-all"
                />
              </div>

              {(status === 'error' || errorMsg) && (
                <p className="text-sm text-red-500">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="px-5 py-2.5 rounded-full text-white text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ background: PINK }}>
                {status === 'loading' ? 'Enregistrement...' : 'Mettre à jour'}
              </button>
            </form>
          </div>
        </div>

        {/* Déconnexion */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Session</h2>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Se déconnecter</p>
                <p className="text-xs text-gray-400 mt-0.5">Fermer la session sur cet appareil</p>
              </div>
              <button
                onClick={() => signOut()}
                className="px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors">
                Déconnexion
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
