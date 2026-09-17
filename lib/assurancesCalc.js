// Assurances — ce que chaque personne et chaque contrat coûtent par an.
//
// Le calcul est séparé de `lib/assurances.js` pour la même raison que
// `paintCalc` l'est de `paintPrices` : les chiffres bougent quand une police
// est renouvelée, la façon de les additionner ne bouge pas.
//
// Deux principes tiennent tout le module :
//
//   1. Une part employeur inconnue produit `null`, pas une moitié.
//      Il serait facile d'écrire `partEmployeur ?? 0.5` — la loi impose au
//      moins la moitié pour l'IJM, et 50/50 est l'usage. Mais l'écran servirait
//      alors des francs inventés à côté de francs relevés sur facture, sans
//      rien pour les distinguer. `null` force l'interface à le dire, et c'est
//      la seule chose qui pousse à aller chercher la vraie réponse.
//
//   2. La prime CALCULÉE et la prime FACTURÉE sont deux nombres différents, et
//      on garde les deux. La Suva facture 2026 sur une masse provisoire de
//      195 000 alors que les salaires déclarés valent 166 800 : l'écart n'est
//      pas une erreur de calcul, c'est une régularisation à venir. L'écraser
//      reviendrait à cacher une créance.

import {
  EFFECTIF, CONTRATS, COUVERTURES, MASSE_AVS, contratParId,
} from './assurances'

/** Arrondi au centime. Les primes se règlent au centime, pas au franc. */
const cts = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100)

/** Somme qui reste `null` dès qu'un terme est inconnu — un total partiel ment. */
export function sommeStricte(valeurs) {
  let total = 0
  for (const v of valeurs) {
    if (v == null || !Number.isFinite(v)) return null
    total += v
  }
  return cts(total)
}

/** Somme des seuls termes connus, avec le compte de ce qui manque. */
export function sommeConnue(valeurs) {
  let total = 0
  let inconnus = 0
  for (const v of valeurs) {
    if (v == null || !Number.isFinite(v)) inconnus += 1
    else total += v
  }
  return { total: cts(total), inconnus }
}

/**
 * Prime d'une ligne à taux, pour un salaire donné.
 * Le plafond du contrat s'applique AVANT le taux : au-delà, le salaire ne
 * produit plus de prime.
 */
export function primeLigne(ligne, salaire, plafond = null, annee = null) {
  const s = Number(salaire)
  if (!Number.isFinite(s) || s <= 0) return null
  const assiette = plafond != null ? Math.min(s, plafond) : s
  const taux = (annee != null && annee >= 2027 && ligne.taux2027 != null) ? ligne.taux2027 : ligne.taux
  if (taux == null || !Number.isFinite(taux)) return null
  return cts(assiette * taux)
}

/**
 * Le coût d'un contrat pour UNE personne.
 * Renvoie toujours `{ total, employeur, employe }`, où `employeur` et `employe`
 * valent `null` quand la répartition n'est pas documentée.
 */
export function coutContratPourPersonne(contrat, personne, annee = null) {
  if (!contrat || contrat.statut !== 'actif') return null

  // La LPP ne se calcule pas : elle est relevée sur la liste Nest, par tête.
  if (contrat.cotisationsParPersonne) {
    const c = contrat.cotisationsParPersonne[personne.nom]
    if (!c) return null
    return {
      lignes: [{
        cle: 'lpp', intitule: 'Cotisation LPP',
        total: cts(c.employe + c.employeur), employeur: cts(c.employeur), employe: cts(c.employe),
      }],
      total: cts(c.employe + c.employeur),
      employeur: cts(c.employeur),
      employe: cts(c.employe),
    }
  }

  if (contrat.assiette !== 'salaire' || !Array.isArray(contrat.lignes)) return null

  const lignes = contrat.lignes.map(l => {
    const total = primeLigne(l, personne.salaireAvs, contrat.salaireMaxAssure, annee)
    const part = l.partEmployeur
    return {
      cle: l.cle, intitule: l.intitule, total,
      employeur: total != null && part != null ? cts(total * part) : null,
      employe: total != null && part != null ? cts(total * (1 - part)) : null,
      partInconnue: part == null,
    }
  })

  return {
    lignes,
    total: sommeStricte(lignes.map(l => l.total)),
    employeur: sommeStricte(lignes.map(l => l.employeur)),
    employe: sommeStricte(lignes.map(l => l.employe)),
  }
}

