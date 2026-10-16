import { fetchTimeout } from './fetchTimeout'
// Helper kDrive (Infomaniak API v2)
// Doc: https://developer.infomaniak.com/

const BASE     = 'https://api.infomaniak.com/2/drive'
const TOKEN    = process.env.KDRIVE_TOKEN
const DRIVE_ID = process.env.KDRIVE_DRIVE_ID
// id du dossier "02. Projets" dans amazing files
const PROJECTS_ROOT_ID = 11480
// id du dossier "amazing files" (parent commun)
const AMAZING_FILES_ID = 7802
// id du dossier "00. Admin" — le SEUL ancrage de l'administratif.
//
// Les deux dossiers de dépôt étaient visés par leur propre id (37796, 37797).
// Ces ids appartenaient à l'ancien « 00. Admin », renommé « 20. Admin Backup »
// le jour où sa copie réorganisée a pris sa place : le code a continué d'y
// écrire pendant des mois, sans qu'aucune erreur ne le dise, puisque les
// dossiers existaient toujours. 234 pièces se sont rangées dans un backup.
//
// D'où la règle : on ancre une RACINE, on résout le reste par NOM.
const ADMIN_ID = 53682

function checkEnv() {
  if (!TOKEN || !DRIVE_ID) {
    throw new Error('kDrive: variables manquantes (KDRIVE_TOKEN, KDRIVE_DRIVE_ID)')
  }
}

function headers(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, ...extra }
}

