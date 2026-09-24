// Les cartes Kanban, en planches A4 paysage de quatre A6.
//
// Le QR est un SVG INLINÉ, comme le bulletin QR d'une facture : rien à aller
// chercher sur le réseau, et le rendu n'attend rien. Les photos, elles, sont
// des URL publiques — d'où `attendre: 'load'` plutôt que 'domcontentloaded' :
// une carte sans sa photo s'imprimerait sans erreur, et le défaut ne se
// verrait qu'au massicot.
//
// La route doit rester dans `outputFileTracingIncludes` de next.config.js avec
// le binaire Chromium ET public/fonts : sans les Apercu Pro, la carte sort en
// Helvetica — en production seulement.
import QRCode from 'qrcode'
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { htmlToPdf } from '../../../lib/htmlToPdf'
import { contentDisposition } from '../../../lib/contentDisposition'
import { planches, filtrerArticles } from '../../../lib/economat'
import { feuillesCartesHtml, policesEmbarquees } from '../../../lib/economatCarte'

export const config = { maxDuration: 60 }

const supabase = getSupabaseServer()
const BUCKET = 'economat-photos'

// L'adresse imprimée sur quatre-vingts cartes ne peut pas dépendre de l'hôte
// qui a servi la requête : une planche générée depuis localhost porterait des
// QR qui ne mènent nulle part.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mazeproject.amazinglab.ch').replace(/\/+$/, '')

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  const [articles, categories, fournisseurs] = await Promise.all([
    supabase.from('economat_articles').select('*').order('designation'),
    supabase.from('economat_categories').select('id, nom, parent_id, couleur'),
    supabase.from('economat_fournisseurs').select('id, nom'),
  ])
  if (articles.error || categories.error || fournisseurs.error) {
    return res.status(500).json({ error: 'Lecture impossible' })
  }
  const cats = categories.data || []
  const fours = fournisseurs.data || []

  // Trois façons de désigner ce qu'on imprime : une sélection, une catégorie
  // (ses sous-catégories comprises), ou tout le catalogue actif.
  let choisis = (articles.data || []).filter(a => !a.archived)
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Number.isInteger)
  if (ids.length) {
    const voulus = new Set(ids)
    // L'ordre de la sélection est celui du catalogue, pas celui de l'URL :
    // deux planches imprimées le même jour se rangent pareil.
    choisis = choisis.filter(a => voulus.has(Number(a.id)))
  } else if (req.query.categorie) {
    // `filtrerArticles` inclut les SOUS-catégories : imprimer « Fixation »
    // doit sortir les 46 vis rangées dans ses cinq filles, pas zéro carte.
    choisis = filtrerArticles(choisis, { categorie: Number(req.query.categorie), categories: cats })
  }
  if (!choisis.length) return res.status(404).json({ error: 'Aucune carte à imprimer' })

  // `depart` laisse des cases vides en tête de planche : réimprimer une carte
  // perdue sur une feuille déjà entamée, sans gâcher trois cartes.
  const feuilles = planches(choisis, { depart: Number(req.query.depart) || 0 })

  const qrs = {}
  const photos = {}
  for (const a of choisis) {
    qrs[a.id] = await QRCode.toString(`${SITE}/e/${a.jeton}`, {
      type: 'svg', errorCorrectionLevel: 'M', margin: 0,
    })
    if (a.photo_path) {
      photos[a.id] = supabase.storage.from(BUCKET).getPublicUrl(a.photo_path)?.data?.publicUrl || ''
    }
  }

  try {
    const html = feuillesCartesHtml(feuilles, { categories: cats, fournisseurs: fours, qrs, photos, polices: policesEmbarquees() })
    const pdf = await htmlToPdf(html, null, { attendre: 'load', delai: 60000 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', contentDisposition(
      `Cartes economat - ${choisis.length} article${choisis.length > 1 ? 's' : ''}.pdf`,
      req.query.download ? 'attachment' : 'inline',
    ))
    res.setHeader('Cache-Control', 'no-store')
    res.send(Buffer.from(pdf))
  } catch (e) {
    console.error('economat/cartes:', e)
    res.status(500).json({ error: 'Génération PDF impossible : ' + e.message })
  }
}
