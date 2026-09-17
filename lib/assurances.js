// Assurances de l'entreprise — contrats, couvertures, coûts et obligations.
//
// Ce module est la SOURCE UNIQUE de l'outil /outils/assurances. Il est écrit à
// la main, à partir des pièces du dossier kDrive
// « Common documents/amazing files/00. Admin/Assurances ». Chaque chiffre porte
// le fichier dont il sort (`source`) : sans ça, personne ne peut vérifier un
// montant deux ans plus tard, et l'outil devient un tas d'affirmations.
//
// Trois règles, héritées de `lib/paintPrices.js` et valables ici aussi :
//
//   1. Une valeur inconnue vaut `null`, jamais 0. Une prime qu'on ignore n'est
//      pas une prime nulle. Une part employeur qu'aucune pièce ne fixe reste
//      `null` et l'écran le dit — il ne la devine pas à 50 %.
//   2. Ce qui est SU est séparé de ce qui est DÉDUIT. `couvert: 'verifier'`
//      existe pour ça : c'est un point à trancher avec l'assureur, pas une
//      couverture. En assurance, une demi-réponse affirmée coûte plus cher
//      qu'un « je ne sais pas ».
//   3. Les contrats caducs RESTENT dans la liste, avec `statut: 'caduc'`. Savoir
//      qui couvrait quoi en 2023 est la première question quand un sinistre
//      ancien ressort, et un fichier supprimé ne répond plus.
//
// Mettre à jour : une nouvelle police arrive → on modifie l'objet concerné, on
// pousse l'ancien en `caduc` s'il est remplacé, et on cite le nouveau fichier.
// Les tests de `tests/assurances.test.js` vérifient la cohérence de l'ensemble.

/** Date de la dernière relecture du dossier, affichée en pied de page. */
export const RELEVE_AU = '2026-09-17'

// ── Masse salariale AVS réellement observée ──────────────────────────────────
//
// À ne pas confondre avec la somme des salaires de `EFFECTIF`, et l'erreur est
// facile : celle-ci vient des salaires DÉCLARÉS à Nest pour la LPP, qui
// ignorent les personnes sous le seuil d'entrée et suivent un salaire annoncé.
// La Suva et l'IJM s'assoient sur la masse AVS, qui est plus large.
//
// Les décomptes trimestriels de la caisse de compensation donnent la vraie
// base. Tant qu'on n'a pas l'année complète, une projection à partir d'un
// trimestre reste une ESTIMATION, et l'écran doit l'écrire.
export const MASSE_AVS = {
  trimestre: { periode: '2026-07 à 2026-09', base: 43566.00, source: 'AVS/12102026_Récépissé…3ème trimestre 2026.pdf' },
  // Base annuelle que la caisse retient pour la redistribution de la taxe CO2.
  annuelleObservee: 192547.75,
  definitifsSuva: [
    { annee: 2024, masse: 191971 },
    { annee: 2025, masse: 170484 },
  ],
}

// ── Effectif assuré ──────────────────────────────────────────────────────────
//
// DEUX salaires par personne, et il ne faut pas les confondre :
//
//   `salaireAvs`            — le salaire SOUMIS à l'AVS. C'est l'assiette de la
//                             Suva et de l'IJM, et la seule qui sert à calculer
//                             une prime ici.
//   `salaireDeclareNest`    — ce que Nest a en base pour la LPP.
//   `salaireBrutCertificat` — le brut du certificat de salaire, allocations
//                             familiales comprises. NE JAMAIS s'en servir comme
//                             assiette : les allocations ne sont pas soumises à
//                             l'AVS, donc pas davantage aux primes.
//
// `sortie` porte le dernier jour COUVERT, pas le dernier jour travaillé — ce
// sont deux dates différentes, et c'est la couverture qui compte ici.
export const EFFECTIF = [
  {
    nom: 'Guillaume', complet: 'Mottaz Guillaume Jean-Pierre',
    avs: '756.6026.1101.38', naissance: '1988-06-07',
    salaireAvs: 55200, salaireDeclareNest: 55200,
    tauxActivite: 1, entree: '2021-06-11', sortie: null,
    source: 'certificat_de_salaire_2025 — salaire confirmé inchangé pour 2026 par Guillaume le 17.09.2026',
  },
  {
    nom: 'Arnaud', complet: 'Meylan Arnaud',
    avs: '756.4693.1372.05', naissance: '1988-01-12',
    salaireAvs: 55200, salaireDeclareNest: 55200, salaireBrutCertificat: 59042,
    tauxActivite: 1, entree: '2021-06-11', sortie: null,
    // Le piège, et il coûte cher si on tombe dedans : le certificat affiche
    // 59 042 de brut, mais 3 842 sont des ALLOCATIONS FAMILIALES (322 par mois),
    // que l'entreprise avance et déduit ensuite de ses cotisations AVS. Les
    // allocations ne sont pas soumises à l'AVS, donc pas davantage à la Suva ni
    // à l'IJM Visana, dont l'assiette est le « salaire AVS au sens de la
    // législation AVS ». L'assiette d'Arnaud reste 55 200 — ce que confirme sa
    // ligne 9, identique à celle de Guillaume au centime près.
    note: "Brut 2025 de 59 042, dont 3 842 d'allocations familiales non soumises à l'AVS. Assiette de prime : 55 200.",
    source: 'certificat_de_salaire_2025 + Guillaume, 17.09.2026 (allocations de 322 par mois)',
  },
  {
    nom: 'Gabin', complet: 'Pioline Gabin André',
    avs: '756.6959.1599.76', naissance: '1998-09-20',
    // 5 000 par mois sur 12 mois selon le contrat de travail du 12.12.2025.
    // Nest, lui, cotise sur 56 400 : l'écart de 3 600 est ouvert (voir MANQUES).
    salaireAvs: 60000, salaireDeclareNest: 56400,
    tauxActivite: 1, entree: '2025-11-01', contratDebut: '2026-01-05', sortie: '2026-10-31',
    // Permis B, donc imposé à la source. L'impôt à la source ne change RIEN au
    // coût d'assurance : il est retenu sur le salaire de l'employé et reversé
    // au canton, il ne s'ajoute pas aux charges patronales et n'entre dans
    // aucune assiette de prime. Noté ici pour qu'on cesse de se poser la
    // question en ouvrant la page.
    note: "Contrat au 05.01.2026 après une mission temporaire (assuré chez Nest dès le 01.11.2025). 5 000 brut par mois, 42 h par semaine, 25 jours de vacances. Résilié le 4 septembre 2026, fin des rapports le 31 octobre 2026. Permis B, imposé à la source — sans effet sur les primes.",
    source: 'NEST (LPP)/Entrée (CP) Pioline, Gabin…pdf + Liste des cotisations.pdf + licenciement Gabin.pdf',
  },
]

/** Personnes sorties. Utile quand un décompte ancien fait surface. */
export const SORTIS = [
  {
    nom: 'Paul Mottaz', avs: '756.9506.8240.06', sortie: '2025-11-30',
    motif: 'Sortie régulière — salaire passé sous le seuil de coordination',
    // Le piège du dossier : Paul sort de la LPP le 30.11.2025 parce que son
    // salaire tombe à 27 000 (45 %) dès le 01.03.2025, mais il travaille
    // jusqu'en mars 2026. Sorti de la LPP ne veut pas dire sorti de
    // l'entreprise : il restait couvert par la Suva et par l'IJM pendant ces
    // quatre mois. Confondre les deux dates fait rater une couverture.
    note: "Sorti de la LPP le 30.11.2025, mais employé jusqu'en mars 2026 (Guillaume, 17.09.2026) : toujours couvert Suva et IJM entre-temps.",
    source: 'NEST (LPP)/Sortie (CP) Mottaz, Paul…pdf',
  },
  { nom: 'Manuel Prampart', avs: '756.7215.1626.93', sortie: '2025-09-30', motif: "Résiliation par l'employeur", source: 'Visana/20082025_nés.pdf' },
  { nom: 'Robin Ascensio', avs: null, sortie: null, note: 'Présent sur la liste IJM de septembre 2024, absent des cotisations 2026.', source: 'Helvetia/IJM_Liste_du_personnel_2024 (2) - copie.pdf' },
]

