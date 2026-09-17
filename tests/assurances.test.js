import { describe, it, expect } from 'vitest'
import {
  CONTRATS, COUVERTURES, OBLIGATIONS, EFFECTIF, MANQUES, VEHICULES, contratParId,
  contratsFamille, couverturesFamille, obligationsFamille,
} from '../lib/assurances'
import {
  primeLigne, coutContratPourPersonne, coutsParPersonne, coutsEntreprise,
  totalAnnuel, ecartFactureCalcule, chercherCouvertures, chercherObligations,
  sommeStricte, sommeConnue, normaliser, motsUtiles, effectifAu, projection,
} from '../lib/assurancesCalc'

const suva = contratParId('suva-laa')
const visana = contratParId('visana-ijm')
const nest = contratParId('nest-lpp')
const guillaume = EFFECTIF.find(p => p.nom === 'Guillaume')
const gabin = EFFECTIF.find(p => p.nom === 'Gabin')

describe('cohérence du dossier', () => {
  it('chaque couverture pointe un contrat qui existe, ou aucun', () => {
    for (const c of COUVERTURES) {
      if (c.contrat) expect(contratParId(c.contrat), `${c.id} → ${c.contrat}`).toBeTruthy()
      if (c.quiAppeler) expect(contratParId(c.quiAppeler), `${c.id} → ${c.quiAppeler}`).toBeTruthy()
    }
  })

  it('chaque obligation pointe un contrat existant et cite sa source', () => {
    for (const o of OBLIGATIONS) {
      expect(contratParId(o.contrat), o.id).toBeTruthy()
      expect(o.source, o.id).toBeTruthy()
    }
  })

  it('chaque contrat cite le fichier dont il sort', () => {
    for (const c of CONTRATS) expect(c.source, c.id).toBeTruthy()
  })

  it('un contrat caduc dit par quoi il est remplacé', () => {
    for (const c of CONTRATS.filter(x => x.statut === 'caduc')) {
      expect(c.remplacePar, c.id).toBeTruthy()
      expect(contratParId(c.remplacePar), c.id).toBeTruthy()
    }
  })

  it('un contrat véhicule pointe un véhicule qui existe', () => {
    // Invariant ajouté après coup : en renommant les véhicules, un contrat
    // était resté sur un identifiant disparu, et rien ne le disait.
    for (const c of CONTRATS) {
      if (!c.vehicule) continue
      expect(VEHICULES.find(v => v.id === c.vehicule), `${c.id} → ${c.vehicule}`).toBeTruthy()
    }
  })

  it('les identifiants sont uniques', () => {
    const ids = CONTRATS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    const cids = COUVERTURES.map(c => c.id)
    expect(new Set(cids).size).toBe(cids.length)
  })

  it('les quatre modules Helvetia font bien la prime annoncée', () => {
    const h = contratParId('helvetia-pme')
    const somme = h.modules.reduce((s, m) => s + m.prime, 0)
    // 2 701.20 de prime + 135.10 de droit de timbre = 2 836.30 facturés.
    expect(somme).toBeCloseTo(2701.20, 2)
    expect(h.primeFacturee).toBeCloseTo(somme + 135.10, 2)
  })
})

describe('sommes', () => {
  it('une somme stricte devient nulle dès qu’un terme manque', () => {
    expect(sommeStricte([1, 2, 3])).toBe(6)
    expect(sommeStricte([1, null, 3])).toBe(null)
    expect(sommeStricte([1, undefined])).toBe(null)
  })

  it('une somme connue additionne le reste et compte les trous', () => {
    expect(sommeConnue([10, null, 5])).toEqual({ total: 15, inconnus: 1 })
  })
})

