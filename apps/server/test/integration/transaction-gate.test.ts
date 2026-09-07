/**
 * Stage 9D — first-transaction gate (deferred wallet + verified contact).
 * Every route that builds an unsigned tx the caller must sign (escrow create /
 * accept / publish) requires BOTH a linked wallet on the escrow's chain
 * namespace (403 WALLET_REQUIRED, carrying chain_ns) AND ≥1 verified contact
 * (403 CONTACT_REQUIRED). Adversarial-first: each gate half is exercised in
 * isolation, plus the pass-through.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  makeTransactable,
  authHeader,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
type App = ReturnType<typeof getApp>

/** Link only a Solana wallet (no contact identity) — isolates the contact half. */
async function linkWalletOnly(app: App, userId: string): Promise<void> {
  await app.db.insert(user_wallets).values({
    chain_ns: 'solana',
    address: `SoWalletOnly${userId.replace(/-/g, '')}`,
    user_id: userId,
    is_primary: true,
    verified_at: new Date(),
  })
}

function postCreate(app: App, token: string) {
  return app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(token), payload: createEscrowBody(),
  })
}

// ---------- create -----------------------------------------------------------

test('create: no wallet on the chain → 403 WALLET_REQUIRED with chain_ns', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app) // complete profile, but no wallet + no contact
  const res = await postCreate(app, u.token)
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'WALLET_REQUIRED')
  // The client uses chain_ns to open the right link-wallet flow.
  assert.strictEqual(res.json().details?.chain_ns, 'solana')
})

test('create: wallet present but no verified contact → 403 CONTACT_REQUIRED', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await linkWalletOnly(app, u.row.id) // clears the wallet half only
  const res = await postCreate(app, u.token)
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'CONTACT_REQUIRED')
})

test('create: wallet + verified contact → 201 (gate passes)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await makeTransactable(app, u.row.id)
  const res = await postCreate(app, u.token)
  assert.strictEqual(res.statusCode, 201)
})

// ---------- direct assignment: the assignee needs a wallet too ----------------

test('create: direct-assign to a walletless counterparty → 422 ASSIGNEE_WALLET_REQUIRED', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id) // caller clears the gate first
  const assignee = await createUser(app) // no wallet — can't have their address baked in
  const res = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token),
    payload: createEscrowBody({ assigned_counterparty_id: assignee.row.id }),
  })
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, 'ASSIGNEE_WALLET_REQUIRED')
  // The client gets the chain + assignee so it can prompt the right person.
  assert.strictEqual(res.json().details?.assignee_id, assignee.row.id)
})

test('create: direct-assign to a counterparty WITH a wallet → 201', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)
  const assignee = await createUser(app)
  await makeTransactable(app, assignee.row.id) // assignee has a solana wallet to bake in
  const res = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token),
    payload: createEscrowBody({ assigned_counterparty_id: assignee.row.id }),
  })
  assert.strictEqual(res.statusCode, 201)
})

// ---------- accept -----------------------------------------------------------

test('accept: counterparty without a wallet → 403 WALLET_REQUIRED', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app) // no wallet/contact
  const e = await createEscrow(app, {
    creator_id: creator.row.id, status: 'open', assigned_counterparty_id: worker.row.id,
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'WALLET_REQUIRED')
})

// ---------- build-create (publish) -------------------------------------------

test('build-create: publishing a draft without a wallet → 403 WALLET_REQUIRED', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const draft = await createEscrow(app, {
    creator_id: u.row.id, status: 'draft', kind: 'gig', completion_duration_seconds: 86_400,
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${draft.id}/build-create`, headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'WALLET_REQUIRED')
})