/**
 * Le tableau « par personne » : pour chacun, le détail par contrat et les
 * totaux. `employeurConnu` cumule ce qui est documenté ; `contratsIncertains`
 * dit combien de lignes manquent à l'appel.
 */
export function coutsParPersonne({ effectif = EFFECTIF, contrats = CONTRATS, annee = null, famille = null } = {}) {
  const lies = contrats.filter(c =>
    c.statut === 'actif'
    && (c.assiette === 'salaire' || c.cotisationsParPersonne)
    && (!famille || c.famille === famille))

  return effectif.map(personne => {
    const parContrat = lies.map(c => ({
      contrat: c.id, assureur: c.assureur, branche: c.branche,
      ...(coutContratPourPersonne(c, personne, annee) || { lignes: [], total: null, employeur: null, employe: null }),
    }))

    const employeur = sommeConnue(parContrat.map(p => p.employeur))
    const total = sommeConnue(parContrat.map(p => p.total))

    return {
      personne: personne.nom,
      salaireAvs: personne.salaireAvs,
      parContrat,
      total: total.total,
      totalIncertain: total.inconnus > 0,
      employeurConnu: employeur.total,
      contratsIncertains: employeur.inconnus,
      // Ce que coûte la personne à l'entreprise en pourcentage de son salaire :
      // le chiffre que le patron cherche vraiment quand il ouvre cette page.
      chargeSurSalaire: employeur.total != null && personne.salaireAvs
        ? cts((employeur.total / personne.salaireAvs) * 100)
        : null,
    }
  })
}

/** Les contrats qui ne suivent personne : locaux, matériel, véhicules. */
export function coutsEntreprise({ contrats = CONTRATS, famille = null } = {}) {
  return contrats
    .filter(c => c.statut === 'actif' && c.assiette !== 'salaire' && !c.cotisationsParPersonne
      && (!famille || c.famille === famille))
    .map(c => ({
      contrat: c.id, assureur: c.assureur, branche: c.branche, intitule: c.intitule,
      assiette: c.assiette, vehicule: c.vehicule ?? null,
      prime: c.primeFacturee ?? null, note: c.primeFactureeNote ?? null,
      modules: c.modules ?? null,
    }))
}

/**
 * Prime facturée contre prime recalculée sur les salaires réels.
 * C'est ce qui fait apparaître la régularisation Suva à venir.
 */
export function ecartFactureCalcule(contrat, effectif = EFFECTIF, annee = null) {
  if (!contrat || contrat.assiette !== 'salaire' || !Array.isArray(contrat.lignes)) return null
  // ATTENTION : la somme des salaires de `EFFECTIF` n'est PAS la masse AVS.
  // Elle vient des salaires déclarés à Nest, plus étroits. Comparer une prime
  // Suva à cette somme fait apparaître un trop-perçu qui n'existe pas. On
  // projette donc le trimestre réellement facturé par la caisse AVS.
  const masseLpp = effectif.reduce((s, p) => s + (p.salaireAvs || 0), 0)
  const masseReelle = MASSE_AVS.trimestre?.base != null
    ? cts(MASSE_AVS.trimestre.base * 4)
    : masseLpp
  // Le plafond est individuel — il écrête chaque salaire — mais le taux
  // s'applique ensuite à la MASSE, comme sur la facture Suva. Additionner des
  // primes individuelles arrondies au centime ferait apparaître un écart de
  // quelques centimes qui n'existe sur aucune facture.
  const calcule = sommeStricte(
    contrat.lignes.map(l => primeLigne(l, masseReelle, null, annee))
  )
  const facture = contrat.primeFacturee ?? null
  return {
    masseReelle, masseLpp,
    estimee: MASSE_AVS.trimestre?.base != null,
    masseFacturee: contrat.masseFacturee ?? null,
    calcule, facture,
    ecart: calcule != null && facture != null ? cts(facture - calcule) : null,
  }
}

