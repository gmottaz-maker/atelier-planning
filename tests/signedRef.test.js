import { describe, it, expect, beforeAll } from 'vitest'
import { signRef, verifyRef } from '../lib/signedRef'

beforeAll(() => { process.env.KDRIVE_TOKEN_SECRET = 'secret-de-test' })

describe('jetons signés kDrive', () => {
  it('relit la charge utile qu\'il a signée', () => {
    const t = signRef({ fileId: 42, projectId: 'abc' })
    expect(verifyRef(t)).toMatchObject({ fileId: 42, projectId: 'abc' })
  })

  it('refuse un jeton modifié', () => {
    const t = signRef({ fileId: 42 })
    const [body, sig] = t.split('.')
    const autre = Buffer.from(JSON.stringify({ fileId: 99, exp: Date.now() + 1000 })).toString('base64url')
    expect(verifyRef(`${autre}.${sig}`)).toBeNull()
    expect(verifyRef(`${body}.${'A'.repeat(sig.length)}`)).toBeNull()
  })

  it('refuse un jeton expiré', () => {
    expect(verifyRef(signRef({ fileId: 1 }, -1))).toBeNull()
  })

  it('refuse tout ce qui n\'est pas un jeton', () => {
    for (const v of [null, undefined, '', 'abc', 'a.b', 42, {}]) expect(verifyRef(v)).toBeNull()
  })
})
