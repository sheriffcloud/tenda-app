/**
 * GET /v1/users/me — the WALLET PROJECTION, which is a contract and not just a
 * dump of the table.
 *
 * Both clients read the first verified wallet on a namespace as the default
 * when none is primary, and that is the ordinary case: the one-primary index
 * is per USER, not per namespace. That first row is what a wallet picker
 * preselects and what an escrow create BAKES on chain, so the order this route
 * returns is load-bearing rather than incidental.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import { walletFixture } from '../helpers/fixtures'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

let addrSeq = 0
async function link(
  app: ReturnType<typeof getApp>,
  user_id: string,
  over: Partial<ReturnType<typeof walletFixture>> = {},
) {
  const w = walletFixture({
    user_id,
    address: `MeWallet${addrSeq++}1111111111111111111111111`,
    is_primary: false,
    ...over,
  })
  await app.db.insert(user_wallets).values(w)
  return w
}

function walletAddresses(res: { json: () => unknown }): string[] {
  return (res.json() as { wallets: { address: string }[] }).wallets.map((w) => w.address)
}

test('users/me: wallets come back primary-first, then oldest link', { skip }, async () => {
  // Both clients read the FIRST verified wallet on a namespace as the default
  // when none is primary — which is the ordinary case, since the one-primary
  // index is per USER, not per namespace. That first row is what a picker
  // preselects and what a create BAKES on chain, so an unordered select would
  // leave the default to postgres heap order.
  //
  // The addresses are deliberately created in the OPPOSITE order to the one
  // expected, so a select that happened to be ordered by address (or by
  // insertion) would fail this rather than pass it by accident.
  const app = getApp()
  const u = await createUser(app)
  const older = await link(app, u.row.id, { verified_at: new Date('2026-01-01T00:00:00Z') })
  const newer = await link(app, u.row.id, { verified_at: new Date('2026-06-01T00:00:00Z') })
  const primary = await link(app, u.row.id, {
    is_primary: true,
    verified_at: new Date('2026-08-01T00:00:00Z'),
  })

  const res = await app.inject({ method: 'GET', url: '/v1/users/me', headers: authHeader(u.token) })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(walletAddresses(res), [primary.address, older.address, newer.address])
})

test('users/me: with no primary at all the order is still deterministic', { skip }, async () => {
  // The second namespace a user links has no primary by construction — the
  // index is per user — so this is the case the clients' fallback runs in.
  const app = getApp()
  const u = await createUser(app)
  // NEWER first, so its address sorts BEFORE the older one's: an
  // address-ordered or insertion-ordered select gives the opposite answer.
  const newer = await link(app, u.row.id, { verified_at: new Date('2026-03-01T00:00:00Z') })
  const older = await link(app, u.row.id, { verified_at: new Date('2026-02-01T00:00:00Z') })

  const res = await app.inject({ method: 'GET', url: '/v1/users/me', headers: authHeader(u.token) })

  assert.deepStrictEqual(walletAddresses(res), [older.address, newer.address])
})
