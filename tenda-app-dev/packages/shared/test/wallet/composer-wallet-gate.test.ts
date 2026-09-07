import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  composerWalletGate,
  composerWalletNotice,
  gigChainOptions,
  type ComposerWalletGate,
  type GigChainOption,
} from '../../src/wallet/gig-chain-options'
import type { LinkedWallet } from '../../src/api/contracts/auth.contract'
import type { ChainRegistryEntry } from '../../src/api/contracts/platform.contract'
import type { WalletsStatus } from '../../src/wallet/section-state'
import { CHAIN_MANIFEST } from '../../src/chains/manifest'
import { gigAssetByChain } from '../../src/chains/manifest-queries'

/**
 * #59 — can this composer be finished at all?
 *
 * The question the composer used to ask only at the signature, by which point
 * the form was filled and the redirect that answered it threw the form away.
 *
 * Split from gig-chain-options.test.ts to stay inside the 300-line limit; that
 * file owns the option list, this one owns the single verdict read off it.
 */

function gigChainOn(namespace: 'solana' | 'eip155'): string {
  const entry = CHAIN_MANIFEST.find((c) => c.namespace === namespace && gigAssetByChain(c.id) !== null)
  assert.ok(entry, `no gig-carrying ${namespace} chain in the manifest`)
  return entry.id
}

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

const REGISTRY = [registryEntry(gigChainOn('solana')), registryEntry(gigChainOn('eip155'))]

function wallet(chain_ns: 'solana' | 'eip155'): LinkedWallet {
  return {
    chain_ns,
    address: chain_ns === 'solana' ? 'So11111111111111111111111111111111111111112' : '0x'.padEnd(42, 'a'),
    is_primary: true,
    verified_at: new Date().toISOString(),
  }
}

/** Real options, built by the real factory — never a hand-written verdict. */
function options(wallets: LinkedWallet[], walletsStatus: WalletsStatus = 'ready') {
  return gigChainOptions({ registry: REGISTRY, wallets, walletsStatus })
}

test('with a signable chain the composer says nothing', () => {
  assert.equal(composerWalletGate(options([wallet('eip155')])), 'ok')
  assert.equal(composerWalletGate(options([wallet('solana'), wallet('eip155')])), 'ok')
})

test('no wallet anywhere, list settled: the composer says a wallet is needed', () => {
  assert.equal(composerWalletGate(options([])), 'needs_wallet')
})

test('an EMPTY option list says nothing — that is the registry, not the user', () => {
  // The chain registry lands after first paint and answers [] on failure too.
  // Reading "you have no wallet" out of a list we never received is the same
  // unearned claim the option states exist to prevent.
  assert.equal(composerWalletGate([]), 'unknown')
})

test('while the wallet list is settling the composer says nothing', () => {
  for (const status of ['idle', 'loading'] as const) {
    assert.equal(composerWalletGate(options([], status)), 'unknown', `under ${status}`)
  }
})

test('a FAILED wallet load is "could not check", never "you have none"', () => {
  assert.equal(composerWalletGate(options([], 'error')), 'unavailable')
})

test('a still-checking chain outranks a failed one — the softer claim wins', () => {
  // Mixed states are reachable: the states are per-namespace, so one chain can
  // be checking while another already failed. The gate must not harden into
  // an accusation while any part of the answer is still coming.
  const mixed: GigChainOption[] = [
    { id: 'a', label: 'A', state: 'wallets_unavailable', enabled: false },
    { id: 'b', label: 'B', state: 'wallets_loading', enabled: false },
  ]
  assert.equal(composerWalletGate(mixed), 'unknown')
})

test('one signable chain is enough, however many are not', () => {
  const mixed: GigChainOption[] = [
    { id: 'a', label: 'A', state: 'needs_wallet', enabled: false },
    { id: 'b', label: 'B', state: 'wallets_unavailable', enabled: false },
    { id: 'c', label: 'C', state: 'ready', enabled: true },
  ]
  assert.equal(composerWalletGate(mixed), 'ok')
})

test('needs_wallet is only reached when EVERY option has settled on it', () => {
  const mixed: GigChainOption[] = [
    { id: 'a', label: 'A', state: 'needs_wallet', enabled: false },
    { id: 'b', label: 'B', state: 'needs_wallet', enabled: false },
  ]
  assert.equal(composerWalletGate(mixed), 'needs_wallet')
})

// ---------- what the notice SAYS for each gate ------------------------------

/** From the type, so a new state cannot slip past the checks below. */
const ALL_GATES: readonly ComposerWalletGate[] = ['ok', 'unknown', 'needs_wallet', 'unavailable']

test('the two silent states say nothing at all', () => {
  assert.equal(composerWalletNotice('ok'), null)
  assert.equal(composerWalletNotice('unknown'), null)
})

test('a settled absence asks for a wallet and offers the LINK', () => {
  const notice = composerWalletNotice('needs_wallet')
  assert.ok(notice)
  assert.equal(notice.action, 'link')
  assert.match(notice.cta, /link/i)
})

test('a failed load offers a RETRY and never claims the user has no wallet', () => {
  const notice = composerWalletNotice('unavailable')
  assert.ok(notice)
  assert.equal(notice.action, 'retry')
  // The distinction the whole state exists for: this is about US, not them.
  assert.match(notice.title, /could not/i)
  assert.doesNotMatch(notice.body, /you have no wallet/i)
})

test('the two speaking states never read alike', () => {
  // A shared map cannot blur them the way two clients' ternaries could.
  const needs = composerWalletNotice('needs_wallet')
  const failed = composerWalletNotice('unavailable')
  assert.ok(needs && failed)
  assert.notEqual(needs.title, failed.title)
  assert.notEqual(needs.body, failed.body)
  assert.notEqual(needs.cta, failed.cta)
})

test('a state this gate does not recognise falls to SILENCE, not an accusation', () => {
  // Unreachable while TypeScript holds — the states are produced in this same
  // module — but the fallthrough is where a future ChainOptionState would land,
  // and inheriting "you have no wallet" is the one wrong answer available here.
  // Built valid, then MUTATED — the state has to be alien at runtime, and a
  // cast would only be a claim about it (the type checker refuses one here,
  // correctly, because the two shapes do not overlap).
  const alien: GigChainOption[] = [{ id: 'a', label: 'A', state: 'needs_wallet', enabled: false }]
  Object.assign(alien[0], { state: 'brand_new' })
  assert.notEqual(alien[0].state, 'needs_wallet')
  assert.equal(composerWalletGate(alien), 'unknown')
})

test('a notice is never undefined, whatever key reaches it', () => {
  // Both clients guard with `=== null`; an undefined would sail past that and
  // blank the composer on `notice.title`.
  const loose = composerWalletNotice as unknown as (v: unknown) => unknown
  for (const bad of ['', 'OK', 'needs-wallet', null, undefined, 0]) {
    assert.equal(loose(bad), null, `${String(bad)} produced a non-null miss`)
  }
})

test('every gate state is mapped — none falls through to undefined', () => {
  for (const gate of ALL_GATES) {
    const notice = composerWalletNotice(gate)
    // null is a decision here, undefined would be an omission.
    assert.ok(notice === null || typeof notice.title === 'string', `${gate} is unmapped`)
    if (notice !== null) {
      for (const field of [notice.title, notice.body, notice.cta]) {
        assert.ok(field.length > 0, `${gate} has an empty field`)
      }
    }
  }
})
