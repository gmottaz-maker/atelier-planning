// Génération d'URLs signées pour les reçus (bucket privé `receipts`).
//
// Le bucket a été passé en privé (voir schema-security-lockdown.sql) : les
// anciennes URLs `/object/public/...` étaient devinables sans authentification.
// On signe désormais chaque URL côté serveur (client service-role) avec une
// durée de vie courte. Le lien reste utilisable dans un <img src>/<a href>
// sans header, mais expire.

const BUCKET = 'receipts'
const SIGNED_TTL = 60 * 60 // 1 h — suffit pour l'affichage, limite le partage

/**
 * Ajoute `receipt_url` (URL signée) à chaque ligne possédant `receipt_path`.
 * Signe en une seule requête via createSignedUrls.
 */
export async function withSignedReceipts(supabase, rows) {
  const list = Array.isArray(rows) ? rows : []
  const paths = list.map(r => r.receipt_path).filter(Boolean)
  if (paths.length === 0) {
    return list.map(r => ({ ...r, receipt_url: null }))
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_TTL)
  if (error) {
    // En cas d'échec on renvoie null plutôt qu'un lien cassé/public
    return list.map(r => ({ ...r, receipt_url: null }))
  }

  const byPath = new Map()
  for (const item of data || []) {
    if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl)
  }
  return list.map(r => ({
    ...r,
    receipt_url: r.receipt_path ? (byPath.get(r.receipt_path) || null) : null,
  }))
}

/** Version pour une seule ligne. */
export async function withSignedReceipt(supabase, row) {
  const [out] = await withSignedReceipts(supabase, [row])
  return out
}
