// Catégories du catalogue : deux niveaux dans l'interface, une auto-référence
// en base qui n'en impose aucun.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'

const supabase = getSupabaseServer()
const CHAMPS = ['name', 'parent_id']

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('catalog_categories')
      .select('*').order('name', { ascending: true })
    if (error) return erreurApi(req, res, 'internal', error, { route: 'catalog-categories' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const p = {}
    for (const k of CHAMPS) if (k in (req.body || {})) p[k] = req.body[k] === '' ? null : req.body[k]
    if (!p.name || !String(p.name).trim()) return res.status(400).json({ error: 'Le nom est requis.' })
    p.name = String(p.name).trim()

    // Deux niveaux : une sous-catégorie ne peut pas elle-même en avoir une.
    // La règle est ici et non en base parce qu'elle relève de l'interface —
    // le schéma reste capable d'aller plus loin le jour où on le décidera.
    if (p.parent_id) {
      const { data: parent } = await supabase.from('catalog_categories')
        .select('parent_id').eq('id', p.parent_id).maybeSingle()
      if (!parent) return res.status(400).json({ error: 'Catégorie parente introuvable.' })
      if (parent.parent_id) return res.status(400).json({ error: 'Une sous-catégorie ne peut pas en contenir une autre.' })
    }

    const { data, error } = await supabase.from('catalog_categories').insert(p).select().single()
    if (error) {
      // 23505 : l'index unique sur (parent, nom). Le message brut de Postgres
      // parlerait d'index et de contrainte ; celui-ci parle à l'utilisateur.
      if (error.code === '23505') return res.status(409).json({ error: `« ${p.name} » existe déjà à cet endroit.` })
      return erreurApi(req, res, 'internal', error, { route: 'catalog-categories' })
    }
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const p = { updated_at: new Date().toISOString() }
    for (const k of CHAMPS) if (k in (req.body || {})) p[k] = req.body[k] === '' ? null : req.body[k]
    if ('name' in p) {
      if (!String(p.name || '').trim()) return res.status(400).json({ error: 'Le nom est requis.' })
      p.name = String(p.name).trim()
    }
    // Une catégorie ne peut pas devenir sa propre parente.
    if (p.parent_id && String(p.parent_id) === String(id)) {
      return res.status(400).json({ error: 'Une catégorie ne peut pas se contenir elle-même.' })
    }
    const { data, error } = await supabase.from('catalog_categories')
      .update(p).eq('id', id).select().single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `« ${p.name} » existe déjà à cet endroit.` })
      return erreurApi(req, res, 'internal', error, { route: 'catalog-categories' })
    }
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    // La cascade emporte les sous-catégories ET les articles (schéma). C'est le
    // comportement demandé ; le garde-fou est l'écran, qui annonce le décompte
    // exact avant d'appeler cette route — rien ne restaure ces lignes.
    const { error } = await supabase.from('catalog_categories').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'catalog-categories' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
