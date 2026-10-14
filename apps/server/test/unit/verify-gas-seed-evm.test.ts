/**
 * The EVM arm of the gas-seed audit (#53b item 3).
 *
 * The script was Solana-only, so a funded EVM hot wallet had nothing checking
 * that its grants were real transfers to the right people — the single thing
 * that script exists to provide. Every decision below is pure and injected, so
 * each failure mode is provable without a node.
 *
 * The case that matters most is the ROTATION one: an audit that checks history
 * against the currently configured key reports every grant an older key paid as
 * fraudulent, which is an alarm that fires on a correct operation.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { checkEvmGrant, type EvmTxView, type FetchEvmTx, type GrantRow } from '@server/scripts/verify-gas-seed'

const FUNDER = '0xB661f0d2ce46Bd787b4Fb5C40c74cF94CCBa8B23'
const OLD_FUNDER = '0x00000000000000000000000000000000000000f1'
const WALLET = '0x4a379BaDEE3B195E47A86d6ec6D4A10D21A457DE'
const OTHER = '0x000000000000000000000000000000000000dEaD'
const AMOUNT = '10000000000000000'

function grant(over: Partial<GrantRow> = {}): GrantRow {
  return {
    user_id: 'u1',
    chain_id: 'eip155:16602',
    amount_raw: AMOUNT,
    // `delivered` is the default because that is the only status with a
    // confirmed transaction to check; the unfinished ones are their own tests.
    status: 'delivered',
    tx_ref: '0xc9a1353e969b7248d8dce11424a1e9dc977802fa32fa8e463d648d5bb9b22f04',
    funder_address: FUNDER,
    wallet_address: WALLET,
    granted_at: new Date(),
    ...over,
  }
}

function tx(over: Partial<EvmTxView> = {}): EvmTxView {
  return { status: 'success', from: FUNDER, to: WALLET, value: BigInt(AMOUNT), ...over }
}

const returning = (view: EvmTxView | null): FetchEvmTx => () => Promise.resolve(view)

test('a real, successful transfer to the recorded wallet verifies', async () => {
  const r = await checkEvmGrant(returning(tx()), grant(), FUNDER)
  assert.strictEqual(r.ok, true)
  assert.match(r.detail, /→ 0x4a379BaDEE/)
})

test('EIP-55 casing is not a mismatch — nodes lower-case, the DB does not', async () => {
  // The two sides come from different places. Comparing them raw reports a
  // correct grant as "someone else funded this", which is the loudest possible
  // false alarm on this surface.
  const r = await checkEvmGrant(
    returning(tx({ from: FUNDER.toLowerCase(), to: WALLET.toLowerCase() })),
    grant(),
    FUNDER,
  )
  assert.strictEqual(r.ok, true)
})

test('a ROTATED key does not retroactively condemn older grants', async () => {
  // The reason `funder_address` is per grant (#53c-1). This grant was paid by
  // the OLD wallet and records it; the chain is now configured with a new one.
  // Checking against the chain's current funder would fail a correct grant.
  const r = await checkEvmGrant(
    returning(tx({ from: OLD_FUNDER })),
    grant({ funder_address: OLD_FUNDER }),
    FUNDER,
  )
  assert.strictEqual(r.ok, true, r.detail)
})

test('a grant with NO recorded funder falls back to the chain’s current one', async () => {
  // Every grant written before the column existed. The fallback is what keeps
  // those auditable at all.
  const r = await checkEvmGrant(returning(tx()), grant({ funder_address: null }), FUNDER)
  assert.strictEqual(r.ok, true)
})

test('a transfer from the WRONG wallet fails, naming both', async () => {
  const r = await checkEvmGrant(returning(tx({ from: OTHER })), grant(), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /funded by 0x0000/)
  assert.match(r.detail, /recorded seed wallet/)
})

test('a transfer to a DIFFERENT wallet than the grant records fails', async () => {
  // "The money left the hot wallet" is not the claim being audited; "it reached
  // the person the grant is for" is.
  const r = await checkEvmGrant(returning(tx({ to: OTHER })), grant(), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /but the grant records/)
})

test('a REVERTED transaction fails even though the hash exists', async () => {
  const r = await checkEvmGrant(returning(tx({ status: 'reverted' })), grant(), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /reverted/)
})

test('the wrong AMOUNT fails, and reports both figures', async () => {
  const r = await checkEvmGrant(returning(tx({ value: 1n })), grant(), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /transferred 1 wei, grant records 10000000000000000/)
})

test('a contract creation (no recipient) is not mistaken for a seed', async () => {
  // `to` is null for a deployment. Treating that as a match would let one pass.
  const r = await checkEvmGrant(returning(tx({ to: null })), grant(), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /no recipient/)
})

test('a tx_ref the node has never seen is a finding, not a crash', async () => {
  const r = await checkEvmGrant(returning(null), grant(), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /not found on-chain/)
})

test('an UNFINISHED grant is reported without any chain lookup at all', async () => {
  // Nothing but a `delivered` grant has a confirmed transaction to inspect, and
  // asking the chain about one would be asking about a hash that either does not
  // exist or is not yet meaningful.
  //
  // The three states get DIFFERENT text, which is the point of #58 replacing the
  // one `pending:` string: they need different actions from an operator.
  const cases = [
    { status: 'claimed' as const, tx_ref: null, expect: /nothing was ever signed/ },
    { status: 'submitted' as const, tx_ref: '0xabc', expect: /awaiting confirmation/ },
    { status: 'unresolved' as const, tx_ref: '0xabc', expect: /UNRESOLVED/ },
  ]
  for (const c of cases) {
    let asked = false
    const fetch: FetchEvmTx = () => {
      asked = true
      return Promise.resolve(null)
    }
    const r = await checkEvmGrant(fetch, grant({ status: c.status, tx_ref: c.tx_ref }), FUNDER)
    assert.strictEqual(r.ok, false, `${c.status} must be reported as a finding`)
    assert.match(r.detail, c.expect)
    assert.strictEqual(asked, false, `${c.status}: looked up a ref it should not have`)
  }
})

test('a DELIVERED grant with no reference is reported, not dereferenced', async () => {
  // Unreachable through the code — the write that sets `delivered` always has a
  // reference — but the columns are independently nullable and a hand-repaired
  // row can contradict that. It must report, not throw.
  const r = await checkEvmGrant(returning(tx()), grant({ tx_ref: null }), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /no tx_ref/)
})

test('a grant predating wallet_address verifies, with the gap NAMED', async () => {
  // Honest rather than silent: the funder and amount are still checked, and the
  // detail says which check could not run.
  const r = await checkEvmGrant(returning(tx()), grant({ wallet_address: null }), FUNDER)
  assert.strictEqual(r.ok, true)
  assert.match(r.detail, /destination unchecked/)
})

test('a fetch that THROWS becomes a failing result, not an aborted audit', async () => {
  // One unreachable transaction must not end a run over many grants.
  const boom: FetchEvmTx = () => Promise.reject(new Error('rpc down'))
  const r = await checkEvmGrant(boom, grant(), FUNDER)
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /rpc down/)
})

test('a malformed address on either side fails closed', async () => {
  const r = await checkEvmGrant(returning(tx({ from: 'not-an-address' })), grant(), FUNDER)
  assert.strictEqual(r.ok, false)
})
