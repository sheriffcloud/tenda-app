/**
 * The demo account's draft ring (#147).
 *
 * The keyless demo bearer mints a draft per task and nothing deleted drafts,
 * so every review run left a row forever. A cap that REFUSED past N would
 * have killed the demo the day it filled; the ring discards the oldest
 * unfunded draft instead. These pin the five properties that make it safe:
 * it keeps the newest, a resend rings nothing out, a refused listing rings
 * nothing out (#155), an ordinary agent is untouched, and a draft with a
 * create in flight is never discarded.
 *
 * `../helpers/agent-demo-env` is imported FIRST for its side effect: it sets
 * the demo address AND a cap of three, so a case can fill the ring in a
 * handful of posts.
 */
import { DEMO_DRAFT_CAP } from '../helpers/agent-demo-env'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { and, eq } from 'drizzle-orm'
import { apiRoutes, type AgentRegisterResponse, type AgentTaskBody, type AgentTaskPaymentRequired } from '@tenda/shared'
import { escrows, tx_attempts } from '@tenda/shared/db/schema'
import { isDemoAccount } from '@server/features/agent/demo/demoDraftRing'
import { discardDrafts } from '@server/features/escrows/creation/discardDrafts'
import {
  TEST_DB_CONFIGURED,
  authHeader,
  createUser,
  resetDb,
  seedAltChain,
  useTestApp,
} from '../helpers/test-app'
import { agentTaskBody, registerAgent } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

async function openDemoSession(): Promise<AgentRegisterResponse> {
  const response = await getApp().inject({ method: 'POST', url: apiRoutes.agent.demoSession })
  assert.strictEqual(response.statusCode, 200, response.body)
  return response.json<AgentRegisterResponse>()
}

/** One header-less post: the 402 whose task_id is the draft it minted. */
async function quote(token: string, body: AgentTaskBody): Promise<string> {
  const response = await getApp().inject({ method: 'POST', url: apiRoutes.agent.tasks, headers: authHeader(token), payload: body })
  assert.strictEqual(response.statusCode, 402, response.body)
  return response.json<AgentTaskPaymentRequired>().task_id
}

/**
 * `n` distinct tasks, oldest first. A tick between posts so `created_at`
 * orders them — the ring evicts by creation time, and two drafts minted in
 * the same instant would make "the oldest" a coin toss.
 */
async function mint(token: string, n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i += 1) {
    if (i > 0) await sleep(2)
    ids.push(await quote(token, agentTaskBody({ creation_operation_id: randomUUID() })))
  }
  return ids
}

async function draftCount(user_id: string): Promise<number> {
  const rows = await getApp().db
    .select({ id: escrows.id })
    .from(escrows)
    .where(and(eq(escrows.creator_id, user_id), eq(escrows.status, 'draft')))
  return rows.length
}

async function readStatus(token: string, task_id: string): Promise<number> {
  const response = await getApp().inject({ method: 'GET', url: apiRoutes.gigs.get.replace(':id', task_id), headers: authHeader(token) })
  return response.statusCode
}

test('past the cap, the OLDEST drafts go and the newest stay — the account never fills', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const session = await openDemoSession()
  const ids = await mint(session.token, DEMO_DRAFT_CAP + 2)

  assert.strictEqual(await draftCount(session.user.id), DEMO_DRAFT_CAP)
  // The two minted first are gone, to their own creator too.
  for (const gone of ids.slice(0, 2)) assert.strictEqual(await readStatus(session.token, gone), 404, `${gone} should have been rung out`)
  for (const kept of ids.slice(2)) assert.strictEqual(await readStatus(session.token, kept), 200, `${kept} should have survived`)
})

test('a resend lands on the replayed draft and rings nothing out', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const session = await openDemoSession()
  const ids = await mint(session.token, DEMO_DRAFT_CAP)
  const body = agentTaskBody({ creation_operation_id: randomUUID() })
  await sleep(2)
  const first = await quote(session.token, body)
  // The ring is full now; the SAME operation again must not mint, so nothing goes.
  const again = await quote(session.token, body)
  assert.strictEqual(again, first)
  assert.strictEqual(await draftCount(session.user.id), DEMO_DRAFT_CAP)
  // ids[0] went when `first` was minted; ids[1] is now the oldest and it stays.
  assert.strictEqual(await readStatus(session.token, ids[1] ?? ''), 200)
})

