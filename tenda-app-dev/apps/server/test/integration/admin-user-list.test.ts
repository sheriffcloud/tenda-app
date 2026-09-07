/**
 * GET /v1/admin/users — what the FILTERS actually select (#110).
 *
 * The refusals on this route (an unassignable role, a status outside the pair)
 * were closed by #105 T5a; what nothing exercised was the filters doing their
 * job. A filter that matches the wrong column, or a subquery that has lost its
 * correlation, answers 200 with a plausible-looking list — the failure mode is
 * a wrong answer, not an error, which is why refusal coverage cannot reach it.
 *
 * THE WALLET SEARCH IS THE ONE TO WATCH. It is an `exists(...)` over
 * user_wallets correlated on `user_wallets.user_id = users.id`; drop the
 * correlation and the subquery still returns rows for every user, so the search
 * would answer "everyone" for any address that exists at all. Both halves are
 * asserted below: the matching user IS returned, and the other user is NOT.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { user_wallets, users } from '@tenda/shared/db/schema/identity'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createAdmin,
  createUser,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The ids the list returned, in no particular order. */
async function listIds(
  app: ReturnType<typeof getApp>,
  token: string,
  query: string,
): Promise<string[]> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/users?${query}`,
    headers: authHeader(token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  const body = res.json() as { data: Array<{ id: string }>; total: number }
  assert.strictEqual(body.total, body.data.length, 'the page and its total must agree here')
  return body.data.map((u) => u.id).sort()
}

test('admin users: the status filter selects one status and excludes the other', { skip }, async () => {
  const app = getApp()
  const admin = await createAdmin(app)
  const active = await createUser(app)
  const suspended = await createUser(app)
  await app.db
    .update(users)
    .set({ status: 'suspended' })
    .where(eq(users.id, suspended.row.id))

  // Both directions, because a filter reading the wrong column would still
  // partition the list — it would just partition it wrongly.
  assert.deepStrictEqual(
    await listIds(app, admin.token, 'status=suspended'),
    [suspended.row.id],
    'only the suspended account',
  )
  assert.deepStrictEqual(
    await listIds(app, admin.token, 'status=active'),
    [admin.row.id, active.row.id].sort(),
    'the admin and the active user, and not the suspended one',
  )
})

test('admin users: search matches a first or last name, and only the right one', { skip }, async () => {
  const app = getApp()
  const admin = await createAdmin(app)
  const ada = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })
  const grace = await createUser(app, { first_name: 'Grace', last_name: 'Hopper' })

  assert.deepStrictEqual(await listIds(app, admin.token, 'search=Lovelace'), [ada.row.id])
  assert.deepStrictEqual(await listIds(app, admin.token, 'search=Grace'), [grace.row.id])
  // Case-insensitive, which is what `ilike` is for — an operator typing a name
  // as they remember it should not have to match the stored capitalisation.
  assert.deepStrictEqual(await listIds(app, admin.token, 'search=ada'), [ada.row.id])
  // A substring, not just a prefix: the pattern the route builds is %term%.
  assert.deepStrictEqual(await listIds(app, admin.token, 'search=ovelac'), [ada.row.id])
})

test('admin users: search matches a linked WALLET address, correlated to its owner', { skip }, async () => {
  // The EXISTS subquery, and the case that says its correlation is live.
  const app = getApp()
  const admin = await createAdmin(app)
  const owner = await createUser(app)
  const other = await createUser(app)
  await app.db.insert(user_wallets).values([
    { chain_ns: 'solana', address: 'SoWalletOfTheOwner1111111111111', user_id: owner.row.id },
    { chain_ns: 'solana', address: 'SoWalletOfSomebodyElse22222222', user_id: other.row.id },
  ])

  assert.deepStrictEqual(
    await listIds(app, admin.token, 'search=OfTheOwner'),
    [owner.row.id],
    'the wallet holder — and NOT the other user, whose wallet also exists',
  )
  assert.deepStrictEqual(
    await listIds(app, admin.token, 'search=SomebodyElse'),
    [other.row.id],
    'and the same in reverse, so neither result is an accident of ordering',
  )
})

test('admin users: a wallet search is case-insensitive and matches mid-address (#118)', { skip }, async () => {
  // BOTH HALVES OF A DECISION, not a restatement of the case above. #118 kept
  // this search as `ILIKE '%term%'` and DROPPED the prefix index built for it,
  // on the grounds that an operator reading a wallet address off a phone call
  // has a fragment from the middle of it and no reason to match its case. That
  // is a deliberate Seq Scan, and nothing was asserting either property OF THE
  // WALLET ARM. (The name arms have both, at the top of this file — which is
  // the trap: they are a separate `ilike` call, and pass whatever the wallet
  // arm does.)
  //
  // The case above already fails if the match becomes prefix-only, because
  // 'OfTheOwner' begins eight characters into the address. It does NOT fail if
  // `ilike` becomes `like` — its search term is spelled exactly as stored. So
  // the mixed-case term below is the half that was unguarded, and it is the one
  // an index "optimisation" would quietly break.
  //
  // Both halves were mutation-proved: `ilike`→`like` on the wallet arm fails
  // THIS case alone; a prefix-only wallet arm fails this one, the case above,
  // and the escaping control.
  const app = getApp()
  const admin = await createAdmin(app)
  const owner = await createUser(app)
  await app.db.insert(user_wallets).values({
    chain_ns: 'solana',
    address: 'SoWalletMixedCaseAbCdEf444444',
    user_id: owner.row.id,
  })

  assert.deepStrictEqual(
    await listIds(app, admin.token, 'search=mixedcaseabcdef'),
    [owner.row.id],
    'lower-cased, and from the middle: the search folds case as ILIKE does',
  )
  assert.deepStrictEqual(
    await listIds(app, admin.token, 'search=MIXEDCASEABCDEF'),
    [owner.row.id],
    'and upper-cased, so the assertion is about folding rather than about one spelling',
  )
})

// ---------- LIKE metacharacters are TEXT, not syntax (#119) --------------------
//
// These three replace a case that pinned the opposite — searching `%` used to
// build `%%%` and match every row. That was never an injection (the value is
// parameterised) but it was a wrong answer with nothing to say why, which is the
// same failure mode as a filter reading the wrong column. Each case searches for
// the metacharacter itself and asserts the ONE user whose name really contains
// it: the assertion fails in both directions, since the un-escaped pattern would
// return everybody and an over-escaped one would return nobody.

test('admin users: `%` is searched for literally, and a name containing one is findable', { skip }, async () => {
  const app = getApp()
  const admin = await createAdmin(app)
  const discount = await createUser(app, { first_name: 'Cash', last_name: 'Back100%' })
  await createUser(app, { first_name: 'Grace', last_name: 'Hopper' })

  assert.deepStrictEqual(
    await listIds(app, admin.token, 'search=%25'),
    [discount.row.id],
    'the account with a percent in its name — not the whole table',
  )
})

test('admin users: `_` matches an underscore, not any character', { skip }, async () => {
  // The one an operator hits by accident, pasting a fragment that happens to
  // contain it. `A_a` un-escaped matches "Aba" too; escaped it matches only the
  // name that really has the underscore.
  const app = getApp()
  const admin = await createAdmin(app)
  const underscored = await createUser(app, { first_name: 'A_a', last_name: 'Lovelace' })
  await createUser(app, { first_name: 'Aba', last_name: 'Turing' })

  assert.deepStrictEqual(await listIds(app, admin.token, 'search=A_a'), [underscored.row.id])
})

test('admin users: `\\` is the escape character, and is itself searchable', { skip }, async () => {
  // The one that would break the escaping if it were applied in two passes: a
  // backslash escaped twice stops meaning a backslash. Searching for it must
  // find the name that contains one.
  const app = getApp()
  const admin = await createAdmin(app)
  const slashed = await createUser(app, { first_name: 'Back', last_name: 'sla\\sh' })
  await createUser(app, { first_name: 'Grace', last_name: 'Hopper' })

  assert.deepStrictEqual(await listIds(app, admin.token, 'search=%5C'), [slashed.row.id])
})

test('admin users: escaping does not break the ordinary search', { skip }, async () => {
  // The control. An escape applied too broadly — or a pattern whose outer `%`
  // got escaped along with the term — would match nothing at all, and every
  // case above would still pass while the feature was dead.
  const app = getApp()
  const admin = await createAdmin(app)
  const ada = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })
  await app.db.insert(user_wallets).values({
    chain_ns: 'solana',
    address: 'SoWalletOfAda11111111111111111',
    user_id: ada.row.id,
  })

  assert.deepStrictEqual(await listIds(app, admin.token, 'search=ovelac'), [ada.row.id])
  assert.deepStrictEqual(await listIds(app, admin.token, 'search=OfAda'), [ada.row.id])
})

test('admin users: a search matching nothing is an EMPTY page, not the whole table', { skip }, async () => {
  // The negative that a broken subquery fails: an uncorrelated EXISTS returns
  // true for every row, so "no match" would come back as "everyone".
  const app = getApp()
  const admin = await createAdmin(app)
  await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })
  await app.db.insert(user_wallets).values({
    chain_ns: 'solana',
    address: 'SoWalletThatExists333333333333',
    user_id: admin.row.id,
  })

  assert.deepStrictEqual(await listIds(app, admin.token, 'search=nobody-by-that-name'), [])
})
