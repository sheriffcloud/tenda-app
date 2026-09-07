/**
 * POST /v1/agent/tasks — the LISTING half of the one-shot (#19): the Stage-6
 * moderation gate, and the listing fields the validator had only TYPED.
 *
 * Split from agent-tasks.test.ts, which reached the 300-line house limit — the
 * same reason display-branches/display-variants split on mobile. That file
 * keeps the escrow half (402 → 201, idempotency, the wallet and assignee
 * gates, the relay); this one keeps everything the listing body can get wrong,
 * which is the half an AGENT composes from a program rather than a form.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { gig_details } from '@tenda/shared/db/schema'
import { apiRoutes, type AgentTaskPaymentRequired } from '@tenda/shared'
import { eq } from 'drizzle-orm'
import { TEST_DB_CONFIGURED, authHeader, seedAltChain, useTestApp } from '../helpers/test-app'
import { agentTaskBody, registerAgent, type TaskPost } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
const URL = apiRoutes.agent.tasks

test('one-shot: the Stage-6 moderation gate refuses a blocked listing 400 CONTENT_MODERATED', { skip }, async () => {
  // The document promises CONTENT_MODERATED on this route's 400, and an
  // autonomous poster is the case the gate exists for — nothing else here
  // proves the agent path runs it rather than only POST /v1/gigs. Same
  // critical keyword the human create suite uses.
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(agent.token),
    payload: agentTaskBody({ title: 'Need a hitman for a job' }),
  })
  assert.strictEqual(res.statusCode, 400, res.body)
  assert.strictEqual(res.json().code, 'CONTENT_MODERATED')
  // Refused BEFORE the listing existed; the draft stays for a fixed retry, as
  // the bad-listing case in agent-tasks.test.ts documents.
  assert.strictEqual((await app.db.select().from(gig_details)).length, 0)
})

test('one-shot: a listing country that is only an Object.prototype key is a clean 400, never a 500', { skip }, async () => {
  // `'toString' in LOCATIONS` is TRUE, so the listing validator's membership
  // check passed it through to `isCityInCountry`, where LOCATIONS['toString']
  // is a FUNCTION and `entry.cities.includes(city)` threw — the agent got a
  // 500 for a body the API is supposed to refuse in words.
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(agent.token),
    payload: agentTaskBody({ country: 'toString', city: 'Lagos', remote: false }),
  })
  assert.strictEqual(res.statusCode, 400, res.body)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
  assert.match(res.json().message, /country must be one of/)
})

test('one-shot: a REMOTE task persists no location, and moderation still gets a market to price it against', { skip }, async () => {
  // Every other case in both files posts an on-site gig. A remote one is the arm the
  // document describes ('country: required for on-site gigs; omitted for
  // remote') and the arm `attachGigDetails` has its own fallback for: a remote
  // listing stores no country, so the price-sanity check is handed the
  // POSTER's market instead of an empty string. Both were unexercised.
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app, { country: 'NG' })
  // The body still CARRIES a location — `agentTaskBody()` ships NG/Lagos — so
  // "persists none" is a claim about what the validator DISCARDS, not about an
  // input that had nothing to discard. (Measured: with the location dropped
  // from the body instead, the mutant that stores it survives.)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(agent.token),
    payload: agentTaskBody({ remote: true }),
  })
  assert.strictEqual(res.statusCode, 402, res.body)
  const [listing] = await app.db
    .select()
    .from(gig_details)
    .where(eq(gig_details.escrow_id, res.json<AgentTaskPaymentRequired>().task_id))
  assert.strictEqual(listing?.remote, true)
  assert.strictEqual(listing?.country, null, 'a remote gig persists no work country')
  assert.strictEqual(listing?.city, null)
  // The poster's own market is unaffected by the listing having none.
  assert.strictEqual(agent.response.user.country, 'NG')
})

test('one-shot: listing fields the validator only TYPES are still checked — a non-string description and a non-boolean remote', { skip }, async () => {
  // Both were trusted on the strength of the TS type and never checked, and an
  // agent composes this body from a program, not a form:
  //   description: 42   → `description?.trim()` threw a TypeError → 500
  //   remote: 'no'      → truthy in JS, so the country/city requirement was
  //                       SKIPPED, but the boolean column stores false — a gig
  //                       persisted as on-site with no country and no city,
  //                       which is the exact state those two checks exist to
  //                       prevent.
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const post = (payload: TaskPost) =>
    app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload })

  const badDescription = await post({ ...agentTaskBody(), description: 42 as unknown as string })
  assert.strictEqual(badDescription.statusCode, 400, badDescription.body)
  assert.strictEqual(badDescription.json().code, 'VALIDATION_ERROR')

  const { country: _c, city: _city, ...noPlace } = agentTaskBody()
  const badRemote = await post({ ...noPlace, remote: 'no' as unknown as boolean })
  assert.strictEqual(badRemote.statusCode, 400, badRemote.body)
  assert.strictEqual(badRemote.json().code, 'VALIDATION_ERROR')
  assert.strictEqual((await app.db.select().from(gig_details)).length, 0, 'no location-less on-site gig was stored')
})
