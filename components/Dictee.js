// Dictée : on parle, le texte arrive dans la zone de saisie.
//
// Raconter prend deux minutes à la voix et quinze au clavier — et ce qui est
// dicté est plus complet, parce qu'on ne s'arrête pas pour chercher ses mots.
// Le son n'est pas conservé : il produit du texte, qui se corrige ensuite
// comme n'importe quel texte.
//
// Servie à deux endroits : le récit d'une présentation client et le fil des
// mises à jour d'un projet. Un vocal WhatsApp déjà enregistré se dépose aussi
// bien qu'un micro qu'on ouvre.
//
// Safari enregistre en mp4, Chrome et Firefox en webm : on prend ce que le
// navigateur sait faire plutôt que d'imposer un format qu'il refusera.
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { AL, C, FONT, R } from '../lib/theme'

const bouton = (actif = true) => ({
  padding: '8px 16px', borderRadius: R.pill, border: `1.5px solid ${C.outline}`,
  background: actif ? AL.black : C.surface, color: actif ? AL.white : AL.black,
  font: `500 13px ${FONT}`, cursor: 'pointer',
})

export default function Dictee({ onTexte }) {
  const [etat, setEtat] = useState('prêt')   // prêt · enregistre · transcrit
  const [secondes, setSecondes] = useState(0)
  const [erreur, setErreur] = useState('')
  const enregistreur = useRef(null)
  const morceaux = useRef([])
  const minuteur = useRef(null)

  useEffect(() => () => {
    clearInterval(minuteur.current)
    enregistreur.current?.stream?.getTracks?.().forEach(t => t.stop())
  }, [])

  async function envoyer(blob, filename) {
    setEtat('transcrit')
    try {
      const base64 = await new Promise((ok, ko) => {
        const l = new FileReader()
        l.onload = () => ok(String(l.result).split(',')[1])
        l.onerror = ko
        l.readAsDataURL(blob)
      })
      const r = await apiFetch('/api/transcription', {
        method: 'POST', json: { base64, filename, mime: blob.type }, timeoutMs: 180000, silencieux: true,
      })
      onTexte(r.texte)
      setEtat('prêt')
    } catch (e) {
      setErreur(e.message)
      setEtat('prêt')
    }
  }

  async function demarrer() {
    setErreur('')
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true })
      // WebM d'abord : son en-tête dit sans ambiguïté qu'il s'agit d'audio.
      // Le mp4 ne vient qu'après, pour Safari qui ne produit que celui-là.
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(t => window.MediaRecorder?.isTypeSupported?.(t))
      const rec = new MediaRecorder(flux, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 })
      morceaux.current = []
      rec.ondataavailable = e => { if (e.data.size) morceaux.current.push(e.data) }
      rec.onstop = () => {
        flux.getTracks().forEach(t => t.stop())
        clearInterval(minuteur.current)
        const blob = new Blob(morceaux.current, { type: rec.mimeType })
        envoyer(blob, `dictee.${rec.mimeType.includes('mp4') ? 'm4a' : 'webm'}`)
      }
      rec.start()
      enregistreur.current = rec
      setSecondes(0)
      minuteur.current = setInterval(() => setSecondes(s => s + 1), 1000)
      setEtat('enregistre')
    } catch (e) {
      // Micro refusé, ou navigateur sans MediaRecorder : la dictée du système
      // reste disponible et écrit directement dans le champ.
      setErreur(`Micro indisponible (${e.name || e.message}). La dictée du système fonctionne dans le champ ci-dessous.`)
    }
  }

  const duree = `${String(Math.floor(secondes / 60)).padStart(2, '0')}:${String(secondes % 60).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
      {etat === 'enregistre' ? (
        <button style={bouton()} onClick={() => enregistreur.current?.stop()}>
          <span style={{ color: C.accentOnDark }}>●</span> arrêter · {duree}
        </button>
      ) : (
        <button style={bouton(false)} disabled={etat === 'transcrit'} onClick={demarrer}>
          {etat === 'transcrit' ? 'transcription…' : 'Dicter'}
        </button>
      )}

      <label style={{ font: `12.5px ${FONT}`, color: C.muted, cursor: 'pointer' }}>
        ou déposer un vocal
        <input type="file" accept="audio/*" style={{ display: 'none' }} disabled={etat !== 'prêt'}
          onChange={e => { const f = e.target.files?.[0]; if (f) envoyer(f, f.name) }} />
      </label>

      {erreur && <span style={{ font: `12px ${FONT}`, color: C.danger }}>{erreur}</span>}
    </div>
  )
}
