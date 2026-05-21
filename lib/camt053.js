// Parser CAMT.053 (relevé bancaire suisse / ISO 20022)
// Extrait les entries pour insertion en base.

import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
})

function arr(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]) }

/**
 * Retourne un array de transactions normalisées :
 * { account_iban, booking_date, value_date, amount, currency,
 *   description, reference, counterparty_name, counterparty_iban, end_to_end_id, raw }
 */
export function parseCamt053(xmlString) {
  const doc = parser.parse(xmlString)
  const root = doc?.Document
  if (!root) throw new Error('CAMT.053 invalide : pas de <Document>')

  // BkToCstmrStmt > Stmt (un ou plusieurs relevés)
  const wrapper = root.BkToCstmrStmt || root['BkToCstmrAcctRpt']  // 053 ou 052
  if (!wrapper) throw new Error('CAMT.053 invalide : pas de BkToCstmrStmt')

  const statements = arr(wrapper.Stmt || wrapper.Rpt)

  const out = []
  for (const stmt of statements) {
    const accountIban = stmt?.Acct?.Id?.IBAN || null
    const entries = arr(stmt.Ntry)

    for (const ntry of entries) {
      const amount = parseFloat(ntry?.Amt?.['#text'] || ntry?.Amt || 0)
      const currency = ntry?.Amt?.['@_Ccy'] || 'CHF'
      const cdtDbt = ntry?.CdtDbtInd  // CRDT (entrée) | DBIT (sortie)
      const signed = cdtDbt === 'DBIT' ? -Math.abs(amount) : Math.abs(amount)

      const bookingDate = ntry?.BookgDt?.Dt || null
      const valueDate   = ntry?.ValDt?.Dt || null

      const txDetailsList = arr(ntry?.NtryDtls?.TxDtls)
      if (txDetailsList.length === 0) {
        out.push({
          account_iban: accountIban,
          booking_date: bookingDate,
          value_date: valueDate,
          amount: signed,
          currency,
          description: ntry?.AddtlNtryInf || null,
          reference: null,
          counterparty_name: null,
          counterparty_iban: null,
          end_to_end_id: null,
          raw: ntry,
        })
        continue
      }

      for (const tx of txDetailsList) {
        const txAmount = parseFloat(tx?.Amt?.['#text'] || tx?.Amt || amount)
        const txCdtDbt = tx?.CdtDbtInd || cdtDbt
        const txSigned = txCdtDbt === 'DBIT' ? -Math.abs(txAmount) : Math.abs(txAmount)
        const txCurrency = tx?.Amt?.['@_Ccy'] || currency

        // Contrepartie : si CRDT alors Dbtr (qui paie), si DBIT alors Cdtr (qui reçoit)
        const isDebit = txCdtDbt === 'DBIT'
        const party    = isDebit ? tx?.RltdPties?.Cdtr     : tx?.RltdPties?.Dbtr
        const partyAcc = isDebit ? tx?.RltdPties?.CdtrAcct : tx?.RltdPties?.DbtrAcct
        const counterpartyName = typeof party === 'object' ? (party?.Nm || null) : (party || null)
        const counterpartyIban = partyAcc?.Id?.IBAN || null

        // Référence structurée ou libre
        const strdRef = tx?.RmtInf?.Strd?.CdtrRefInf?.Ref
                     || tx?.RmtInf?.Strd?.AddtlRmtInf
                     || null
        const ustrd   = tx?.RmtInf?.Ustrd || null
        const reference = strdRef || (typeof ustrd === 'string' ? ustrd : null)

        const endToEndId = tx?.Refs?.EndToEndId || tx?.Refs?.TxId || null
        const description = ntry?.AddtlNtryInf || (typeof ustrd === 'string' ? ustrd : null) || null

        out.push({
          account_iban: accountIban,
          booking_date: bookingDate,
          value_date: valueDate,
          amount: txSigned,
          currency: txCurrency,
          description,
          reference,
          counterparty_name: counterpartyName,
          counterparty_iban: counterpartyIban,
          end_to_end_id: endToEndId,
          raw: tx,
        })
      }
    }
  }
  return out
}
