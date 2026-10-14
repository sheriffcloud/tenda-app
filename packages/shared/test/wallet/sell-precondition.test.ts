import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sellWalletNotice, sellWalletSection } from '../../src/wallet/sell-precondition'
import { resolveWalletSection, type WalletSectionState } from '../../src/wallet/section-state'

/**
 * #60. An empty sell list had four causes and one rendering. These are
 * written from the two accounts that broke: the one with no wallet at all,
 * and the one that HAS a wallet and was told to link one because nothing had
 * finished loading yet.
 */

const OFFER = 'Link a wallet to post an offer.'

/** From the type, so a new section state cannot skip the checks below. */
const ALL_SECTIONS: readonly WalletSectionState[] = [
  'ready', 'loading', 'no-wallet', 'wallets-error', 'balances-unavailable',
]

test('a usable surface says nothing — the caller renders its picker', () => {
  assert.equal(sellWalletNotice('ready', OFFER), null)
})

test('a settled absence asks for a wallet, in the CALLER own words', () => {
  const notice = sellWalletNotice('no-wallet', OFFER)
  assert.ok(notice)
  assert.equal(notice.message, OFFER)
  assert.equal(notice.action, 'link')
  assert.equal(notice.cta, 'Link a wallet')
})

test('while it is still looking it speaks but offers NO control', () => {
  // The defect this state exists for: mobile said "link a wallet" here, to a
  // reader who may well have one. The only honest response is to wait, so
  // there is nothing to press.
  const notice = sellWalletNotice('loading', OFFER)
  assert.ok(notice)
  assert.equal(notice.action, null)
  assert.equal(notice.cta, null)
  assert.notEqual(notice.message, OFFER)
  assert.match(notice.message, /checking/i)
})

test('the two failures retry DIFFERENT loads and say different things', () => {
  const wallets = sellWalletNotice('wallets-error', OFFER)
  const chains = sellWalletNotice('balances-unavailable', OFFER)
  assert.ok(wallets && chains)
  assert.equal(wallets.action, 'retry-wallets')
  assert.equal(chains.action, 'retry-chains')
  // A single "retry" wired to one load would leave the other stuck.
  assert.notEqual(wallets.action, chains.action)
  assert.notEqual(wallets.message, chains.message)
})

test('no failure state ever claims the user has no wallet', () => {
  for (const section of ['loading', 'wallets-error', 'balances-unavailable'] as const) {
    const notice = sellWalletNotice(section, OFFER)
    assert.ok(notice)
    assert.notEqual(notice.message, OFFER, `${section} borrowed the no-wallet line`)
    assert.notEqual(notice.action, 'link', `${section} offered the no-wallet control`)
  }
})

test('every section state is mapped — none falls through to undefined', () => {
  for (const section of ALL_SECTIONS) {
    const notice = sellWalletNotice(section, OFFER)
    // null is a decision here; undefined would be an omission.
    assert.ok(notice === null || typeof notice.message === 'string', `${section} is unmapped`)
    if (notice !== null) assert.ok(notice.message.length > 0, `${section} has an empty message`)
  }
})

test('a section this map does not recognise is silent, not an accusation', () => {
  const loose = sellWalletNotice as unknown as (s: unknown, m: string) => unknown
  for (const bad of ['', 'READY', 'no_wallet', null, undefined]) {
    assert.equal(loose(bad, OFFER), null, `${String(bad)} produced a non-null miss`)
  }
})

// ---------- the sell surface's own precedence -------------------------------

const READY = {
  walletsStatus: 'ready', chainsStatus: 'ready', registryUsable: true, hasTradableOption: true,
} as const

test('something to sell is the only route to ready', () => {
  assert.equal(sellWalletSection(READY), 'ready')
  // ...so a caller can never land on the picker with nothing in it.
  assert.notEqual(sellWalletSection({ ...READY, hasTradableOption: false }), 'ready')
})

test('a FAILED registry is blamed on the registry, whatever the wallets say', () => {
  // THE defect this function exists for. Fed through the wallet screen's
  // ordering — which asks about wallets first and never reaches chainsStatus —
  // this same input answered 'no-wallet', telling a reader holding a verified
  // wallet to link one because OUR chains request had failed.
  const input = {
    walletsStatus: 'ready', chainsStatus: 'error', registryUsable: false, hasTradableOption: false,
  } as const
  assert.equal(sellWalletSection(input), 'balances-unavailable')
  assert.equal(resolveWalletSection({ ...input, hasWallet: false }), 'no-wallet')
})

test('BOTH loads failed: the registry is named, because there was no list to filter', () => {
  // The one input that distinguishes the two orderings — and nothing pinned it
  // before, so swapping the checks passed every test. With no chains there is
  // no option list at all, so the wallets question is moot; naming the wallets
  // here would also be the harsher of the two claims.
  assert.equal(
    sellWalletSection({
      walletsStatus: 'error', chainsStatus: 'error',
      registryUsable: false, hasTradableOption: false,
    }),
    'balances-unavailable',
  )
})

test('a registry still in flight is loading, not a verdict on the reader', () => {
  for (const chainsStatus of ['idle', 'loading'] as const) {
    assert.equal(
      sellWalletSection({ ...READY, chainsStatus, registryUsable: false, hasTradableOption: false }),
      'loading',
      chainsStatus,
    )
  }
})

test('with the registry usable, the wallets decide — and only a settled list accuses', () => {
  const base = { ...READY, hasTradableOption: false }
  assert.equal(sellWalletSection({ ...base, walletsStatus: 'ready' }), 'no-wallet')
  assert.equal(sellWalletSection({ ...base, walletsStatus: 'error' }), 'wallets-error')
  for (const walletsStatus of ['idle', 'loading'] as const) {
    assert.equal(sellWalletSection({ ...base, walletsStatus }), 'loading', walletsStatus)
  }
})

test('every situation reaches a notice the surface can render', () => {
  // End to end: the section function and the copy map, together.
  const cases: [Parameters<typeof sellWalletSection>[0], string | null][] = [
    [READY, null],
    [{ ...READY, hasTradableOption: false }, OFFER],
    [{ ...READY, hasTradableOption: false, walletsStatus: 'loading' }, 'checking'],
    [{ ...READY, hasTradableOption: false, walletsStatus: 'error' }, 'wallets'],
    [{ ...READY, hasTradableOption: false, registryUsable: false, chainsStatus: 'error' }, 'chains'],
  ]
  for (const [input, expected] of cases) {
    const notice = sellWalletNotice(sellWalletSection(input), OFFER)
    if (expected === null) {
      assert.equal(notice, null, JSON.stringify(input))
    } else {
      assert.ok(notice, JSON.stringify(input))
      assert.match(notice.message, new RegExp(expected, 'i'), JSON.stringify(input))
    }
  }
})
