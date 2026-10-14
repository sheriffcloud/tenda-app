/**
 * POST /v1/moderation/preview — the composer's pre-submit check (#105 T3).
 *
 * The route had NO integration test: the sweep flagged three unexecuted
 * refusals in it, and the truth is that nothing had ever called it. Its
 * verdict logic is covered by unit tests (test/unit/moderation.test.ts) and both
 * clients have hook tests, but the seam where a request becomes a
 * `moderateGig` call was unexercised.
 *
 * WHAT THE GUARDS ARE ACTUALLY FOR. `amount_raw` and `asset_decimals` are not
 * cosmetic: they are handed to the budget rules that decide whether a draft is
 * plausible, and `asset_decimals` is bounded 0–18 because it becomes an
 * exponent. A NaN or a 10^60 scale factor would not be refused downstream, it
 * would produce a verdict computed from nonsense — the shape of failure that
 * reads as a working feature.
 *
 * ORDER IS BEHAVIOUR HERE TOO. Every refusal on this route is 422
 * VALIDATION_ERROR, so which one fires is the whole of what the composer can
 * tell the user, and a status-only assertion cannot see it. `amount_raw` and
 * `asset_decimals` are checked in the handler BEFORE the `str(...)` field
 * checks, which run while building the argument object — so a request that is
 * wrong in several ways reports the amount first, not the title.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  TEST_ASSET,
  useTestApp,
  createUser,
  authHeader,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const URL = '/v1/moderation/preview'

/** A draft the route accepts; each case varies exactly one field. */
function draft(): Record<string, unknown> {
  return {
    title: 'Paint my fence',
    description: 'Two coats, green, materials supplied.',
    category: 'service',
    country: 'NG',
    asset: TEST_ASSET,
    amount_raw: '25000000',
    asset_decimals: 6,
  }
}

function preview(app: ReturnType<typeof getApp>, u: TestUser, body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: URL, headers: authHeader(u.token), payload: body })
}

test('moderation preview: a non-canonical amount_raw is refused 422', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)

  for (const amount_raw of [undefined, '', '1.5', '-5', '007', 'abc', 25_000_000]) {
    const res = await preview(app, u, { ...draft(), amount_raw })
    assert.strictEqual(res.statusCode, 422, String(amount_raw))
    // ANCHORED, and that is not decoration: unanchored, this regex also matches
    // 'asset_amount_raw must be canonical' — the fiat route's message for a
    // different field. MEASURED: a mutant that swapped this route's message for
    // that one left all seven cases green until the anchors went in.
    assert.match(res.json().message, /^amount_raw must be canonical$/, String(amount_raw))
  }
})

test('moderation preview: asset_decimals outside 0–18 is refused 422', { skip }, async () => {
  // The bound is inclusive at both ends and integer-only. A float is the
  // interesting one: 6.5 decimals is meaningless as an exponent but passes a
  // naive `typeof === 'number'` check.
  const app = getApp()
  const u = await createUser(app)

  for (const asset_decimals of [undefined, -1, 19, 6.5, Number.NaN, '6', null]) {
    const res = await preview(app, u, { ...draft(), asset_decimals })
    assert.strictEqual(res.statusCode, 422, String(asset_decimals))
    assert.match(res.json().message, /asset_decimals must be 0–18/)
  }
})

test('moderation preview: the 0 and 18 boundaries are ACCEPTED', { skip }, async () => {
  // The other half of the bound. An off-by-one that refused a legitimate
  // zero-decimal or 18-decimal asset would be invisible to the case above,
  // which only sends values already outside the range.
  const app = getApp()
  const u = await createUser(app)

  for (const asset_decimals of [0, 18]) {
    const res = await preview(app, u, { ...draft(), asset_decimals })
    assert.strictEqual(res.statusCode, 200, `${asset_decimals}: ${res.body}`)
  }
})

test('moderation preview: each required string field is refused BY NAME', { skip }, async () => {
  // `str()` is one helper shared by four fields, and it interpolates the field
  // name into the message. Asserting the name is what proves the right field was
  // rejected — with a shared helper, a mis-wired call site would otherwise
  // report a 422 for the wrong thing and look correct.
  const app = getApp()
  const u = await createUser(app)
  const cases: Array<[string, unknown]> = [
    ['title', ''],
    ['title', 'x'.repeat(201)],
    ['category', undefined],
    ['country', 42],
    ['asset', ''],
  ]
  for (const [field, value] of cases) {
    const res = await preview(app, u, { ...draft(), [field]: value })
    assert.strictEqual(res.statusCode, 422, `${field}=${String(value)}`)
    assert.match(res.json().message, new RegExp(`^${field} must be 1–\\d+ chars$`), field)
  }
})

test('moderation preview: the amount guards run BEFORE the field checks', { skip }, async () => {
  // Both answer 422 and differ only in message, so ordering is invisible to a
  // status assertion. A body wrong in both ways must report amount_raw, because
  // that guard is in the handler while the field checks run inside the argument
  // object below it.
  const app = getApp()
  const u = await createUser(app)

  const res = await preview(app, u, { ...draft(), amount_raw: 'nope', title: '' })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /^amount_raw must be canonical$/)
})

test('moderation preview: a valid draft returns a verdict (the control)', { skip }, async () => {
  // Without it every refusal above is satisfiable by a route that rejects
  // everything. The verdict's CONTENT is the unit tests' business; what this
  // pins is that a well-formed draft reaches the moderator at all.
  const app = getApp()
  const u = await createUser(app)

  const res = await preview(app, u, draft())
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.ok(typeof res.json() === 'object' && res.json() !== null)
})

test('moderation preview: an unauthenticated call never reaches the guards', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'POST', url: URL, payload: { amount_raw: 'nope' } })
  assert.strictEqual(res.statusCode, 401)
})