// ── Véhicules ────────────────────────────────────────────────────────────────
export const VEHICULES = [
  {
    id: 'master-2026', nom: 'Renault Master T35 2.0 Blue dCi 150 L3H3-EU6dISC',
    plaque: 'VD 624182', chassis: 'VF1RDA00776082817',
    miseEnCirculation: 2025, prixCatalogue: 51239, accessoires: 6702,
    leasing: true, actif: true,
    leasingDetail: {
      bailleur: 'RCI Finance SA / Mobilize Financial Services',
      contrat: 'C000366608.000', client: '000100493547',
      livraison: '2025-12-19', fin: '2030-12-19', duree: 60,
      mensualite: 474.80, majorationInitiale: 15000.00, depotGarantie: 0,
      source: 'Véhicules/Nouveau Master Renault/Leasing_Master_19122025_MOBILIZE.pdf',
    },
    // La motorisation est tranchée : deux courriers Mobilize et le numéro de
    // châssis disent dCi 150. C'est l'offre Smile qui porte « dCi 130 ».
    note: "Livré le 19.12.2025, plaque VD 624182 (confirmée par Guillaume le 17.09.2026). Motorisation dCi 150 selon le leasing et le châssis — les deux documents Smile disent 130.",
  },
  {
    id: 'vito', nom: 'Mercedes-Benz Vito 113 CDI EL 4Matic', plaque: 'VD 637451',
    chassis: 'WDF6396031382 3497', matricule: '677.000.028',
    miseEnCirculation: 2013, premiereCirculation: '2013-07-09', prixCatalogue: 48405,
    leasing: false, actif: true,
    // Acheté 16 390 le 18.09.2018 chez Solazzo par Arnaud Meylan À TITRE PRIVÉ,
    // alors que la police Smile et les courriers du Service des automobiles
    // nomment l'entreprise. Le détenteur — ce qui compte pour l'assurance —
    // est donc bien l'entreprise ; la facture d'origine, elle, est au nom d'un
    // associé. Rien d'anormal en soi, mais c'est un point à connaître avant de
    // revendre le véhicule ou de le sortir des actifs.
    note: "Plaque VD 637451 confirmée par Guillaume le 17.09.2026. Facture d'achat de 2018 au nom d'Arnaud Meylan à titre privé ; l'entreprise est détenteur depuis (courriers SAN et police à son nom). VD 11 593, qui apparaît sur un contrôle technique de 2023 classé avec le Vito, est donc une ANCIENNE plaque — et c'est pourtant elle qui figure encore au TCS.",
  },
  {
    id: 'master-2018', nom: 'Renault Master L3H3 (2018) — vendu',
    plaque: null, chassis: 'VF1MAO00560051743', matricule: '681.752.912',
    miseEnCirculation: 2018, prixCatalogue: null, leasing: false, actif: false,
    note: "Mis en circulation le 31.05.2018, vendu (contrat AutoScout24, 102 445 km). Guillaume a confirmé le 17.09.2026 qu'il n'existe plus.",
  },
]

// ── Contrats ─────────────────────────────────────────────────────────────────
//
// `assiette` dit COMMENT le coût se répartit, et c'est tout le calcul de
// l'écran « par personne » :
//   'salaire'   — prime = taux × salaire ; elle suit la personne.
//   'entreprise'— prime forfaitaire ; elle ne suit personne, on peut la
//                 répartir par tête mais c'est une CONVENTION, pas un fait.
//   'vehicule'  — prime attachée à une plaque.
//
// `partEmployeur` : 1 = l'employeur paie tout, 0.5 = moitié, `null` = aucune
// pièce du dossier ne le fixe (à trancher avec la fiduciaire ou l'assureur).
//
// `famille` sépare les deux OUTILS, pas les deux natures juridiques :
//   'social'    — ce que l'État et la prévoyance obligatoire prélèvent sur les
//                 salaires : AVS/AC/AF, LAA, LPP. Répond à « combien me coûte
//                 un employé ». → /outils/charges-sociales
//   'assurance' — ce qu'on a choisi d'assurer : IJM, choses, RC, véhicules.
//                 Répond à « suis-je couvert ». → /outils/assurances
// L'IJM est à cheval — c'est une assurance de personnes, mais assise sur les
// salaires. Elle est rangée du côté ASSURANCE parce qu'elle se résilie et se
// négocie, là où l'AVS et la LAA s'imposent. Son coût apparaît donc dans
// l'outil Assurances, et pas dans le coût employeur des charges sociales.