/** Le total annuel, dans les trois colonnes qui comptent. */
export function totalAnnuel({ effectif = EFFECTIF, contrats = CONTRATS, annee = null, famille = null } = {}) {
  const parPersonne = coutsParPersonne({ effectif, contrats, annee, famille })
  const entreprise = coutsEntreprise({ contrats, famille })

  const personnesEmployeur = sommeConnue(parPersonne.map(p => p.employeurConnu))
  const personnesTotal = sommeConnue(parPersonne.map(p => p.total))
  const entreprisePrimes = sommeConnue(entreprise.map(e => e.prime))

  // `employeurConnu` est DÉJÀ une somme du connu : elle ne vaut jamais `null`,
  // et compter ses `null` ici ne verrait donc jamais rien manquer. Le nombre de
  // parts non documentées se lit un niveau plus bas, dans `contratsIncertains`.
  const partsManquantes = parPersonne.reduce((s, p) => s + p.contratsIncertains, 0)
  const employeur = (personnesEmployeur.total ?? 0) + (entreprisePrimes.total ?? 0)

  return {
    personnes: { employeur: personnesEmployeur.total, total: personnesTotal.total, inconnus: partsManquantes },
    entreprise: { primes: entreprisePrimes.total, inconnus: entreprisePrimes.inconnus },
    employeur: cts(employeur),
    // Vrai dès qu'une seule brique manque : l'écran doit alors écrire
    // « au moins », jamais un total sec.
    incomplet: partsManquantes > 0 || entreprisePrimes.inconnus > 0,
    parTete: effectif.length ? cts(employeur / effectif.length) : null,
  }
}

// ── Boîte à questions ────────────────────────────────────────────────────────
//
// Pourquoi une recherche par mots-clés et non un appel au modèle : une réponse
// d'assurance doit être VÉRIFIABLE. Chaque réponse rendue ici pointe une ligne
// de `COUVERTURES`, qui pointe une police, qui pointe un fichier du dossier. Un
// modèle produirait de plus jolies phrases et, un jour, une exclusion inventée
// ou un plafond arrondi — sur un sujet où l'erreur se découvre au sinistre. En
// prime, ce moteur répond quand le crédit d'API est à sec.

/** Enlève accents, ponctuation et pluriels simples. */
export function normaliser(texte = '') {
  return String(texte)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VIDES = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'a', 'au', 'aux',
  'en', 'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'est', 'ce', 'cet', 'cette',
  'que', 'qui', 'quoi', 'je', 'j', 'il', 'elle', 'on', 'nous', 'mon', 'ma', 'mes',
  'notre', 'nos', 'se', 'sa', 'son', 'ses', 'y', 'pas', 'ne', 'plus', 'si', 'mais',
  'ai', 'as', 'ont', 'avons', 'suis', 'sommes', 'ete', 'etait', 'quand', 'comment',
  'est ce', 'couvert', 'couverte', 'assurance', 'assure', 'assurer',
])

export function motsUtiles(texte) {
  return normaliser(texte).split(' ').filter(m => m.length > 2 && !VIDES.has(m))
}

/**
 * Cherche les couvertures qui répondent à une phrase.
 * Le score compte les mots-clés retrouvés ; un mot-clé en plusieurs morceaux
 * (« objet confié ») vaut plus qu'un mot isolé, parce qu'il est plus précis.
 */
