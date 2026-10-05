// Les gestes du quotidien (brief V2, §11–§19) : bouger le stock, prendre en
// charge un réapprovisionnement, annuler le dernier geste.
//
// TOUT passe par une fonction PostgreSQL (`economat_stock`,
// `economat_prise_en_charge`, `economat_annuler`) : la ligne de l'article est
// verrouillée, le geste et sa trace dans l'historique s'écrivent ensemble ou
// pas du tout, et un « −1 » se calcule sur le stock RÉEL. Deux personnes qui
// scannent la même boîte au même moment font deux −1, pas un.
//
// L'article se désigne par son `id` (fiche) OU par son `jeton` (carte
// scannée). Le jeton n'est pas un droit : la route exige un compte comme
// toutes les autres. Le nom inscrit dans l'historique vient du JWT, jamais
// du corps de la requête.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerGeste, messageRefus } from '../../../lib/economat'

const supabase = getSupabaseServer()

// Ce que l'écran relit après un geste : de quoi redessiner le niveau et la
// prise en charge, sans recharger tout le catalogue.
const CHAMPS = `id, code, jeton, type, suivi, decoupage, unite_stock_id, cible, seuil_orange,
  seuil_rouge, stock, reappro_par, reappro_le, etat, etat_le`

async function trouver(req) {
  const id = req.body?.id === undefined || req.body?.id === null ? null : Number(req.body.id)
  const jeton = String(req.body?.jeton || '').trim()
  if (id === null && !jeton) return { erreur: 'id ou jeton requis' }
  if (id !== null && !Number.isInteger(id)) return { erreur: 'id invalide' }
  const requete = supabase.from('economat_articles').select('id')
  const { data, error } = await (id !== null ? requete.eq('id', id) : requete.eq('jeton', jeton)).maybeSingle()
  if (error) return { panne: error }
  if (!data) return { absent: true }
  return { id: data.id }
}

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const par = utilisateur.name || utilisateur.email || null
  const action = String(req.body?.action || '')
  let appel

  if (action === 'annuler') {
    const mouvement = Number(req.body?.mouvement_id)
    if (!Number.isInteger(mouvement)) return res.status(400).json({ error: 'mouvement_id requis' })
    appel = await supabase.rpc('economat_annuler', { p_mouvement: mouvement, p_par: par })
  } else if (action === 'stock' || action === 'prendre' || action === 'lacher') {
    const cible = await trouver(req)
    if (cible.erreur) return res.status(400).json({ error: cible.erreur })
    if (cible.panne) return erreurApi(req, res, 'internal', cible.panne, { route: 'economat/geste' })
    if (cible.absent) return res.status(404).json({ error: 'Article introuvable' })

    if (action === 'stock') {
      const { ok, erreur, valeur } = validerGeste(req.body)
      if (!ok) return res.status(400).json({ error: erreur })
      appel = await supabase.rpc('economat_stock', {
        p_article: cible.id, p_type: valeur.type, p_delta: valeur.delta, p_valeur: valeur.valeur, p_par: par,
      })
    } else {
      appel = await supabase.rpc('economat_prise_en_charge', { p_article: cible.id, p_prendre: action === 'prendre', p_par: par })
    }
  } else {
    return res.status(400).json({ error: 'Action inconnue' })
  }

  if (appel.error) return erreurApi(req, res, 'internal', appel.error, { route: 'economat/geste' })
  const r = appel.data || {}
  // Un refus de la base n'est pas une panne : déjà pris en charge par un
  // collègue, rien à annuler, stock déjà à ce niveau. 409, avec la phrase.
  if (!r.ok) {
    if (r.raison === 'article_absent' || r.raison === 'mouvement_absent') return res.status(404).json({ error: 'Introuvable' })
    return res.status(409).json({ error: messageRefus(r), raison: r.raison })
  }

  // L'article à jour, pour que l'écran n'ait pas à tout relire.
  let articleId = null
  if (action === 'annuler') {
    const { data: m } = await supabase.from('economat_mouvements').select('article_id').eq('id', Number(req.body.mouvement_id)).maybeSingle()
    articleId = m?.article_id ?? null
  } else {
    articleId = (await trouver(req)).id
  }
  const { data: article } = articleId
    ? await supabase.from('economat_articles').select(CHAMPS).eq('id', articleId).maybeSingle()
    : { data: null }
  return res.status(200).json({ ...r, article })
}