test('a refused listing rings nothing out — the ring turns only for a draft that is actually minted', { skip }, async () => {
  // #155: the listing gate runs BEFORE the mint. Were the ring turned first,
  // every blocked body posted at the cap would discard someone's live draft
  // and mint nothing in its place — a keyless way to empty the demo account.
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const session = await openDemoSession()
  const ids = await mint(session.token, DEMO_DRAFT_CAP)
  await sleep(2)
  const blocked = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(session.token),
    payload: agentTaskBody({ creation_operation_id: randomUUID(), title: 'Need a hitman for a job' }),
  })
  assert.strictEqual(blocked.statusCode, 400, blocked.body)
  assert.strictEqual(await draftCount(session.user.id), DEMO_DRAFT_CAP)
  assert.strictEqual(await readStatus(session.token, ids[0] ?? ''), 200, 'the oldest draft was rung out by a refused post')
})

test('an ordinary agent account is not rung — the cap is the demo account\'s alone', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const ids = await mint(agent.token, DEMO_DRAFT_CAP + 2)
  assert.strictEqual(await draftCount(agent.response.user.id), DEMO_DRAFT_CAP + 2)
  for (const id of ids) assert.strictEqual(await readStatus(agent.token, id), 200)
})

test('a draft whose create is in flight is never discarded, whatever its age', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const session = await openDemoSession()
  const ids = await mint(session.token, DEMO_DRAFT_CAP)
  const oldest = ids[0] ?? ''
  // The creator signed and broadcast: an attempt exists and has not settled.
  await app.db.insert(tx_attempts).values({ user_id: session.user.id, escrow_id: oldest, action: 'create', tx_ref: `create-${randomUUID()}` })

  await sleep(2)
  await mint(session.token, 2)
  assert.strictEqual(await readStatus(session.token, oldest), 200, 'an in-flight draft was rung out')
  // The ring counts only what it may discard, so the pending one sits ABOVE the cap.
  assert.strictEqual(await draftCount(session.user.id), DEMO_DRAFT_CAP + 1)
  assert.strictEqual(await readStatus(session.token, ids[1] ?? ''), 404, 'the next-oldest should have gone instead')
})

test('the DISCARD re-checks the in-flight guard, so a create recorded mid-ring cannot erase its escrow', { skip }, async () => {
  // The case above proves the SELECT skips an in-flight draft. This one is the
  // window BETWEEN the two statements, which is reachable precisely because the
  // demo account is shared: one caller's resend records its create attempt
  // while another caller's ring is already holding the ids it chose. Handing
  // those ids straight to the discard IS that state.
  //
  // Deleting there is not a lost draft — the relayer has broadcast and paid the
  // gas, and the cascade takes the tx_attempts row verify-tx would have applied,
  // so the escrow is orphaned on-chain with no server record.
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const session = await openDemoSession()
  const ids = await mint(session.token, 2)
  const [inFlight, ordinary] = ids
  assert.ok(inFlight !== undefined && ordinary !== undefined)
  await app.db.insert(tx_attempts).values({ user_id: session.user.id, escrow_id: inFlight, action: 'create', tx_ref: `create-${randomUUID()}` })

  assert.strictEqual(await discardDrafts(app.db, ids), 1, 'only the draft with no create in flight may go')
  assert.strictEqual(await readStatus(session.token, inFlight), 200, 'a draft whose create is in flight was erased by the discard')
  assert.strictEqual(await readStatus(session.token, ordinary), 404, 'the draft with nothing in flight should still have gone')
})

test('a settled attempt is no longer in flight, so its draft is dischargeable again', { skip }, async () => {
  // The other side of the guard: `pendingCreateAttempt` counts only attempts
  // with neither confirmed_at nor failed_at. A create that FAILED leaves a row
  // behind, and treating that as "in flight" would pin the draft forever — the
  // ring would stop being able to free the account at all.
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const session = await openDemoSession()
  const [only] = await mint(session.token, 1)
  assert.ok(only !== undefined)
  await app.db.insert(tx_attempts).values({
    user_id: session.user.id,
    escrow_id: only,
    action: 'create',
    tx_ref: `create-${randomUUID()}`,
    failed_at: new Date(),
  })
  assert.strictEqual(await discardDrafts(app.db, [only]), 1, 'a failed create still pinned the draft')
})

test('discardDrafts on an empty list touches nothing', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const session = await openDemoSession()
  await mint(session.token, 1)
  assert.strictEqual(await discardDrafts(app.db, []), 0)
  assert.strictEqual(await draftCount(session.user.id), 1)
})

test('isDemoAccount: the demo account by its wallet; nobody when no demo is configured', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const session = await openDemoSession()
  const other = await createUser(app)
  const configured = process.env.AGENT_DEMO_ADDRESS ?? null
  assert.strictEqual(await isDemoAccount(app.db, session.user.id, configured), true)
  assert.strictEqual(await isDemoAccount(app.db, other.row.id, configured), false)
  assert.strictEqual(await isDemoAccount(app.db, session.user.id, null), false)
})
