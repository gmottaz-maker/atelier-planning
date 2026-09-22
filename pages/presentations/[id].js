// Une présentation client, du récit au PDF.
//
// On raconte le projet comme on le dirait au téléphone, on dépose les visuels
// avec leurs noms, et Claude en fait la présentation entière — le nombre de
// pages suit le nombre de pièces, pas un réglage. On lit le résultat, on
// demande une correction en une phrase, on dépose le PDF dans le dossier du
// projet.
//
// La relecture champ par champ existe encore, repliée : elle sert à corriger
// une faute de frappe, pas à construire le document. Le premier écran l'avait
// mise au centre — c'était un formulaire de dix-sept sections, et remplir un
// formulaire n'est pas ce qu'on veut faire d'un projet.
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { apiFetch } from '../../lib/api'
import { C, FONT, MONO, R } from '../../lib/theme'
import { pagesDeck } from '../../lib/deck'
import { reduireImage } from '../../lib/imageReduite'
import { gabaritDeck } from '../../lib/deckGabarit'

// Postgres ne garde PAS l'ordre des clés d'un `jsonb` : il les réécrit par
// longueur puis alphabétiquement. Un écran qui dessine les champs dans l'ordre
// de l'objet relu affiche donc « date, lieu, titre, numéro » au lieu de l'ordre
// du document. Le gabarit sert de référence d'ordre — il est, lui, écrit à la
// main dans le dépôt. (Le PDF n'est pas concerné : ses gabarits lisent des clés
// nommées.)
const REFERENCE = gabaritDeck({ pieces: 3 })

const TITRES = {
  couverture: 'Couverture', contexte: 'Le contexte', brief: 'Le brief',
  pourquoi: 'Pourquoi nous', apercu: 'Les pièces', methode: 'Comment lire les visuels',
  visuels: 'Visuels', detail: 'Détail', materiaux: 'Matériaux', planning: 'Planning',
  budget: 'Budget', conditions: 'Conditions', cloture: 'Clôture',
}

const LIBELLES = {
  libelleTva: 'Libellé de TVA', sousTotal: 'Sous-total', tva: 'TVA', montant: 'Montant', total: 'Total',
  surtitre: 'Sur-titre', titre: 'Titre', sousTitre: 'Sous-titre', texte: 'Texte',
  intro: 'Introduction', legende: 'Légende', nom: 'Nom', description: 'Description',
  label: 'Libellé', valeur: 'Valeur', date: 'Date', note: 'Note', portee: 'Portée',
  contact: 'Contact', ligne: 'Phrase', lieu: 'Lieu et dates', numero: 'Numéro',
  libelle: 'Poste', points: 'Mots-clés', paragraphes: 'Paragraphes', attente: null,
  kdrive_id: null, kdrive_nom: null, mime: null, src: null, empile: null,
  rang: null, total: null, type: null, couleur: 'Couleur',
}

const panneau = {
  border: `1px solid ${C.border}`, borderRadius: R.panel, background: C.surface,
  padding: '16px 18px', marginBottom: 12,
}
const champ = {
  width: '100%', padding: '8px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
  font: `13.5px ${FONT}`, color: C.ink, background: C.surface, outline: 'none', resize: 'vertical',
}
const microLabel = {
  fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.muted, display: 'block', marginBottom: 4,
}
const bouton = (actif = true) => ({
  padding: '8px 16px', borderRadius: R.pill, border: `1.5px solid ${C.outline}`,
  background: actif ? C.ink : C.surface, color: actif ? C.surface : C.ink,
  font: `500 13px ${FONT}`, cursor: 'pointer',
})

/** Un emplacement de visuel : un objet qui attend un fichier, ou en porte un. */
const estImage = v => v && typeof v === 'object' && !Array.isArray(v) && ('attente' in v || 'kdrive_id' in v)

/** Chemin → valeur, sur une copie modifiable. */
function poser(objet, chemin, valeur) {
  const copie = JSON.parse(JSON.stringify(objet))
  const segments = chemin.split('.')
  let courant = copie
  for (const s of segments.slice(0, -1)) courant = courant[s]
  courant[segments.at(-1)] = valeur
  return copie
}

/** Dessine récursivement les champs d'une page. */
function clesOrdonnees(valeur, ref) {
  const cles = Object.keys(valeur)
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return cles
  const ordre = Object.keys(ref)
  return [...ordre.filter(k => cles.includes(k)), ...cles.filter(k => !ordre.includes(k))]
}

