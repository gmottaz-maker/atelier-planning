import { describe, it, expect } from 'vitest'
import { parseCamt053 } from '../lib/camt053'

// Extrait CAMT.053 calqué sur un vrai relevé (structure Pty + référence QR 27 chiffres).
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><IBAN>CH5780808004248674156</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="CHF">5096.95</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-07-15</Dt></BookgDt>
        <ValDt><Dt>2026-07-15</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Amt Ccy="CHF">5096.95</Amt>
            <CdtDbtInd>DBIT</CdtDbtInd>
            <RmtInf>
              <Strd>
                <CdtrRefInf>
                  <Tp><CdOrPrtry><Prtry>QRR</Prtry></CdOrPrtry></Tp>
                  <Ref>800538100000008140000000000</Ref>
                </CdtrRefInf>
              </Strd>
            </RmtInf>
            <RltdPties>
              <Cdtr><Pty><Nm>LEUBA Hiag SA</Nm></Pty></Cdtr>
              <CdtrAcct><Id><IBAN>CH4630761016122910674</IBAN></Id></CdtrAcct>
            </RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">7.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-07-13</Dt></BookgDt>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

describe('parseCamt053', () => {
  const txs = parseCamt053(xml)

  it('lit toutes les écritures', () => {
    expect(txs).toHaveLength(2)
  })

  it('préserve une référence QR de 27 chiffres sans la convertir en flottant', () => {
    // Le bug : parseTagValue par défaut la transformait en 8.05…e+26.
    expect(txs[0].reference).toBe('800538100000008140000000000')
    expect(String(txs[0].reference)).not.toContain('e+')
  })

  it('extrait le nom de la contrepartie sous le wrapper <Pty>', () => {
    expect(txs[0].counterparty_name).toBe('LEUBA Hiag SA')
  })

  it('extrait l\'IBAN du bénéficiaire', () => {
    expect(txs[0].counterparty_iban).toBe('CH4630761016122910674')
  })

  it('signe le débit en négatif et garde le montant exact', () => {
    expect(txs[0].amount).toBe(-5096.95)
  })

  it('accepte une écriture sans contrepartie ni référence (paiement carte)', () => {
    expect(txs[1].amount).toBe(-7.5)
    expect(txs[1].counterparty_name).toBeNull()
    expect(txs[1].reference).toBeNull()
  })
})
