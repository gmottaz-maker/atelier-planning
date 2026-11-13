// La navigation de Maze, une seule fois.
//
// La barre latérale, la barre du bas du téléphone et la recherche lisent
// TOUTES cette liste : deux listes de navigation divergent au premier ajout,
// et c'est comme ça que dix-huit pages étaient devenues injoignables au doigt.
//
// Les rubriques suivent la fréquence : ce qu'on ouvre en travaillant, ce que
// chacun saisit pour soi (« Mon temps »), puis la gestion, réservée à l'admin.

import { chercherProjets } from './projectHelpers'
import { normalize } from './textSearch'

export const RUBRIQUES = [
  { cle: 'travail', nom: null, items: [
    { href: '/home', nom: 'Accueil', icone: 'accueil' },
    { href: '/', nom: 'Projets', icone: 'projets', aussi: ['/projects'], compte: 'projets' },
    { href: '/tasks', nom: 'Tâches', icone: 'taches', compte: 'taches' },
    { href: '/agenda', nom: 'Agenda', icone: 'agenda' },
    { href: '/meeting', nom: 'Réunion', icone: 'reunion' },
    { href: '/outils', nom: 'Outils', icone: 'outils', aussi: ['/peintures'] },
  ] },
  { cle: 'temps', nom: 'Mon temps', icone: 'temps', items: [
    { href: '/schedule', nom: 'Horaires' },
    { href: '/heures', nom: 'Heures' },
    { href: '/frais', nom: 'Frais' },
  ] },
  { cle: 'gestion', nom: 'Gestion', icone: 'gestion', admin: true, items: [
    { href: '/finances', nom: 'Tableau de bord' },
    { href: '/clients', nom: 'Contacts' },
    { href: '/prospects', nom: 'Prospects' },
    { href: '/catalog', nom: 'Catalogue' },
    { href: '/stockage', nom: 'Stockage' },
  ] },
  { cle: 'clients', nom: 'Finances clients', icone: 'clients', admin: true, items: [
    { href: '/offres', nom: 'Offres' },
    { href: '/factures-emises', nom: 'Factures sortantes' },
  ] },
  { cle: 'internes', nom: 'Finances internes', icone: 'internes', admin: true, items: [
    { href: '/factures-fournisseurs', nom: 'Factures entrantes' },
    { href: '/justificatifs', nom: 'Justificatifs' },
    { href: '/banque', nom: 'Transactions bancaires' },
    { href: '/compta', nom: 'Compta' },
  ] },
  { cle: 'reporting', nom: 'Reporting', icone: 'reporting', admin: true, items: [
    { href: '/planning', nom: 'Charge de l’atelier' },
    { href: '/activity', nom: 'Journal d’activité' },
  ] },
]

export const COMPTE = [
  { href: '/settings', nom: 'Réglages' },
  { href: '/display', nom: 'Écran de l’atelier', externe: true },
]

// Pendant la refonte, les écrans redessinés vivent à côté des anciens
// (`…/essai`). La navigation y mène, pour qu'on parcoure le nouveau design
// d'un bout à l'autre ; chaque page d'essai garde un lien vers l'ancienne.
// À retirer quand les essais remplacent les pages.
export const PAGES_ESSAI = {
  '/home': '/home/essai',
  '/': '/projects/essai',
  '/tasks': '/tasks/essai',
  '/agenda': '/agenda/essai',
  '/meeting': '/meeting/essai',
  '/outils': '/outils/essai',
  '/outils/annuaire': '/outils/annuaire/essai',
  '/outils/charges-sociales': '/outils/charges-sociales/essai',
  '/outils/assurances': '/outils/assurances/essai',
  '/outils/marge-km': '/outils/marge-km/essai',
}
// Faux depuis le 13 novembre 2026 : le rail mène aux pages ACTUELLES.
//
// Le redesign est déployé et reste joignable à la main (`/projects/essai`,
// `/home/essai`, …), mais il n'est pas l'interface de travail : l'éditeur
// d'offre n'y est pas encore utilisable, et une navigation qui y mène
// partout en fait le défaut sans que personne l'ait décidé. Le rail, lui,
// est retenu — c'est la seule partie du redesign qui a remplacé l'existant.
//
// Repasser à `true` quand les essais seront prêts à prendre la place : c'est
// ce drapeau, et rien d'autre, qui fait la bascule.
export const ESSAIS_DANS_LA_NAV = false

export const lienDe = href => (ESSAIS_DANS_LA_NAV && PAGES_ESSAI[href]) || href

/** L'entrée correspond-elle à la page ouverte ? (ancienne page ou essai) */
export function estActif(item, chemin) {
  if (!chemin) return false
  if (item.href === '/') return chemin === '/' || chemin.startsWith('/projects')
  return [item.href, ...(item.aussi || [])].some(h => chemin === h || chemin.startsWith(`${h}/`))
}

export const rubriquesVisibles = isAdmin => RUBRIQUES.filter(r => isAdmin || !r.admin)

/** La rubrique qui contient la page ouverte. */
export const rubriqueActive = (chemin, isAdmin) =>
  rubriquesVisibles(isAdmin).find(r => r.items.some(i => estActif(i, chemin)))?.cle || null

/**
 * La recherche du ⌘K : pages et projets, les pages d'abord. Un numéro de
 * projet (« 147 ») sort le projet en tête, c'est ce qu'on tape le plus.
 */
export function chercher(q, { projets = [], isAdmin = false, limite = 8 } = {}) {
  const requete = String(q || '').trim()
  if (!requete) return []
  const n = normalize(requete)
  const pages = [...rubriquesVisibles(isAdmin).flatMap(r => r.items.map(i => ({ ...i, rubrique: r.nom }))), ...COMPTE]
    .filter(i => normalize(i.nom).split(/\s+/).some(m => m.startsWith(n)) || normalize(i.nom).startsWith(n))
    .map(i => ({ genre: 'page', cle: `page-${i.href}`, nom: i.nom, detail: i.rubrique || '', href: lienDe(i.href), externe: i.externe }))
  const trouves = chercherProjets(projets, requete)
    .sort((a, b) => (String(b.numero) === requete) - (String(a.numero) === requete) || (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || (Number(b.numero) || 0) - (Number(a.numero) || 0))
    .map(p => ({ genre: 'projet', cle: `projet-${p.id}`, numero: p.numero, nom: p.name, detail: [p.client, p.status === 'active' ? null : 'archivé'].filter(Boolean).join(' · '), href: `/projects/${p.id}/essai` }))
  const premierNumero = trouves[0] && String(trouves[0].numero) === requete
  return (premierNumero ? [...trouves, ...pages] : [...pages, ...trouves]).slice(0, limite)
}