export const CONTRATS = [
  // ─────────────────────────────────────────────────────── AVS / AC / AF
  {
    id: 'avs-caf', famille: 'social',
    assureur: 'Caisse cantonale vaudoise de compensation AVS', branche: 'AVS, chômage, allocations familiales', obligatoire: true,
    statut: 'actif',
    intitule: 'Cotisations sociales — AVS/AI/APG, chômage, allocations familiales, PC Famille',
    police: "Affilié 2034272-10 / CHE-269.778.116",
    debut: null, fin: null, echeance: 'trimestrielle',
    assiette: 'salaire',
    salaireMaxAssure: null, // L'AVS n'a pas de plafond.
    // Les taux sont relevés sur le décompte du 3e trimestre 2026. Les deux
    // premières lignes se partagent par moitié, les trois autres sont
    // entièrement patronales. La somme des parts salariales vaut
    // 5,30 + 1,10 = 6,400 % — exactement la ligne 9 des certificats de salaire,
    // ce qui recoupe les deux documents l'un par l'autre.
    lignes: [
      { cle: 'avs', intitule: 'AVS / AI / APG', taux: 0.1060, partEmployeur: 0.5 },
      { cle: 'ac', intitule: 'Assurance chômage', taux: 0.0220, partEmployeur: 0.5 },
      { cle: 'af', intitule: 'Allocations familiales', taux: 0.0262, partEmployeur: 1 },
      { cle: 'pcfam', intitule: 'PC Famille et rente-pont', taux: 0.0018, partEmployeur: 1 },
      { cle: 'admin', intitule: 'Participation aux frais administratifs', taux: 0.00375, partEmployeur: 1 },
    ],
    primeFacturee: null,
    primeFactureeNote: "Facturé au trimestre sur la masse réelle : 5 598.55 pour le 3e trimestre 2026, sur une base de 43 566. Les allocations versées aux employés (1 172.00 sur le trimestre) sont déduites du décompte, et deux redistributions de taxe CO2 viennent encore en diminution.",
    contact: { nom: 'Caisse cantonale vaudoise de compensation AVS', role: 'Rue des Moulins 3, 1800 Vevey', tel: '021 964 12 11', email: null },
    confirmePar: 'Décompte du 3e trimestre 2026, recoupé avec les certificats de salaire 2025.',
    source: 'AVS/12102026_Récépissé…Décompte de cotisations 3ème trimestre 2026.pdf',
  },

  // ─────────────────────────────────────────────────────── SUVA (LAA)
  {
    id: 'suva-laa', famille: 'social',
    assureur: 'Suva', branche: 'Accidents (LAA)', obligatoire: true,
    statut: 'actif',
    intitule: 'Assurance-accidents obligatoire — AAP et AANP',
    police: '9-00002-77497 / sous-n° 01 « Tout le personnel »',
    debut: null, fin: null, echeance: '01.01',
    assiette: 'salaire',
    salaireMaxAssure: 148200,
    // Deux lignes, deux payeurs : l'AAP est à la charge de l'employeur, l'AANP
    // est la seule prime que la loi autorise à retenir sur le salaire
    // (art. 91 LAA). Les confondre fausse le coût employeur de ~2 %.
    // L'AANP est à 1 — l'employeur la paie en entier — et ce n'est pas une
    // hypothèse. Les certificats de salaire 2025 portent 3 532.80 de
    // « cotisations AVS/AI/APG/AC/AANP », soit exactement 6,400 % de 55 200 :
    // 4,35 + 0,7 + 0,25 (AVS/AI/APG) + 1,1 (AC). L'AANP ajouterait 1,94 % et
    // porterait la ligne à 4 603.68. Elle n'est donc pas retenue sur le salaire,
    // alors que la loi l'autoriserait (art. 91 LAA).
    lignes: [
      { cle: 'aap', intitule: 'Accidents professionnels (AAP)', taux: 0.013147, taux2027: 0.012110, partEmployeur: 1 },
      { cle: 'aanp', intitule: 'Accidents non professionnels (AANP)', taux: 0.019400, taux2027: 0.020300, partEmployeur: 1 },
    ],
    confirmePar: 'Certificats de salaire 2025 de Guillaume et Arnaud (Downloads, 17.09.2026).',
    primeFacturee: 6346.65,
    primeFactureeNote: 'Facture provisoire 2026, calculée sur une masse de 195 000 (définitif 2024 + 2 %).',
    masseFacturee: 195000,
    contact: { nom: 'Difraz Yildiz', role: 'Suva Lausanne', tel: '021 310 81 38', email: 'difraz.yildiz@suva.ch' },
    source: 'SUVA (Accident)/Décomptes/Suva_2025-11-25_…Facture_de_primes_provisoires_01.01.2026….pdf',
  },

  // ─────────────────────────────────────────────────────── Visana (IJM)
  {
    id: 'visana-ijm', famille: 'assurance',
    assureur: 'Visana', branche: 'Perte de gain maladie (IJM)', obligatoire: false,
    statut: 'actif',
    intitule: "Assurance-maladie collective d'indemnités journalières — Visana PME Smart",
    police: '1.484318.000.3 (client 5.171.781.69)',
    debut: '2025-11-01', fin: '2028-12-31', echeance: '01.01',
    assiette: 'salaire',
    salaireMaxAssure: 300000,
    // Deux pièces se contredisent, et on ne tranche pas à leur place.
    // CONTRE une part employé : le certificat d'Arnaud donne
    // 59 042 − 3 532.80 (AVS) − 2 053.80 (LPP) = 53 455.40, le net imprimé au
    // centime. Rien ne s'intercale, alors que deux mois d'IJM auraient laissé
    // une trace (l'IJM a démarré le 01.11.2025).
    // POUR : le contrat de travail de Gabin, du 12.12.2025, écrit noir sur
    // blanc que « la part de l'employé aux cotisations à la LPP, à l'IJM et
    // l'impôt à la source » est déduite du brut.
    // Donc la part employeur n'est PAS 1, et on ignore ce qu'elle vaut : `null`,
    // et l'écran écrit « au moins ». Une fiche 2026 lèvera le doute.
    lignes: [
      { cle: 'ijm', intitule: 'Indemnités journalières maladie, type A', taux: 0.0147, partEmployeur: null },
    ],
    confirmePar: null,
    primeFacturee: 2940.00,
    primeFactureeNote: 'Prime annuelle provisoire, sur une masse déclarée de 200 000.',
    masseFacturee: 200000,
    contact: { nom: 'Régis Arber', role: 'Visana, GS 838 Région West 2', tel: '021 321 61 74', email: 'regis.arber@visana.ch' },
    source: 'Visana/30112025_VISANA_IJM_signé.pdf',
  },

  // ─────────────────────────────────────────────────────── Nest (LPP)
  {
    id: 'nest-lpp', famille: 'social',
    assureur: 'Nest Fondation collective', branche: 'Prévoyance professionnelle (LPP)', obligatoire: true,
    statut: 'actif',
    intitule: 'Plan de base, valable dès le 01.01.2026',
    police: 'Affiliation 11110 (sujet 719109)',
    debut: '2026-01-01', fin: null, echeance: 'trimestrielle',
    assiette: 'salaire',
    // La LPP ne se calcule pas par un taux sur le salaire AVS : elle passe par
    // le salaire assuré (déduction de coordination), puis par des bonifications
    // par tranche d'âge. Les cotisations exactes de chacun sont donc reprises
    // telles quelles de la liste Nest plutôt que recalculées — un recalcul
    // approximatif ici donnerait des francs faux dans un écran de coûts.
    cotisationsParPersonne: {
      Guillaume: { salaireAssure: 28740, employe: 2004.00, employeur: 2004.00 },
      Arnaud:    { salaireAssure: 28740, employe: 2004.00, employeur: 2004.00 },
      Gabin:     { salaireAssure: 29940, employe: 1528.80, employeur: 1528.80 },
    },
    plan: {
      seuilEntree: 22680, salaireAvsMax: 90720, deductionCoordination: 26460,
      salaireAssureMin: 3780, salaireAssureMax: 64260,
      renteInvalidite: 0.40, delaiAttenteInvalidite: 360, liberationPrimes: 90,
      rentePartenaire: 0.24, renteOrphelin: 0.08, tauxConversion: 0.053,
    },
    contact: { nom: 'Nest Fondation collective', role: 'Molkenstrasse 21, 8004 Zürich', tel: '044 444 57 57', email: 'info@nest-info.ch' },
    source: 'NEST (LPP)/Plan de prévoyance au 01.01.2026 Plan de base.pdf + Liste des cotisations.pdf',
  },

  // ─────────────────────────────────────────────────────── Helvetia (PME)
  {
    id: 'helvetia-pme', famille: 'assurance',
    assureur: 'Helvetia', branche: 'Commerce PME', obligatoire: false,
    statut: 'actif',
    intitule: 'Biens mobiliers, technique, RC entreprise et professionnelle, protection juridique',
    police: 'Proposition 127201-1.621.437.976 (police du 11.11.2024)',
    debut: '2024-11-01', fin: '2029-09-01', echeance: '01.09',
    assiette: 'entreprise',
    partEmployeur: 1,
    // Le détail des quatre modules : c'est ce qui permet de dire « la RC coûte
    // 1 358.20 », et pas seulement « Helvetia coûte 2 836.30 ».
    modules: [
      { cle: 'biens', intitule: 'Assurance biens mobiliers', prime: 412.60, debut: '2025-05-01' },
      { cle: 'technique', intitule: 'Assurance technique (machines, IT)', prime: 248.80, debut: '2024-11-01' },
      { cle: 'rc', intitule: 'RC entreprise et professionnelle', prime: 1358.20, debut: '2025-05-01' },
      { cle: 'pj', intitule: 'Protection juridique (Coop Protection Juridique SA)', prime: 681.60, debut: '2024-11-01' },
    ],
    primeFacturee: 2836.30,
    primeFactureeNote: 'Prime annuelle 2 701.20 + droit de timbre fédéral 135.10. Rabais de combinaison 7 % déjà compris.',
    basesTarif: { chiffreAffaires: 861200, masseSalariale: 206400 },
    contact: { nom: 'Gabriel Amary', role: 'Helvetia, Agence générale Lausanne La Côte', tel: '058 280 70 11', email: 'gabriel.amary@helvetia.ch' },
    source: 'Helvetia/HELVETIA_police_11.11.24.pdf',
  },

  // ─────────────────────────────────────────────────────── Smile (véhicules)
  {
    id: 'smile-master-2026', famille: 'assurance',
    assureur: 'Smile (Helvetia)', branche: 'Véhicule', obligatoire: true,
    statut: 'actif',
    intitule: 'Renault Master (leasing) — RC, casco COMPLÈTE, accidents des occupants',
    police: null,
    debut: '2026-04-02', fin: '2027-04-01', echeance: '02.04',
    assiette: 'vehicule', vehicule: 'master-2026',
    partEmployeur: 1,
    primeFacturee: 2285.50,
    primeFactureeNote: 'Offre 8024646, validée par Guillaume. RC 496.90 + casco 1 567.50 + accidents 66.00 + négligence grave 41.60, taxes 113.50 comprises. La police définitive n’est pas encore au dossier.',
    contact: { nom: 'smile.direct assurances', role: 'Zürichstrasse 130, 8600 Dübendorf', tel: '0844 848 444', email: null },
    source: 'Smile (Véhicule)/smile_car_offre_8024646.pdf',
    note: "Le leasing explique le saut de prime, et ce n'est pas un choix : le chiffre 5.2 des conditions Mobilize IMPOSE une casco complète couvrant la valeur du véhicule pendant toute la durée du contrat, plaques déposées comprises. C'est le seul véhicule du parc à l'avoir. Leasing RCI Finance SA / Mobilize, contrat C000366608.000.",
  },
  {
    id: 'smile-vito', famille: 'assurance',
    assureur: 'Smile (Helvetia)', branche: 'Véhicule', obligatoire: true,
    statut: 'actif',
    intitule: 'Mercedes Vito — RC, casco partielle, accidents des occupants',
    police: 'MOT-2’092’406',
    debut: '2025-12-20', fin: '2026-12-19', echeance: '20.12',
    assiette: 'vehicule', vehicule: 'vito',
    partEmployeur: 1,
    primeFacturee: 1004.80,
    primeFactureeNote: 'Prime 952.50 + taxes légales 52.30.',
    contact: { nom: 'smile.direct assurances', role: 'Zürichstrasse 130, 8600 Dübendorf', tel: '0844 848 444', email: null },
    source: 'Smile (Véhicule)/07061988_.car.pdf',
  },

  // ─────────────────────────────────────────────────────── TCS
  {
    id: 'tcs', famille: 'assurance',
    assureur: 'TCS', branche: 'Assistance et protection juridique circulation', obligatoire: false,
    statut: 'actif',
    intitule: 'TCS Carte Entreprise — secours routier, flotte',
    police: 'P0709858708-10600/00 (réf. 709.858.708)',
    debut: '2024-01-23', fin: null, echeance: '22.01',
    assiette: 'vehicule', vehicule: null,
    partEmployeur: 1,
    primeFacturee: 214.00,
    primeFactureeNote: 'Reconduction tacite. 80.00 par plaque + parts « autres prestations ».',
    plaquesCouvertes: ['VD 637451', 'VD 11593'],
    contact: { nom: 'TCS Entreprise', role: 'Chemin de Blandonnet 4, 1214 Vernier', tel: '0842 440 440', email: 'entreprise@tcs.ch' },
    source: 'TCS/TCS Entreprise.pdf',
  },

  // ─────────────────────────────────────────────────────── Caducs
  {
    id: 'smile-master-partielle', famille: 'assurance',
    assureur: 'Smile (Helvetia)', branche: 'Véhicule', obligatoire: true,
    statut: 'caduc', remplacePar: 'smile-master-2026',
    intitule: 'Master VD 624182 — ancienne couverture, casco PARTIELLE',
    police: 'MOT-7’388’584',
    debut: '2026-04-11', fin: '2027-04-10', echeance: '11.04',
    assiette: 'vehicule', vehicule: 'master-2026',
    partEmployeur: 1,
    primeFacturee: 1063.60,
    primeFactureeNote: 'RC 470.80 + casco 430.10 + accidents 66.00 + négligence grave 41.60, taxes 55.10 comprises.',
    contact: { nom: 'smile.direct assurances', role: 'Zürichstrasse 130, 8600 Dübendorf', tel: '0844 848 444', email: null },
    source: 'Smile (Véhicule)/Master Gris.pdf',
    note: "MÊME véhicule que la police actuelle : c'est la couverture qui a changé, pas le Master. À l'arrivée du nouveau Master, l'attestation demandée pour la nouvelle carte grise a repris telle quelle la police de l'ancien — donc en casco partielle, alors que le leasing exige la complète, sans que personne l'annonce à Smile. Corrigé le 02.04.2026. Caduque.",
  },
  {
    id: 'zurich-rc', famille: 'assurance',
    assureur: 'Zurich', branche: 'RC entreprise', obligatoire: false,
    statut: 'caduc', remplacePar: 'helvetia-pme',
    intitule: 'RC pour entreprises — reprise par Helvetia',
    police: '16.119.517',
    debut: null, fin: '2025-04-30', echeance: '01.05',
    assiette: 'entreprise', partEmployeur: 1,
    primeFacturee: null,
    primeFactureeNote: 'Aucune pièce du dossier ne donne la prime annuelle finale.',
    contact: { nom: 'Swiss Life Select (courtier)', role: 'Succursale de Lausanne, Av. Baumettes 7, 1020 Renens', tel: null, email: null },
    source: 'Zürich (Choses)/01052024_Déclaration.pdf',
    note: "Résiliée pour regroupement chez Helvetia, d'après les questions de la proposition Helvetia de novembre 2024. Dernière déclaration couvrant le 01.05.2024 – 30.04.2025.",
  },
  {
    id: 'zurich-biens', famille: 'assurance',
    assureur: 'Zurich', branche: 'Biens mobiliers', obligatoire: false,
    statut: 'caduc', remplacePar: 'helvetia-pme',
    intitule: 'Assurance biens mobiliers — reprise par Helvetia',
    police: null,
    debut: null, fin: '2025-04-30', echeance: null,
    assiette: 'entreprise', partEmployeur: 1,
    primeFacturee: null,
    contact: { nom: 'Swiss Life Select (courtier)', role: 'Succursale de Lausanne', tel: null, email: null },
    source: 'Zürich (Choses)/Offre RC pro + objets confiés.pdf',
    note: 'Citée comme résiliée dans la proposition Helvetia (question 1 : « Assurance biens mobiliers — Zürich assurances »).',
  },
  {
    id: 'helvetia-ijm', famille: 'assurance',
    assureur: 'Helvetia', branche: 'Perte de gain maladie (IJM)', obligatoire: false,
    statut: 'caduc', remplacePar: 'visana-ijm',
    intitule: "Annonce pour une assurance collective d'indemnités journalières",
    police: null,
    debut: null, fin: null, echeance: null,
    assiette: 'salaire', partEmployeur: null,
    primeFacturee: null,
    contact: { nom: 'Gabriel Amary', role: 'Helvetia, Agence générale Lausanne La Côte', tel: '058 280 70 11', email: 'gabriel.amary@helvetia.ch' },
    source: 'Helvetia/09092024_helvetia ^.pdf',
    note: "Liste du personnel remplie le 09.09.2024 (Guillaume, Arnaud, Robin Ascensio, Paul). La police Helvetia du 11.11.2024 ne contient AUCUN module IJM : soit la proposition n'a pas abouti, soit la police manque au dossier. À trancher — voir les manques.",
  },
]

