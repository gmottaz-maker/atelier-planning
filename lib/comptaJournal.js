// Génère un journal comptable en partie double (plan comptable suisse PME)
// à partir des pièces : factures clients, factures fournisseurs, frais,
// et paiements bancaires rapprochés.
//
// Chaque écriture est une ligne simple : un compte au débit, un au crédit.
// Une pièce avec TVA produit 2 lignes (HT + TVA), ce qui reste importable
// dans n'importe quel logiciel (Banana, Crésus, bexio, Excel fiduciaire).

const DEBTORS   = '1100'  // Créances clients
const BANK      = '1020'  // Banque
const VAT_DUE   = '2200'  // TVA due (sur le CA)
const VAT_INPUT = '1170'  // Impôt préalable
const CREDITORS = '2000'  // Dettes fournisseurs
const EMP_DEBT  = '2030'  // Dettes envers collaborateurs (frais perso à rembourser)

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const r2 = n => Math.round(n * 100) / 100

// Montants HT / TVA d'une pièce, avec repli si amount_net absent (pièces anciennes).
function split(doc) {
  const ttc = num(doc.amount)
  const rate = num(doc.vat_rate)
  let net = doc.amount_net != null && doc.amount_net !== '' ? num(doc.amount_net) : null
  let vat = doc.vat_amount != null && doc.vat_amount !== '' ? num(doc.vat_amount) : null
  if (net == null) net = rate > 0 ? r2(ttc / (1 + rate / 100)) : ttc
  if (vat == null) vat = r2(ttc - net)
  return { ttc, net, vat, rate }
}

export function accountFor(mappings, scope, category) {
  const list = mappings || []
  const hit = list.find(m => m.scope === scope && m.category === (category || ''))
  if (hit) return hit.account
  const def = list.find(m => m.scope === scope && m.category === '')
  if (def) return def.account
  return scope === 'sale' ? '3200' : scope === 'supplier' ? '4000' : '6700'
}

export function buildJournal({ customerInvoices = [], supplierInvoices = [], expenses = [], bankTx = [], mappings = [] }) {
  const lines = []
  const push = (date, piece, libelle, tiers, debit, credit, montant, extra = {}) => {
    if (!montant || r2(montant) === 0) return
    lines.push({ date, piece, libelle, tiers, debit, credit, montant: r2(montant), ...extra })
  }

  // ── Factures clients : Débiteurs / Ventes + TVA due ──
  for (const inv of customerInvoices) {
    const { net, vat, rate } = split(inv)
    const isStorage = String(inv.object || '').startsWith('Stockage')
    const sale = accountFor(mappings, 'sale', isStorage ? 'stockage' : '')
    const piece = inv.invoice_number
    const lib = `Facture ${inv.invoice_number}${inv.object ? ' — ' + inv.object : inv.projects?.name ? ' — ' + inv.projects.name : ''}`
    push(inv.issue_date, piece, lib, inv.client_name, DEBTORS, sale, net, { taux: rate || '', type: 'Vente' })
    push(inv.issue_date, piece, `${lib} — TVA ${rate}%`, inv.client_name, DEBTORS, VAT_DUE, vat, { taux: rate, type: 'TVA due' })
  }

  // ── Factures fournisseurs : Charge + Impôt préalable / Créanciers ──
  for (const inv of supplierInvoices) {
    const { net, vat, rate } = split(inv)
    const charge = accountFor(mappings, 'supplier', inv.category)
    const piece = inv.invoice_number || `F${inv.id}`
    const lib = `Facture fournisseur ${inv.invoice_number || ''}`.trim()
    push(inv.issue_date, piece, lib, inv.supplier_name, charge, CREDITORS, net, { taux: rate || '', type: 'Achat' })
    push(inv.issue_date, piece, `${lib} — TVA ${rate}%`, inv.supplier_name, VAT_INPUT, CREDITORS, vat, { taux: rate, type: 'Impôt préalable' })
  }

  // ── Frais : Charge + Impôt préalable / Banque (carte société) ou Dette collaborateur ──
  for (const ex of expenses) {
    const { net, vat, rate } = split(ex)
    // Compte explicite du ticket (catégorie comptable) prioritaire, sinon
    // dérivé de la catégorie via la table de correspondance.
    const charge = ex.account || accountFor(mappings, 'expense', ex.category)
    const credit = ex.payment_method === 'company' ? BANK : EMP_DEBT
    const piece = `FR${ex.id}`
    const lib = `Frais ${ex.category || ''}${ex.merchant ? ' — ' + ex.merchant : ''}`.trim()
    push(ex.date, piece, lib, ex.merchant || ex.user_name, charge, credit, net, { taux: rate || '', type: 'Frais' })
    push(ex.date, piece, `${lib} — TVA ${rate}%`, ex.merchant || ex.user_name, VAT_INPUT, credit, vat, { taux: rate, type: 'Impôt préalable' })
  }

  // ── Paiements bancaires rapprochés ──
  // Un frais payé par carte société est déjà crédité sur la banque à l'écriture
  // du frais : son mouvement bancaire ne doit PAS générer une 2e écriture.
  const expenseById = new Map(expenses.map(x => [String(x.id), x]))
  for (const t of bankTx) {
    const amt = num(t.amount)
    const piece = t.reference || `BQ${t.id}`
    const lib = t.description || 'Mouvement bancaire'
    if (t.matched_to_type === 'customer_invoice' && amt > 0) {
      push(t.booking_date, piece, `Encaissement — ${lib}`, t.counterparty_name, BANK, DEBTORS, amt, { type: 'Encaissement' })
    } else if (t.matched_to_type === 'supplier_invoice' && amt < 0) {
      push(t.booking_date, piece, `Paiement fournisseur — ${lib}`, t.counterparty_name, CREDITORS, BANK, -amt, { type: 'Paiement' })
    } else if (t.matched_to_type === 'expense' && amt < 0) {
      // Seuls les frais avancés personnellement créent une dette à rembourser.
      const ex = expenseById.get(String(t.matched_to_id))
      if (ex && ex.payment_method === 'company') continue
      push(t.booking_date, piece, `Remboursement frais — ${lib}`, t.counterparty_name, EMP_DEBT, BANK, -amt, { type: 'Remboursement' })
    }
  }

  lines.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.piece).localeCompare(String(b.piece)))
  const totalDebit = r2(lines.reduce((s, l) => s + l.montant, 0))
  return { lines, totalDebit, totalCredit: totalDebit, balanced: true }
}

