// Transport : ce que coûte un kilomètre, et ce qu'il rapporte.
//
// La conduite ne se facture jamais à l'heure (cf. CLAUDE.md) : on facture des
// KILOMÈTRES, ou un FORFAIT pour les villes régulières. Ce montant doit payer
// le véhicule ET le temps passé au volant — c'est ce que vérifie la marge
// transport d'un projet.
//
// Le coût d'un km se calcule par VÉHICULE : entre un utilitaire en leasing et
// un fourgon payé depuis longtemps, il varie du simple au double. Le véhicule
// se choisit sur la ligne km ou forfait de l'offre.
import { normaliserDevis, logisticsNet } from './quoteLines'

// Écrit en dur, et c'est permis : un code d'activité ne change jamais.
export const CODE_CONDUITE = 51

export const CHAMPS_COUT = [
  { cle: 'leasing_mensuel', label: 'Leasing', unite: 'CHF / mois' },
  { cle: 'taxe', label: 'Taxe automobile', unite: 'CHF / an' },
  { cle: 'assurance', label: 'Assurance', unite: 'CHF / an' },
  { cle: 'vignette', label: 'Vignette', unite: 'CHF / an' },
  { cle: 'pneus', label: 'Pneus', unite: 'CHF / an' },
  { cle: 'service', label: 'Services', unite: 'CHF / an' },
  { cle: 'tcs', label: 'TCS', unite: 'CHF / an' },
  { cle: 'autres', label: 'Autres (réparations, amortissement)', unite: 'CHF / an' },
  { cle: 'km_annuels', label: 'Kilomètres par an', unite: 'km' },
  { cle: 'conso', label: 'Consommation', unite: 'l / 100 km' },
]
const FIXES_ANNUELS = ['taxe', 'assurance', 'vignette', 'pneus', 'service', 'tcs', 'autres']