function Champs({ valeur, chemin, ref, presentationId, onChange, onDepose }) {
  if (typeof valeur === 'string') {
    const cle = chemin.split('.').at(-1)
    const libelle = LIBELLES[cle] !== undefined ? LIBELLES[cle] : cle
    if (libelle === null) return null
    const long = valeur.length > 80
    return (
      <label style={{ display: 'block', marginBottom: 10 }}>
        <span style={microLabel}>{libelle}</span>
        {long
          ? <textarea style={{ ...champ, minHeight: 72 }} value={valeur} onChange={e => onChange(chemin, e.target.value)} />
          : <input style={champ} value={valeur} onChange={e => onChange(chemin, e.target.value)} />}
      </label>
    )
  }
  if (Array.isArray(valeur)) {
    return valeur.map((v, i) => (
      <Champs key={i} valeur={v} chemin={`${chemin}.${i}`} ref={Array.isArray(ref) ? (ref[i] ?? ref[0]) : null}
        presentationId={presentationId} onChange={onChange} onDepose={onDepose} />
    ))
  }
  if (valeur && typeof valeur === 'object') {
    if (estImage(valeur)) {
      return <>
        <div style={{ font: `12.5px ${MONO}`, color: C.muted, marginBottom: 8 }}>
          visuel : {valeur.kdrive_nom ? valeur.attente : `— (${valeur.attente || 'vide'})`}
        </div>
        {'legende' in valeur && <Champs valeur={valeur.legende} chemin={`${chemin}.legende`}
          presentationId={presentationId} onChange={onChange} onDepose={onDepose} />}
      </>
    }
    return clesOrdonnees(valeur, ref).map(k => (
      <Champs key={k} valeur={valeur[k]} chemin={`${chemin}.${k}`} ref={ref?.[k]}
        presentationId={presentationId} onChange={onChange} onDepose={onDepose} />
    ))
  }
  // Les montants viennent de l'offre et ne s'éditent pas ici : une présentation
  // qui contredit l'offre jointe est un piège. Ils s'affichent quand même —
  // sinon la page budget n'est qu'une colonne de libellés sans chiffres, et on
  // croit à un bug.
  if (typeof valeur === 'number') {
    const cle = chemin.split('.').at(-1)
    return (
      <div style={{ font: `12.5px ${MONO}`, color: C.muted, margin: '-4px 0 10px' }}>
        {(LIBELLES[cle] || cle).toLowerCase()} {valeur.toFixed(2)} — depuis l’offre
      </div>
    )
  }
  return null
}

/**
 * Dictée : on parle, le texte arrive dans la zone de saisie.
 *
 * Raconter un projet à la voix prend deux minutes, l'écrire en prend quinze —
 * et ce qui est dicté est plus complet, parce qu'on ne s'arrête pas pour
 * chercher ses mots. Le son n'est pas conservé : il produit du texte, qui se
 * corrige ensuite comme n'importe quel texte.
 *
 * Safari enregistre en mp4, Chrome et Firefox en webm : on prend ce que le
 * navigateur sait faire plutôt que d'imposer un format qu'il refusera.
 */
