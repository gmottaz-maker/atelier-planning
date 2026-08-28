// Recherche libre de pièces à rapprocher à la main.
//
// Le rapprochement automatique ne propose que ce qu'il juge plausible. Quand il
// ne trouve rien — libellé bancaire opaque, montant partiel, facture saisie
// après coup — il n'y avait aucun moyen d'aller chercher la pièce soi-même et
// d'imposer le lien. Cette route sert cette recherche ; c'est `bank/match` qui
// écrit, comme pour une suggestion acceptée.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { loadCandidates } from '../../../lib/reconcileRun'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()
const LIMITE = 25

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Le texte cherché apparaît-il dans la pièce ? Nom, numéro, ou montant. */
function correspond(c, q) {
  if (!q) return true
  const champs = [c.supplier_name, c.client_name, c.merchant, c.invoice_number,
                  c.object, c.description, c.payment_reference, String(c.amount)]
  return champs.some(v => norm(v).includes(q))
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!(await requireAdmin(req, res))) return

  const { transaction_id, q } = req.query
  if (!transaction_id) return res.status(400).json({ error: 'transaction_id requis' })

  const { data: tx, error } = await supabase.from('bank_transactions')
    .select('id, amount').eq('id', transaction_id).maybeSingle()
  if (error) return erreurApi(req, res, 'internal', error, { route: 'bank/candidates' })
  if (!tx) return res.status(404).json({ error: 'Transaction introuvable' })

  const cands = await loadCandidates(supabase)
  const estCredit = parseFloat(tx.amount) > 0
  const recherche = norm(q).trim()

  // On renvoie les TROIS types, y compris ceux du mauvais sens : forcer un
  // rapprochement est le but de cet écran. Mais le sens inverse est signalé,
  // pour que l'utilisateur sache qu'il passe outre plutôt que de le découvrir
  // au journal — un crédit qui solde un frais est presque toujours une erreur.
  const paquets = [
    { type: 'supplier_invoice', liste: cands.supplier_invoices, sensAttendu: 'debit' },
    { type: 'customer_invoice', liste: cands.customer_invoices, sensAttendu: 'credit' },
    { type: 'expense',          liste: cands.expenses,          sensAttendu: 'debit' },
  ]

  const resultats = []
  for (const { type, liste, sensAttendu } of paquets) {
    const sensInverse = sensAttendu === 'credit' ? !estCredit : estCredit
    for (const c of liste) {
      if (!correspond(c, recherche)) continue
      resultats.push({
        type,
        sensInverse,
        ecart: Math.round((Math.abs(parseFloat(c.amount) || 0) - Math.abs(parseFloat(tx.amount))) * 100) / 100,
        candidate: c,
      })
    }
  }

  // Le plus proche du montant d'abord : sans recherche textuelle, c'est le
  // critère qui met la bonne pièce en tête.
  resultats.sort((a, b) => {
    if (a.sensInverse !== b.sensInverse) return a.sensInverse ? 1 : -1
    return Math.abs(a.ecart) - Math.abs(b.ecart)
  })

  return res.status(200).json({ candidates: resultats.slice(0, LIMITE), total: resultats.length })
}