async function kfetch(path, init = {}) {
  checkEnv()
  const r = await fetchTimeout(`${BASE}/${DRIVE_ID}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  })
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('json')) {
    const t = await r.text()
    throw new Error(`kDrive: réponse non-JSON (HTTP ${r.status}) — ${t.substring(0, 150)}`)
  }
  const data = await r.json()
  if (data.result !== 'success') {
    throw new Error(`kDrive: ${data.error?.description || JSON.stringify(data.error)}`)
  }
  return data.data
}

// ── Lecture ──────────────────────────────────────────────────────────────────

export async function listDir(dirId, page = 1, perPage = 200) {
  return kfetch(`/files/${dirId}/files?per_page=${perPage}&page=${page}`)
}

export async function findChildByName(parentId, name) {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const target = norm(name)
  const items = await listDir(parentId, 1, 200)
  return items.find(f => norm(f.name) === target) || null
}

// ── Écriture ─────────────────────────────────────────────────────────────────

export async function createDir(parentId, name) {
  return kfetch(`/files/${parentId}/directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function findOrCreateChild(parentId, name) {
  const existing = await findChildByName(parentId, name)
  if (existing && existing.type === 'dir') return existing
  return createDir(parentId, name)
}

// Cherche ou crée la hiérarchie 02. Projets / <client> / <project>
// Retourne l'id du dossier projet.
// Ce qu'on répond quand un projet n'a pas de dossier et qu'on voulait y
// déposer quelque chose.
//
// Le dossier n'est PLUS créé au passage : un projet sans dossier en est un, et
// certains chantiers — une intervention d'une heure — n'ont aucun fichier. La
// création silencieuse semait des dossiers vides que personne ne rangeait.
// C'est donc un geste, pas un effet de bord : « choisir un dossier » ou « créer
// le dossier », depuis la fiche projet.
export const SANS_DOSSIER = 'Ce projet n\'a pas de dossier kDrive. Choisis-en un, ou crée-le depuis la fiche du projet.'

export async function ensureProjectFolder(client, projectName) {
  const c = (client && client.trim()) || 'Sans client'
  const p = (projectName && projectName.trim()) || 'Sans nom'
  const clientDir  = await findOrCreateChild(PROJECTS_ROOT_ID, c)
  const projectDir = await findOrCreateChild(clientDir.id, p)
  return projectDir.id
}

/**
 * Un dossier qui doit DÉJÀ exister. S'il manque, on crie.
 *
 * C'est la vraie leçon de la panne des ids en dur : ce qui tue, ce n'est pas
 * l'erreur, c'est le silence. `findOrCreateChild` appliqué à un dossier de
 * STRUCTURE — « Finances », « Comptabilité » — en recrée un vide dès que
 * l'original est renommé ou déplacé, et les pièces s'empilent dans un arbre
 * fantôme sans que personne ne le voie. C'est ainsi que 234 documents se sont
 * rangés dans un backup pendant des mois.
 *
 * Un dépôt qui échoue en annonçant pourquoi est réparable en deux minutes.
 * Deux cents documents mal classés en silence coûtent une journée.
 */
async function dossierExistant(parentId, nom, chemin) {
  const t = await findChildByName(parentId, nom)
  if (!t || t.type !== 'dir') {
    throw new Error(
      `kDrive: dossier « ${chemin} » introuvable. Il a dû être renommé ou déplacé — ` +
      'corrige le chemin dans lib/kdrive.js plutôt que de recréer un dossier à côté.'
    )
  }
  return t
}

/**
 * Cherche ou crée
 * "00. Admin / Finances / Comptabilité / Comptabilité <année> / Justificatifs
 * comptables / T<trimestre>".
 *
 * UNE SEULE destination pour toutes les pièces d'achat — justificatifs comme
 * factures fournisseurs. Elles ont d'abord été rangées dans deux branches
 * séparées (`Factures fournisseurs/` et `Justificatifs/`), puis fusionnées
 * ici par le reclassement d'octobre 2026 : un contrôle fiscal porte sur un
 * EXERCICE, pas sur la façon dont une pièce est arrivée chez nous, et chercher
 * un achat dans deux branches selon qu'il portait un numéro de facture était
 * une distinction pour nous, pas pour le contrôleur.
 *
 * `CONSIGNES-MAZE-PROJECT.md` (dans `_Gestion/`) fait foi, et prévient : si
 * `Factures fournisseurs/` ou `Justificatifs/` réapparaissent, c'est que ce
 * code écrit au mauvais endroit.
 *
 * L'année vient de la date du DOCUMENT (cf. `quarterOf`), pas de celle du
 * scan : une facture de décembre numérisée en janvier appartient à l'exercice
 * de décembre, et c'est le seul classement qu'un comptable accepte.
 *
 * Deux régimes, et la frontière est voulue :
 *   — `Finances` et `Comptabilité` sont la STRUCTURE : elles existent, ou on
 *     refuse de déposer ;
 *   — l'année, la branche et le trimestre se CRÉENT à la demande. En janvier,
 *     « Comptabilité 2027 » n'existe pas encore, et c'est normal.
 */
export const BRANCHE_PIECES = 'Justificatifs comptables'

async function ensureComptaFolder(year, quarter) {
  const finances = await dossierExistant(ADMIN_ID, 'Finances', '00. Admin / Finances')
  const compta   = await dossierExistant(finances.id, 'Comptabilité', '00. Admin / Finances / Comptabilité')
  const yearDir  = await findOrCreateChild(compta.id, `Comptabilité ${year}`)
  const brDir    = await findOrCreateChild(yearDir.id, BRANCHE_PIECES)
  const qDir     = await findOrCreateChild(brDir.id, `T${quarter}`)
  return qDir.id
}

// Les deux portes d'entrée restent distinctes — l'une sert les factures
// fournisseurs, l'autre les justificatifs — mais elles mènent au MÊME dossier.
// Les garder séparées laisse la porte ouverte à une divergence future sans
// retoucher les deux routes qui les appellent.
export function ensureSupplierInvoiceFolder(year, quarter) {
  return ensureComptaFolder(year, quarter)
}

export function ensureReceiptFolder(year, quarter) {
  return ensureComptaFolder(year, quarter)
}

// Cherche ou crée "Factures émises / <année>" sous amazing files.
export async function ensureCustomerInvoiceFolder(year) {
  const root  = await findOrCreateChild(AMAZING_FILES_ID, 'Factures émises')
  const yearDir = await findOrCreateChild(root.id, String(year))
  return yearDir.id
}

export async function upload(dirId, filename, buffer, mimeType) {
  checkEnv()
  const params = new URLSearchParams({
    directory_id: String(dirId),
    file_name: filename,
    total_size: String(buffer.length),
    conflict: 'rename',
  })
  const r = await fetchTimeout(`${BASE}/${DRIVE_ID}/upload?${params}`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': mimeType || 'application/octet-stream' },
    body: buffer,
  })
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('json')) {
    const t = await r.text()
    throw new Error(`kDrive upload: réponse non-JSON (HTTP ${r.status}) — ${t.substring(0, 150)}`)
  }
  const data = await r.json()
  if (data.result !== 'success') {
    throw new Error(`kDrive upload: ${data.error?.description || JSON.stringify(data.error)}`)
  }
  return data.data
}

export async function del(fileId) {
  return kfetch(`/files/${fileId}`, { method: 'DELETE' })
}

// Renvoie un stream pour proxy le download (le endpoint kDrive renvoie un 302
// vers une URL signée — fetch suit automatiquement la redirection).
export async function downloadStream(fileId) {
  checkEnv()
  const r = await fetchTimeout(`${BASE}/${DRIVE_ID}/files/${fileId}/download`, {
    headers: headers(),
    redirect: 'follow',
  })
  if (!r.ok) throw new Error(`kDrive download: HTTP ${r.status}`)
  return r
}

export async function thumbnailStream(fileId) {
  checkEnv()
  const r = await fetchTimeout(`${BASE}/${DRIVE_ID}/files/${fileId}/thumbnail`, {
    headers: headers(),
    redirect: 'follow',
  })
  if (!r.ok) throw new Error(`kDrive thumbnail: HTTP ${r.status}`)
  return r
}
