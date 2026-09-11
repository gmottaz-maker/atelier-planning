// Rentabilité d'un projet : ce que l'offre prévoyait, ce qui a été dépensé.
//
// PRÉVU vient de l'offre, au prix de REVIENT — prix d'achat × quantité pour les
// matériaux, tarif × quantité pour la sous-traitance — avant marge et avant
// escompte : c'est ce qu'on s'attendait à PAYER, pas ce qu'on facture.
// RÉEL vient des coûts saisis (`project_couts`) et des heures imputées.
//
// Les lignes masquées de l'offre comptent : le masquage est un filtre
// d'affichage, jamais une suppression (cf. CLAUDE.md).
import { normaliserDevis } from './quoteLines'

export const CATEGORIES_COUT = [
  { cle: 'materiel', label: 'Matériaux' },
  { cle: 'sous_traitance', label: 'Sous-traitance' },
  { cle: 'autre', label: 'Autres frais' },
]
const CLES = CATEGORIES_COUT.map(c => c.cle)

// Accepte « 1'234.50 », « 1234,50 », « 1 234 » : un montant recopié d'une
// facture suisse porte souvent l'apostrophe des milliers.
export const montant = v => {
  const n = Number(String(v ?? '').replace(/['’\s]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const num = v => { const n = montant(v); return Number.isNaN(n) ? 0 : n }
const arrondi = n => Math.round(n * 100) / 100

const unite = u => String(u || '').trim().toLowerCase()
const enHeures = u => ['h', 'heure', 'heures', 'heure(s)'].includes(unite(u))
const enJours = u => ['j', 'jour', 'jours', 'jour(s)'].includes(unite(u))

/**
 * Ce que l'offre prévoyait.
 *
 * Une ligne de main-d'œuvre en jours, ou sans unité, n'est PAS convertie en
 * heures : une journée ne vaut pas le même nombre d'heures pour tout le monde,
 * et deviner fausserait l'écart sans prévenir. Elle est comptée à part, pour
 * que l'écran dise ce qu'il laisse de côté.
 */
export function prevuDevis(raw) {
  const q = normaliserDevis(raw)
  const achats = []
  const mainOeuvre = [...q.management]
  for (const it of q.items) {
    achats.push(...it.purchases)
    mainOeuvre.push(...it.labor)
    for (const el of it.elements) {
      achats.push(...el.purchases)
      mainOeuvre.push(...el.labor)
    }
  }

  let heures = 0
  let nonConverties = 0
  for (const r of mainOeuvre) {
    if (!num(r.quantity)) continue
    if (enHeures(r.unit)) heures += num(r.quantity)
    else nonConverties += 1
  }
  // La logistique mêle kilomètres, forfaits et heures de montage : seules ses
  // lignes en heures sont de la main-d'œuvre, et ses jours se signalent.
  for (const r of q.logistics) {
    if (!num(r.quantity)) continue
    if (enHeures(r.unit)) heures += num(r.quantity)
    else if (enJours(r.unit)) nonConverties += 1
  }

  return {
    materiel: arrondi(achats.reduce((s, r) => s + num(r.unit_price) * num(r.quantity), 0)),
    sous_traitance: arrondi(q.subcontracting.reduce((s, r) => s + num(r.rate) * num(r.quantity), 0)),
    autre: 0,
    heures: arrondi(heures),
    lignesNonConverties: nonConverties,
  }
}

/** Ce qui a été réellement dépensé et imputé. */
export function reelProjet(couts = [], heuresImputees = []) {
  const par = { materiel: 0, sous_traitance: 0, autre: 0 }
  for (const c of couts) if (CLES.includes(c.categorie)) par[c.categorie] += num(c.montant_ht)
  const minutes = heuresImputees.reduce((s, h) => s + (Number(h.minutes) || 0), 0)
  return {
    materiel: arrondi(par.materiel),
    sous_traitance: arrondi(par.sous_traitance),
    autre: arrondi(par.autre),
    heures: arrondi(minutes / 60),
  }
}

/**
 * Lignes prêtes à afficher. `ecart` = réel − prévu : positif, on a dépensé
 * PLUS que prévu. `pct` est null quand rien n'était prévu — un pourcentage
 * d'un zéro ne veut rien dire.
 */
export function comparaison(prevu, reel) {
  const ligne = (cle, label, unite) => {
    const p = prevu?.[cle] || 0
    const r = reel?.[cle] || 0
    return { cle, label, unite, prevu: p, reel: r, ecart: arrondi(r - p), pct: p ? Math.round((r - p) / p * 100) : null }
  }
  return [
    ligne('materiel', 'Matériaux', 'CHF'),
    ligne('sous_traitance', 'Sous-traitance', 'CHF'),
    ligne('autre', 'Autres frais', 'CHF'),
    ligne('heures', 'Heures', 'h'),
  ]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
function dateValide(s) {
  if (!DATE.test(s)) return false
  const [y, m, j] = s.split('-').map(Number)
  const d = new Date(y, m - 1, j)
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === j
}

/** Valide une ligne de coût. Renvoie la seule liste blanche qu'on écrira. */
export function validerCout(brut) {
  const categorie = String(brut?.categorie || '')
  if (!CLES.includes(categorie)) return { ok: false, erreur: 'Catégorie inconnue' }
  const libelle = String(brut?.libelle ?? '').trim()
  if (!libelle) return { ok: false, erreur: 'Libellé requis' }
  const m = montant(brut?.montant_ht)
  if (String(brut?.montant_ht ?? '').trim() === '' || Number.isNaN(m) || m === 0) {
    return { ok: false, erreur: 'Montant HT requis (négatif pour un avoir)' }
  }
  if (Math.abs(m) >= 1e9) return { ok: false, erreur: 'Montant invraisemblable' }
  const date = brut?.date ? String(brut.date) : null
  if (date && !dateValide(date)) return { ok: false, erreur: 'Date invalide' }
  const fournisseur = String(brut?.fournisseur ?? '').trim().slice(0, 80)
  return {
    ok: true,
    valeur: { categorie, libelle: libelle.slice(0, 120), fournisseur: fournisseur || null, montant_ht: arrondi(m), date },
  }
}

/**
 * Heures imputées au projet, par activité, valorisées au coût de revient et
 * au tarif de vente de chaque activité.
 *
 * Une activité sans coût renseigné rend `cout: null`, et ses minutes sont
 * reportées dans `minutesSansCout` : on ne les compte pas gratuites, on dit
 * qu'on ne sait pas.
 */
export function mainOeuvreReelle(heures = [], activites = []) {
  const minutesPar = {}
  for (const h of heures) minutesPar[h.activite] = (minutesPar[h.activite] || 0) + (Number(h.minutes) || 0)
  const renseigne = v => v !== null && v !== undefined && String(v).trim() !== ''
  const lignes = Object.entries(minutesPar).map(([code, minutes]) => {
    const a = activites.find(x => String(x.code) === String(code)) || {}
    const h = minutes / 60
    return {
      code: Number(code),
      libelle: a.libelle || `activité ${code}`,
      minutes,
      cout: renseigne(a.cout_revient) ? arrondi(h * num(a.cout_revient)) : null,
      vente: renseigne(a.tarif_vente) ? arrondi(h * num(a.tarif_vente)) : null,
    }
  }).sort((x, y) => y.minutes - x.minutes)
  return {
    lignes,
    cout: arrondi(lignes.reduce((s, l) => s + (l.cout ?? 0), 0)),
    minutesSansCout: lignes.filter(l => l.cout === null).reduce((s, l) => s + l.minutes, 0),
  }
}

/** Prix de l'offre moins tout ce qui a réellement été dépensé. */
export function margeReelle(venteHT, reel, coutMainOeuvre) {
  const vente = arrondi(num(venteHT))
  const couts = arrondi((reel?.materiel || 0) + (reel?.sous_traitance || 0) + (reel?.autre || 0) + (coutMainOeuvre || 0))
  const marge = arrondi(vente - couts)
  return { vente, couts, marge, pct: vente ? Math.round(marge / vente * 1000) / 10 : null }
}
