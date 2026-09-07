/**
 * boot-seed guard — the decision half: which registry rows the seed would
 * switch off, and which of those still hold user funds.
 *
 * Pure, so it is tested without a database; the DB half (advisory lock, the
 * counting queries, applySeedRows) is covered in integration/boot-seed.test.ts.
 *
 * The two halves guard DIFFERENT harms, which is why they have separate
 * override flags:
 *   - a disabled CHAIN means no adapter was built, so every action on its
 *     escrows fails and the funds are trapped
 *   - a disabled ASSET only blocks CREATION; existing escrows still settle,
 *     because settlement never re-resolves the asset
 * Under-report either and a deploy silently ships the wrong one.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  ESCROW_STATUS_ORDER,
  ESCROW_STATUS_SETTLEMENT,
  UNSETTLED_ESCROW_STATUSES,
} from '@tenda/shared'
import {
  idsToDisable,
  assetsToDisable,
  pendingDisables,
  describeBlockedDisable,
  unacknowledgedDisables,
  DISABLE_OVERRIDE,
} from '@server/lib/boot-seed'

const counts = (o: Record<string, number>) => new Map(Object.entries(o))

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

test('a chain missing from config but holding unsettled escrows is blocked', () => {
  const blocked = pendingDisables(
    'chain',
    idsToDisable(['solana:devnet', 'eip155:84532'], ['solana:devnet']),
    counts({ 'eip155:84532': 7 }),
  )
  assert.deepStrictEqual(blocked, [{ entity: 'chain', id: 'eip155:84532', unsettled: 7 }])
})

test('a chain missing from config with only settled escrows is allowed to retire', () => {
  // The whole point of counting rather than merely detecting the disable: a
  // finished chain must still be retirable without an override.
  assert.deepStrictEqual(
    pendingDisables('chain', idsToDisable(['a', 'b'], ['a']), counts({})),
    [],
  )
})

test('a chain still in the active config is never blocked, however many escrows it holds', () => {
  assert.deepStrictEqual(
    pendingDisables('chain', idsToDisable(['a', 'b'], ['a', 'b']), counts({ b: 999 })),
    [],
  )
})

test('a chain already disabled is not re-reported', () => {
  // Only currently-enabled rows are passed in; a chain retired earlier must not
  // resurface as a blocker on every subsequent boot.
  assert.deepStrictEqual(pendingDisables('chain', idsToDisable([], ['a']), counts({ b: 3 })), [])
})

test('every row being dropped is reported, not just the first', () => {
  const blocked = pendingDisables('chain', idsToDisable(['a', 'b', 'c'], ['a']), counts({ b: 2, c: 5 }))
  assert.deepStrictEqual(blocked, [
    { entity: 'chain', id: 'b', unsettled: 2 },
    { entity: 'chain', id: 'c', unsettled: 5 },
  ])
})

// ---------------------------------------------------------------------------
// Assets — not stranding: creation stops, existing escrows still settle
// ---------------------------------------------------------------------------

test('an asset dropped from config while its chain survives is blocked', () => {
  // The real shape of this: CHAIN_SOLANA_DEVNET_USDC_MINT goes missing, the
  // chain stays up, and USDC alone is retired — so the app quietly stops
  // offering it while escrows on it are still open.
  const candidates = assetsToDisable(
    [
      { id: 'USDC_SOL_DEVNET', chain_id: 'solana:devnet' },
      { id: 'SOL_DEVNET', chain_id: 'solana:devnet' },
    ],
    ['SOL_DEVNET'],
    [],
  )
  assert.deepStrictEqual(candidates, ['USDC_SOL_DEVNET'])
  assert.deepStrictEqual(pendingDisables('asset', candidates, counts({ USDC_SOL_DEVNET: 4 })), [
    { entity: 'asset', id: 'USDC_SOL_DEVNET', unsettled: 4 },
  ])
})

test('assets on a chain that is itself retiring are NOT reported separately', () => {
  // Otherwise one retired chain reports once as the chain and again as each of
  // its assets, burying the line that matters under duplicates of itself.
  assert.deepStrictEqual(
    assetsToDisable(
      [
        { id: 'USDC_BASE', chain_id: 'eip155:84532' },
        { id: 'ETH_BASE', chain_id: 'eip155:84532' },
      ],
      [],
      ['eip155:84532'],
    ),
    [],
  )
})

test('a retiring chain hides only ITS assets, not another live chain\'s', () => {
  assert.deepStrictEqual(
    assetsToDisable(
      [
        { id: 'USDC_BASE', chain_id: 'eip155:84532' },
        { id: 'USDC_SOL', chain_id: 'solana:devnet' },
      ],
      [],
      ['eip155:84532'],
    ),
    ['USDC_SOL'],
  )
})

test('an asset still in the active config is never a candidate', () => {
  assert.deepStrictEqual(
    assetsToDisable([{ id: 'USDC_SOL', chain_id: 'solana:devnet' }], ['USDC_SOL'], []),
    [],
  )
})

// ---------------------------------------------------------------------------
// Shared contracts
// ---------------------------------------------------------------------------

test('the refusal states each row\'s OWN consequence and OWN flag', () => {
  const msg = describeBlockedDisable([
    { entity: 'chain', id: 'eip155:84532', unsettled: 7 },
    { entity: 'asset', id: 'USDC_SOL_DEVNET', unsettled: 1 },
  ])
  assert.ok(msg.includes('chain eip155:84532: 7 unsettled escrow(s)'))
  assert.ok(msg.includes('asset USDC_SOL_DEVNET: 1 unsettled escrow(s)'))
  // Each names its own flag — an operator must not read one and set the other.
  assert.ok(msg.includes('set ALLOW_CHAIN_DISABLE=true'))
  assert.ok(msg.includes('set ALLOW_ASSET_DISABLE=true'))
  // And the consequences are stated separately, because they genuinely differ:
  // a chain disable traps funds, an asset disable only stops new creation.
  assert.ok(msg.includes('funds are stuck'))
  assert.ok(msg.includes('existing escrows still settle normally'))
  assert.ok(msg.includes('NEW escrows on this asset'))
})

// ---------------------------------------------------------------------------
// The split flags — the whole point is that one cannot clear the other
// ---------------------------------------------------------------------------

const CHAIN_BLOCK = { entity: 'chain', id: 'eip155:84532', unsettled: 7 } as const
const ASSET_BLOCK = { entity: 'asset', id: 'USDC_SOL_DEVNET', unsettled: 1 } as const

test('ALLOW_CHAIN_DISABLE does NOT clear an asset block', () => {
  // The reason the flag was split. A single flag would be set routinely for
  // harmless asset retirements and then already be present on the day a chain
  // disable is about to freeze real money.
  assert.deepStrictEqual(unacknowledgedDisables([ASSET_BLOCK], { ALLOW_CHAIN_DISABLE: 'true' }), [
    ASSET_BLOCK,
  ])
})

test('ALLOW_ASSET_DISABLE does NOT clear a chain block — the dangerous direction', () => {
  assert.deepStrictEqual(unacknowledgedDisables([CHAIN_BLOCK], { ALLOW_ASSET_DISABLE: 'true' }), [
    CHAIN_BLOCK,
  ])
})

test('each flag clears its own kind, and only its own kind', () => {
  assert.deepStrictEqual(
    unacknowledgedDisables([CHAIN_BLOCK, ASSET_BLOCK], { ALLOW_CHAIN_DISABLE: 'true' }),
    [ASSET_BLOCK],
  )
  assert.deepStrictEqual(
    unacknowledgedDisables([CHAIN_BLOCK, ASSET_BLOCK], { ALLOW_ASSET_DISABLE: 'true' }),
    [CHAIN_BLOCK],
  )
})

test('both flags together clear everything; neither clears nothing', () => {
  assert.deepStrictEqual(
    unacknowledgedDisables([CHAIN_BLOCK, ASSET_BLOCK], {
      ALLOW_CHAIN_DISABLE: 'true',
      ALLOW_ASSET_DISABLE: 'true',
    }),
    [],
  )
  assert.deepStrictEqual(unacknowledgedDisables([CHAIN_BLOCK, ASSET_BLOCK], {}), [
    CHAIN_BLOCK,
    ASSET_BLOCK,
  ])
})

test('only the exact string "true" acknowledges — not "1", not "TRUE"', () => {
  for (const v of ['1', 'TRUE', 'yes', '']) {
    assert.deepStrictEqual(
      unacknowledgedDisables([CHAIN_BLOCK], { ALLOW_CHAIN_DISABLE: v }),
      [CHAIN_BLOCK],
      `'${v}' must not count as acknowledgement`,
    )
  }
})

test('every entity kind has an override flag — a new kind cannot be unguardable', () => {
  // Record<RegistryEntity, string> makes omission a compile error; this makes
  // it a test failure too, and pins the names the runbook documents.
  assert.deepStrictEqual(DISABLE_OVERRIDE, {
    chain: 'ALLOW_CHAIN_DISABLE',
    asset: 'ALLOW_ASSET_DISABLE',
  })
})

test('idsToDisable is the single source for both halves and both judgements', () => {
  // pendingDisables falls back to 0 for an id it has no count for, which is
  // fail-open. That is only safe because the ids counted and the ids judged
  // come from this one function (assetsToDisable delegates to it too). Pinned
  // so a second predicate cannot creep back in.
  assert.deepStrictEqual(idsToDisable(['a', 'b', 'c'], ['b']), ['a', 'c'])
  assert.deepStrictEqual(idsToDisable(['a'], ['a']), [])
  assert.deepStrictEqual(idsToDisable([], ['a']), [])
})

test('a candidate with no count entry is treated as safe — the fail-open contract', () => {
  // Documents the behaviour deliberately rather than leaving it implicit: if
  // this ever needs to be fail-CLOSED, this test is what has to change first.
  assert.deepStrictEqual(pendingDisables('chain', ['a'], new Map()), [])
  assert.deepStrictEqual(pendingDisables('asset', ['a'], new Map()), [])
})

// ---------------------------------------------------------------------------
// The status split the counts depend on
// ---------------------------------------------------------------------------

test('every escrow status is classified, so a new one cannot be silently missed', () => {
  // The type makes omission a compile error; this makes it a test failure too,
  // because the DB enum is what actually feeds the query.
  for (const s of ESCROW_STATUS_ORDER) {
    assert.ok(
      ESCROW_STATUS_SETTLEMENT[s] === 'settled' || ESCROW_STATUS_SETTLEMENT[s] === 'unsettled',
      `status '${s}' is not classified as settled/unsettled`,
    )
  }
  assert.strictEqual(
    Object.keys(ESCROW_STATUS_SETTLEMENT).length,
    ESCROW_STATUS_ORDER.length,
    'ESCROW_STATUS_SETTLEMENT has entries that are not real statuses',
  )
})

test('the unsettled set is exactly the funded, non-terminal statuses', () => {
  // Pinned by value, not derived from the map, so flipping a classification
  // fails here rather than silently changing what the guard counts. `disputed`
  // matters most: funds are locked AND a mediator still has to act.
  assert.deepStrictEqual(
    [...UNSETTLED_ESCROW_STATUSES].sort(),
    ['accepted', 'disputed', 'open', 'submitted'],
  )
})

test('terminal statuses are excluded — the contract has already released them', () => {
  for (const s of ['completed', 'cancelled', 'refunded', 'resolved'] as const) {
    assert.ok(
      !UNSETTLED_ESCROW_STATUSES.includes(s),
      `'${s}' is terminal and must not count as stranding anybody`,
    )
  }
})

test('draft is absent — it is off-chain and was never funded', () => {
  assert.ok(!(UNSETTLED_ESCROW_STATUSES as readonly string[]).includes('draft'))
})
