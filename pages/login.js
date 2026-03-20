import { useState } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

const PINK = '#FF4D6D'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou mot de passe incorrect')
    }
    // Redirect handled by _app.js via onAuthStateChange
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Connexion — Amazing Lab</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          input:focus { border-color: ${PINK} !important; box-shadow: 0 0 0 3px ${PINK}22 !important; outline: none; }
          input { font-size: 16px !important; }
          * { -webkit-tap-highlight-color: transparent; }
        `}</style>
      </Head>

      <div className="w-full max-w-xs">
        {/* Logo */}
        <div className="text-center mb-10">
          <svg width="44" height="44" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3">
            <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
            <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
            <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
            <circle cx="20" cy="20" r="3" fill={PINK} />
          </svg>
          <p className="font-bold text-gray-900 text-xl">amazing lab</p>
          <p className="text-gray-400 text-sm mt-1">Connexion</p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Mot de passe</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm bg-white transition-all"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center py-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-opacity disabled:opacity-50 mt-2"
            style={{ background: PINK }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
