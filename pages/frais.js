// Mes frais — l'écran de celui qui dépense.
//
// `/justificatifs` montre les mêmes pièces, mais c'est l'écran de celui qui
// CLASSE : rapprochement bancaire, comptes, export, et réservé à l'admin.
// Ici, chacun dépose ses tickets. Sans cette page, un membre de l'équipe
// n'aurait aucune façon de rendre un reçu — ce qui a failli arriver en
// sortant les frais de la page des horaires, où ils n'avaient rien à faire.
//
// Toute la mécanique vit dans `components/FraisPanel.js` ; cette page ne fait
// que dire DE QUI et de QUELLE ANNÉE.
import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import NavBar from '../components/NavBar'
import FraisPanel from '../components/FraisPanel'
import { useResponsibles } from '../lib/useResponsibles'
import { AL, C, FONT, MONO, R } from '../lib/theme'

const micro = { font: `500 10.5px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }
const champ = {
  padding: '7px 12px', borderRadius: R.pill, border: `1px solid ${C.border}`,
  font: `13px ${FONT}`, color: AL.black, background: C.surface, outline: 'none',
}

export default function Frais() {
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const { responsibles } = useResponsibles()

  const annee = new Date().getFullYear()
  const [an, setAn] = useState(annee)
  // L'admin regarde aussi ceux des autres — c'est lui qui les classe. Un
  // membre est ramené à son propre nom par le serveur de toute façon.
  const [qui, setQui] = useState('')
  const personne = (isAdmin && qui) || user?.name || ''
  const equipe = (Array.isArray(responsibles) ? responsibles : [])
    .filter(r => r && r !== 'non défini' && r !== 'Sous-traitant')

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>Frais — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          @media (max-width: 768px) {
            .frais-main { padding: 20px 16px 104px !important; }
            .frais-titre { font-size: 27px !important; }
            input, select { font-size: 16px !important; }
          }
        `}</style>
      </Head>
      <NavBar title="frais" />

      <main className="frais-main" style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 className="frais-titre" style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>
            Frais
          </h1>
          <p style={{ fontSize: 17, color: C.muted, margin: '10px 0 0' }}>
            Photographie le ticket : la date, le montant et le commerçant se remplissent tout seuls.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && (
            <>
              <span style={micro}>de</span>
              <select value={qui} onChange={e => setQui(e.target.value)} style={champ}>
                <option value="">Moi ({user?.name})</option>
                {equipe.filter(n => n !== user?.name).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </>
          )}
          <span style={micro}>année</span>
          <select value={an} onChange={e => setAn(Number(e.target.value))} style={champ}>
            {[annee, annee - 1, annee - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {personne ? <FraisPanel userName={personne} year={an} /> : null}

        {isAdmin && (
          <span style={micro}>
            Le classement comptable, le rapprochement et l&apos;export sont dans{' '}
            <Link href="/justificatifs" style={{ color: C.muted }}>justificatifs</Link>
          </span>
        )}
      </main>
    </div>
  )
}
