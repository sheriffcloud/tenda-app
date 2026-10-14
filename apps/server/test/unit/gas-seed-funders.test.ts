/**
 * The funder side of the seed (#53c-1): who pays, what is left, and the cache
 * that keeps an availability poll from becoming an RPC storm.
 *
 * `GasSeedFunder` exists because availability has to intersect three sources,
 * one of which is the hot wallet's balance. The port is read-only and per
 * chain — the same keying rule as the senders, which is the property the first
 * test here pins: a funder map that disagreed with the sender map would report
 * a seed as available and then refuse to pay it.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  buildGasSeedFunders,
  buildGasSeedSenders,
  cachedFunders,
  gasSeedFunders,
  gasSeedJobId,
  resetGasSeedFunderCache,
  type GasSeedFunder,
} from '@server/features/gas-seed'
import { seededChainBalance } from '@server/features/alerts'
import { evmGasSeedFunder } from '@server/features/gas-seed/senders/evm'
import { solanaGasSeedFunder } from '@server/features/gas-seed/senders/solana'
import type { ResolvedChainSecret } from '@server/chains/secrets'

function solanaSecretKey(): string {
  return bs58.encode(Keypair.generate().secretKey)
}

function secrets(entries: ResolvedChainSecret[]): ReadonlyMap<string, ResolvedChainSecret> {
  return new Map(entries.map((s) => [s.chainId, s]))
}

const EVM_KEY = generatePrivateKey()
const SOLANA_KEY = solanaSecretKey()

const EVM_SECRET: ResolvedChainSecret = {
  namespace: 'eip155',
  chainId: 'eip155:84532',
  rpcUrl: 'https://rpc.invalid',
  escrow: '0x0000000000000000000000000000000000000001',
  treasury: '0x0000000000000000000000000000000000000002',
  gasSeedKey: EVM_KEY,
}
const SOLANA_SECRET: ResolvedChainSecret = {
  namespace: 'solana',
  chainId: 'solana:devnet',
  rpcUrl: 'https://api.devnet.solana.com',
  treasury: '11111111111111111111111111111111',
  gasSeedKey: SOLANA_KEY,
}

// ---------- the registry --------------------------------------------------------

test('funders and senders cover EXACTLY the same chains', () => {
  // The invariant `seedableChainArgs` exists to hold. If these two sets ever
  // diverged, availability would answer for a chain that cannot pay (or refuse
  // one that can), and nothing else in the suite would notice.
  const all = secrets([
    EVM_SECRET,
    SOLANA_SECRET,
    // A chain with no seed key: in neither map.
    { ...EVM_SECRET, chainId: 'eip155:8453', gasSeedKey: undefined },
  ])
  assert.deepStrictEqual(
    [...buildGasSeedFunders(all).keys()].sort(),
    [...buildGasSeedSenders(all).keys()].sort(),
  )
  assert.deepStrictEqual(
    [...buildGasSeedFunders(all).keys()].sort(),
    ['eip155:84532', 'solana:devnet'],
  )
})

test('no seed keys anywhere yields an empty funder map, not a partial one', () => {
  const none = secrets([{ ...EVM_SECRET, gasSeedKey: undefined }])
  assert.strictEqual(buildGasSeedFunders(none).size, 0)
})

test('a funder reports the address derived from its own signing key', () => {
  // The address must come from the SAME secret the sender signs with, or the
  // funder_address stamped on a grant names a wallet that did not pay it.
  const funders = buildGasSeedFunders(secrets([EVM_SECRET, SOLANA_SECRET]))
  assert.strictEqual(
    funders.get('eip155:84532')?.address,
    privateKeyToAccount(EVM_KEY).address,
  )
  assert.strictEqual(
    funders.get('solana:devnet')?.address,
    Keypair.fromSecretKey(bs58.decode(SOLANA_KEY)).publicKey.toBase58(),
  )
})

test('each namespace builds a funder without contacting its chain', () => {
  // Construction is local (secp256k1 / ed25519 key derivation). An RPC call at
  // build time would make `buildGasSeedClaimDeps` — which runs per request —
  // wait on the network before any guard had even been evaluated.
  const evm = evmGasSeedFunder({
    rpc_url: 'https://rpc.invalid',
    rpc_url_fallback: undefined,
    chain_id: 'eip155:84532',
    private_key: EVM_KEY,
  })
  const solana = solanaGasSeedFunder({
    rpc_url: 'https://rpc.invalid',
    rpc_url_fallback: undefined,
    chain_id: 'solana:devnet',
    secret_key_base58: SOLANA_KEY,
  })
  assert.match(evm.address, /^0x[0-9a-fA-F]{40}$/)
  assert.ok(solana.address.length > 0)
})

// ---------- the balance cache -----------------------------------------------------

function countingFunder(balances: bigint[]): { funder: GasSeedFunder; calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    funder: {
      address: '0xfunder',
      async balance() {
        const value = balances[calls] ?? balances[balances.length - 1]
        calls += 1
        if (value === undefined) throw new Error('no balance configured')
        return value
      },
    },
  }
}

test('repeated reads inside the window share ONE round trip', () => {
  const { funder, calls } = countingFunder([42n])
  const cached = cachedFunders(new Map([['c', funder]]), () => 1_000, 30_000).get('c')
  assert.ok(cached)
  return Promise.all([cached.balance(), cached.balance(), cached.balance()]).then((values) => {
    assert.deepStrictEqual(values, [42n, 42n, 42n])
    assert.strictEqual(calls(), 1, 'availability polling re-read the chain')
  })
})

test('the window EXPIRES, so a drained wallet is noticed', async () => {
  // The failure this prevents is the opposite of an RPC storm: a cache that
  // never expired would keep offering claims from a wallet that ran dry.
  const { funder, calls } = countingFunder([100n, 0n])
  let now = 0
  const cached = cachedFunders(new Map([['c', funder]]), () => now, 30_000).get('c')
  assert.ok(cached)

  assert.strictEqual(await cached.balance(), 100n)
  now = 29_999
  assert.strictEqual(await cached.balance(), 100n, 'expired one millisecond early')
  now = 30_000
  assert.strictEqual(await cached.balance(), 0n, 'served a stale balance past the window')
  assert.strictEqual(calls(), 2)
})

test('a FAILED read is not cached — one blip must not hide a healthy wallet', async () => {
  let calls = 0
  const flaky: GasSeedFunder = {
    address: '0xfunder',
    async balance() {
      calls += 1
      if (calls === 1) throw new Error('rpc down')
      return 7n
    },
  }
  // Time never advances here: the point is that a rejection is dropped from the
  // cache immediately, INSIDE the window, not that the window expired.
  const cached = cachedFunders(new Map([['c', flaky]]), () => 0, 30_000).get('c')
  assert.ok(cached)

  await assert.rejects(() => cached.balance())
  // Same instant, still inside the window: a cached rejection would refuse
  // every claim on this chain for the next 30 seconds over one blip.
  assert.strictEqual(await cached.balance(), 7n)
  assert.strictEqual(calls, 2)
})

test('each chain caches independently', () => {
  const a = countingFunder([1n])
  const b = countingFunder([2n])
  const cached = cachedFunders(
    new Map([
      ['a', a.funder],
      ['b', b.funder],
    ]),
    () => 0,
    30_000,
  )
  return Promise.all([cached.get('a')?.balance(), cached.get('b')?.balance()]).then((values) => {
    assert.deepStrictEqual(values, [1n, 2n])
    assert.strictEqual(a.calls(), 1)
    assert.strictEqual(b.calls(), 1)
  })
})

test('caching preserves the address, which is local and never stale', () => {
  const { funder } = countingFunder([1n])
  assert.strictEqual(cachedFunders(new Map([['c', funder]])).get('c')?.address, '0xfunder')
})

// ---------- ONE map for the process, and for BOTH readers -------------------------

test('gasSeedFunders returns the SAME map every call', () => {
  // The cache is only a cache if the map survives the call. An earlier version
  // of the claim deps rebuilt it per request, so the 30s balance window never
  // once hit and every availability poll paid its RPC round trip — a defect no
  // test of `cachedFunders` itself can see, because it exercises the wrapper
  // rather than the call site.
  resetGasSeedFunderCache()
  const first = gasSeedFunders()
  assert.strictEqual(gasSeedFunders(), first)
  assert.strictEqual(gasSeedFunders(), first)
})

test('resetting the cache is what makes a second map possible', () => {
  // Pins that the identity above comes from the CACHE and not from
  // `buildGasSeedFunders` happening to return something shared. Without this,
  // a rewrite that memoised at the wrong level would pass the test above.
  resetGasSeedFunderCache()
  const first = gasSeedFunders()
  resetGasSeedFunderCache()
  assert.notStrictEqual(gasSeedFunders(), first)
})

test('the ALERT monitor reads the same map the claim surface does', () => {
  // #53b's hot-wallet monitor and the availability endpoint report on the same
  // wallets. Two maps would mean two sets of RPC clients and two TTLs, so the
  // two surfaces could state different balances for one wallet at one moment —
  // which is precisely the disagreement the alert exists to report on.
  //
  // Asserted through BEHAVIOUR rather than by inspecting an import: a chain with
  // no configured seed key is absent from the shared map, and the reader must
  // answer null (unreadable) rather than 0n (an alarming reading) for it.
  resetGasSeedFunderCache()
  const absent = 'eip155:999999'
  assert.strictEqual(gasSeedFunders().has(absent), false)
  return seededChainBalance(absent).then((balance) => {
    assert.strictEqual(balance, null)
  })
})

// ---------- the queue's dedup key ------------------------------------------------

test('the job id is derived from the grant\'s primary key, so duplicates collapse', () => {
  // Two taps on one chain must produce ONE job id; the same user on a different
  // chain must not. The grant row is what actually prevents a double pay — this
  // only saves the duplicate the round trip of finding that out — but a key that
  // collided across chains would drop a claim the user is owed.
  assert.strictEqual(
    gasSeedJobId({ user_id: 'u-1', chain_id: 'eip155:16661' }),
    'gas-seed:u-1:eip155:16661',
  )
  assert.strictEqual(
    gasSeedJobId({ user_id: 'u-1', chain_id: 'eip155:16661' }),
    gasSeedJobId({ user_id: 'u-1', chain_id: 'eip155:16661' }),
  )
  assert.notStrictEqual(
    gasSeedJobId({ user_id: 'u-1', chain_id: 'eip155:16661' }),
    gasSeedJobId({ user_id: 'u-1', chain_id: 'solana:devnet' }),
  )
  assert.notStrictEqual(
    gasSeedJobId({ user_id: 'u-1', chain_id: 'eip155:16661' }),
    gasSeedJobId({ user_id: 'u-2', chain_id: 'eip155:16661' }),
  )
})
