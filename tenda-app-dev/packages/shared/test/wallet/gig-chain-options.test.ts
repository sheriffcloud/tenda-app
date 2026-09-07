import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chainOptionLabel,
  gigChainOptions,
  defaultGigChainId,
  type ChainOptionState,
  type GigChainOption,
} from '../../src/wallet/gig-chain-options'
import type { LinkedWallet } from '../../src/api/contracts/auth.contract'
import type { ChainRegistryEntry } from '../../src/api/contracts/platform.contract'
import type { WalletsStatus } from '../../src/wallet/section-state'
import { CHAIN_MANIFEST } from '../../src/chains/manifest'
import { gigAssetByChain } from '../../src/chains/manifest-queries'

/**
 * #58. The shipped rule was `namespace !== 'eip155' || hasEvmWallet`, so a
 * chain on any OTHER namespace was enabled unconditionally and the composer's
 * default pointed at one. These tests are written from the two accounts that
 * broke: the fresh one with no wallet, and the one that linked only EVM.
 */

/** Real chain ids off the manifest — a fabricated id would not be gig-eligible. */
function gigChainOn(namespace: 'solana' | 'eip155'): string {
  const entry = CHAIN_MANIFEST.find((c) => c.namespace === namespace && gigAssetByChain(c.id) !== null)
  assert.ok(entry, `no gig-carrying ${namespace} chain in the manifest`)
  return entry.id
}

const SOLANA_CHAIN = gigChainOn('solana')
const EVM_CHAIN = gigChainOn('eip155')

function registryEntry(id: string): ChainRegistryEntry {
  const manifest = CHAIN_MANIFEST.find((c) => c.id === id)
  assert.ok(manifest, `unknown chain ${id}`)
  const gigAsset = gigAssetByChain(id)
  assert.ok(gigAsset, `${id} carries no gig asset`)
  return {
    id,
    namespace: manifest.namespace,
    display_name: manifest.displayName,
    escrow_address: 'unused-by-these-tests',
    assets: [
      { id: gigAsset, symbol: 'USDC', decimals: 6, is_stable: true, token_address: null, supports_permit: false },
    ],
  }
}

const REGISTRY = [registryEntry(SOLANA_CHAIN), registryEntry(EVM_CHAIN)]

/**
 * EXACTLY the four fields LinkedWallet carries, and no cast: an `as` here
 * would let the fixture claim fields the wire has no way to send, which is
 * how a test starts measuring its own fiction instead of the contract.
 */
function wallet(chain_ns: 'solana' | 'eip155', verified = true): LinkedWallet {
  return {
    chain_ns,
    address: chain_ns === 'solana' ? 'So11111111111111111111111111111111111111112' : '0x'.padEnd(42, 'a'),
    is_primary: true,
    verified_at: verified ? new Date().toISOString() : null,
  }
}

function options(wallets: LinkedWallet[], walletsStatus: WalletsStatus = 'ready') {
  return gigChainOptions({ registry: REGISTRY, wallets, walletsStatus })
}

/** Every state a wallets load can report — from the type, not retyped by hand. */
const ALL_STATUSES: readonly WalletsStatus[] = ['idle', 'loading', 'ready', 'error']

/** Likewise for the option states, so a new one cannot skip the label checks. */
const ALL_OPTION_STATES: readonly ChainOptionState[] = [
  'ready', 'needs_wallet', 'wallets_loading', 'wallets_unavailable',
]

function byId(list: GigChainOption[], id: string): GigChainOption {
  const found = list.find((o) => o.id === id)
  assert.ok(found, `no option for ${id}`)
  return found
}

// ---------- the bug, stated as tests -----------------------------------------

test('no wallets at all: NO chain is offerable, Solana included', () => {
  // The shipped rule returned enabled:true for Solana here, which is the whole
  // defect — the one enabled chip read as verified next to greyed EVM ones.
  const list = options([])
  assert.equal(list.length, 2)
  for (const opt of list) assert.equal(opt.enabled, false, `${opt.id} must not be offerable`)
})

test('an EVM-only wallet does not make Solana offerable', () => {
  const list = options([wallet('eip155')])
  assert.equal(byId(list, EVM_CHAIN).enabled, true)
  assert.equal(byId(list, SOLANA_CHAIN).enabled, false)
  assert.equal(byId(list, SOLANA_CHAIN).state, 'needs_wallet')
})

test('a Solana-only wallet does not make EVM offerable', () => {
  const list = options([wallet('solana')])
  assert.equal(byId(list, SOLANA_CHAIN).enabled, true)
  assert.equal(byId(list, EVM_CHAIN).enabled, false)
  assert.equal(byId(list, EVM_CHAIN).state, 'needs_wallet')
})

test('both namespaces linked: both offerable', () => {
  const list = options([wallet('solana'), wallet('eip155')])
  for (const opt of list) assert.equal(opt.enabled, true, `${opt.id} should be offerable`)
})

test('an UNVERIFIED wallet does not offer its chain', () => {
  // verifiedWalletsOn owns this rule; asserted here because a chain offered on
  // an unverified wallet fails at the server, which is the same wall again.
  const list = options([wallet('solana', false)])
  assert.equal(byId(list, SOLANA_CHAIN).enabled, false)
})

// ---------- the three disabled states must stay distinct ---------------------

