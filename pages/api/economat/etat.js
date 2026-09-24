// Le geste central de l'économat : basculer 🟢 🟠 🔴 🔵.
//
// UNE SEULE route l'écrit, et c'est délibéré : le changement d'état ouvre et
// ferme aussi le journal des commandes. Laisser le PUT du catalogue écrire
// `etat` en passant aurait produit des états sans historique, découverts le
// jour où l'on cherche « on l'a commandé quand, déjà ? ».
//
// L'article se désigne par son `id` (écran du catalogue) OU par son `jeton`
// (carte scannée). Le jeton n'est pas un droit : la route exige un compte
// comme toutes les autres — il ne fait qu'identifier l'article sans exposer
// d'identifiant énumérable sur une carte imprimée.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { ETAT_CLES } from '../../../lib/economat'

const supabase = getSupabaseServer()

const CHAMPS = `id, code, jeton, designation, fournisseur_id, reference, quantite_commande, etat, etat_le`

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const etat = String(req.body?.etat || '')
  // Toutes les TRANSITIONS sont libres — 🟠 → 🔵 est une commande anticipée,
  // et un retour en arrière est une correction. Seule la VALEUR est contrainte.
  if (!ETAT_CLES.includes(etat)) return res.status(400).json({ error: 'État inconnu' })

  const id = req.body?.id === undefined ? null : Number(req.body.id)
  const jeton = String(req.body?.jeton || '').trim()
  if (id === null && !jeton) return res.status(400).json({ error: 'id ou jeton requis' })

  const requete = supabase.from('economat_articles').select(CHAMPS)
  const { data: article, error: lecture } = await (id !== null ? requete.eq('id', id) : requete.eq('jeton', jeton)).maybeSingle()
  if (lecture) return erreurApi(req, res, 'internal', lecture, { route: 'economat/etat' })
  if (!article) return res.status(404).json({ error: 'Article introuvable' })

  const maintenant = new Date().toISOString()
  const avant = article.etat

  if (etat !== avant) {
    if (etat === 'commande') {
      // Le fournisseur, la référence et la quantité sont RECOPIÉS : changer de
      // fournisseur l'an prochain ne doit pas réécrire ce qu'on a commandé
      // cette année. Et c'est le NOM du fournisseur, pas sa clé — une ligne
      // d'historique doit rester lisible si le fournisseur est renommé ou
      // retiré de la liste. C'est une photographie, pas une jointure.
      const { data: f } = article.fournisseur_id
        ? await supabase.from('economat_fournisseurs').select('nom').eq('id', article.fournisseur_id).maybeSingle()
        : { data: null }
      const { error } = await supabase.from('economat_commandes').insert({
        article_id: article.id,
        par: utilisateur.name || utilisateur.email || null,
        fournisseur: f?.nom || null,
        reference: article.reference,
        quantite: article.quantite_commande,
      })
      if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/etat' })
    } else if (avant === 'commande') {
      // Il n'y a pas d'état « Reçu » à l'écran, mais la ligne se ferme : dans
      // deux ans, ça donne les délais réels sans rien avoir demandé à personne.
      const { data: ouverte } = await supabase.from('economat_commandes')
        .select('id').eq('article_id', article.id).is('recu_le', null)
        .order('commande_le', { ascending: false }).limit(1).maybeSingle()
      if (ouverte) await supabase.from('economat_commandes').update({ recu_le: maintenant }).eq('id', ouverte.id)
    }
  }

  const { data, error } = await supabase.from('economat_articles')
    .update({ etat, etat_le: maintenant, updated_at: maintenant })
    .eq('id', article.id).select(CHAMPS).single()
  if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/etat' })
  return res.status(200).json(data)
}
