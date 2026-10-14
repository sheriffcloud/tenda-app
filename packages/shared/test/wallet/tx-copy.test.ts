/**
 * tx-copy — the wallet feed's per-side wording + amount honesty (the pure
 * half ported from mobile's TxRow jest suite when the module moved to
 * shared; the render half stays in mobile's TxRow.test).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TX_LABEL_BY_ROLE,
  txAmountRaw,
  txDisplayAmount,
  txLabel,
  txSign,
  viewerRole,
} from '../../src/wallet'
import { ESCROW_TX_TYPES, type EscrowTxType } from '../../src/constants/escrow'
import { TX_FEED_VISIBILITY } from '../../src/constants/escrow-feed'
import type { UserEscrowTransaction } from '../../src/types'

const KINDS = ['gig', 'exchange'] as const

function tx(over: Partial<UserEscrowTransaction> = {}): UserEscrowTransaction {
  return {
    id: 't1',
    escrow_id: 'e1',
    type: 'approve',
    tx_ref: 'sig-1',
    amount_raw: '48500000',
    platform_fee_raw: null,
    creator_payout_raw: null,
    actor_id: null,
    winner: null,
    created_at: '2026-08-15T00:00:00Z',
    escrow: {
      id: 'e1',
      kind: 'gig',
      title: 'Fix my sink',
      amount_raw: '50000000',
      asset: 'USDC_SOL',
      chain_id: 'solana:devnet',
      status: 'completed',
      creator_id: 'creator-1',
      counterparty_id: 'worker-1',
    },
    ...over,
  }
}

test('the base label map is TOTAL — no type on either kind renders its enum slug', () => {
  for (const type of ESCROW_TX_TYPES) {
    for (const kind of KINDS) {
      for (const role of ['creator', 'counterparty', null] as const) {
        const label = txLabel(kind, type, role)
        assert.notStrictEqual(label, type, `${kind}/${type}/${String(role)} leaked the slug`)
        assert.ok(label.length > 0)
      }
    }
  }
})

test('every type BOTH parties always see is worded per side, or explicitly waived', () => {
  const bothVisible = ESCROW_TX_TYPES.filter(
    (t) => TX_FEED_VISIBILITY[t].creator === 'always' && TX_FEED_VISIBILITY[t].counterparty === 'always',
  )
  const WAIVED: EscrowTxType[] = ['resolve'] // identical from either seat
  for (const type of bothVisible) {
    if (WAIVED.includes(type)) continue
    for (const kind of KINDS) {
      assert.ok(TX_LABEL_BY_ROLE[kind][type], `${kind}/${type} needs a per-side wording`)
    }
  }
  // …and no override exists for a type only one side ever sees.
  for (const kind of KINDS) {
    for (const type of Object.keys(TX_LABEL_BY_ROLE[kind]) as EscrowTxType[]) {
      assert.ok(bothVisible.includes(type), `${kind}/${type} override is unreachable`)
      // A per-side override must actually change what each side reads.
      assert.notStrictEqual(txLabel(kind, type, 'creator'), txLabel(kind, type, 'counterparty'))
    }
  }
})

test('viewerRole: creator / counterparty / null (an unassigned ex-worker matches neither)', () => {
  const row = tx()
  assert.strictEqual(viewerRole(row, 'creator-1'), 'creator')
  assert.strictEqual(viewerRole(row, 'worker-1'), 'counterparty')
  assert.strictEqual(viewerRole(row, 'someone-else'), null)
})

test('txSign is viewer-relative: funding debits the creator, payout credits the worker', () => {
  assert.strictEqual(txSign(tx({ type: 'create' }), 'creator'), '-')
  assert.strictEqual(txSign(tx({ type: 'create' }), 'counterparty'), null)
  assert.strictEqual(txSign(tx({ type: 'approve' }), 'counterparty'), '+')
  assert.strictEqual(txSign(tx({ type: 'approve' }), 'creator'), null)
  assert.strictEqual(txSign(tx({ type: 'cancel' }), 'creator'), '+')
  assert.strictEqual(txSign(tx({ type: 'submit' }), 'creator'), null) // neutral lifecycle row
})

test('resolve credits the winner (or both on a split), never the loser', () => {
  assert.strictEqual(txSign(tx({ type: 'resolve', winner: 'creator' }), 'creator'), '+')
  assert.strictEqual(txSign(tx({ type: 'resolve', winner: 'creator' }), 'counterparty'), null)
  assert.strictEqual(txSign(tx({ type: 'resolve', winner: 'split' }), 'counterparty'), '+')
  assert.strictEqual(txSign(tx({ type: 'resolve', winner: null }), 'creator'), null)
})

test('amount honesty: attested-only rows with no attested figure show NO number', () => {
  // settlement-amount honesty: never fall back to the principal for
  // approve/claim/resolve/dispute — that would overstate what moved.
  for (const type of ['approve', 'claim_stalled', 'dispute'] as const) {
    assert.strictEqual(txAmountRaw(tx({ type, amount_raw: null }), 'counterparty'), null)
  }
  // Non-credit rows fall back to the principal — that IS their exact figure.
  assert.strictEqual(txAmountRaw(tx({ type: 'accept', amount_raw: null }), 'creator'), '50000000')
})

test('resolve shows each side ITS share', () => {
  const row = tx({ type: 'resolve', amount_raw: '30000000', creator_payout_raw: '20000000' })
  assert.strictEqual(txAmountRaw(row, 'creator'), '20000000')
  assert.strictEqual(txAmountRaw(row, 'counterparty'), '30000000')
  assert.strictEqual(txAmountRaw(row, null), null)
})

test('txDisplayAmount converts to display units with the asset symbol; zero shows nothing', () => {
  const shown = txDisplayAmount(tx(), 'counterparty')
  assert.deepStrictEqual(shown, { amount: 48.5, symbol: 'USDC' })
  assert.strictEqual(txDisplayAmount(tx({ amount_raw: '0' }), 'counterparty'), null)
})

test('a resolve row seen by a NON-party (unassigned ex-worker) is unsigned', () => {
  assert.strictEqual(txSign(tx({ type: 'resolve', winner: 'split' }), null), null)
})

test('an asset missing from ASSET_META keeps its raw id as the symbol', () => {
  const base = tx()
  const row = tx({ escrow: { ...base.escrow, asset: 'MYSTERY_ASSET' } })
  assert.strictEqual(txDisplayAmount(row, 'counterparty')?.symbol, 'MYSTERY_ASSET')
})

test('...but shows NO figure for it, because its decimals are unknown', () => {
  // The row survives and still names the asset; only the number is withheld.
  // Base units would have read as 48,500,000 next to a symbol the reader has
  // no way to sanity-check.
  const base = tx()
  const row = tx({ escrow: { ...base.escrow, asset: 'MYSTERY_ASSET' } })
  assert.strictEqual(txDisplayAmount(row, 'counterparty')?.amount, null)
})

test('a zero amount still drops the whole row, unknown asset or not', () => {
  // The two nulls mean different things and must not be conflated: no money on
  // this row at all, versus money whose scale this build cannot express.
  assert.strictEqual(txDisplayAmount(tx({ amount_raw: '0' }), 'counterparty'), null)
})