describe('primes à taux', () => {
  it('AAP de Guillaume : 1,3147 % de 55 200', () => {
    const aap = suva.lignes.find(l => l.cle === 'aap')
    expect(primeLigne(aap, 55200, suva.salaireMaxAssure)).toBeCloseTo(725.71, 2)
  })

  it('le plafond du contrat s’applique avant le taux', () => {
    const aap = suva.lignes.find(l => l.cle === 'aap')
    // 200 000 dépassent le maximum LAA de 148 200 : la prime se calcule sur le plafond.
    expect(primeLigne(aap, 200000, 148200)).toBeCloseTo(148200 * 0.013147, 2)
  })

  it('le taux 2027 remplace celui de 2026 quand l’année le demande', () => {
    const aap = suva.lignes.find(l => l.cle === 'aap')
    expect(primeLigne(aap, 55200, 148200, 2027)).toBeCloseTo(55200 * 0.012110, 2)
    expect(primeLigne(aap, 55200, 148200, 2026)).toBeCloseTo(55200 * 0.013147, 2)
  })

  it('un salaire absent ou nul ne produit pas une prime de zéro', () => {
    const aap = suva.lignes.find(l => l.cle === 'aap')
    expect(primeLigne(aap, null)).toBe(null)
    expect(primeLigne(aap, 0)).toBe(null)
  })
})

describe('part employeur', () => {
  it('l’AAP est entièrement à la charge de l’employeur', () => {
    const c = coutContratPourPersonne(suva, guillaume)
    const aap = c.lignes.find(l => l.cle === 'aap')
    expect(aap.employeur).toBeCloseTo(aap.total, 2)
    expect(aap.employe).toBe(0)
  })

  it('l’AANP est entièrement patronale, preuve à l’appui', () => {
    // Démontré par les certificats de salaire 2025 : la ligne 9 vaut
    // exactement 6,400 % (AVS/AI/APG/AC), sans les 1,94 % de l'AANP.
    const c = coutContratPourPersonne(suva, guillaume)
    const aanp = c.lignes.find(l => l.cle === 'aanp')
    expect(aanp.employeur).toBeCloseTo(aanp.total, 2)
    expect(aanp.partInconnue).toBe(false)
  })

  it('l’IJM redevient inconnue quand deux pièces se contredisent', () => {
    // Le contrat de travail de Gabin prévoit une part employé, les certificats
    // 2025 n'en montrent aucune. On ne tranche pas à leur place : la prime
    // totale reste calculée, la répartition non.
    const v = coutContratPourPersonne(visana, guillaume)
    expect(v.total).toBeCloseTo(811.44, 2)
    expect(v.employeur).toBe(null)
    expect(v.lignes[0].partInconnue).toBe(true)
  })

  it('une part employeur non documentée reste nulle — jamais une moitié', () => {
    // Plus aucun contrat réel n'exerce cette règle depuis que les certificats
    // ont tranché. Elle reste l'invariant du module : on la garde sur un
    // contrat fictif, pour qu'un futur contrat mal documenté ne passe pas en
    // silence à moitié-moitié.
    const fictif = {
      id: 'x', statut: 'actif', assiette: 'salaire', salaireMaxAssure: null,
      lignes: [{ cle: 'x', intitule: 'Prime sans répartition connue', taux: 0.01, partEmployeur: null }],
    }
    const c = coutContratPourPersonne(fictif, guillaume)
    expect(c.lignes[0].total).toBeCloseTo(552, 2)
    expect(c.lignes[0].employeur).toBe(null)
    expect(c.lignes[0].partInconnue).toBe(true)
    expect(c.employeur).toBe(null)
  })

  it('la LPP est relevée sur la liste Nest, pas recalculée', () => {
    const c = coutContratPourPersonne(nest, gabin)
    expect(c.employeur).toBeCloseTo(1528.80, 2)
    expect(c.total).toBeCloseTo(3057.60, 2)
  })

  it('une personne absente de la liste Nest ne reçoit pas une cotisation inventée', () => {
    const inconnu = { nom: 'Personne', salaireAvs: 50000 }
    expect(coutContratPourPersonne(nest, inconnu)).toBe(null)
  })

  it('un contrat caduc ne coûte plus rien', () => {
    expect(coutContratPourPersonne(contratParId('helvetia-ijm'), guillaume)).toBe(null)
  })
})