// ── Couvertures ──────────────────────────────────────────────────────────────
//
// C'est le cœur de la boîte à questions. Chaque ligne répond à « est-ce que
// ceci est couvert, par qui, jusqu'à combien, avec quelle franchise ».
//
// `couvert` : true | false | 'partiel' | 'verifier'
//   'partiel'  — couvert, mais avec une limite qui mord (sous-limite, exclusion).
//   'verifier' — le dossier ne permet PAS de trancher. C'est un état honnête,
//                pas un défaut : c'est exactement ce qu'il faut savoir avant
//                d'appeler l'assureur.
//
// `mots` sert à retrouver la ligne depuis une phrase tapée par un humain. On y
// met le vocabulaire d'atelier ET le vocabulaire d'assurance, parce que
// personne ne tape « préjudice pécuniaire pur » quand il a cassé un truc.

export const COUVERTURES = [
  // ── Personnes : accident
  {
    id: 'accident-pro', contrat: 'suva-laa', couvert: true,
    intitule: 'Accident pendant le travail, à l’atelier ou sur un chantier',
    detail: "Soins, indemnités journalières dès le 3e jour après l'accident (jours de carence), rente en cas d'invalidité. L'indemnité vaut 80 % du gain assuré.",
    plafond: 'Gain assuré plafonné à 148 200 par an', franchise: 'Aucune',
    quiAppeler: 'suva-laa',
    mots: ['accident', 'travail', 'blessé', 'blessure', 'chantier', 'atelier', 'coupure', 'machine', 'chute', 'doigt', 'main', 'scie', 'aap'],
  },
  {
    id: 'accident-nonpro', contrat: 'suva-laa', couvert: true,
    intitule: 'Accident en dehors du travail (loisirs, trajet, vacances)',
    detail: "Couvert dès 8 heures de travail par semaine. C'est la branche AANP — les deux sinistres de Gabin en juillet 2026 en relèvent.",
    plafond: 'Gain assuré plafonné à 148 200 par an', franchise: 'Aucune',
    quiAppeler: 'suva-laa',
    mots: ['accident', 'loisir', 'vacances', 'ski', 'vélo', 'sport', 'weekend', 'privé', 'domicile', 'aanp', 'non professionnel'],
  },
  {
    id: 'maladie-pro', contrat: 'suva-laa', couvert: true,
    intitule: 'Maladie professionnelle (solvants, poussière de bois, bruit)',
    detail: "Assimilée à un accident professionnel. C'est la contrepartie de l'autocontrôle « produits chimiques » que la Suva réclame.",
    plafond: 'Gain assuré plafonné à 148 200 par an', franchise: 'Aucune',
    quiAppeler: 'suva-laa',
    mots: ['maladie professionnelle', 'solvant', 'peinture', 'vernis', 'poussière', 'bois', 'bruit', 'surdité', 'produit chimique', 'amiante', 'allergie'],
  },

  // ── Personnes : maladie
  {
    id: 'maladie-perte-gain', contrat: 'visana-ijm', couvert: true,
    intitule: 'Arrêt maladie d’un collaborateur — perte de salaire',
    detail: "80 % du salaire, après 30 jours d'attente comptés par cas, pendant 730 jours au maximum (délai d'attente déduit). Les 30 premiers jours restent à la charge de l'entreprise.",
    plafond: '300 000 de salaire annuel par personne', franchise: "30 jours d'attente par cas",
    quiAppeler: 'visana-ijm',
    mots: ['maladie', 'malade', 'arrêt', 'grippe', 'burnout', 'dépression', 'hôpital', 'opération', 'perte de gain', 'ijm', 'salaire', 'certificat médical'],
  },
  {
    id: 'ijm-accident', contrat: 'visana-ijm', couvert: false,
    intitule: 'Accident — l’IJM Visana ne joue pas',
    detail: "Le risque accident est explicitement exclu du contrat Visana. Ce n'est pas un trou : c'est la Suva qui prend l'accident, dès le 3e jour et sans les 30 jours d'attente.",
    plafond: null, franchise: null,
    quiAppeler: 'suva-laa',
    mots: ['accident', 'ijm', 'visana', 'exclu', 'perte de gain accident'],
  },
  {
    id: 'grossesse', contrat: 'visana-ijm', couvert: 'verifier',
    intitule: 'Maternité et grossesse',
    detail: "L'offre exige qu'aucune personne à assurer ne soit enceinte à la signature, mais le dossier ne contient pas les CGA 2021 type A qui règlent la maternité. L'APG maternité fédérale (14 semaines, 80 %) reste due par la caisse de compensation AVS, indépendamment de ce contrat.",
    plafond: null, franchise: null,
    quiAppeler: 'visana-ijm',
    mots: ['grossesse', 'enceinte', 'maternité', 'congé maternité', 'accouchement', 'bébé', 'paternité'],
  },

  // ── Personnes : long terme
  {
    id: 'invalidite', contrat: 'nest-lpp', couvert: true,
    intitule: 'Invalidité de longue durée',
    detail: "Rente d'invalidité de 40 % du salaire assuré, après 360 jours d'attente. Les primes sont libérées après 90 jours. S'ajoute à la rente AI fédérale et, en cas d'accident, à la rente Suva.",
    plafond: '40 % du salaire assuré (max. 64 260)', franchise: "360 jours d'attente",
    quiAppeler: 'nest-lpp',
    mots: ['invalidité', 'invalide', 'ai', 'rente', 'incapacité', 'longue durée', 'handicap'],
  },
  {
    id: 'deces', contrat: 'nest-lpp', couvert: true,
    intitule: 'Décès d’un collaborateur',
    detail: "Rente de partenaire de 24 % du salaire assuré, rente d'orphelin de 8 %. Les rachats effectués chez Nest sont restitués aux bénéficiaires en plus des prestations.",
    plafond: '24 % du salaire assuré au partenaire', franchise: 'Aucune',
    quiAppeler: 'nest-lpp',
    mots: ['décès', 'mort', 'veuve', 'veuf', 'orphelin', 'survivant', 'partenaire'],
  },
  {
    id: 'retraite', contrat: 'nest-lpp', couvert: true,
    intitule: 'Retraite',
    detail: "Rente de 5,3 % du capital vieillesse à 65 ans. Bonifications de 8 % (25-34 ans) à 19 % (55-65 ans) du salaire assuré, partagées moitié-moitié.",
    plafond: 'Salaire assuré entre 3 780 et 64 260', franchise: null,
    quiAppeler: 'nest-lpp',
    mots: ['retraite', 'pension', 'vieillesse', 'rachat', '2e pilier', 'deuxième pilier', 'lpp', 'capital'],
  },

  // ── Choses : atelier et matériel
  {
    id: 'incendie-atelier', contrat: 'helvetia-pme', couvert: true,
    intitule: 'Incendie, dégâts d’eau et dommages naturels à l’atelier',
    detail: "Biens meubles assurés à 87 000. S'y ajoutent 17 400 de frais consécutifs et de propriété de tiers confiée à titre temporaire, et 861 200 de perte de revenu et frais supplémentaires.",
    plafond: '87 000 de biens meubles', franchise: '500 (200 pour les dommages naturels)',
    quiAppeler: 'helvetia-pme',
    mots: ['incendie', 'feu', 'brûlé', 'eau', 'inondation', 'dégât des eaux', 'tempête', 'grêle', 'atelier', 'local'],
  },
  {
    id: 'vol-atelier', contrat: 'helvetia-pme', couvert: 'partiel',
    intitule: 'Vol de matériel',
    detail: "Le vol avec effraction est dans l'assurance de base (87 000). Le VOL SIMPLE, sans effraction, est une prestation à part limitée à 10 000 — et à 5 000 seulement pour ce qui se trouve sur un chantier. La police note « Protection vol : non ».",
    plafond: '10 000 en vol simple, 5 000 sur chantier', franchise: '500',
    quiAppeler: 'helvetia-pme',
    mots: ['vol', 'volé', 'cambriolage', 'effraction', 'disparu', 'outillage', 'machine volée', 'chantier'],
  },
  {
    id: 'vol-vehicule', contrat: 'smile-master-2026', couvert: true,
    intitule: 'Vol du véhicule lui-même',
    detail: "La casco partielle couvre le vol du véhicule, sur le Master comme sur le Vito, franchise nulle. Ce qui se trouve DEDANS suit une autre règle — voir « Affaires et outillage laissés dans un véhicule ».",
    plafond: 'Valeur du véhicule', franchise: '0',
    quiAppeler: 'smile-master-2026',
    mots: ['vol', 'véhicule', 'camionnette', 'fourgon', 'master', 'vito', 'volé', 'voiture volée'],
  },
  {
    id: 'machines', contrat: 'helvetia-pme', couvert: true,
    intitule: 'Panne ou casse d’une machine, d’un appareil ou de l’informatique',
    detail: "Assurance technique : machines et appareils jusqu'à 250 000 par objet, somme globale 87 000, indemnisation à la valeur à neuf jusqu'à 3 ans. Les installations IT sont incluses (option retenue) pour 87 000.",
    plafond: '87 000, max. 250 000 par objet', franchise: '500',
    quiAppeler: 'helvetia-pme',
    mots: ['machine', 'panne', 'cassé', 'casse', 'appareil', 'ordinateur', 'informatique', 'it', 'serveur', 'cnc', 'défensive', 'collision'],
  },
  {
    id: 'donnees', contrat: 'helvetia-pme', couvert: 'partiel',
    intitule: 'Perte de données, rançongiciel, piratage',
    detail: "Deux poches distinctes et modestes : 2 500 pour reconstituer les données et logiciels, et 50 000 de RC pour les préjudices causés à des tiers par cyber-criminalité ou atteinte à la protection des données. Ce n'est PAS une cyber-assurance : la rançon, l'interruption d'exploitation et l'expertise forensique ne sont pas couvertes.",
    plafond: '2 500 de reconstitution, 50 000 de RC', franchise: '500 (200 en protection des données)',
    quiAppeler: 'helvetia-pme',
    mots: ['données', 'cyber', 'piratage', 'hacké', 'rançongiciel', 'ransomware', 'virus', 'sauvegarde', 'rgpd', 'lpd', 'fuite'],
  },

  // ── Responsabilité
  {
    id: 'rc-dommage-client', contrat: 'helvetia-pme', couvert: true,
    intitule: 'Dommage causé à un client ou à un tiers',
    detail: "RC entreprise et professionnelle : 5 000 000 par événement pour les dommages corporels et matériels, double garantie par année d'assurance. Les normes SIA et FIDIC sont expressément couvertes.",
    plafond: '5 000 000 par événement', franchise: '500',
    quiAppeler: 'helvetia-pme',
    mots: ['responsabilité', 'rc', 'dommage', 'client', 'tiers', 'abîmé', 'cassé chez le client', 'montage', 'livraison', 'blessé quelqu\'un'],
  },
  {
    id: 'objets-confies', contrat: 'helvetia-pme', couvert: 'partiel',
    intitule: 'Objet d’un client confié, loué ou en cours de travail, abîmé',
    detail: "Couverture élargie pour objets confiés, loués et traités : 50 000, hors véhicules. C'est une SOUS-LIMITE, pas les 5 millions de la RC de base — un meuble ancien de valeur dépasse vite ce montant.",
    plafond: '50 000', franchise: '500 plus 10 % du solde',
    quiAppeler: 'helvetia-pme',
    mots: ['objet confié', 'confié', 'loué', 'location', 'meuble du client', 'restauration', 'rénovation', 'abîmé', 'traité', 'dépôt'],
  },
  {
    id: 'rc-vehicule-tiers', contrat: 'helvetia-pme', couvert: true,
    intitule: 'Dommage causé en utilisant le véhicule d’un tiers',
    detail: "Option retenue dans la police Helvetia : 5 000 000 pour les dommages corporels et matériels causés avec un véhicule qui n'est pas à l'entreprise.",
    plafond: '5 000 000', franchise: '500 plus 10 %',
    quiAppeler: 'helvetia-pme',
    mots: ['véhicule de tiers', 'voiture empruntée', 'location véhicule', 'camion loué', 'emprunté'],
  },
  {
    id: 'malversation', contrat: 'helvetia-pme', couvert: true,
    intitule: 'Vol ou escroquerie commis par une personne de confiance',
    detail: "Préjudices pécuniaires à la suite d'infractions commises par des personnes de confiance ou d'actes frauduleux de tiers : 100 000.",
    plafond: '100 000', franchise: '1 000',
    quiAppeler: 'helvetia-pme',
    mots: ['escroquerie', 'fraude', 'détournement', 'employé malhonnête', 'faux ordre', 'arnaque', 'phishing', 'virement frauduleux'],
  },

  // ── Véhicules
  {
    id: 'accident-responsable', contrat: 'smile-master-2026', couvert: 'partiel',
    intitule: 'Je suis responsable : les dégâts sur NOTRE véhicule',
    detail: "Tout dépend du véhicule, et c'est le piège. Le MASTER en leasing a la casco complète depuis avril 2026 : la réparation est payée, sous déduction de 1 000 de franchise. Le VITO n'a que la casco partielle : en tort, sa réparation est entièrement à la charge de l'entreprise.",
    plafond: 'Valeur du Master ; rien sur le Vito', franchise: '1 000 sur le Master',
    quiAppeler: 'smile-master-2026',
    mots: ['accident', 'voiture', 'véhicule', 'ma faute', 'responsable', 'tôle', 'collision', 'casco', 'carrosserie', 'choc', 'accroché', 'master', 'vito'],
  },
  {
    id: 'effets-personnels', contrat: 'smile-master-2026', couvert: 'partiel',
    intitule: 'Affaires et outillage laissés dans un véhicule',
    detail: "Les deux véhicules actuels couvrent les effets personnels jusqu'à 2 000 (K.3.3). Au-delà, c'est la limite de vol simple d'Helvetia qui prend le relais — 10 000, et 5 000 seulement sur un chantier. L'ancien Master, lui, ne les couvrait pas du tout : la couverture a été gagnée au changement de véhicule.",
    plafond: '2 000 par véhicule', franchise: '0',
    quiAppeler: 'smile-master-2026',
    mots: ['effets personnels', 'affaires', 'outillage', 'outils', 'laissé dans', 'camionnette', 'fourgon', 'coffre', 'volé dans'],
  },
  {
    id: 'rc-vehicule', contrat: 'smile-master-2026', couvert: true,
    intitule: 'Dommages causés à autrui avec nos véhicules',
    detail: "RC circulation jusqu'à 100 millions, sur les deux véhicules. Franchise nulle pour le conducteur habituel et les autres conducteurs, 500 pour un jeune conducteur. La négligence grave est rachetée.",
    plafond: '100 000 000', franchise: '0 (500 pour un jeune conducteur)',
    quiAppeler: 'smile-master-2026',
    mots: ['accident', 'rc', 'circulation', 'dégâts à autrui', 'tiers', 'route', 'jeune conducteur', 'négligence grave'],
  },
  {
    id: 'bris-glace', contrat: 'smile-master-2026', couvert: true,
    intitule: 'Bris de glace, grêle, animal, vandalisme sur un véhicule',
    detail: "Casco partielle sur les deux véhicules. Bris de glace « assuré plus », franchise 0. Les dommages de parking ne sont couverts sur aucun des deux : ni sur le Master (option écartée), ni sur le Vito depuis son renouvellement.",
    plafond: 'Valeur du véhicule', franchise: '0 en bris de glace',
    quiAppeler: 'smile-master-2026',
    mots: ['pare-brise', 'vitre', 'bris de glace', 'grêle', 'animal', 'sanglier', 'vandalisme', 'rayure', 'parking', 'martre'],
  },
  {
    id: 'panne-route', contrat: 'tcs', couvert: 'partiel',
    intitule: 'Panne, crevaison ou remorquage en route',
    detail: "TCS Carte Entreprise, secours routier. MAIS l'attestation du dossier (janvier 2024) ne couvre que VD 637451 (Vito) et VD 11593. Le Renault Master VD 624182, mis en circulation en 2025, n'y figure pas.",
    plafond: null, franchise: null,
    quiAppeler: 'tcs',
    mots: ['panne', 'dépannage', 'remorquage', 'crevaison', 'batterie', 'tcs', 'route', 'autoroute', 'immobilisé'],
  },

  // ── Juridique et exploitation
  {
    id: 'litige', contrat: 'helvetia-pme', couvert: true,
    intitule: 'Litige juridique lié à l’entreprise',
    detail: "Protection juridique par Coop Protection Juridique SA : jusqu'à 1 000 000 par cas pour l'entreprise, franchise nulle. Le droit contractuel élargi (500 000) et la circulation (1 000 000) ont été retenus en option.",
    plafond: "1 000 000 par cas", franchise: '0',
    quiAppeler: 'helvetia-pme',
    mots: ['litige', 'procès', 'avocat', 'tribunal', 'conflit', 'juridique', 'contrat', 'prud\'hommes', 'droit'],
  },
  {
    id: 'impaye', contrat: 'helvetia-pme', couvert: 'partiel',
    intitule: 'Un client ne paie pas sa facture',
    detail: "L'encaissement de créances est couvert jusqu'à 150 000 par cas au titre de la protection juridique — c'est-à-dire les FRAIS de la procédure. La facture impayée elle-même n'est pas remboursée : il n'y a pas d'assurance-crédit au dossier.",
    plafond: '150 000 de frais de procédure', franchise: '0',
    quiAppeler: 'helvetia-pme',
    mots: ['impayé', 'facture', 'pas payé', 'client mauvais payeur', 'recouvrement', 'poursuite', 'créance', 'encaissement'],
  },
  {
    id: 'perte-exploitation', contrat: 'helvetia-pme', couvert: 'partiel',
    intitule: 'Arrêt de l’activité après un sinistre',
    detail: "Perte de revenu et frais supplémentaires : 861 200, mais uniquement à la suite d'un sinistre couvert par l'assurance biens mobiliers (incendie, dégâts d'eau, dommages naturels, vol). Un arrêt pour une autre cause — panne de machine, cyberattaque, absence de personnel — n'ouvre pas ce droit.",
    plafond: '861 200', franchise: '500',
    quiAppeler: 'helvetia-pme',
    mots: ['perte d\'exploitation', 'arrêt', 'fermeture', 'chiffre d\'affaires', 'production arrêtée', 'sinistre', 'interruption'],
  },
  {
    id: 'personne-cle', contrat: 'helvetia-pme', couvert: 'partiel',
    intitule: 'Défaillance d’une personne clé',
    detail: "Libération du paiement des primes en cas de défaillance d'une personne clé : 30 000 au maximum. Cela paie les PRIMES, pas la perte de chiffre d'affaires ni le remplacement.",
    plafond: '30 000', franchise: null,
    quiAppeler: 'helvetia-pme',
    mots: ['personne clé', 'homme clé', 'dirigeant', 'absence', 'décès dirigeant', 'défaillance'],
  },

  // ── Trous connus
  {
    id: 'gap-leasing', contrat: null, couvert: 'verifier',
    intitule: 'Master détruit ou volé : le solde du leasing reste-t-il à payer ?',
    detail: "Le risque le plus cher du parc, et il ne se voit sur aucune police. Le chiffre 6.4 des conditions Mobilize prévoit qu'en cas de perte totale ou de vol, le leasing est résilié de plein droit et l'entreprise doit l'encours comptable PLUS la valeur résiduelle. Smile, lui, indemnise la valeur du véhicule. L'écart entre les deux — la « lacune GAP » — n'est couvert par aucune pièce du dossier. L'option « assuré plus » du type d'indemnisation adoucit la décote les premières années, mais ce n'est pas une garantie GAP.",
    plafond: null, franchise: null,
    quiAppeler: 'smile-master-2026',
    mots: ['leasing', 'perte totale', 'dommage total', 'épave', 'détruit', 'volé', 'gap', 'valeur résiduelle', 'solde', 'master'],
  },
  {
    id: 'qui-conduit', contrat: null, couvert: 'partiel',
    intitule: 'Qui a le droit de conduire le Master',
    detail: "Deux limites se superposent. Côté Smile, un jeune conducteur porte une franchise de 500 en RC. Côté leasing (chiffre 7.2), le véhicule ne peut être confié qu'aux collaborateurs domiciliés en Suisse et aux membres de leur ménage : tout autre usage — un indépendant, un intérimaire, un ami — exige l'accord ÉCRIT de Mobilize. Le point devient concret au départ de Gabin, si un renfort externe devait conduire.",
    plafond: null, franchise: '500 pour un jeune conducteur',
    quiAppeler: 'smile-master-2026',
    mots: ['conduire', 'conducteur', 'qui peut', 'prêter', 'intérimaire', 'stagiaire', 'apprenti', 'externe', 'permis', 'jeune conducteur'],
  },
  {
    id: 'trou-rc-dirigeants', contrat: null, couvert: false,
    intitule: 'Responsabilité personnelle des gérants (RC D&O)',
    detail: "Aucun contrat au dossier. La RC entreprise couvre la société, pas le patrimoine personnel des gérants en cas d'action pour faute de gestion.",
    plafond: null, franchise: null, quiAppeler: null,
    mots: ['d&o', 'gérant', 'dirigeant', 'faute de gestion', 'responsabilité personnelle', 'administrateur', 'associé'],
  },
  {
    id: 'trou-marchandises', contrat: null, couvert: 'verifier',
    intitule: 'Marchandise transportée dans nos véhicules',
    detail: "Les effets personnels ne sont assurés sur aucun des deux véhicules. La couverture d'un meuble fini, transporté vers un client, dépend de la notion de « propriété de tiers confiée à titre temporaire » d'Helvetia (17 400) et de sa validité hors de l'atelier. À faire confirmer par écrit par Helvetia.",
    plafond: '17 400, à confirmer', franchise: '500',
    quiAppeler: 'helvetia-pme',
    mots: ['transport', 'marchandise', 'livraison', 'meuble transporté', 'camionnette', 'chargement', 'route'],
  },
  {
    id: 'trou-expo', contrat: null, couvert: 'verifier',
    intitule: 'Mobilier événementiel monté sur un site extérieur',
    detail: "C'est le métier même de l'entreprise, et le dossier ne le traite nulle part explicitement. « Biens meubles sur des chantiers » est une option Helvetia (5 000, franchise 5 000 — donc quasi sans effet), et le vol simple sur chantier est plafonné à 5 000. Un stand ou un mobilier de scène en extérieur mérite une réponse écrite d'Helvetia.",
    plafond: '5 000 sur chantier', franchise: '5 000',
    quiAppeler: 'helvetia-pme',
    mots: ['événementiel', 'événement', 'expo', 'exposition', 'stand', 'salon', 'festival', 'extérieur', 'montage', 'scène', 'installation'],
  },
]