/** Nombre positif tel qu'on le tape (« 2,26 », « 10'000 »), ou null. */
export const nombre = v => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(/['’\s]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}
const arrondi = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d
export const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Réglage lisible par tous : noms des véhicules, forfaits avec prix et distance. */
export function normaliserTransport(v) {
  const vehicules = (Array.isArray(v?.vehicules) ? v.vehicules : [])
    .map(x => ({ id: String(x?.id || slug(x?.nom)), nom: String(x?.nom || '').trim() }))
    .filter(x => x.id && x.nom)
  const forfaits = (Array.isArray(v?.forfaits) ? v.forfaits : [])
    .map(f => ({
      id: String(f?.id || slug(f?.nom)), nom: String(f?.nom || '').trim(),
      prix: nombre(f?.prix), km: nombre(f?.km),
      // Durée aller-retour en minutes : c'est elle, et non les km, qui dit ce
      // que coûte le temps au volant — 12 km en ville prennent une demi-heure.
      duree: nombre(f?.duree),
    }))
    .filter(f => f.id && f.nom)
  return { vehicules, forfaits }
}

/** Réglage réservé à l'admin : ce que coûte chaque véhicule, et le diesel. */
export function normaliserCouts(v) {
  const vehicules = {}
  for (const [id, c] of Object.entries(v?.vehicules || {})) {
    vehicules[id] = Object.fromEntries(CHAMPS_COUT.map(({ cle }) => [cle, nombre(c?.[cle])]))
  }
  // `vitesse_moyenne` (km/h) : pour estimer le temps de route d'une ligne au
  // km, qui ne porte pas de durée comme un forfait.
  return { prix_diesel: nombre(v?.prix_diesel), vitesse_moyenne: nombre(v?.vitesse_moyenne), vehicules }
}

/**
 * Coût d'un km pour un véhicule. Les coûts fixes vides comptent zéro (le Vito
 * n'a pas de leasing) ; les km par an, la consommation ou le prix du diesel
 * manquants rendent null — un coût au km inventé serait pire que pas de coût.
 */
export function coutKm(c, prixDiesel) {
  if (!c) return null
  const fixeAnnuel = arrondi((c.leasing_mensuel || 0) * 12 + FIXES_ANNUELS.reduce((s, k) => s + (c[k] || 0), 0))
  const fixeKm = c.km_annuels ? fixeAnnuel / c.km_annuels : null
  const carburantKm = c.conso != null && prixDiesel != null ? c.conso / 100 * prixDiesel : null
  const totalKm = fixeKm != null && carburantKm != null ? fixeKm + carburantKm : null
  const r3 = x => (x == null ? null : arrondi(x, 3))
  return { fixeAnnuel, fixeKm: r3(fixeKm), carburantKm: r3(carburantKm), totalKm: r3(totalKm) }
}

/** Coût au km de chaque véhicule, et la moyenne de la flotte pondérée par les km. */
export function coutsKmFlotte(couts) {
  const par = {}
  let km = 0
  let total = 0
  for (const [id, c] of Object.entries(couts?.vehicules || {})) {
    const r = coutKm(c, couts?.prix_diesel)
    par[id] = r?.totalKm ?? null
    if (r?.totalKm != null && c.km_annuels) { km += c.km_annuels; total += r.totalKm * c.km_annuels }
  }
  return { par, moyenne: km ? arrondi(total / km, 3) : null }
}

/**
 * Ligne de forfait prête pour l'offre. La DISTANCE est copiée dans la ligne :
 * changer un forfait dans les réglages ne réécrit pas les offres déjà faites.
 */
export function ligneForfait(f) {
  return {
    trajet: `Forfait ${f.nom}`, description: 'aller-retour',
    rate: f.prix == null ? '' : String(f.prix), quantity: '1', unit: 'pce',
    margin: '', discount: '', discount_amount: '',
    forfait: f.id, km: f.km, duree: f.duree, vehicule: '', personnes: 1,
  }
}

const enKm = u => String(u || '').trim().toLowerCase() === 'km'

/** Les lignes de transport d'une offre : kilomètres et forfaits. */
export function lignesTransport(raw) {
  const out = []
  for (const r of normaliserDevis(raw).logistics) {
    const qte = nombre(r.quantity) ?? 0
    if (!qte) continue
    // Combien de personnes dans la voiture : chacune coûte son heure de route.
    const personnes = Math.max(1, Math.round(nombre(r.personnes) ?? 1))
    if (enKm(r.unit)) {
      out.push({ type: 'km', libelle: r.trajet || 'Trajet', km: qte, minutes: null, personnes,
        recette: logisticsNet(r), vehicule: r.vehicule || null })
    } else if (r.forfait) {
      const duree = nombre(r.duree)
      out.push({ type: 'forfait', libelle: r.trajet || 'Forfait', km: (nombre(r.km) ?? 0) * qte,
        minutes: duree == null ? null : duree * qte, personnes, recette: logisticsNet(r), vehicule: r.vehicule || null })
    }
  }
  return out
}

/**
 * Marge transport : ce que les km et les forfaits rapportent, moins le
 * véhicule et le temps passé au volant.
 *
 * Une ligne sans véhicule choisi est comptée au coût MOYEN de la flotte et
 * signalée : c'est une approximation, pas une valeur. Une ligne dont aucun
 * coût n'est connu est écartée du coût et signalée aussi.
 */
export function margeTransport({ lignes = [], flotte = { par: {}, moyenne: null }, coutConduite = 0 }) {
  let km = 0
  let recette = 0
  let coutVehicules = 0
  let kmSansVehicule = 0
  let kmSansCout = 0
  const parVehicule = {}
  for (const l of lignes) {
    km += l.km
    recette += l.recette
    if (!l.vehicule) kmSansVehicule += l.km
    const cout = l.vehicule && flotte.par?.[l.vehicule] != null ? flotte.par[l.vehicule] : flotte.moyenne
    if (cout == null) { kmSansCout += l.km; continue }
    coutVehicules += l.km * cout
    const id = l.vehicule && flotte.par?.[l.vehicule] != null ? l.vehicule : 'moyenne'
    parVehicule[id] = parVehicule[id] || { km: 0, cout: 0 }
    parVehicule[id].km += l.km
    parVehicule[id].cout += l.km * cout
  }
  const marge = recette - coutVehicules - (coutConduite || 0)
  return {
    km: arrondi(km), recette: arrondi(recette), coutVehicules: arrondi(coutVehicules),
    coutConduite: arrondi(coutConduite || 0), marge: arrondi(marge), parKm: km ? arrondi(marge / km) : null,
    kmSansVehicule: arrondi(kmSansVehicule), kmSansCout: arrondi(kmSansCout),
    parVehicule: Object.fromEntries(Object.entries(parVehicule).map(([k, v]) => [k, { km: arrondi(v.km), cout: arrondi(v.cout) }])),
  }
}

/**
 * Marge transport PRÉVUE, ligne par ligne, telle que l'offre la fixe : le
 * véhicule choisi, le nombre de personnes à bord, et le temps de route —
 * la durée du forfait, ou les km à la vitesse moyenne.
 *
 * C'est elle qui dit, au moment de faire l'offre, si un trajet à deux gagne
 * de l'argent. La marge RÉELLE (margeTransport) reprend ensuite les heures de
 * conduite vraiment imputées.
 *
 * Un coût inconnu (véhicule sans coût, conduite sans coût horaire) rend null
 * et se signale ; il n'est jamais compté zéro.
 */
export function transportPrevu({ lignes = [], flotte = { par: {}, moyenne: null }, vitesse = null, coutHoraire = null }) {
  const detail = lignes.map(l => {
    const coutKmVeh = l.vehicule && flotte.par?.[l.vehicule] != null ? flotte.par[l.vehicule] : flotte.moyenne
    const coutVehicule = coutKmVeh == null ? null : arrondi(l.km * coutKmVeh)
    const minutes = l.minutes != null ? l.minutes : (vitesse ? Math.round(l.km / vitesse * 60) : null)
    const coutTemps = minutes != null && coutHoraire != null ? arrondi(minutes / 60 * l.personnes * coutHoraire) : null
    const marge = arrondi(l.recette - (coutVehicule ?? 0) - (coutTemps ?? 0))
    return { ...l, coutVehicule, minutes, coutTemps, marge, complet: coutVehicule != null && coutTemps != null }
  })
  const somme = cle => arrondi(detail.reduce((s, l) => s + (l[cle] ?? 0), 0))
  const km = somme('km')
  const marge = somme('marge')
  return {
    lignes: detail,
    km, recette: somme('recette'), coutVehicules: somme('coutVehicule'), coutTemps: somme('coutTemps'),
    marge, parKm: km ? arrondi(marge / km) : null,
    complet: detail.every(l => l.complet),
  }
}
