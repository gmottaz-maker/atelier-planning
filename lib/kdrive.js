// Helper kDrive (Infomaniak API v2)
// Doc: https://developer.infomaniak.com/

const BASE     = 'https://api.infomaniak.com/2/drive'
const TOKEN    = process.env.KDRIVE_TOKEN
const DRIVE_ID = process.env.KDRIVE_DRIVE_ID
// id du dossier "02. Projets" dans amazing files
const PROJECTS_ROOT_ID = 11480
// id du dossier "amazing files" (parent commun)
const AMAZING_FILES_ID = 7802
// id du dossier "00. Admin / 00. Claude Finance / Factures fournisseurs"
const SUPPLIER_INVOICES_ID = 37796

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
  const r = await fetch(`${BASE}/${DRIVE_ID}${path}`, {
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
export async function ensureProjectFolder(client, projectName) {
  const c = (client && client.trim()) || 'Sans client'
  const p = (projectName && projectName.trim()) || 'Sans nom'
  const clientDir  = await findOrCreateChild(PROJECTS_ROOT_ID, c)
  const projectDir = await findOrCreateChild(clientDir.id, p)
  return projectDir.id
}

// Cherche ou crée "<année> / T<trimestre>" sous 00. Claude Finance / Factures fournisseurs.
export async function ensureSupplierInvoiceFolder(year, quarter) {
  const yearDir = await findOrCreateChild(SUPPLIER_INVOICES_ID, String(year))
  const qDir    = await findOrCreateChild(yearDir.id, `T${quarter}`)
  return qDir.id
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
  const r = await fetch(`${BASE}/${DRIVE_ID}/upload?${params}`, {
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
  const r = await fetch(`${BASE}/${DRIVE_ID}/files/${fileId}/download`, {
    headers: headers(),
    redirect: 'follow',
  })
  if (!r.ok) throw new Error(`kDrive download: HTTP ${r.status}`)
  return r
}

export async function thumbnailStream(fileId) {
  checkEnv()
  const r = await fetch(`${BASE}/${DRIVE_ID}/files/${fileId}/thumbnail`, {
    headers: headers(),
    redirect: 'follow',
  })
  if (!r.ok) throw new Error(`kDrive thumbnail: HTTP ${r.status}`)
  return r
}