describe('tableau par personne', () => {
  const lignes = coutsParPersonne()

  it('couvre tout l’effectif', () => {
    expect(lignes.map(l => l.personne)).toEqual(['Guillaume', 'Arnaud', 'Gabin'])
  })

  it('la part employeur de Guillaume, hors IJM non tranchée', () => {
    const g = lignes.find(l => l.personne === 'Guillaume')
    // AVS/AC/AF 5 285.40 + Suva 1 796.59 + LPP 2 004. L'IJM manque à l'appel.
    expect(g.employeurConnu).toBeCloseTo(9085.99, 2)
    expect(g.contratsIncertains).toBe(1)
  })

  it('les allocations familiales d’Arnaud ne gonflent pas son assiette', () => {
    const a = EFFECTIF.find(p => p.nom === 'Arnaud')
    // Son certificat porte 59 042 de brut, dont 3 842 d'allocations — non
    // soumises à l'AVS, donc hors assiette de prime. Prendre le brut ferait
    // payer des primes sur de l'argent qui n'en produit pas.
    expect(a.salaireBrutCertificat).toBe(59042)
    expect(a.salaireAvs).toBe(55200)
    const arnaud = lignes.find(l => l.personne === 'Arnaud')
    const g = lignes.find(l => l.personne === 'Guillaume')
    expect(arnaud.employeurConnu).toBeCloseTo(g.employeurConnu, 2)
  })

  it('la charge sur salaire se calcule sur le connu', () => {
    const g = lignes.find(l => l.personne === 'Guillaume')
    // Plus de 16 % du salaire, et ce n'est qu'un plancher : l'IJM s'y ajoutera.
    expect(g.chargeSurSalaire).toBeCloseTo((9085.99 / 55200) * 100, 1)
  })

  it('Gabin est bien dans les quatre contrats liés au salaire', () => {
    const gab = lignes.find(l => l.personne === 'Gabin')
    expect(gab.parContrat.map(c => c.contrat)).toEqual(['avs-caf', 'suva-laa', 'visana-ijm', 'nest-lpp'])
  })

  it('la part salariale AVS vaut exactement les 6,40 % des certificats', () => {
    const g = lignes.find(l => l.personne === 'Guillaume')
    const avs = g.parContrat.find(c => c.contrat === 'avs-caf')
    // 5,30 (AVS/AI/APG) + 1,10 (chômage). C'est ce recoupement entre le
    // décompte de la caisse et la ligne 9 du certificat qui prouve qu'aucune
    // retenue AANP ni IJM ne touche le salaire.
    expect(avs.employe).toBeCloseTo(55200 * 0.064, 1)
  })
})

describe('total annuel', () => {
  const t = totalAnnuel()

  it('se déclare incomplet tant que la part IJM n’est pas tranchée', () => {
    expect(t.incomplet).toBe(true)
    // Une ligne par personne : l'IJM, et elle seule.
    expect(t.personnes.inconnus).toBe(3)
  })

  it('additionne les primes d’entreprise, toutes connues', () => {
    // Helvetia 2 836.30 + Master en leasing 2 285.50 + Vito 1 004.80 + TCS 214.00
    expect(t.entreprise.primes).toBeCloseTo(6340.60, 2)
    expect(t.entreprise.inconnus).toBe(0)
  })

  it('ne compte pas les contrats caducs dans les primes d’entreprise', () => {
    const ids = coutsEntreprise().map(e => e.contrat)
    expect(ids).not.toContain('zurich-rc')
    expect(ids).not.toContain('zurich-biens')
    // L'ancien Master est remplacé : sa prime ne doit plus être comptée deux fois.
    expect(ids).not.toContain('smile-master-2025')
    expect(ids).toContain('smile-master-2026')
  })
})

describe('effectif à une date donnée', () => {
  it('Gabin compte aujourd’hui, plus en novembre 2026', () => {
    expect(effectifAu('2026-09-17').map(p => p.nom)).toContain('Gabin')
    expect(effectifAu('2026-11-01').map(p => p.nom)).not.toContain('Gabin')
  })

  it('Gabin ne comptait pas avant son entrée de novembre 2025', () => {
    expect(effectifAu('2025-10-01').map(p => p.nom)).not.toContain('Gabin')
  })

  it('son dernier jour couvert compte encore', () => {
    expect(effectifAu('2026-10-31').map(p => p.nom)).toContain('Gabin')
  })

  it('après octobre 2026, il ne reste qu’Arnaud et Guillaume', () => {
    const p = projection('2026-11-01')
    expect(p.effectif.sort()).toEqual(['Arnaud', 'Guillaume'])
    expect(p.masseSalariale).toBe(110400)
    // Le total doit baisser : une personne de moins, une masse plus petite.
    expect(p.total).toBeLessThan(totalAnnuel().personnes.total)
  })
})