function Dictee({ onTexte }) {
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

export default function Presentation() {
  const router = useRouter()
  const { id } = router.query
  const { data, mutate } = useSWR(id ? `/api/presentations/${id}` : null)

  const [contenu, setContenu] = useState(null)
  const [modifie, setModifie] = useState(false)
  const [recit, setRecit] = useState('')
  const [correction, setCorrection] = useState('')
  const [travail, setTravail] = useState('')       // ce que la machine fait en ce moment
  const [erreur, setErreur] = useState('')
  const [relecture, setRelecture] = useState(false)
  const [envoi, setEnvoi] = useState(0)

  useEffect(() => { if (data?.contenu && !modifie) setContenu(data.contenu) }, [data, modifie])
  useEffect(() => { if (data && !recit) setRecit(data.consignes || '') }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !contenu) return <div style={{ padding: 24, font: `14px ${FONT}`, color: C.muted }}>Chargement…</div>

  const fichiers = data.fichiers || []
  const pages = pagesDeck(contenu)
  const genere = pages.some(p => p.type === 'visuels' || p.type === 'detail')
  const occupe = !!travail

  const changer = (chemin, valeur) => { setContenu(c => poser(c, chemin, valeur)); setModifie(true) }

  async function enregistrer() {
    await apiFetch(`/api/presentations/${id}`, { method: 'PUT', json: { contenu } })
    setModifie(false)
    mutate()
  }

  async function deposerVisuels(liste) {
    const choisis = Array.from(liste || [])
    if (choisis.length === 0) return
    setErreur('')
    for (let i = 0; i < choisis.length; i++) {
      const f = choisis[i]
      setTravail(`dépôt ${i + 1}/${choisis.length} — ${f.name}`)
      try {
        // Réduit AVANT l'envoi : l'hébergeur refuse au-delà de 4,5 Mo, et
        // surtout ces visuels voyagent ensuite dans le PDF, encodés en base64.
        // Le nom d'origine est conservé — c'est lui qui rattache le visuel à
        // sa pièce.
        const { base64 } = await reduireImage(f)
        await apiFetch(`/api/presentations/${id}/fichiers`, {
          method: 'POST', json: { base64, filename: f.name }, silencieux: true, timeoutMs: 120000,
        })
      } catch (e) {
        setErreur(`${f.name} : ${e.message}`)
      }
    }
    setTravail('')
    mutate()
  }

  async function retirerVisuel(nom) {
    await apiFetch(`/api/presentations/${id}/fichiers`, { method: 'DELETE', json: { nom } })
    mutate()
  }

  async function generer(demande) {
    setErreur('')
    setTravail(demande ? 'Claude corrige…' : 'Claude construit la présentation…')
    try {
      if (modifie) await enregistrer()
      const r = await apiFetch(`/api/presentations/${id}/generation`, {
        method: 'POST',
        json: demande ? { correction: demande } : { consignes: recit },
        timeoutMs: 300000, silencieux: true,
      })
      setContenu(r.contenu)
      setModifie(false)
      setCorrection('')
      setEnvoi(v => v + 1)
      mutate()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setTravail('')
    }
  }

  async function deposerSurKdrive() {
    setErreur('')
    setTravail('dépôt du PDF sur kDrive…')
    try {
      if (modifie) await enregistrer()
      await apiFetch(`/api/presentations/${id}/pdf?deposer=1`, { method: 'GET', timeoutMs: 300000, silencieux: true })
      mutate()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setTravail('')
    }
  }

  return (
    <>
      <Head><title>{data.titre || 'Présentation'} · Maze Project</title></Head>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 64px' }}>

        <Link href={`/projects/${data.project_id}`} style={{ font: `12.5px ${FONT}`, color: C.muted }}>← le projet</Link>
        <h1 style={{ font: `700 22px ${FONT}`, color: C.ink, margin: '8px 0 4px' }}>{data.titre || 'Présentation'}</h1>
        <p style={{ font: `13px ${FONT}`, color: C.muted, margin: '0 0 20px' }}>
          {genere ? `${pages.length} pages` : 'pas encore générée'}
          {data.trous?.length ? ` · ${data.trous.length} champ${data.trous.length > 1 ? 's' : ''} laissé${data.trous.length > 1 ? 's' : ''} entre crochets` : ''}
          {data.envoyee_le && ' · déposée sur kDrive'}
        </p>

        {erreur && (
          <div style={{ ...panneau, borderColor: C.danger, color: C.danger, font: `13px ${FONT}` }}>{erreur}</div>
        )}

        {/* ── 1. Le récit ── */}
        <section style={panneau}>
          <h2 style={{ font: `600 15px ${FONT}`, color: C.ink, margin: '0 0 4px' }}>Raconte le projet</h2>
          <p style={{ font: `12.5px ${FONT}`, color: C.muted, margin: '0 0 12px', lineHeight: 1.6 }}>
            Comme tu le dirais au téléphone : le client, le lieu, les dates, les pièces à fabriquer,
            les matériaux, ce à quoi il faut faire attention. Claude en déduit le nombre de pages.
            Il n’invente ni dimension ni chiffre — ce qu’il ignore reste entre crochets.
          </p>
          <Dictee onTexte={t => setRecit(r => (r ? `${r.trim()}\n\n${t}` : t))} />
          <textarea style={{ ...champ, minHeight: 200 }} value={recit} onChange={e => setRecit(e.target.value)}
            placeholder="on fait une vitrine et un stand pour … dans leur boutique de … du 3 au 18 décembre. la vitrine fait 2,4 m, chêne massif et stratifié blanc, démontable en trois éléments parce que la porte fait 90 cm. le stand …" />
        </section>

        {/* ── 2. Les visuels ── */}
        <section style={panneau}>
          <h2 style={{ font: `600 15px ${FONT}`, color: C.ink, margin: '0 0 4px' }}>Les visuels</h2>
          <p style={{ font: `12.5px ${FONT}`, color: C.muted, margin: '0 0 12px', lineHeight: 1.6 }}>
            Tous d’un coup, avec leurs noms — c’est le nom qui dit la pièce et la nature :
            <code style={{ fontFamily: MONO, fontSize: 12 }}> vitrine_3d.png</code>,
            <code style={{ fontFamily: MONO, fontSize: 12 }}> vitrine_ia.png</code>,
            <code style={{ fontFamily: MONO, fontSize: 12 }}> stand_3d.png</code>…
            jpeg, png ou webp. Les grandes images sont réduites à 2000 px dans le navigateur,
            avant l’envoi.
          </p>

          <label style={{
            display: 'block', padding: '18px', borderRadius: R.panel, textAlign: 'center',
            border: `1.5px dashed ${C.faint}`, font: `13px ${FONT}`, color: C.muted, cursor: 'pointer',
          }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); deposerVisuels(e.dataTransfer.files) }}>
            {occupe ? travail : 'déposer les fichiers ici, ou cliquer pour les choisir'}
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
              disabled={occupe} onChange={e => deposerVisuels(e.target.files)} />
          </label>

          {fichiers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {fichiers.map(f => (
                <div key={f.nom} style={{ width: 132 }}>
                  <div style={{
                    height: 76, borderRadius: R.panel, background: C.neutralBg, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img src={`/api/presentations/${id}/fichier?kdrive=${encodeURIComponent(f.kdrive_id)}`} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                  <div style={{ font: `11px ${MONO}`, color: C.ink, marginTop: 4, wordBreak: 'break-all' }}>{f.nom}</div>
                  <button onClick={() => retirerVisuel(f.nom)}
                    style={{ font: `11px ${FONT}`, color: C.muted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    retirer
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 3. Générer ── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 20px' }}>
          <button style={bouton()} onClick={() => generer('')} disabled={occupe || !recit.trim()}>
            {genere ? 'Refaire la présentation' : 'Générer la présentation'}
          </button>
          {occupe && <span style={{ font: `12.5px ${FONT}`, color: C.muted }}>{travail}</span>}
        </div>

        {/* ── 4. Le résultat ── */}
        {genere && (
          <>
            <section style={panneau}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h2 style={{ font: `600 15px ${FONT}`, color: C.ink, margin: 0 }}>La présentation</h2>
                <a href={`/api/presentations/${id}/pdf?download=1`} style={{ font: `12.5px ${FONT}`, color: C.muted }}>télécharger</a>
              </div>
              <iframe key={`${data.updated_at}-${envoi}`} title="aperçu"
                src={`/api/presentations/${id}/pdf#view=FitH`}
                style={{ width: '100%', height: 480, border: `1px solid ${C.border}`, borderRadius: R.panel, background: C.neutralBg }} />

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input style={champ} value={correction} onChange={e => setCorrection(e.target.value)}
                  placeholder="ce qu’il faut changer : « inverse les deux pièces », « le comptoir fait 2,80 m »…"
                  onKeyDown={e => { if (e.key === 'Enter' && correction.trim() && !occupe) generer(correction) }} />
                <button style={bouton(false)} disabled={occupe || !correction.trim()}
                  onClick={() => generer(correction)}>Corriger</button>
              </div>
            </section>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              <button style={bouton()} onClick={deposerSurKdrive} disabled={occupe}>
                Déposer dans le dossier du projet
              </button>
              <button style={bouton(false)} onClick={() => setRelecture(v => !v)}>
                {relecture ? 'Masquer la relecture' : 'Relire page par page'}
              </button>
              {modifie && <button style={bouton()} onClick={enregistrer}>Enregistrer</button>}
            </div>
          </>
        )}

        {/* ── 5. La relecture, pour une faute de frappe ── */}
        {relecture && pages.map((page, i) => (
          <section key={i} style={panneau}>
            <h2 style={{ font: `600 15px ${FONT}`, color: C.ink, margin: '0 0 12px' }}>
              {TITRES[page.type] || page.type}
              {page.rang ? <span style={{ font: `12px ${MONO}`, color: C.muted }}> {page.rang}/{page.total}</span> : null}
            </h2>
            {page.type === 'visuels' && (
              <Champs valeur={contenu.pieces?.[page.rang - 1]?.nom ?? ''} chemin={`pieces.${page.rang - 1}.nom`}
                presentationId={id} onChange={changer} onDepose={() => mutate()} />
            )}
            <Champs valeur={contenuDePage(contenu, page)} chemin={cheminDePage(contenu, page)}
              ref={contenuDePage(REFERENCE, page)} presentationId={id}
              onChange={changer} onDepose={() => mutate()} />
          </section>
        ))}
      </div>
    </>
  )
}

// Le chemin de la section du document que cette page affiche. Les paires
// visuels/détail vivent sous `pieces.N`, tout le reste sous son propre nom.
function cheminDePage(contenu, page) {
  if (page.type === 'visuels') return `pieces.${page.rang - 1}.images`
  if (page.type === 'detail') return `pieces.${page.rang - 1}.detail`
  return page.type
}

function contenuDePage(contenu, page) {
  const chemin = cheminDePage(contenu, page)
  return chemin.split('.').reduce((o, s) => (o == null ? o : o[s]), contenu)
}
