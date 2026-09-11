// Heures imputées : qui, quel jour, de quand à quand, sur quel projet (ou
// aucun), pour quelle activité.
//
// Tout ce qui décide si une ligne d'heure est acceptable vit ici, pour que la
// saisie à l'écran, l'import d'une feuille scannée et l'export comptent
// exactement pareil. Une seconde implémentation finirait par diverger — c'est
// ce qui était arrivé aux échéances des factures (cf. CLAUDE.md).

import { dateDuJour } from './aujourdhui'

export const SOURCES = ['saisie', 'scan']
export const FAMILLES = ['atelier', 'finitions', 'logistique', 'chantier', 'gestion', 'interne']

// Au-delà, c'est presque toujours une faute de frappe (« 7:00 → 19:00 » pour
// « 17:00 ») ou une journée entière saisie en une ligne.
export const DUREE_MAX = 14 * 60

const DATE = /^\d{4}-\d{2}-\d{2}$/

function dateValide(s) {
  if (!DATE.test(String(s || ''))) return false
  const [y, m, j] = s.split('-').map(Number)
  const d = new Date(y, m - 1, j)
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === j
}

/**
 * « 9:00 », « 09:00 », « 9h00 », « 9h », « 9.30 », et le « 09:00:00 » que
 * renvoie une colonne TIME → « 09:00 ». Autre chose → null.
 */