describe('véhicules après le changement de Master', () => {
  it('le Master en leasing a la casco complète, avec 1 000 de franchise', () => {
    const c = COUVERTURES.find(x => x.id === 'accident-responsable')
    // Ce n'est plus un « non » sec : le Master est couvert, le Vito ne l'est pas.
    expect(c.couvert).toBe('partiel')
    expect(c.franchise).toContain('1 000')
  })

  it('l’ancienne couverture du Master est caduque et renvoie à la nouvelle', () => {
    // Même véhicule, deux couvertures successives : la casco partielle a
    // cédé la place à la casco complète qu'impose le leasing.
    const ancien = contratParId('smile-master-partielle')
    expect(ancien.statut).toBe('caduc')
    expect(ancien.remplacePar).toBe('smile-master-2026')
    expect(ancien.vehicule).toBe(contratParId('smile-master-2026').vehicule)
  })

  it('la nouvelle prime Master est bien celle de l’offre validée', () => {
    const m = contratParId('smile-master-2026')
    // 496.90 + 1 567.50 + 66.00 + 41.60 = 2 172.00, plus 113.50 de taxes.
    expect(m.primeFacturee).toBeCloseTo(2172.00 + 113.50, 2)
    expect(m.statut).toBe('actif')
  })

  it('les effets personnels sont couverts sur les DEUX véhicules actuels', () => {
    const c = COUVERTURES.find(x => x.id === 'effets-personnels')
    expect(c.couvert).toBe('partiel')
    expect(c.plafond).toContain('2 000')
  })
})

describe('écart entre prime facturée et prime réelle', () => {
  it('la Suva 2026 est facturée sur une masse plus large que les salaires réels', () => {
    const e = ecartFactureCalcule(suva)
    // La masse AVS projetée depuis le 3e trimestre 2026 (43 566 × 4), et NON
    // la somme des salaires déclarés à Nest.
    expect(e.masseReelle).toBe(174264)
    expect(e.masseLpp).toBe(170400)
    expect(e.estimee).toBe(true)
    expect(e.masseFacturee).toBe(195000)
    // Un trop-perçu, donc un écart positif à récupérer au décompte définitif.
    expect(e.ecart).toBeGreaterThan(0)
    // Chaque ligne est arrondie au centime avant la somme, d'où le demi-centime
    // d'écart avec le produit exact.
    expect(e.calcule).toBeCloseTo(174264 * (0.013147 + 0.0194), 1)
  })
})

describe('boîte à questions', () => {
  it('normalise accents, apostrophes et ponctuation', () => {
    expect(normaliser("J’ai cassé l'établi !")).toBe('j ai casse l etabli')
  })

  it('écarte les mots vides', () => {
    expect(motsUtiles('un client ne paie pas sa facture')).toContain('client')
    expect(motsUtiles('un client ne paie pas sa facture')).not.toContain('pas')
  })

  it('un vol sur chantier renvoie la sous-limite de vol simple', () => {
    const r = chercherCouvertures('on m’a volé de l’outillage sur un chantier')
    expect(r[0].id).toBe('vol-atelier')
    expect(r[0].couvert).toBe('partiel')
  })

  it('un arrêt maladie renvoie l’IJM et son délai d’attente', () => {
    const r = chercherCouvertures('un collaborateur est en arrêt maladie depuis trois semaines')
    expect(r.map(x => x.id)).toContain('maladie-perte-gain')
  })

  it('un accident en tort distingue le Master du Vito', () => {
    const r = chercherCouvertures('j’ai accroché une voiture avec le Master, c’est ma faute')
    expect(r.map(x => x.id)).toContain('accident-responsable')
    // Depuis avril 2026 la réponse dépend du véhicule : « partiel », pas « non ».
    const c = r.find(x => x.id === 'accident-responsable')
    expect(c.couvert).toBe('partiel')
    expect(c.detail).toMatch(/vito/i)
  })

  it('une facture impayée renvoie la protection juridique, pas une assurance-crédit', () => {
    const r = chercherCouvertures('un client ne paie pas sa facture')
    expect(r[0].id).toBe('impaye')
    expect(r[0].couvert).toBe('partiel')
  })

  it('une question sans rapport ne renvoie rien plutôt que n’importe quoi', () => {
    expect(chercherCouvertures('quel temps fait-il demain')).toEqual([])
    expect(chercherCouvertures('')).toEqual([])
  })

  it('chaque réponse porte le contact à appeler', () => {
    const r = chercherCouvertures('incendie à l’atelier')
    expect(r[0].contactDetail?.nom).toBeTruthy()
  })

  it('les produits chimiques ramènent l’autocontrôle Suva en retard', () => {
    const o = chercherObligations('on utilise des produits chimiques à l’atelier', OBLIGATIONS)
    expect(o.map(x => x.id)).toContain('autocontrole-chimiques')
  })
})