export function chercherCouvertures(question, { couvertures = COUVERTURES, limite = 4 } = {}) {
  const mots = motsUtiles(question)
  if (mots.length === 0) return []
  const phrase = normaliser(question)

  const notes = couvertures.map(c => {
    let score = 0
    for (const cle of c.mots) {
      const n = normaliser(cle)
      if (!n) continue
      const morceaux = n.split(' ')
      if (morceaux.length > 1) {
        if (phrase.includes(n)) score += 3 + morceaux.length
      } else if (mots.includes(n)) {
        score += 2
      } else if (mots.some(m => m.startsWith(n) || n.startsWith(m))) {
        // Rattrape les pluriels et les formes voisines : « machines »/« machine »,
        // « volé »/« vol ». Vaut moins qu'une correspondance exacte.
        score += 1
      }
    }
    // Un mot de l'intitulé compte aussi : il arrive qu'on tape le titre.
    for (const m of motsUtiles(c.intitule)) if (mots.includes(m)) score += 1
    return { couverture: c, score }
  })

  return notes
    .filter(n => n.score > 0)
    .sort((a, b) => b.score - a.score || a.couverture.id.localeCompare(b.couverture.id))
    .slice(0, limite)
    .map(n => ({
      ...n.couverture,
      score: n.score,
      contratDetail: n.couverture.contrat ? contratParId(n.couverture.contrat) : null,
      contactDetail: n.couverture.quiAppeler ? contratParId(n.couverture.quiAppeler)?.contact ?? null : null,
    }))
}

/** Les obligations que la question touche — souvent la vraie réponse. */
export function chercherObligations(question, obligations) {
  const mots = motsUtiles(question)
  if (!mots.length) return []
  const phrase = normaliser(question)
  return obligations
    .map(o => {
      let score = 0
      for (const cle of o.mots) {
        const n = normaliser(cle)
        if (n.includes(' ')) { if (phrase.includes(n)) score += 3 }
        else if (mots.includes(n)) score += 2
      }
      return { o, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(x => x.o)
}

/**
 * L'effectif COUVERT à une date donnée.
 * Une personne compte tant que son dernier jour couvert n'est pas passé — pas
 * tant qu'elle travaille. Les deux dates diffèrent : Paul est sorti de la LPP
 * le 30.11.2025 en restant employé jusqu'en mars 2026, couvert Suva et IJM
 * pendant ces quatre mois.
 */
export function effectifAu(date, effectif = EFFECTIF) {
  const jour = String(date)
  return effectif.filter(p => {
    if (p.entree && p.entree > jour) return false
    if (p.sortie && p.sortie < jour) return false
    return true
  })
}

/**
 * Ce que coûteront les assurances de personnes une fois l'effectif réduit.
 * Répond à « et quand Gabin sera parti ? » sans refaire le calcul à la main.
 */
export function projection(date, { contrats = CONTRATS, annee = null, famille = null } = {}) {
  const restants = effectifAu(date, EFFECTIF)
  const lignes = coutsParPersonne({ effectif: restants, contrats, annee, famille })
  const employeur = sommeConnue(lignes.map(p => p.employeurConnu))
  const total = sommeConnue(lignes.map(p => p.total))
  return {
    date, effectif: restants.map(p => p.nom),
    masseSalariale: restants.reduce((s, p) => s + (p.salaireAvs || 0), 0),
    employeurConnu: employeur.total,
    total: total.total,
    partsManquantes: lignes.reduce((s, p) => s + p.contratsIncertains, 0),
  }
}

/** Les échéances des contrats actifs, pour le rappel d'agenda. */
export function echeances({ contrats = CONTRATS } = {}) {
  return contrats
    .filter(c => c.statut === 'actif' && c.echeance)
    .map(c => ({ contrat: c.id, assureur: c.assureur, branche: c.branche, echeance: c.echeance, fin: c.fin ?? null }))
}