export function normaliserHeure(s) {
  const t = String(s ?? '').trim()
  let m = t.match(/^([01]?\d|2[0-3])[:hH.]([0-5]\d)(?::[0-5]\d)?$/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  m = t.match(/^([01]?\d|2[0-3])\s*[hH]$/)
  if (m) return `${m[1].padStart(2, '0')}:00`
  return null
}

export function versMinutes(heure) {
  const h = normaliserHeure(heure)
  if (!h) return null
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + mm
}

/** Durée en minutes, ou null si les horaires sont invalides ou à l'envers. */
export function duree(debut, fin) {
  const a = versMinutes(debut), b = versMinutes(fin)
  if (a === null || b === null || b <= a) return null
  return b - a
}

/** 150 → « 2 h 30 », 120 → « 2 h », 45 → « 0 h 45 ». */
export function formatDuree(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`
}

/** Heures décimales à deux chiffres : 150 → 2.5. */
export const enHeures = minutes => Math.round((Number(minutes) || 0) / 60 * 100) / 100

/**
 * Valide et normalise une ligne d'heure. Ne connaît ni l'utilisateur ni la
 * source : c'est la route qui les pose, depuis le JWT.
 *
 * `tolererInactive` : le code d'activité déjà porté par la ligne qu'on
 * modifie. Désactiver une activité ne doit pas rendre ses anciennes heures
 * impossibles à corriger.
 *
 * @returns {{ ok: true, valeur, minutes } | { ok: false, erreur }}
 */
export function validerEntree(brut, { activites = [], aujourdhui = dateDuJour(), tolererInactive = null } = {}) {
  const e = brut || {}
  const date = String(e.date || '')
  if (!dateValide(date)) return { ok: false, erreur: 'Date invalide' }
  if (date > aujourdhui) return { ok: false, erreur: 'On n\'impute pas d\'heures à l\'avance' }

  const debut = normaliserHeure(e.debut)
  const fin = normaliserHeure(e.fin)
  if (!debut || !fin) return { ok: false, erreur: 'Heure de début et de fin requises (HH:MM)' }
  const minutes = duree(debut, fin)
  if (!minutes) {
    return { ok: false, erreur: 'La fin doit être après le début — une nuit à cheval sur minuit se saisit en deux lignes' }
  }
  if (minutes > DUREE_MAX) return { ok: false, erreur: 'Plus de 14 h d\'affilée : vérifie les horaires' }

  const code = Number(e.activite)
  const activite = activites.find(a => Number(a.code) === code)
  if (!Number.isInteger(code) || !activite) return { ok: false, erreur: 'Activité inconnue' }
  if (activite.actif === false && code !== Number(tolererInactive)) {
    return { ok: false, erreur: `Activité ${code} désactivée` }
  }

  const note = String(e.note ?? '').trim().slice(0, 500)
  return {
    ok: true,
    minutes,
    valeur: { date, debut, fin, project_id: e.project_id || null, activite: code, note: note || null },
  }
}

/** Deux plages [début, fin[ se recouvrent-elles ? Se toucher (11:00 / 11:00) est permis. */
const recouvre = (a, b) => versMinutes(a.debut) < versMinutes(b.fin) && versMinutes(b.debut) < versMinutes(a.fin)

/**
 * La première entrée de `existantes` que `nouvelle` recouvre, ou null.
 * `existantes` : les lignes de la même personne le même jour — c'est à
 * l'appelant de les choisir. `ignorer` : l'id de la ligne qu'on modifie.
 */
export function chevauche(nouvelle, existantes = [], ignorer = null) {
  for (const e of existantes) {
    if (ignorer != null && String(e.id) === String(ignorer)) continue
    if (recouvre(nouvelle, e)) return e
  }
  return null
}

/** Toutes les paires qui se recouvrent, par personne et par jour. */
export function chevauchements(entrees = []) {
  const groupes = {}
  for (const e of entrees) (groupes[`${e.user_name}|${e.date}`] ||= []).push(e)
  const paires = []
  for (const g of Object.values(groupes)) {
    const tri = [...g].sort((a, b) => versMinutes(a.debut) - versMinutes(b.debut))
    for (let i = 0; i < tri.length; i++) {
      for (let j = i + 1; j < tri.length && versMinutes(tri[j].debut) < versMinutes(tri[i].fin); j++) {
        paires.push([tri[i], tri[j]])
      }
    }
  }
  return paires
}

const minutesDe = e => (Number.isFinite(Number(e?.minutes)) && e.minutes !== null ? Number(e.minutes) : duree(e?.debut, e?.fin) || 0)

/** Minutes cumulées par clé : `totalPar(entrees, e => e.activite)`. */
export function totalPar(entrees = [], cle) {
  const out = {}
  for (const e of entrees) {
    const k = cle(e)
    out[k] = (out[k] || 0) + minutesDe(e)
  }
  return out
}

// ── Export ─────────────────────────────────────────────────────────────────
// Une ligne par heure imputée, à plat : c'est la forme qu'un tableur ou un
// outil financier sait agréger sans retraitement. Les minutes sont données
// en entier ET en heures décimales, pour ne pas dépendre du séparateur
// décimal du tableur qui l'ouvre.

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

export const COLONNES_EXPORT = [
  ['date', 'Date'], ['jour', 'Jour'], ['personne', 'Personne'],
  ['debut', 'Début'], ['fin', 'Fin'], ['minutes', 'Minutes'], ['heures', 'Heures'],
  ['projet_numero', 'N° projet'], ['projet', 'Projet'], ['client', 'Client'],
  ['activite_code', 'N° activité'], ['activite', 'Activité'], ['famille', 'Famille'],
  ['note', 'Remarque'], ['source', 'Source'],
]

export function lignesExport(entrees = [], { activites = [], projets = [] } = {}) {
  const act = Object.fromEntries(activites.map(a => [Number(a.code), a]))
  const prj = Object.fromEntries(projets.map(p => [String(p.id), p]))
  return [...entrees]
    .sort((a, b) => `${a.date}${a.user_name}${a.debut}`.localeCompare(`${b.date}${b.user_name}${b.debut}`))
    .map(e => {
      const p = e.projects || prj[String(e.project_id)] || null
      const a = act[Number(e.activite)] || {}
      const [y, m, j] = String(e.date).split('-').map(Number)
      const minutes = minutesDe(e)
      return {
        date: e.date,
        jour: y ? JOURS[new Date(y, m - 1, j).getDay()] : '',
        personne: e.user_name,
        debut: normaliserHeure(e.debut) || '',
        fin: normaliserHeure(e.fin) || '',
        minutes,
        heures: enHeures(minutes),
        projet_numero: p?.numero ?? '',
        projet: p?.name || '',
        client: p?.client || '',
        activite_code: e.activite,
        activite: a.libelle || '',
        famille: a.famille || '',
        note: e.note || '',
        source: e.source || '',
      }
    })
}

/**
 * CSV lisible par Excel en français : point-virgule, UTF-8 avec BOM, CRLF.
 *
 * Une cellule texte commençant par = + - @ est préfixée d'une apostrophe :
 * sinon Excel l'exécute comme une formule. Une remarque « =HYPERLINK(...) »
 * saisie sur une feuille deviendrait un lien piégé dans le fichier exporté.
 */
export function versCSV(lignes = []) {
  const cellule = v => {
    if (typeof v === 'number') return String(v)
    let s = String(v ?? '')
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
  }
  const tete = COLONNES_EXPORT.map(([, libelle]) => cellule(libelle)).join(';')
  const corps = lignes.map(l => COLONNES_EXPORT.map(([cle]) => cellule(l[cle])).join(';'))
  return '﻿' + [tete, ...corps].join('\r\n')
}

// ── Activités ──────────────────────────────────────────────────────────────

/** Valide une activité à créer. Le code est définitif : il est vérifié libre. */
export function validerActivite(brut, existantes = []) {
  const code = Number(brut?.code)
  if (!Number.isInteger(code) || code < 1 || code > 99) return { ok: false, erreur: 'Code entre 1 et 99' }
  if (existantes.some(a => Number(a.code) === code)) {
    return { ok: false, erreur: `Le code ${code} est déjà pris — un code n'est jamais réattribué` }
  }
  const libelle = String(brut?.libelle ?? '').trim()
  if (!libelle) return { ok: false, erreur: 'Libellé requis' }
  const famille = String(brut?.famille || '')
  if (!FAMILLES.includes(famille)) return { ok: false, erreur: 'Famille inconnue' }
  return { ok: true, valeur: { code, libelle: libelle.slice(0, 60), famille } }
}
