// Heures imputées : qui, quel jour, de quand à quand, sur quel projet (ou
// aucun), pour quelle activité.
//
// Tout ce qui décide si une ligne d'heure est acceptable vit ici, pour que la
// saisie à l'écran, l'import d'une feuille scannée et l'export comptent
// exactement pareil. Une seconde implémentation finirait par diverger — c'est
// ce qui était arrivé aux échéances des factures (cf. CLAUDE.md).

import { dateDuJour } from './aujourdhui'

export const SOURCES = ['saisie', 'scan']
// Dans l'ordre du travail sur un projet, qui est aussi celui des codes : une
// dizaine par famille (Gestion 10–19, Atelier 20–29 … Interne 60–69).
export const FAMILLES = ['gestion', 'atelier', 'finitions', 'chantier', 'logistique', 'interne']

/**
 * Prochain code libre de la famille, dans sa dizaine — ou null si la dizaine
 * est pleine. Une activité ajoutée se range ainsi avec les siennes, au lieu de
 * tomber en fin de liste. Ce n'est qu'une proposition : le code reste libre.
 */
export function prochainCode(famille, activites = []) {
  const i = FAMILLES.indexOf(famille)
  if (i < 0) return null
  const pris = new Set(activites.map(a => Number(a.code)))
  for (let c = (i + 1) * 10; c < (i + 2) * 10; c++) if (!pris.has(c)) return c
  return null
}

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

  // Un client plutôt qu'un projet : le temps de conseil hors projet (cf.
  // lib/consulting.js). Jamais les deux — une heure de projet appartient déjà
  // au client du projet.
  const brutContact = e.contact_id
  const contact = brutContact === '' || brutContact == null ? null : Number(brutContact)
  if (contact !== null && !Number.isInteger(contact)) return { ok: false, erreur: 'Client invalide' }
  if (contact !== null && e.project_id) {
    return { ok: false, erreur: 'Une heure va à un projet OU à un client, pas aux deux' }
  }

  const note = String(e.note ?? '').trim().slice(0, 500)
  return {
    ok: true,
    minutes,
    valeur: { date, debut, fin, project_id: e.project_id || null, contact_id: contact, activite: code, note: note || null },
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
    // Un complément n'a pas d'horaire : il se range en fin de journée.
    .sort((a, b) => `${a.date}${a.user_name}${normaliserHeure(a.debut) || '99:99'}`
      .localeCompare(`${b.date}${b.user_name}${normaliserHeure(b.debut) || '99:99'}`))
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

/**
 * Tarif horaire tel qu'on le tape : « 120 », « 120.50 », « 120,50 », « 1'200 ».
 * Vide → null : un tarif inconnu n'est pas un tarif nul.
 */
export function lireTarif(v) {
  if (v === null || v === undefined || String(v).trim() === '') return { ok: true, valeur: null }
  const n = Number(String(v).replace(/['’\s]/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n >= 10000) return { ok: false }
  return { ok: true, valeur: Math.round(n * 100) / 100 }
}

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
  const vente = lireTarif(brut?.tarif_vente)
  if (!vente.ok) return { ok: false, erreur: 'Tarif de vente invalide' }
  const cout = lireTarif(brut?.cout_revient)
  if (!cout.ok) return { ok: false, erreur: 'Coût de revient invalide' }
  return {
    ok: true,
    valeur: {
      code, libelle: libelle.slice(0, 60), famille, tarif_vente: vente.valeur, cout_revient: cout.valeur,
      // Facturée à l'heure par défaut ; la conduite (au km) et l'interne non.
      facturee_heure: brut?.facturee_heure === undefined ? true : brut.facturee_heure === true,
    },
  }
}

/**
 * Modification d'une activité : seuls les champs PRÉSENTS sont validés et
 * renvoyés. Le code n'en fait jamais partie — il ne change pas.
 */
export function validerMajActivite(brut) {
  const b = brut || {}
  const maj = {}
  if ('libelle' in b) {
    const l = String(b.libelle ?? '').trim()
    if (!l) return { ok: false, erreur: 'Libellé requis' }
    maj.libelle = l.slice(0, 60)
  }
  if ('famille' in b) {
    if (!FAMILLES.includes(b.famille)) return { ok: false, erreur: 'Famille inconnue' }
    maj.famille = b.famille
  }
  if ('actif' in b) maj.actif = !!b.actif
  if ('facturee_heure' in b) maj.facturee_heure = b.facturee_heure === true
  for (const [cle, nom] of [['tarif_vente', 'Tarif de vente'], ['cout_revient', 'Coût de revient']]) {
    if (!(cle in b)) continue
    const t = lireTarif(b[cle])
    if (!t.ok) return { ok: false, erreur: `${nom} invalide` }
    maj[cle] = t.valeur
  }
  if (!Object.keys(maj).length) return { ok: false, erreur: 'Rien à modifier' }
  return { ok: true, valeur: maj }
}

// ── Journée régulière et heures non notées ─────────────────────────────────
// Une journée régulière dure 8,4 h PAYÉES, dont 30 min de pause offerte ; la
// pause de midi (1 h) n'est pas payée et n'y entre pas. Dans une journée
// travaillée, tout ce qui n'a pas été noté compte en « Divers » : les moments
// qui se perdent existent, et les ignorer ferait passer les heures notées
// pour toute la journée.
//
// Les codes sont écrits en dur, et c'est permis : un code d'activité ne change
// jamais (cf. CLAUDE.md).
export const JOURNEE = { minutes: 504, pausePayee: 30, pauseMidi: 60 }
export const CODE_DIVERS = 63
export const CODE_PAUSE = 64

/** Ce qu'une journée d'une personne contient, et ce qui lui manque. */
export function complementJour(entrees = [], journee = JOURNEE) {
  let travail = 0
  let pauseNotee = 0
  for (const e of entrees) {
    const m = minutesDe(e)
    if (Number(e.activite) === CODE_PAUSE) pauseNotee += m
    else travail += m
  }
  const pause = Math.max(0, journee.pausePayee - pauseNotee)
  const divers = Math.max(0, journee.minutes - journee.pausePayee - travail)
  return { travail, pauseNotee, pause, divers, total: travail + pauseNotee + pause + divers }
}

const estJourDeSemaine = date => {
  const [y, m, j] = String(date).split('-').map(Number)
  const d = new Date(y, m - 1, j).getDay()
  return d >= 1 && d <= 5
}

/**
 * Lignes CALCULÉES qui complètent chaque journée travaillée : la pause payée
 * non notée, et le temps non noté en Divers. Jamais écrites en base — elles se
 * recalculent dès qu'une vraie ligne s'ajoute.
 *
 * Pas de complément pour le jour en cours (la journée n'est pas finie), ni
 * pour un jour sans aucune ligne (oubli ou absence ? on ne sait pas), ni le
 * week-end. `entrees` doit contenir TOUTES les lignes des jours concernés :
 * une journée partielle fabriquerait un faux Divers.
 */
export function complements(entrees = [], { aujourdhui = dateDuJour(), journee = JOURNEE } = {}) {
  const groupes = {}
  for (const e of entrees) (groupes[`${e.user_name}|${e.date}`] ||= []).push(e)
  const out = []
  for (const liste of Object.values(groupes)) {
    const { user_name, date } = liste[0]
    if (date >= aujourdhui || !estJourDeSemaine(date)) continue
    const c = complementJour(liste, journee)
    const base = { user_name, date, debut: null, fin: null, project_id: null, source: 'complément' }
    if (c.pause) out.push({ ...base, activite: CODE_PAUSE, minutes: c.pause, note: 'pause payée' })
    if (c.divers) out.push({ ...base, activite: CODE_DIVERS, minutes: c.divers, note: 'non noté' })
  }
  return out
}
