/**
 * `GET /v1/wallet/gas-seed`'s answer (#53c-1): one verdict per seedable chain,
 * scoped to the caller, and costing an RPC round trip only when it must.
 *
 * The DECISION each verdict carries is proved in gas-seed-eligibility.test.ts.
 * What this file owns is the read AROUND it — where the session's identity
 * comes from, and when the hot-wallet balance is worth asking for.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { gasSeedAvailability } from '@server/features/gas-seed'
import { makeDeps, MOBILE, SOLANA, ZEROG } from '../helpers/gas-seed-claim'
import { withChainPaused } from '../helpers/pause-chain'

// ---------- availability ---------------------------------------------------------

test('availability answers once per seedable chain, in the order the store returns', () => {
  const { deps } = makeDeps({ chains: [SOLANA, ZEROG], wallets: { solana: 'W1', eip155: '0xE' } })
  return gasSeedAvailability(deps, MOBILE).then((res) => {
    assert.deepStrictEqual(
      res.chains.map((c) => c.chain_id),
      ['solana:devnet', 'eip155:16661'],
    )
    assert.ok(res.chains.every((c) => c.available))
  })
})

test('the session client comes from the TOKEN, not from the store', async () => {
  // The store deliberately returns `client: null` for everyone; the identity
  // supplies it. If the service ever took the store's value, a mobile session
  // would be refused as web — the feature would look broken for everyone.
  const { deps } = makeDeps({ wallets: { eip155: '0xE' } })
  const asWeb = await gasSeedAvailability(deps, { user_id: 'u-1', client: null })
  assert.strictEqual(asWeb.chains[0]?.reason, 'mobile_only')

  const asApp = await gasSeedAvailability(deps, MOBILE)
  assert.strictEqual(asApp.chains[0]?.available, true)
})

test('a refusal that has nothing to do with the hot wallet costs NO balance read', async () => {
  // The two-phase read: an RPC round trip per chain on every availability poll
  // is the cost this avoids, and nothing else would notice if it regressed.
  const { deps, balanceReads } = makeDeps({ wallets: {} }) // no wallet on chain
  const res = await gasSeedAvailability(deps, MOBILE)
  assert.strictEqual(res.chains[0]?.reason, 'no_wallet')
  assert.deepStrictEqual(balanceReads, [], 'read a balance for a claim already refused')
})

test('the balance IS read when it is the only thing left to check', async () => {
  const { deps, balanceReads } = makeDeps({ wallets: { eip155: '0xE' } })
  await gasSeedAvailability(deps, MOBILE)
  assert.deepStrictEqual(balanceReads, ['eip155:16661'])
})

test('an empty hot wallet turns an otherwise-eligible claim into funder_empty', async () => {
  const { deps } = makeDeps({ wallets: { eip155: '0xE' }, balances: { 'eip155:16661': 1n } })
  const res = await gasSeedAvailability(deps, MOBILE)
  assert.strictEqual(res.chains[0]?.available, false)
  assert.strictEqual(res.chains[0]?.reason, 'funder_empty')
})

test('a chain whose balance read THROWS is reported, not propagated', async () => {
  // One sick chain must not take the whole availability response down: a user
  // with a wallet on two chains still needs the answer for the healthy one.
  const { deps } = makeDeps({ chains: [SOLANA, ZEROG], wallets: { solana: 'W1', eip155: '0xE' } })
  const funders = new Map(deps.funders)
  funders.set('solana:devnet', {
    address: 'funder-of-solana:devnet',
    balance: () => Promise.reject(new Error('rpc down')),
  })
  const res = await gasSeedAvailability({ ...deps, funders }, MOBILE)
  assert.strictEqual(res.chains[0]?.reason, 'funder_empty')
  assert.strictEqual(res.chains[1]?.available, true)
})

test('a PAUSED chain offers no seed — a seed onboards a new user onto the chain, which a pause refuses', async () => {
  const { deps } = makeDeps({ chains: [SOLANA, ZEROG], wallets: { solana: 'W1', eip155: '0xE' } })
  const during = await withChainPaused(ZEROG.chain_id, () => gasSeedAvailability(deps, MOBILE))
  const byChain = Object.fromEntries(during.chains.map((c) => [c.chain_id, c]))
  assert.strictEqual(byChain[ZEROG.chain_id]?.available, false)
  assert.strictEqual(byChain[ZEROG.chain_id]?.reason, 'claims_disabled')
  assert.strictEqual(byChain[SOLANA.chain_id]?.available, true, 'only the paused chain is switched off')
  // And it comes back with the flag.
  const after = await gasSeedAvailability(deps, MOBILE)
  assert.ok(after.chains.every((c) => c.available))
})
