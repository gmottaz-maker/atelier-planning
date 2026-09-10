// Modèle des lignes d'une offre : normalisation, totaux, et mise à plat pour
// l'affichage. Source unique dont dépendent les calculs, le PDF et l'éditeur —
// trois implémentations du même barème finiraient par diverger.
//
// ── Trois niveaux dans Fabrication ──────────────────────────────────────────
//
//   1. l'ITEM            « Cabane »
//   2. l'ÉLÉMENT         « Toiture »            (facultatif)
//   3. la COMPOSITION    « Panneau 3 plis »     matériaux et heures
//
// La composition est l'outil de chiffrage : c'est elle qui porte les quantités
// et les prix. Un élément ou un item n'a pas de prix propre, son total est la
// somme de ce qu'il contient. Masquer une ligne ne change donc AUCUN total :
// c'est un filtre d'affichage, le montant remonte au parent qui reste visible.
//
// ── Compatibilité ───────────────────────────────────────────────────────────
//
// Un item peut porter sa composition directement (`purchases` / `labor`), sans
// élément intermédiaire : c'est le cas de toutes les offres antérieures, et
// c'est resté valable pour un item simple.

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

// ── Identifiants de ligne ────────────────────────────────────────────────────
// `_uid` n'est pas persisté pour lui-même : c'est la clé React d'une ligne dans
// l'éditeur. Deux lignes qui partagent une clé se marchent dessus à l'écran.
export function genRowUid()  { return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
export function genItemUid() { return `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

// ── Ordre des lignes ─────────────────────────────────────────────────────────
// L'ordre de saisie EST l'ordre du document : offre et facture impriment les
// lignes telles qu'elles sont rangées ici. Les réordonner n'est donc pas du
// confort d'édition, c'est de la mise en page.
//
// Échange deux voisines et rend un NOUVEAU tableau. Un déplacement impossible
// (bord de liste, index hors bornes) rend le tableau d'origine inchangé, pour
// qu'un appel erroné ne puisse ni perdre ni dupliquer une ligne.
export function deplacerLigne(lignes, idx, sens) {
  if (!Array.isArray(lignes)) return lignes
  const cible = idx + sens
  if (idx < 0 || idx >= lignes.length || cible < 0 || cible >= lignes.length) return lignes
  const suite = [...lignes]
  ;[suite[idx], suite[cible]] = [suite[cible], suite[idx]]
  return suite
}

// ── Copie d'un item ──────────────────────────────────────────────────────────
// Duplique un item avec TOUTE sa composition : achats, main d'œuvre, éléments,
// et la composition de chaque élément.
//
// Chaque `_uid` est regénéré, à tous les niveaux — c'est le seul vrai piège.
// Un `...spread` seul recopierait les clés, et on éditerait ensuite la copie en
// croyant éditer l'originale.
//
// Le reste est conservé tel quel, `hidden` compris : on duplique un chiffrage
// pour le retoucher, pas pour repartir de zéro. Le nom prend un suffixe, sans
// quoi deux items homonymes se retrouveraient dans l'offre ET dans le PDF.
export function copierLignes(lignes) {
  return (lignes || []).map(r => ({ ...r, _uid: genRowUid() }))
}
export function copierItem(item) {
  return {
    ...item,
    _uid: genItemUid(),
    name: item?.name ? `${item.name} (copie)` : '',
    purchases: copierLignes(item?.purchases),
    labor: copierLignes(item?.labor),
    elements: (item?.elements || []).map(el => ({
      ...el,
      _uid: genItemUid(),
      purchases: copierLignes(el.purchases),
      labor: copierLignes(el.labor),
    })),
  }
}


const effMargin    = (r, gm) => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : num(gm)
// La logistique n'hérite jamais de la marge générale.
const marginLog    = r => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0
// Escompte par ligne : pourcentage puis montant, borné à 0.
const applyDisc    = (amt, r) => Math.max(0, amt * (1 - num(r.discount) / 100) - num(r.discount_amount))

// Montant AVANT escompte. Le document doit pouvoir montrer les deux : sans le
// brut, la colonne « Prix » multipliée par la quantité ne retombe pas sur le
// sous-total, et le client lit une erreur de calcul là où il y a un rabais.
export const purchaseBrut  = (r, gm) => num(r.unit_price) * num(r.quantity) * (1 + effMargin(r, gm) / 100)
export const laborBrut     = r      => num(r.rate) * num(r.quantity)
export const serviceBrut   = (r, gm) => num(r.rate) * num(r.quantity) * (1 + effMargin(r, gm) / 100)
export const logisticsBrut = r      => num(r.rate) * num(r.quantity) * (1 + marginLog(r) / 100)

export const purchaseNet  = (r, gm) => applyDisc(purchaseBrut(r, gm), r)
export const laborNet     = r      => applyDisc(laborBrut(r), r)
export const serviceNet   = (r, gm) => applyDisc(serviceBrut(r, gm), r)
export const logisticsNet = r      => applyDisc(logisticsBrut(r), r)

/** Y a-t-il un escompte sur cette ligne ? */
export const aUnEscompte = r => num(r?.discount) > 0 || num(r?.discount_amount) > 0

/** Ce que l'escompte retire, en francs. */
export const montantEscompte = (brut, net) => Math.round((brut - net) * 100) / 100

/** « Escompte 20 % », « Escompte 50.00 CHF », ou les deux. */
export function libelleEscompte(r, fmtCHF = n => String(n)) {
  const p = num(r?.discount), a = num(r?.discount_amount)
  const parts = []
  if (p) parts.push(`${String(r.discount).replace('.', ',')} %`)
  if (a) parts.push(`${fmtCHF(a)} CHF`)
  return parts.length ? `Escompte ${parts.join(' + ')}` : 'Escompte'
}

/** Prix unitaire affiché, marge comprise. */
export const purchasePrice  = (r, gm) => num(r.unit_price) * (1 + effMargin(r, gm) / 100)
export const servicePrice   = (r, gm) => num(r.rate) * (1 + effMargin(r, gm) / 100)
export const logisticsPrice = r      => num(r.rate) * (1 + marginLog(r) / 100)

/** Une ligne masquée disparaît du document, jamais des totaux. */
export const estMasquee = x => x?.hidden === true

/**
 * Ramène un devis à la forme canonique, quel que soit son âge :
 *   { management[], items[{ name, elements[{ name, purchases[], labor[] }],
 *                           purchases[], labor[] }],
 *     subcontracting[], logistics[], general_margin }
 */
export function normaliserDevis(raw) {
  const q = raw || {}
  // Seuls les ITEMS ont deux formats. Gestion, sous-traitance et logistique se
  // lisent toujours à la racine : les rattacher au repérage du format faisait
  // disparaître la sous-traitance d'un devis qui n'a pas d'item.
  const items = Array.isArray(q.items)
    ? q.items.map(it => ({
        ...it,
        elements: (it.elements || []).map(el => ({
          ...el,
          purchases: el.purchases || [],
          labor: el.labor || [],
        })),
        purchases: it.purchases || [],
        labor: it.labor || [],
      }))
    // Format plat d'origine : { purchases, labor } au niveau du devis.
    : ((q.purchases?.length || q.labor?.length)
        ? [{ name: 'Général', elements: [], purchases: q.purchases || [], labor: q.labor || [] }]
        : [])

  return {
    management: q.management || [],
    items,
    subcontracting: q.subcontracting || [],
    logistics: q.logistics || [],
    general_margin: q.general_margin,
  }
}

/** Total d'un porteur de composition (item ou élément). */
export function totalComposition(porteur, gm) {
  return (porteur.purchases || []).reduce((s, r) => s + purchaseNet(r, gm), 0)
       + (porteur.labor || []).reduce((s, r) => s + laborNet(r), 0)
}

export function totalItem(item, gm) {
  return totalComposition(item, gm)
       + (item.elements || []).reduce((s, el) => s + totalComposition(el, gm), 0)
}

export function totauxDevis(raw) {
  const q = normaliserDevis(raw)
  const gm = q.general_margin ?? ''
  const gestion   = q.management.reduce((s, r) => s + laborNet(r), 0)
  const fabrication = q.items.reduce((s, it) => s + totalItem(it, gm), 0)
  const soustraitance = q.subcontracting.reduce((s, r) => s + serviceNet(r, gm), 0)
  const logistique = q.logistics.reduce((s, r) => s + logisticsNet(r), 0)
  return {
    gestion, fabrication, soustraitance, logistique,
    total: gestion + fabrication + soustraitance + logistique,
  }
}

// ── Mise à plat pour l'affichage ────────────────────────────────────────────

const qtyLabel = r => {
  const q = num(r.quantity)
  if (!q) return ''
  return `${(Math.round(q * 100) / 100).toString().replace('.', ',')}${r.unit ? ' ' + r.unit : ''}`
}



/**
 * Lignes prêtes à rendre. `fmtCHF` sert uniquement au libellé d'escompte.
 *
 * Les lignes masquées sont écartées ici, après que les totaux ont été calculés
 * sur l'ensemble : un item dont toute la composition est masquée affiche donc
 * son titre et son montant, sans le détail.
 */
export function lignesDevis(raw, { fmtCHF = n => String(n), itemsLabel = 'Fabrication' } = {}) {
  const q = normaliserDevis(raw)
  const gm = q.general_margin ?? ''
  const t = totauxDevis(raw)
  const out = []

  const section = (label, total) => out.push({ kind: 'section', label, total })
  // `role` dit ce QU'EST la ligne, `level` où elle se place. La graisse suit le
  // rôle : une composition ne doit jamais être en gras, qu'elle soit sous un
  // item (niveau 2) ou sous un élément (niveau 3).
  const ligne = (level, role, o) => out.push({ kind: 'line', level, role, ...o })

  /**
   * Une position, escompte compris.
   *
   * Sans escompte, une seule ligne, comme avant. Avec escompte, trois : le
   * montant plein, ce que le rabais retire, et le net après un filet. C'est
   * le seul moyen que Prix × Qté retombe sur le sous-total affiché — sinon le
   * client lit un écart inexpliqué et le geste commercial passe pour une
   * faute de calcul.
   */
  const position = (level, role, o, r, brut) => {
    if (!aUnEscompte(r)) { ligne(level, role, o); return }
    // `escompte: true` retire son filet à la ligne : la position, son rabais
    // et son net forment un bloc que le trait couperait en deux.
    ligne(level, role, { ...o, total: brut, escompte: true })
    ligne(level, 'escompte', {
      title: libelleEscompte(r, fmtCHF), desc: '', qty: '', price: null,
      total: -montantEscompte(brut, o.total),
    })
    ligne(level, 'net', { title: '', desc: '', qty: '', price: null, total: o.total })
  }

  // Composition d'un porteur, à un niveau donné.
  const composition = (porteur, level) => {
    const parts = [
      ...(porteur.purchases || []).map(r => ({ r, achat: true })),
      ...(porteur.labor || []).map(r => ({ r, achat: false })),
    ]
    for (const p of parts) {
      if (estMasquee(p.r)) continue
      position(level, 'composition', {
        title: p.r.description || (p.achat ? 'Matériel' : "Main d'œuvre"),
        desc: p.r.dimension || '',
        qty: qtyLabel(p.r),
        price: p.achat ? purchasePrice(p.r, gm) : num(p.r.rate),
        total: p.achat ? purchaseNet(p.r, gm) : laborNet(p.r),
      }, p.r, p.achat ? purchaseBrut(p.r, gm) : laborBrut(p.r))
    }
    return parts
  }

  if (q.management.length) {
    section('Gestion projet', t.gestion)
    for (const r of q.management) {
      if (estMasquee(r)) continue
      position(1, 'prestation', {
        title: r.item || 'Gestion de projet',
        desc: r.description || '',
        qty: qtyLabel(r), price: num(r.rate), total: laborNet(r),
      }, r, laborBrut(r))
    }
  }

  if (q.items.length) {
    section(itemsLabel, t.fabrication)
    for (const it of q.items) {
      if (estMasquee(it)) continue
      const elements = (it.elements || []).filter(el => !estMasquee(el))
      const directes = [...(it.purchases || []), ...(it.labor || [])]

      // Un item sans élément et à ligne unique se fond avec elle : sinon on
      // lit deux fois la même chose pour le même montant.
      if (!it.elements?.length && directes.length === 1 && !estMasquee(directes[0])) {
        const r = directes[0]
        const achat = (it.purchases || []).includes(r)
        position(1, 'item', {
          title: it.name || r.description || 'Item',
          desc: [r.description, r.dimension].filter(Boolean).join(' · '),
          qty: qtyLabel(r),
          price: achat ? purchasePrice(r, gm) : num(r.rate),
          total: achat ? purchaseNet(r, gm) : laborNet(r),
        }, r, achat ? purchaseBrut(r, gm) : laborBrut(r))
        continue
      }

      ligne(1, 'item', { title: it.name || 'Item', desc: '', qty: '', price: null, total: totalItem(it, gm) })
      composition(it, 2)
      for (const el of elements) {
        ligne(2, 'element', {
          title: el.name || 'Élément', desc: '', qty: '', price: null,
          total: totalComposition(el, gm),
        })
        composition(el, 3)
      }
    }
  }

  if (q.subcontracting.length) {
    section('Sous-traitance', t.soustraitance)
    for (const r of q.subcontracting) {
      if (estMasquee(r)) continue
      position(1, 'prestation', {
        title: r.item || 'Sous-traitance',
        desc: r.description || '',
        qty: qtyLabel(r), price: servicePrice(r, gm), total: serviceNet(r, gm),
      }, r, serviceBrut(r, gm))
    }
  }

  if (q.logistics.length) {
    section('Logistique', t.logistique)
    for (const r of q.logistics) {
      if (estMasquee(r)) continue
      position(1, 'prestation', {
        title: r.trajet || 'Logistique',
        desc: r.description || '',
        qty: qtyLabel(r), price: logisticsPrice(r), total: logisticsNet(r),
      }, r, logisticsBrut(r))
    }
  }

  return out
}
