// Apprentissage commerçant → compte comptable.
// Le rapprochement se fait sur un nom de commerçant normalisé (sans accents,
// sans forme juridique, sans ponctuation), pour unifier « Migros », « MIGROS »
// et « Migros Genève » sans risquer de fausses fusions.

export function merchantKey(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // formes juridiques et suffixes web, en tant que mots isolés
    .replace(/\b(sarl|sagl|sa|ag|gmbh|ltd|inc|llc|co|group|holding)\b/g, ' ')
    .replace(/\.(ch|com|fr|de|net|org)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

// Mémorise (ou renforce) l'association commerçant → compte.
export async function learnMerchantAccount(supabase, merchant, account) {
  const key = merchantKey(merchant)
  if (!key || !account) return
  const { data: existing } = await supabase.from('merchant_accounts')
    .select('uses, account').eq('merchant_key', key).maybeSingle()
  await supabase.from('merchant_accounts').upsert({
    merchant_key: key,
    merchant_label: merchant,
    account,
    // on renforce le compteur tant que le compte ne change pas ; un changement
    // de compte repart d'une occurrence (la dernière décision fait foi)
    uses: existing && existing.account === account ? (existing.uses || 1) + 1 : 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'merchant_key' })
}

// Renvoie le compte appris pour ce commerçant, ou null.
export async function lookupMerchantAccount(supabase, merchant) {
  const key = merchantKey(merchant)
  if (!key) return null
  const { data } = await supabase.from('merchant_accounts')
    .select('account').eq('merchant_key', key).maybeSingle()
  return data?.account || null
}
