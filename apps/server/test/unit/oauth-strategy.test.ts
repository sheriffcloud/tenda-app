/**
 * lib/auth/strategies/oauth — maps a verified id_token to an identity outcome.
 * The OIDC verifier is injected, so this tests the mapping (incl. Apple's
 * no-email case) without network.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import { oauthStrategy } from '@server/lib/auth/strategies/oauth'
import type { OidcVerifier } from '@server/lib/auth/oidc'
import type { VerifyProof } from '@server/lib/auth/strategy'

const stub = (claims: { sub: string; email: string | null }): OidcVerifier => ({
  verify: async () => claims,
})

test('google: id_token → identity { kind: google, identifier: sub, email }', async () => {
  const s = oauthStrategy('google', stub({ sub: 'g-1', email: 'a@x.io' }))
  const out = await s.verify({ method: 'google', id_token: 'tok' })
  assert.deepStrictEqual(out, {
    type: 'identity',
    identity: { kind: 'google', identifier: 'g-1', email: 'a@x.io' },
  })
})

test('apple: a missing email (post-first-login) maps to email: null', async () => {
  const s = oauthStrategy('apple', stub({ sub: 'a-1', email: null }))
  const out = await s.verify({ method: 'apple', id_token: 'tok' })
  assert.deepStrictEqual(out, {
    type: 'identity',
    identity: { kind: 'apple', identifier: 'a-1', email: null },
  })
})

test('rejects a proof whose method does not match the strategy', async () => {
  const s = oauthStrategy('google', stub({ sub: 'g-1', email: null }))
  const wrong: VerifyProof = { method: 'phone', identifier: '+1', code: '1', user_id: null }
  await assert.rejects(() => s.verify(wrong), (e: unknown) => e instanceof AppError && e.statusCode === 500)
})