// Récap TVA de la période (méthode effective).
export function vatSummary(lines) {
  const due = lines.filter(l => l.credit === VAT_DUE).reduce((s, l) => s + l.montant, 0)
  const input = lines.filter(l => l.debit === VAT_INPUT).reduce((s, l) => s + l.montant, 0)
  const revenue = lines.filter(l => l.type === 'Vente').reduce((s, l) => s + l.montant, 0)
  return { revenueNet: r2(revenue), vatDue: r2(due), vatInput: r2(input), vatToPay: r2(due - input) }
}

// Décompte TVA (méthode effective) — chiffres du formulaire AFC, par taux.
export function vatReturn(lines) {
  const byRate = {}
  for (const l of lines.filter(x => x.type === 'Vente')) {
    const k = String(l.taux || 0)
    ;(byRate[k] ||= { rate: num(l.taux), net: 0, vat: 0 }).net += l.montant
  }
  for (const l of lines.filter(x => x.credit === VAT_DUE)) {
    const k = String(l.taux || 0)
    ;(byRate[k] ||= { rate: num(l.taux), net: 0, vat: 0 }).vat += l.montant
  }
  const rates = Object.values(byRate)
    .map(x => ({ rate: x.rate, net: r2(x.net), vat: r2(x.vat) }))
    .sort((a, b) => b.rate - a.rate)

  const totalRevenue = r2(rates.reduce((s, x) => s + x.net, 0))
  const vatDue = r2(rates.reduce((s, x) => s + x.vat, 0))
  const vatInput = r2(lines.filter(l => l.debit === VAT_INPUT).reduce((s, l) => s + l.montant, 0))
  const vatInputInvest = r2(lines.filter(l => l.debit === '1171').reduce((s, l) => s + l.montant, 0))
  return {
    rates,                       // ch. 301 / 311 / 341 : CA et impôt par taux
    totalRevenue,                // ch. 200/299 : chiffre d'affaires imposable
    vatDue,                      // impôt dû total
    vatInput,                    // ch. 400 : impôt préalable matériel et prestations
    vatInputInvest,              // ch. 405 : impôt préalable investissements
    balance: r2(vatDue - vatInput - vatInputInvest),  // ch. 500 (+ à payer) / 510 (− en faveur)
  }
}

// Balance des comptes de la période (débit / crédit / solde par compte).
export function accountBalance(lines) {
  const map = {}
  for (const l of lines) {
    ;(map[l.debit] ||= { account: l.debit, debit: 0, credit: 0 }).debit += l.montant
    ;(map[l.credit] ||= { account: l.credit, debit: 0, credit: 0 }).credit += l.montant
  }
  return Object.values(map)
    .map(a => ({ ...a, debit: r2(a.debit), credit: r2(a.credit), solde: r2(a.debit - a.credit) }))
    .sort((a, b) => a.account.localeCompare(b.account))
}