// ── Obligations non financières ──────────────────────────────────────────────
// Tout ce que le dossier impose et qui ne se paie pas en francs : ce sont les
// choses qui coûtent cher quand on les oublie.
export const OBLIGATIONS = [
  {
    id: 'autocontrole-chimiques', contrat: 'suva-laa',
    intitule: 'Autocontrôle Suva « Utilisation de produits chimiques »',
    detail: "Questionnaire en ligne obligatoire (art. 50 et 61 al. 3 OPA). Courrier du 10 mai 2026, rappel du 15 juin fixant le délai au 29 juin. Mandat 0046547144. FAIT — confirmé par Guillaume le 17.09.2026. Le dossier n'en contient pas d'accusé : si la Suva relance, c'est là qu'il faudra le chercher.",
    fait: true,
    echeance: null, recurrence: null, criticite: 'basse',
    ou: 'www.suva.ch/autocontrole-questionnaire — droit d’accès « Poste de travail des préposés à la sécurité »',
    source: 'SUVA (Accident)/Sécurité_au_travail…/Suva_2026-06-15_…rappel_renvoi_questionnaire.pdf',
    mots: ['autocontrôle', 'produits chimiques', 'suva', 'questionnaire', 'sécurité', 'opa', 'préposé sécurité'],
  },
  {
    id: 'declaration-salaires-suva', contrat: 'suva-laa',
    intitule: 'Déclaration annuelle des masses salariales à la Suva',
    detail: "À transmettre chaque année d'ici au 31 janvier, par ELM/Swissdec ou via mySuva. Sans déclaration, la Suva fixe les primes par décision (art. 120 OLAA). Une première transmission par ELM donne 100 de rabais.",
    echeance: null, recurrence: '31 janvier', criticite: 'haute',
    ou: 'mySuva → Déclaration de salaires',
    source: 'SUVA (Accident)/Declaration_de_salaires/Suva_2025-12-02_…Invitation_déclaration_des_salaires….pdf',
    mots: ['déclaration', 'salaires', 'masse salariale', 'suva', 'elm', 'swissdec', 'mysuva', 'janvier'],
  },
  {
    id: 'liste-salaires-nest', contrat: 'nest-lpp',
    intitule: 'Liste des salaires Nest pour l’année suivante',
    detail: "Formulaire à compléter et signer intégralement, y compris la dernière page (fonds de garantie LPP), avant le 31 janvier. Les salaires inchangés doivent quand même être mentionnés.",
    echeance: null, recurrence: '31 janvier', criticite: 'moyenne',
    ou: 'Portail Nest connect',
    source: 'NEST (LPP)/Liste des salaires.pdf',
    mots: ['nest', 'lpp', 'liste des salaires', 'annonce', 'déclaration', 'janvier', 'fonds de garantie'],
  },
  {
    id: 'declaration-visana', contrat: 'visana-ijm',
    intitule: 'Déclaration des masses salariales Visana (IJM)',
    detail: "À transmettre d'ici au 31 janvier, par formulaire ou par ELM. Point d'attention : ELM 4.0 n'est plus supporté depuis le 30 juin 2026 — la comptabilité salariale doit être passée en ELM 5.0 pour que la LAA, la LAAC et l'IJM continuent de partir.",
    echeance: null, recurrence: '31 janvier', criticite: 'moyenne',
    ou: 'www.visana.ch ou ELM 5.0',
    source: 'Visana/30062026_visaNa.pdf',
    mots: ['visana', 'ijm', 'déclaration', 'masse salariale', 'elm', 'swissdec', '5.0'],
  },
  {
    id: 'information-employes', contrat: 'visana-ijm',
    intitule: 'Informer les collaborateurs du contenu du contrat IJM',
    detail: "Obligation de l'employeur selon l'art. 3 al. 3 LCA : informer par écrit chaque employé du contenu essentiel du contrat, de ses modifications et de sa résiliation. Visana fournit les formulaires « Notice pour les collaboratrices et collaborateurs ».",
    echeance: null, recurrence: 'à chaque entrée et à chaque modification', criticite: 'moyenne',
    ou: 'visana.ch/fr/clientele_entreprises → téléchargements',
    source: 'Visana/30112025_VISANA_IJM_signé.pdf',
    mots: ['information', 'employés', 'lca', 'notice', 'collaborateurs', 'devoir d\'information'],
  },
  {
    id: 'cession-leasing', contrat: 'smile-master-2026',
    intitule: 'Remettre l’acte de cession des droits d’assurance à Mobilize',
    detail: "Chiffre 5.3 des conditions du leasing : quand c'est le preneur qui conclut la casco complète, il doit céder ses droits d'assurance à la société de leasing et lui fournir l'acte de cession. Rien de tel n'est au dossier. La casco doit par ailleurs être maintenue pendant toute la durée du contrat, même si les plaques sont déposées temporairement.",
    echeance: null, recurrence: 'une fois, à la conclusion', criticite: 'haute',
    ou: 'RCI Finance SA / Mobilize, 0848 00 07 07, contrat C000366608.000',
    source: 'ScanSnap Home folder/Leasing Master.pdf, conditions générales ch. 5.3',
    mots: ['cession', 'acte de cession', 'leasing', 'mobilize', 'rci', 'casco', 'droits'],
  },
  {
    id: 'sinistre-leasing', contrat: 'smile-master-2026',
    intitule: 'Déclarer tout sinistre du Master À MOBILIZE AUSSI',
    detail: "Chiffre 6.1 : tout sinistre au-delà de 1 000 doit être annoncé par écrit et sans délai à l'assurance ET à la société de leasing. Toute perte de valeur due à un oubli est à la charge de l'entreprise. Le seuil coïncide avec la franchise casco de 1 000 : en pratique, dès qu'il y a une déclaration à Smile, il en faut une à Mobilize.",
    echeance: null, recurrence: 'à chaque sinistre', criticite: 'haute',
    ou: 'relation-clientele.ch@mobilize-fs.com, contrat C000366608.000',
    source: 'ScanSnap Home folder/Leasing Master.pdf, conditions générales ch. 6.1',
    mots: ['sinistre', 'accident', 'déclarer', 'leasing', 'mobilize', 'master', 'vol'],
  },
  {
    id: 'sortie-gabin', contrat: 'suva-laa',
    intitule: 'Annoncer la sortie de Gabin à la Suva, Visana, Nest et la caisse AVS',
    detail: "Les rapports de travail prennent fin le 31 octobre 2026 (congé notifié le 4 septembre, délai d'un mois). Quatre annonces à faire, sans quoi les primes continuent de courir sur un salaire qui n'existe plus. Nest a un formulaire de sortie dédié ; la Suva et Visana se régularisent à la déclaration annuelle de janvier, mais une annonce immédiate évite d'avancer la trésorerie.",
    echeance: '2026-10-31', recurrence: null, criticite: 'haute',
    ou: 'Portail Nest connect, mySuva, Visana, caisse AVS Vaud',
    source: 'ScanSnap Home folder/licenciement Gabin.pdf',
    mots: ['sortie', 'départ', 'gabin', 'licenciement', 'annoncer', 'résiliation', 'fin de contrat'],
  },
  {
    id: 'tcs-plaques', contrat: 'tcs',
    intitule: 'Annoncer les plaques au TCS',
    detail: "Toute modification de plaque doit être annoncée par écrit à entreprise@tcs.ch. L'attestation au dossier date du 23 janvier 2024 et ne mentionne pas VD 624182.",
    echeance: null, recurrence: 'à chaque changement de véhicule', criticite: 'haute',
    ou: 'entreprise@tcs.ch ou 0842 440 440',
    source: 'TCS/TCS Entreprise.pdf',
    mots: ['tcs', 'plaque', 'véhicule', 'flotte', 'immatriculation', 'annoncer'],
  },
]

