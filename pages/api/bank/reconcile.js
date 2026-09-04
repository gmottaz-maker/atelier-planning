// Relance le rapprochement automatique SANS importer de relevé.
//
// Jusqu'ici il ne tournait qu'à l'import CAMT. Or il balaie toutes les
// transactions non rapprochées, pas seulement celles du fichier : une pièce
// saisie après coup, ou une correction du moteur de rapprochement, ne se
// répercutait donc qu'au relevé suivant. C'est exactement ce qui s'est passé
// quand les factures clientes sont redevenues rapprochables — l'arriéré serait
// resté en attente jusqu'au prochain CAMT.
//
// L'opération n'établit que des liens, elle n'en défait aucun, et
// `reconcile_match` refuse une transaction déjà rapprochée ou une facture déjà
// payée. La relancer deux fois de suite est donc sans effet.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { reconcileTransactions } from '../../../lib/reconcileRun'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    const { reconciled, ambiguous } = await reconcileTransactions(supabase, admin?.name)
    return res.status(200).json({ reconciled, ambiguous })
  } catch (e) {
    return erreurApi(req, res, 'internal', e, { route: 'bank/reconcile' })
  }
}
