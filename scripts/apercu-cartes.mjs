#!/usr/bin/env node
// Rend une planche de cartes Kanban en PDF, avec des articles fictifs.
//
//   node scripts/apercu-cartes.mjs [fichier.pdf] [nombre de cartes]
//
// Ne touche ni à la base ni au réseau : c'est la géométrie qu'on vérifie —
// A4 PAYSAGE, quatre A6, repères de coupe, QR lisible à 20 mm, fonte de la
// maison. Un massicot ne pardonne pas un demi-millimètre, et une planche
// fausse ne se voit qu'une fois imprimée.
import { writeFileSync } from 'fs'
import QRCode from 'qrcode'
import { planches } from '../lib/economat.js'
import { feuillesCartesHtml, policesEmbarquees } from '../lib/economatCarte.js'

const sortie = process.argv[2] || 'apercu-cartes.pdf'
const combien = Number(process.argv[3] || 6)

const CATS = [
  { id: 1, nom: 'Fixation & quincaillerie', parent_id: null, couleur: '#A8C0DC' },
  { id: 2, nom: 'Visserie bois', parent_id: 1 },
  { id: 3, nom: 'Abrasifs', parent_id: null, couleur: '#D9B48F' },
  { id: 4, nom: 'Disques', parent_id: 3 },
  { id: 5, nom: 'EPI & sécurité', parent_id: null, couleur: '#F58F8F' },
  { id: 6, nom: 'Protection respiratoire', parent_id: 5 },
]

const FOURS = [
  { id: 10, nom: 'OPO' }, { id: 11, nom: 'qbendo.ch' }, { id: 12, nom: 'Galaxus' },
]

// Des cas réels du fichier repris de Numbers, y compris les plus encombrants :
// une désignation longue, un seuil écrit à la main, un article sans catégorie.
const MODELES = [
  { designation: 'Vis 4x16', categorie_id: 2, fournisseur_id: 10, reference: '85.175.4016',
    seuil_commander: 'Si inférieur à 100pce', quantite_commande: '1000pce',
    delai: 'Le lendemain si avant: 17h', emplacement: 'Rayonnage A · bac 3' },
  { designation: 'Cartouches filtrante 3M™ 6055 / A2 pour masques de protection de la respiration',
    categorie_id: 6, fournisseur_id: 10, reference: '29.469.11',
    seuil_bas: 'dernier paquet', seuil_commander: '2 paires', quantite_commande: '10pce',
    delai: 'Le lendemain si avant: 17h', emplacement: 'Armoire EPI' },
  { designation: 'Disque abrasif P80 Ø150', categorie_id: 4, fournisseur_id: 12,
    reference: 'GX-77120', seuil_bas: '½ boîte', seuil_commander: '~20 % restant',
    quantite_commande: '100pce', delai: '1 - 2 jours', emplacement: 'Établi ponçage' },
  { designation: 'Colliers de serrage, 200 x 2.5 mm, noirs', categorie_id: null,
    fournisseur_id: 11, reference: 'KBD-PA-000-051',
    seuil_commander: 'Si inférieur à 100pce', quantite_commande: '500pce', delai: 'Sous trois jours' },
]

const articles = Array.from({ length: combien }, (_, i) => ({
  id: i + 1,
  code: `ECO-${String(i + 1).padStart(4, '0')}`,
  jeton: Math.random().toString(36).slice(2, 14),
  ...MODELES[i % MODELES.length],
}))

const qrs = {}
for (const a of articles) {
  qrs[a.id] = await QRCode.toString(`https://mazeproject.amazinglab.ch/e/${a.jeton}`, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 0,
  })
}

const html = feuillesCartesHtml(planches(articles), { categories: CATS, fournisseurs: FOURS, qrs, polices: policesEmbarquees() })

// `attendre: 'load'` et non 'networkidle0' : tout est inliné ici, il n'y a
// aucune photo distante à attendre.
const { htmlToPdf } = await import('../lib/htmlToPdf.js')
const pdf = await htmlToPdf(html, null, { attendre: 'load' })
writeFileSync(sortie, pdf)
console.log(`${sortie} — ${articles.length} cartes, ${planches(articles).length} feuille(s), ${(pdf.length / 1024).toFixed(0)} ko`)