// ── Sinistres ────────────────────────────────────────────────────────────────
export const SINISTRES = [
  {
    id: '25.86379.26.0', contrat: 'suva-laa', personne: 'Gabin',
    date: '2026-07-04', type: 'Accident non professionnel',
    statut: 'accepté', montant: null,
    detail: "Prise en charge confirmée le 13 juillet 2026. Indemnité journalière de 131.55 par jour calendaire, au plus tôt dès le 7 juillet 2026.",
    source: 'SUVA (Accident)/Correspondance_accidents/Suva_2026-07-13_…Acceptation_entreprise.pdf',
  },
  {
    id: '26.10348.26.5', contrat: 'suva-laa', personne: 'Gabin',
    date: '2026-07-27', type: 'Accident non professionnel',
    statut: 'indemnisé', montant: 1118.35,
    detail: "Décompte du 19 août 2026 : 3 jours à 131.55, 2 jours à 131.55, puis 7 jours à 65.80 (incapacité à 50 %). Versé sur le compte Raiffeisen de l'entreprise.",
    source: 'SUVA (Accident)/Décomptes_indemnités_journalières/Suva_2026-08-19_…1118.35.pdf',
  },
  {
    id: 'accident-master-2026', contrat: 'smile-master-partielle', personne: null,
    date: null, type: 'Accident — Master VD 624182',
    statut: 'clos, à la charge de l’entreprise', montant: null,
    // La leçon utile n'est pas « qui a fauté » : au changement de véhicule,
    // Smile a reconduit la police de l'ancien Master, qui était en casco
    // partielle, et personne ne lui a annoncé que le nouveau était en leasing.
    // Une attestation demandée pour une nouvelle carte grise ne change pas
    // l'étendue de la couverture — elle la recopie. À retenir au prochain
    // changement de véhicule.
    detail: "Survenu alors que le Master n'était couvert qu'en casco partielle : au changement de véhicule, Smile avait reconduit la police de l'ancien Master sans que le leasing lui soit annoncé. C'est ce sinistre qui l'a révélé, d'où le passage en casco complète le 02.04.2026. Réparations assumées par l'entreprise ; Guillaume a décidé le 17.09.2026 de ne pas y revenir.",
    source: 'Guillaume, 17.09.2026 (oral). Aucune pièce au dossier.',
  },
  {
    id: 'vol-2023', contrat: 'smile-vito', personne: null,
    date: '2023-01-02', type: 'Vol de véhicule',
    statut: 'clos', montant: null,
    detail: 'Plainte déposée, attestation de dépôt de plainte au dossier. Les pièces sont des scans sans couche texte.',
    source: 'Smile (Véhicule)/Vol 02.01.23/02012024_ATTESTATION DE DÉPÔT DE PLAINTE.pdf',
  },
  {
    id: 'axa-camion-2023', contrat: null, personne: null,
    date: '2023-11-08', type: 'Litige — camion',
    statut: 'à qualifier', montant: null,
    detail: "Dossier AXA du 8 novembre 2023 rangé dans « Litiges », avec une plainte genevoise. Aucun de nos contrats n'est AXA : il s'agit vraisemblablement de l'assureur d'un tiers.",
    source: 'Litiges/AXA_08.11.2023_Camion AL_Peter.pdf',
  },
]

