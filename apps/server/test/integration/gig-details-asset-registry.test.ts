/**
 * POST /v1/gigs reads the asset's decimals for the moderation price check
 * through the shared accessor (#116 follow-up).
 *
 * It used to be `ASSET_META[escrow.asset]?.decimals ?? 0`. For a prototype key
 * that bracket read answers a FUNCTION, `.decimals` is undefined, and the
 * fallback moderated the price at zero decimals — silently, with a 201. The
 * create path pins `asset` to the seeded table AND escrows carry a composite
 * foreign key to it, so the state can only exist when the TABLE holds an asset
 * the shared registry does not — a registry/table disagreement, which is the
 * case the guard names. Each case seeds that row first; what is pinned is that
 * the route says so instead of moderating nonsense.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ErrorCode } from '@tenda/shared'
import { assets } from '@tenda/shared/db/schema'
import { TEST_CHAIN_ID, TEST_DB_CONFIGURED, authHeader, createEscrow, createUser, useTestApp } from '../helpers/test-app'
import { gigDetailsBody } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED

/**
 * The three canonical prototype keys. Shared's test tree holds the full list
 * (`test/helpers/inherited-keys.ts`), which this package's test root cannot
 * import; the same three appear in asset-rate-source.test.ts for #116.
 */
const PROTOTYPE_KEYS = ['toString', 'constructor', '__proto__'] as const
const getApp = useTestApp()

test('a draft whose asset is a prototype key is refused as a registry fault, never moderated at 0 decimals', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  for (const key of PROTOTYPE_KEYS) {
    // The table row the registry knows nothing about — the FK is satisfied,
    // the registry is not.
    // A TOKEN, not a native asset: the table allows one native row per chain.
    await app.db.insert(assets).values({ id: key, chain_id: TEST_CHAIN_ID, symbol: key, decimals: 6, token_address: `token-for-${key}` })
    const escrow = await createEscrow(app, { creator_id: u.row.id, asset: key })
    const res = await app.inject({ method: 'POST', url: '/v1/gigs', headers: authHeader(u.token), payload: gigDetailsBody(escrow.id) })
    assert.strictEqual(res.statusCode, 500, `${key}: ${res.body}`)
    assert.strictEqual(res.json().code, ErrorCode.INTERNAL_ERROR)
    assert.match(res.json().message, new RegExp(`asset '${key}' is not in the shared asset registry`))
  }
})

test('and the registry asset the fixture uses still attaches (the guard is not "refuse everything")', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id })
  const res = await app.inject({ method: 'POST', url: '/v1/gigs', headers: authHeader(u.token), payload: gigDetailsBody(escrow.id) })
  assert.strictEqual(res.statusCode, 201, res.body)
})