test('while the wallet list is loading, no chain claims the user lacks a wallet', () => {
  for (const status of ['idle', 'loading'] as const) {
    const list = options([], status)
    for (const opt of list) {
      assert.equal(opt.state, 'wallets_loading', `${opt.id} under ${status}`)
      assert.equal(opt.enabled, false)
    }
  }
})

test('an ABSENT status never yields "you have no wallet"', () => {
  // A caller that forgets to pass the status is telling us nothing, which is
  // not the same as telling us the list is loaded and empty. Web's wizard
  // store mock did exactly this, and the earlier default handed it the one
  // message that has to be earned.
  // Built and then STRIPPED rather than cast: the omission has to be real at
  // runtime, and a type assertion would only be a claim about it.
  const args = { registry: REGISTRY, wallets: [], walletsStatus: 'ready' as WalletsStatus }
  Reflect.deleteProperty(args, 'walletsStatus')
  assert.equal('walletsStatus' in args, false)

  const list = gigChainOptions(args)
  for (const opt of list) assert.notEqual(opt.state, 'needs_wallet')
})

test('a FAILED wallet load is its own state, not "you have no wallet"', () => {
  const list = options([], 'error')
  for (const opt of list) assert.equal(opt.state, 'wallets_unavailable')
})

test('a wallet already in hand wins over a stale status', () => {
  // The list is the trust source; the status only explains an absence. A
  // wallet present under status 'loading' must not be reported as unknown.
  const list = options([wallet('solana')], 'loading')
  assert.equal(byId(list, SOLANA_CHAIN).state, 'ready')
  assert.equal(byId(list, EVM_CHAIN).state, 'wallets_loading')
})

test('enabled is exactly state === ready, never set independently', () => {
  for (const status of ALL_STATUSES) {
    for (const list of [options([], status), options([wallet('eip155')], status)]) {
      for (const opt of list) assert.equal(opt.enabled, opt.state === 'ready')
    }
  }
})

// ---------- eligibility filtering is unchanged -------------------------------

test('a registry chain that carries no gig asset is not offered', () => {
  const stripped: ChainRegistryEntry = { ...registryEntry(SOLANA_CHAIN), assets: [] }
  const list = gigChainOptions({ registry: [stripped], wallets: [wallet('solana')], walletsStatus: 'ready' })
  assert.deepEqual(list, [])
})

test('an empty registry yields no options rather than throwing', () => {
  assert.deepEqual(gigChainOptions({ registry: [], wallets: [], walletsStatus: 'ready' }), [])
})

// ---------- what the chip actually reads -------------------------------------

/**
 * The label rule lives here because BOTH pickers render it and neither owns
 * it; mobile has no NetworkPicker suite at all, so a copy proved only on web
 * would leave the other client's chip unguarded.
 */
function labelFor(state: ChainOptionState): string {
  return chainOptionLabel({ id: 'eip155:84532', label: 'Base', state, enabled: state === 'ready' })
}

test('a ready chain reads as its bare name — no parenthetical to explain away', () => {
  assert.equal(labelFor('ready'), 'Base')
})

test('each disabled state appends its OWN reason', () => {
  assert.equal(labelFor('needs_wallet'), 'Base (link a wallet)')
  assert.equal(labelFor('wallets_loading'), 'Base (checking wallets)')
  assert.equal(labelFor('wallets_unavailable'), 'Base (wallets unavailable)')
})

test('no two states produce the same label — a shared note table cannot blur them', () => {
  // The whole point of the state union: "link a wallet" is a claim about the
  // USER, the other two are about us. Collapsing any pair puts a false claim
  // on the chip, which is what the note table exists to prevent.
  const labels = ALL_OPTION_STATES.map(labelFor)
  assert.equal(new Set(labels).size, ALL_OPTION_STATES.length)
})

test('every state in the union has a label — none falls through to undefined', () => {
  for (const state of ALL_OPTION_STATES) {
    const label = labelFor(state)
    assert.ok(label.startsWith('Base'), `${state} lost the chain name`)
    assert.equal(label.includes('undefined'), false, `${state} has no note of its own`)
  }
})

// ---------- the default follows the wallets ----------------------------------

test('the default is the first chain the user can sign on', () => {
  const list = options([wallet('eip155')])
  assert.equal(defaultGigChainId(list, SOLANA_CHAIN), EVM_CHAIN)
})

test('with no signable chain the caller fallback stands', () => {
  assert.equal(defaultGigChainId(options([]), SOLANA_CHAIN), SOLANA_CHAIN)
  assert.equal(defaultGigChainId([], SOLANA_CHAIN), SOLANA_CHAIN)
})

test('the default is not simply the first option regardless of wallets', () => {
  // Guards the lazy implementation `options[0]?.id ?? fallback`, which would
  // pass the EVM-only case above only by the order of REGISTRY.
  const solanaFirst = gigChainOptions({
    registry: [registryEntry(SOLANA_CHAIN), registryEntry(EVM_CHAIN)],
    wallets: [wallet('eip155')],
    walletsStatus: 'ready',
  })
  assert.equal(solanaFirst[0]?.id, SOLANA_CHAIN)
  assert.equal(defaultGigChainId(solanaFirst, SOLANA_CHAIN), EVM_CHAIN)
})