// ── Ce qui manque au dossier ─────────────────────────────────────────────────
// Écrit ici plutôt que dans un coin de l'écran : c'est une donnée de l'outil,
// pas une note de bas de page. Tant que ces lignes existent, l'outil sait
// qu'il répond avec un dossier incomplet.
export const MANQUES = [
  {
    id: 'part-employeur-2026', criticite: 'basse',
    quoi: 'Confirmer sur une fiche 2026 que rien n’est retenu pour l’IJM',
    pourquoi: "Les certificats 2025 montrent qu'aucune retenue AANP ni IJM ne touche le salaire — l'employeur paie tout, et l'outil le compte ainsi. Mais l'IJM Visana n'a démarré que le 01.11.2025 : deux mois de recul seulement. Une fiche 2026 lèverait la dernière réserve.",
    ou: 'Une fiche de salaire 2026.',
  },
  {
    id: 'police-ijm', criticite: 'haute',
    quoi: "La police IJM Visana définitive, et le sort de la proposition Helvetia de 2024",
    pourquoi: "Le dossier contient la proposition Visana signée, pas la police émise. Et une annonce de personnel Helvetia de septembre 2024 pour la même branche, sans police correspondante. Deux contrats IJM qui se chevauchent, ou aucun entre 2024 et novembre 2025 : il faut trancher.",
    ou: 'Régis Arber chez Visana, Gabriel Amary chez Helvetia.',
  },
  {
    id: 'tcs-master', criticite: 'haute',
    quoi: 'Une attestation TCS à jour : une des deux plaques couvertes n’existe plus',
    pourquoi: "L'attestation de janvier 2024 couvre VD 637451 et VD 11 593. Le Vito est bien VD 637451 (confirmé par Guillaume), donc la seconde plaque est une ancienne immatriculation : l'entreprise paie 80 par an pour une plaque hors service, pendant que le Master, lui, n'est couvert par AUCUNE des deux. En cas de panne du Master sur la route, l'assistance peut être refusée.",
    ou: 'entreprise@tcs.ch, réf. 709.858.708.',
  },
  {
    id: 'cga', criticite: 'moyenne',
    quoi: 'Les Conditions Générales citées par les polices',
    pourquoi: "Les polices renvoient aux CGA (Helvetia PME avril 2023, biens mobiliers septembre 2022, technique novembre 2023, RC juin 2021 ; Visana 2021 type A ; Smile MOT 2022.01) sans les contenir. Les exclusions vivent là — pas dans la police.",
    ou: 'helvetia.ch, visana.ch, smile-assurance.ch/cga.',
  },
  {
    id: 'rc-montant', criticite: 'moyenne',
    quoi: "La prime Zurich et la date exacte de fin des contrats repris",
    pourquoi: "Savoir ce que coûtait la RC chez Zurich dirait si le passage chez Helvetia a fait gagner ou perdre de l'argent. Et la date de bascule exacte compte si un sinistre de 2024-2025 ressort.",
    ou: 'Swiss Life Select, ou les relevés bancaires de 2024.',
  },
  {
    id: 'motorisation-master', criticite: 'haute',
    quoi: 'Le Master assuré et le Master en leasing n’ont pas la même motorisation',
    pourquoi: "C'est tranché, et c'est Smile qui se trompe : deux courriers Mobilize ET le numéro de châssis VF1RDA00776082817 donnent un « dCi 150 ». L'offre Smile validée porte « dCi 130 ». La puissance entre dans le tarif, et un véhicule mal décrit donne prise à une réduction de prestation en cas de sinistre important. À faire corriger par écrit, et à garder : une correction obtenue par téléphone ne se prouve pas.",
    ou: 'smile.direct, 0844 848 444, en citant le châssis VF1RDA00776082817.',
  },
  {
    id: 'gap-master', criticite: 'haute',
    quoi: 'Savoir si la lacune GAP du leasing est couverte',
    pourquoi: "En perte totale, Mobilize réclame l'encours plus la valeur résiduelle (ch. 6.4) tandis que Smile paie la valeur du véhicule. La différence peut représenter plusieurs milliers de francs à sortir d'un coup, et rien au dossier ne dit qu'elle est assurée. À poser en une phrase à Smile : « en cas de perte totale, la prestation couvre-t-elle le solde du leasing ? »",
    ou: 'smile.direct, 0844 848 444, police du Master.',
  },
  {
    id: 'plaque-master', criticite: 'haute',
    quoi: 'La plaque du nouveau Master, et sa police définitive',
    pourquoi: "L'offre 8024646 est validée mais ne porte que « VD », sans numéro : le dossier ne contient donc la plaque d'aucun véhicule en service côté Master. Sans elle, impossible de vérifier l'inscription au TCS, ni de rattacher un sinistre au bon contrat.",
    ou: 'Le permis de circulation, ou smile-assurance.ch.',
  },
  {
    id: 'lpp-gabin', criticite: 'haute',
    quoi: 'Gabin cotise à la LPP sur 56 400 alors que son contrat dit 60 000',
    pourquoi: "Le contrat du 12.12.2025 fixe 5 000 brut par mois sur 12 mois. Nest cotise sur 56 400, soit 4 700 par mois — 3 600 de moins par an. Un salaire LPP sous-déclaré réduit ses prestations de vieillesse, d'invalidité et de décès, et la responsabilité en revient à l'employeur. À corriger même s'il part fin octobre : la période 2026 reste due.",
    ou: 'Portail Nest connect, ou la fiduciaire.',
  },
  {
    id: 'part-ijm', criticite: 'haute',
    quoi: "Ce qui est réellement retenu aux employés pour l'IJM",
    pourquoi: "Le contrat de travail prévoit une part employé sur l'IJM, mais les certificats de salaire 2025 n'en montrent aucune trace — le net s'y reconstitue au centime sans elle. L'un des deux ne correspond pas à la pratique. Tant que c'est ouvert, le coût employeur affiché ici est un plafond.",
    ou: 'Une fiche de salaire 2026.',
  },
  {
    id: 'scans', criticite: 'basse',
    quoi: 'Dix pièces sont des images sans texte',
    pourquoi: "Les décomptes de primes Smile 2023, le contrat Smile, les pièces Suva de 2022 et l'attestation de plainte n'ont pas de couche texte. Ils n'ont pas pu être dépouillés automatiquement — seulement lus à l'œil.",
    ou: 'Les repasser à l’OCR si leur contenu doit entrer ici.',
  },
]

/** Un contrat par son identifiant. */
export const contratParId = (id) => CONTRATS.find(c => c.id === id) || null

/** Les contrats en vigueur, dans l'ordre de la liste. */
export const contratsActifs = () => CONTRATS.filter(c => c.statut === 'actif')

/** Les contrats d'une famille ('social' ou 'assurance'), actifs et caducs. */
export const contratsFamille = (famille) =>
  famille ? CONTRATS.filter(c => c.famille === famille) : CONTRATS

/** Les couvertures rattachées à une famille, via leur contrat. */
export const couverturesFamille = (famille) => {
  if (!famille) return COUVERTURES
  return COUVERTURES.filter(c => {
    // Une couverture sans contrat est un TROU : il n'appartient à personne et
    // doit rester visible des deux côtés plutôt que de disparaître entre eux.
    if (!c.contrat) return true
    return contratParId(c.contrat)?.famille === famille
  })
}

/** Les obligations d'une famille. */
export const obligationsFamille = (famille) =>
  famille ? OBLIGATIONS.filter(o => contratParId(o.contrat)?.famille === famille) : OBLIGATIONS
