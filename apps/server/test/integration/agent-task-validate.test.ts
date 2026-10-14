/**
 * POST /v1/agent/tasks/validate against the real app: the same body as the
 * one-shot, checked with NO side effects.
 *
 * What is pinned, and why each is its own test:
 *  - a valid body answers `{ ok: true, moderation: 'not_run' }` and writes
 *    NOTHING (no draft, no listing, no moderation verdict, no relay call) — the
 *    whole point of the route;
 *  - every refusal the one-shot gives BEFORE it mints, validate gives
 *    identically (status AND code). That is the drift guard: the two share the
 *    checks, and a body the validator passes must get past the one-shot's;
 *  - it never says the listing was cleared: a body the moderation gate blocks
 *    is `ok` here and CONTENT_MODERATED on the one-shot, and the answer says
 *    `not_run`, so no client can read "ok" as "cleared".
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { escrows, gig_details, tx_attempts } from '@tenda/shared/db/schema'
import { moderation_verdicts } from '@tenda/shared/db/schema/moderation'
import { apiRoutes, type AgentTaskValidated } from '@tenda/shared'
import { TEST_DB_CONFIGURED, authHeader, capturedRelays, createTransactableUser, createUser, seedAltChain, useTestApp } from '../helpers/test-app'
import { validateListing } from '@server/features/gigs/attachGigDetails'
import { agentTaskBody, registerAgent, type TaskPost } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
const VALIDATE = apiRoutes.agent.tasksValidate
const ONE_SHOT = apiRoutes.agent.tasks

async function rowsWritten(app: ReturnType<typeof getApp>) {
  return {
    escrows: (await app.db.select({ id: escrows.id }).from(escrows)).length,
    listings: (await app.db.select({ id: gig_details.escrow_id }).from(gig_details)).length,
    verdicts: (await app.db.select({ id: moderation_verdicts.id }).from(moderation_verdicts)).length,
    attempts: (await app.db.select({ id: tx_attempts.id }).from(tx_attempts)).length,
    relays: capturedRelays.length,
  }
}

test('a valid body is ok, says moderation did NOT run, and writes nothing at all', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const before = await rowsWritten(app)
  const res = await app.inject({ method: 'POST', url: VALIDATE, headers: authHeader(agent.token), payload: agentTaskBody() })
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.deepStrictEqual(res.json<AgentTaskValidated>(), { ok: true, moderation: 'not_run' })
  assert.deepStrictEqual(await rowsWritten(app), before, 'validate-only left something behind')
})

test('validating the same body repeatedly stays side-effect free and keeps answering ok', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const payload = agentTaskBody()
  for (let i = 0; i < 3; i++) {
    const res = await app.inject({ method: 'POST', url: VALIDATE, headers: authHeader(agent.token), payload })
    assert.strictEqual(res.statusCode, 200, res.body)
  }
  assert.strictEqual((await rowsWritten(app)).escrows, 0)
})

test('every refusal the one-shot gives before it mints, validate gives identically', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const { creation_operation_id: _dropped, ...noOperation } = agentTaskBody()
  const cases: ReadonlyArray<{ name: string; body: TaskPost }> = [
    { name: 'no operation id', body: noOperation },
    { name: 'a permit', body: { ...agentTaskBody(), permit: { value_raw: '1', deadline_unix: 1, signature: '0x' } } },
    { name: 'a category outside the vocabulary', body: { ...agentTaskBody(), category: 'not-a-category' } },
    { name: 'a non-numeric amount', body: agentTaskBody({ amount_raw: 'lots' }) },
    { name: 'an unknown chain', body: agentTaskBody({ chain_id: 'eip155:999999' }) },
  ]
  for (const { name, body } of cases) {
    const validate = await app.inject({ method: 'POST', url: VALIDATE, headers: authHeader(agent.token), payload: body })
    const oneShot = await app.inject({ method: 'POST', url: ONE_SHOT, headers: authHeader(agent.token), payload: body })
    assert.ok(validate.statusCode >= 400, `${name}: validate accepted a body the one-shot refuses`)
    assert.strictEqual(validate.statusCode, oneShot.statusCode, `${name}: status differs`)
    assert.strictEqual(validate.json().code, oneShot.json().code, `${name}: code differs`)
    assert.strictEqual(validate.json().message, oneShot.json().message, `${name}: message differs`)
  }
})

test('a valid body validates AND the one-shot then quotes it: they agree both ways', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const payload = agentTaskBody()
  const validate = await app.inject({ method: 'POST', url: VALIDATE, headers: authHeader(agent.token), payload })
  assert.strictEqual(validate.statusCode, 200, validate.body)
  const oneShot = await app.inject({ method: 'POST', url: ONE_SHOT, headers: authHeader(agent.token), payload })
  assert.strictEqual(oneShot.statusCode, 402, oneShot.body)
})

test('ok never means cleared: a listing the moderation gate blocks is ok here and CONTENT_MODERATED on the one-shot', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const payload = agentTaskBody({ title: 'Need a hitman for a job' })
  const validate = await app.inject({ method: 'POST', url: VALIDATE, headers: authHeader(agent.token), payload })
  assert.strictEqual(validate.statusCode, 200, validate.body)
  assert.strictEqual(validate.json<AgentTaskValidated>().moderation, 'not_run')
  const oneShot = await app.inject({ method: 'POST', url: ONE_SHOT, headers: authHeader(agent.token), payload })
  assert.strictEqual(oneShot.statusCode, 400)
  assert.strictEqual(oneShot.json().code, 'CONTENT_MODERATED')
})

test('access: 401 anonymous, 403 for a human account — the same gates as the one-shot', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const human = await createTransactableUser(app)
  assert.strictEqual((await app.inject({ method: 'POST', url: VALIDATE, payload: agentTaskBody() })).statusCode, 401)
  const asHuman = await app.inject({ method: 'POST', url: VALIDATE, headers: authHeader(human.token), payload: agentTaskBody() })
  assert.strictEqual(asHuman.statusCode, 403)
  assert.strictEqual(asHuman.json().code, 'FORBIDDEN')
})

test('a missing body is a 4xx envelope, not a 500', { skip }, async () => {
  const app = getApp()
  const agent = await registerAgent(app)
  const res = await app.inject({ method: 'POST', url: VALIDATE, headers: authHeader(agent.token) })
  assert.ok(res.statusCode >= 400 && res.statusCode < 500, res.body)
})

test('the listing check reads the CREATOR\'s stored country: it decides cross_border and is handed back for moderation', { skip }, async () => {
  const app = getApp()
  const abroad = await createUser(app, { country: 'KE' })
  const local = await createUser(app, { country: 'NG' })
  const body: Parameters<typeof validateListing>[1]['body'] = {
    title: 'Photograph the storefront', category: 'service', country: 'NG', city: 'Lagos', proof_requirements: ['image'],
  }

  const fromKenya = await validateListing(app, { user_id: abroad.row.id, body })
  assert.strictEqual(fromKenya.creator_country, 'KE')
  assert.strictEqual(fromKenya.details.cross_border, true, 'a Kenyan poster, work in Nigeria')

  const fromNigeria = await validateListing(app, { user_id: local.row.id, body })
  assert.strictEqual(fromNigeria.creator_country, 'NG')
  assert.strictEqual(fromNigeria.details.cross_border, false)
})