describe('leasing du Master', () => {
  it('une perte totale ramène la lacune GAP, pas une réponse rassurante', () => {
    const r = chercherCouvertures('le Master est parti à la casse, perte totale')
    expect(r.map(x => x.id)).toContain('gap-leasing')
    // « À vérifier » et non « couvert » : aucune pièce ne dit que le solde du
    // leasing est payé, et affirmer le contraire coûterait cher au sinistre.
    expect(r.find(x => x.id === 'gap-leasing').couvert).toBe('verifier')
  })

  it('un sinistre du Master rappelle la double déclaration', () => {
    const o = chercherObligations('accident avec le Master, sinistre à déclarer', OBLIGATIONS)
    expect(o.map(x => x.id)).toContain('sinistre-leasing')
  })

  it('le départ de Gabin est une obligation d’annonce, pas seulement une date', () => {
    const o = chercherObligations('Gabin part, licenciement, que faut-il annoncer', OBLIGATIONS)
    expect(o.map(x => x.id)).toContain('sortie-gabin')
  })
})

describe('séparation des deux outils', () => {
  it('chaque contrat appartient à une famille et une seule', () => {
    for (const c of CONTRATS) {
      expect(['social', 'assurance'], c.id).toContain(c.famille)
    }
    const social = contratsFamille('social').map(c => c.id)
    const assurance = contratsFamille('assurance').map(c => c.id)
    expect(social.length + assurance.length).toBe(CONTRATS.length)
    expect(social.filter(id => assurance.includes(id))).toEqual([])
  })

  it('l’AVS, la Suva et la LPP sont des charges sociales', () => {
    const ids = contratsFamille('social').map(c => c.id)
    expect(ids).toEqual(['avs-caf', 'suva-laa', 'nest-lpp'])
  })

  it('l’IJM est rangée du côté assurance : elle se résilie', () => {
    expect(contratParId('visana-ijm').famille).toBe('assurance')
  })

  it('un trou sans contrat reste visible des DEUX côtés', () => {
    // Sinon il disparaîtrait entre les deux écrans, ce qui est exactement
    // l'inverse du but : un risque non couvert doit se voir partout.
    const orphelins = COUVERTURES.filter(c => !c.contrat).map(c => c.id)
    expect(orphelins.length).toBeGreaterThan(0)
    for (const id of orphelins) {
      expect(couverturesFamille('social').map(c => c.id)).toContain(id)
      expect(couverturesFamille('assurance').map(c => c.id)).toContain(id)
    }
  })

  it('les deux familles se partagent les obligations sans en perdre', () => {
    const a = obligationsFamille('social').length
    const b = obligationsFamille('assurance').length
    expect(a + b).toBe(OBLIGATIONS.length)
  })

  it('les coûts des deux outils, additionnés, font le total général', () => {
    const social = totalAnnuel({ famille: 'social' })
    const assurance = totalAnnuel({ famille: 'assurance' })
    const tout = totalAnnuel()
    expect(social.employeur + assurance.employeur).toBeCloseTo(tout.employeur, 2)
  })
})

describe('manques', () => {
  it('sont classés et expliqués', () => {
    expect(MANQUES.length).toBeGreaterThan(0)
    for (const m of MANQUES) {
      expect(['haute', 'moyenne', 'basse']).toContain(m.criticite)
      expect(m.pourquoi, m.id).toBeTruthy()
      expect(m.ou, m.id).toBeTruthy()
    }
  })
})
