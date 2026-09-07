import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAIN_MANIFEST,
  feeCurrencyAddress,
  isNativeAsset,
  assertManifestValid,
  type ChainManifestEntry,
} from '../../src/chains/manifest'
import {
  chainById,
  findChain,
  gigAssetByChain,
  exchangeAssetsByChain,
  evmPublicRpcUrl,
  requireEvmPublicRpcUrl,
  evmChainNumericId,
  nativeAssetOf,
  nativeCurrencyOf,
  evmManifestEntries,
  firstEvmChainIdByKind,
} from '../../src/chains/manifest-queries'
import { ASSET_META } from '../../src/constants/assets'

// The manifest is a hand-maintained data table that the server registry,
// seeder, sponsor, and webhooks all key off — these invariants are what keep
// those consumers correct as chains are added. (The module also self-checks a
// subset at import; importing it here is itself coverage of that guard.)

test('manifest is non-empty and every id is unique', () => {
  assert.ok(CHAIN_MANIFEST.length > 0)
  const ids = CHAIN_MANIFEST.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate chain id in manifest')
})

test('every asset id resolves in ASSET_META', () => {
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      assert.ok(ASSET_META[asset.id] !== undefined, `${asset.id} on ${entry.id} missing from ASSET_META`)
    }
  }
})

test('each chain has exactly one native asset (token null, no fromSecret)', () => {
  for (const entry of CHAIN_MANIFEST) {
    const natives = entry.assets.filter(isNativeAsset)
    assert.equal(natives.length, 1, `${entry.id} must have exactly one native asset, found ${natives.length}`)
  }
})

test('fromSecret assets are not counted native and have null manifest token', () => {
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      if (asset.fromSecret !== undefined) {
        assert.equal(asset.token, null, `${asset.id}: fromSecret asset must not also hardcode a token`)
        assert.equal(isNativeAsset(asset), false, `${asset.id}: secret-sourced asset is not native`)
      }
    }
  }
})

test('at most one gig asset per chain', () => {
  for (const entry of CHAIN_MANIFEST) {
    const gigs = entry.assets.filter((a) => a.roles.includes('gig'))
    assert.ok(gigs.length <= 1, `${entry.id} has ${gigs.length} gig assets`)
  }
})

test('feeCurrency is set iff gasPolicy is feeCurrency, and resolves an address', () => {
  for (const entry of CHAIN_MANIFEST) {
    assert.equal(
      entry.feeCurrency !== undefined,
      entry.gasPolicy === 'feeCurrency',
      `${entry.id}: feeCurrency/gasPolicy mismatch`,
    )
    if (entry.feeCurrency !== undefined) {
      assert.ok(feeCurrencyAddress(entry) !== null, `${entry.id}: feeCurrency has no address`)
    } else {
      assert.equal(feeCurrencyAddress(entry), null)
    }
  }
})

test('EVM token addresses are 0x-prefixed 40-hex; native tokens are null', () => {
  for (const entry of CHAIN_MANIFEST) {
    if (entry.namespace !== 'eip155') continue
    for (const asset of entry.assets) {
      if (asset.token === null) continue
      assert.match(asset.token, /^0x[0-9a-fA-F]{40}$/, `${asset.id} on ${entry.id} is not a valid EVM address`)
    }
  }
})

test('namespace and gasPolicy are from the supported sets', () => {
  const policies = new Set(['native-seed', 'paymaster', 'feeCurrency', 'none'])
  for (const entry of CHAIN_MANIFEST) {
    assert.ok(entry.namespace === 'solana' || entry.namespace === 'eip155', `bad namespace on ${entry.id}`)
    assert.ok(policies.has(entry.gasPolicy), `bad gasPolicy on ${entry.id}`)
    assert.ok(entry.family.length > 0, `empty family on ${entry.id}`)
  }
})

test('chainById returns the entry for a known id and throws on unknown', () => {
  const entry = chainById('eip155:8453')
  assert.equal(entry.displayName, 'BASE')
  assert.throws(() => chainById('eip155:99999'), /unknown chain id/)
})

test('findChain returns undefined on unknown without throwing', () => {
  assert.equal(findChain('does:not-exist'), undefined)
  assert.ok(findChain('solana:devnet') !== undefined)
})

test('gigAssetByChain resolves a USDC stablecoin wherever a chain carries gigs, null when unknown', () => {
  // Not "every chain": a chain with no verified stablecoin ships exchange-only
  // (0G mainnet, below) and gigAssetByChain answers null for it — the state the
  // server's assertGigAsset 422s and the composers' pickers filter out. What
  // stays unconditional is the POLICY: where a gig asset exists, it is USDC.
  for (const entry of CHAIN_MANIFEST) {
    const gigAsset = gigAssetByChain(entry.id)
    if (gigAsset === null) continue
    const meta = ASSET_META[gigAsset]
    assert.ok(meta !== undefined, `${entry.id} -> ${gigAsset} present in ASSET_META`)
    assert.equal(meta.is_stable, true, `${entry.id} gig asset must be a stablecoin`)
    assert.equal(meta.symbol, 'USDC', `${entry.id} gig asset must be USDC`)
  }
  assert.equal(gigAssetByChain('unknown:chain'), null)
})

test('gig coverage is pinned per chain — gig-less chains are named, never accidental', () => {
  // The loop above skips null, so THIS is what notices a chain silently losing
  // its gig asset: the gig-less list is pinned exactly (empty since
  // 2026-08-27, when 0G mainnet gained USDC.e — XSwap/CCIP Bridged USDC,
  // domain + EIP-3009 verified on-chain). A chain that must ship
  // exchange-only again gets NAMED here, never silently skipped.
  const gigless = CHAIN_MANIFEST.filter((c) => gigAssetByChain(c.id) === null).map((c) => c.id)
  assert.deepEqual(gigless, [])
  // Both 0G chains resolve the same registry id to DIFFERENT tokens (mock on
  // Galileo, USDC.e on mainnet) — the Base pattern, safe under
  // one-active-chain-per-family.
  assert.equal(gigAssetByChain('eip155:16602'), 'USDC_0G')
  assert.equal(gigAssetByChain('eip155:16661'), 'USDC_0G')
})

test('exchangeAssetsByChain returns USDC + the native token per chain; empty for unknown', () => {
  for (const entry of CHAIN_MANIFEST) {
    const ids = exchangeAssetsByChain(entry.id)
    assert.ok(ids.length >= 1, `${entry.id} should have at least one exchange asset`)
    // Every returned id is exchange-tagged in the manifest and resolves in ASSET_META.
    for (const id of ids) {
      const asset = entry.assets.find((a) => a.id === id)
      assert.ok(asset?.roles.includes('exchange'), `${id} on ${entry.id} must be exchange-tagged`)
      assert.ok(ASSET_META[id] !== undefined, `${id} present in ASSET_META`)
    }
    // The chain's native token is always exchange-tradable.
    const native = entry.assets.find(isNativeAsset)
    assert.ok(native !== undefined && ids.includes(native.id), `${entry.id} native must be exchange-tradable`)
    // Where the chain carries a gig USDC, it is also exchange-tradable (roles
    // overlap); a gig-less chain (0G mainnet) has nothing to overlap.
    const gigAsset = gigAssetByChain(entry.id)
    assert.ok(gigAsset === null || ids.includes(gigAsset), `${entry.id} USDC must be exchange-tradable`)
  }
  assert.deepEqual(exchangeAssetsByChain('unknown:chain'), [])
})

test('assertManifestValid rejects an asset that declares no roles', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [{ id: 'ETH_BASE', roles: [], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /declares no roles/)
})

// ---------- assertManifestValid (the import-time integrity guard) -----------

test('assertManifestValid accepts the real manifest', () => {
  assert.doesNotThrow(() => assertManifestValid(CHAIN_MANIFEST))
})

test('assertManifestValid rejects a duplicate chain id', () => {
  const dup = [chainById('solana:devnet'), chainById('solana:devnet')]
  assert.throws(() => assertManifestValid(dup), /duplicate chain id/)
})

test('assertManifestValid rejects an asset missing from ASSET_META', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, gasPolicy: 'none',
    assets: [{ id: 'NOT_A_REAL_ASSET', roles: ['gig'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /missing from ASSET_META/)
})

test('assertManifestValid rejects a chain without exactly one native asset', () => {
  const noNative: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, gasPolicy: 'none',
    assets: [{ id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }],
  }
  assert.throws(() => assertManifestValid([noNative]), /exactly one native asset/)
})

test('assertManifestValid rejects feeCurrency/gasPolicy mismatch', () => {
  const mismatch: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example',
    gasPolicy: 'none', feeCurrency: 'cUSD',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([mismatch]), /feeCurrency must be set iff/)
})

test('assertManifestValid rejects feeCurrency that resolves no address', () => {
  // gasPolicy feeCurrency + feeCurrency id present, but that asset has no token.
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example',
    gasPolicy: 'feeCurrency', feeCurrency: 'CELO',
    assets: [{ id: 'CELO', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /has no token address/)
})

test('every EVM manifest chain exposes a publicRpcUrl; assertManifestValid enforces it', () => {
  for (const entry of CHAIN_MANIFEST) {
    if (entry.namespace !== 'eip155') continue
    assert.ok((entry.publicRpcUrl ?? '').length > 0, `${entry.id} missing publicRpcUrl`)
  }
  const noRpc: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, gasPolicy: 'none',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([noRpc]), /must set a publicRpcUrl/)
})

test('every EVM manifest chain exposes an explorerUrl; assertManifestValid enforces it', () => {
  for (const entry of CHAIN_MANIFEST) {
    if (entry.namespace !== 'eip155') continue
    assert.ok((entry.explorerUrl ?? '').length > 0, `${entry.id} missing explorerUrl`)
  }
  const noExplorer: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([noExplorer]), /must set an explorerUrl/)
})

// ---------- EIP-2612 permit config ------------------------------------------

test('permit config: USDC carries version 2 on every EVM chain; cUSD and natives carry none', () => {
  // Versions were read from the LIVE tokens (version() + DOMAIN_SEPARATOR
  // recomputation, 2026-07-03). cUSD's domain is non-standard → no entry.
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      if (entry.namespace === 'eip155' && asset.roles.includes('gig')) {
        assert.deepEqual(asset.permit, { version: '2' }, `${asset.id} on ${entry.id} should be permit v2`)
      } else {
        assert.equal(asset.permit, undefined, `${asset.id} on ${entry.id} must not declare permit`)
      }
    }
  }
})

test('assertManifestValid rejects permit on an asset without a canonical token', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [
      { id: 'ETH_BASE', roles: ['exchange'], token: null, permit: { version: '2' } },
      { id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    ],
  }
  assert.throws(() => assertManifestValid([bad]), /declares permit but has no canonical token/)
})

test('assertManifestValid rejects an empty permit version', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example', gasPolicy: 'none',
    assets: [
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
      { id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', permit: { version: '' } },
    ],
  }
  assert.throws(() => assertManifestValid([bad]), /empty permit version/)
})

test('exactly one chain is active per family across mainnet/testnet pairs', () => {
  // Not a uniqueness assertion (families repeat by design) — documents that
  // families group networks, which the secret loader uses to enforce one
  // active chain per family.
  const byFamily = new Map<string, ChainManifestEntry[]>()
  for (const entry of CHAIN_MANIFEST) {
    const list = byFamily.get(entry.family) ?? []
    list.push(entry)
    byFamily.set(entry.family, list)
  }
  // base, solana, celo, and 0g each ship a mainnet/testnet pair.
  assert.deepEqual(byFamily.get('base')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
  assert.deepEqual(byFamily.get('solana')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
  assert.deepEqual(byFamily.get('celo')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
  assert.deepEqual(byFamily.get('0g')?.map((e) => e.kind).sort(), ['mainnet', 'testnet'])
})

// ---------- feeCurrency adapter resolution (USDC gas) ------------------------

test('feeCurrencyAddress returns the adapter for a USDC-gas chain, not the token', () => {
  // Celo's USDC is 6-decimal → the tx feeCurrency must be the FeeCurrencyDirectory
  // adapter (18-decimal gas interface), never the token itself.
  for (const id of ['eip155:42220', 'eip155:11142220']) {
    const entry = chainById(id)
    assert.equal(entry.feeCurrency, 'USDC_CELO')
    assert.ok(entry.feeCurrencyAdapter !== undefined, `${id} must carry a feeCurrencyAdapter`)
    assert.equal(feeCurrencyAddress(entry), entry.feeCurrencyAdapter, `${id} resolves to the adapter`)
    const usdc = entry.assets.find((a) => a.id === 'USDC_CELO')
    assert.notEqual(feeCurrencyAddress(entry), usdc?.token, `${id} must NOT resolve to the raw token`)
  }
})

test('feeCurrencyAddress falls back to the fee asset token when no adapter is set', () => {
  // An 18-decimal Mento stable is its own gas adapter — synthetic entry proves
  // the no-adapter branch still resolves the token address.
  const nativeStable: ChainManifestEntry = {
    id: 'eip155:42220', namespace: 'eip155', family: 'celo', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 3, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'feeCurrency', feeCurrency: 'cUSD',
    assets: [
      { id: 'cUSD', roles: ['exchange'], token: '0x765DE816845861e75A25fCA122bb6898B8B1282a' },
      { id: 'CELO', roles: ['exchange'], token: null },
    ],
  }
  assert.equal(feeCurrencyAddress(nativeStable), '0x765DE816845861e75A25fCA122bb6898B8B1282a')
})

test('assertManifestValid rejects a feeCurrencyAdapter set without a feeCurrency', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'none',
    feeCurrencyAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /feeCurrencyAdapter set without feeCurrency/)
})

test('assertManifestValid rejects a malformed feeCurrencyAdapter address', () => {
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'feeCurrency', feeCurrency: 'USDC_BASE',
    feeCurrencyAdapter: '0xnope',
    assets: [
      { id: 'USDC_BASE', roles: ['gig'], token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', permit: { version: '2' } },
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
    ],
  }
  assert.throws(() => assertManifestValid([bad]), /feeCurrencyAdapter is not a valid EVM address/)
})

test('assertManifestValid rejects a feeCurrency id that is not one of the chain assets', () => {
  // With an adapter present, a dangling feeCurrency id would otherwise resolve an
  // address and slip through — this guard catches the typo explicitly.
  const bad: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'feeCurrency', feeCurrency: 'USDC_CELO',
    feeCurrencyAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    assets: [{ id: 'ETH_BASE', roles: ['exchange'], token: null }],
  }
  assert.throws(() => assertManifestValid([bad]), /is not one of its assets/)
})

// ---------- gas-seed amount (native-seed onboarding grant) ------------------

test('both Solana chains carry a positive native-seed gasSeedAmountRaw', () => {
  for (const id of ['solana:mainnet', 'solana:devnet']) {
    const entry = CHAIN_MANIFEST.find((c) => c.id === id)
    assert.ok(entry !== undefined, `${id} present in the manifest`)
    assert.equal(entry.gasPolicy, 'native-seed', `${id} is a native-seed chain`)
    assert.match(entry.gasSeedAmountRaw ?? '', /^[1-9]\d*$/, `${id} declares base-unit seed`)
  }
})

const solanaSeedBase: ChainManifestEntry = {
  id: 'solana:x', namespace: 'solana', family: 'solana', kind: 'mainnet', status: 'planned',
  displayName: 'X', minConfirmations: 1, gasPolicy: 'native-seed',
  gasSeedAmountRaw: '7000000',
  assets: [{ id: 'SOL', roles: ['exchange'], token: null }],
}

test('assertManifestValid rejects gasSeedAmountRaw on a non-native-seed chain', () => {
  const bad: ChainManifestEntry = { ...solanaSeedBase, gasPolicy: 'none' }
  assert.throws(() => assertManifestValid([bad]), /gasSeedAmountRaw set without gasPolicy 'native-seed'/)
})

test('assertManifestValid rejects a non-positive-integer gasSeedAmountRaw', () => {
  // '0' is the sneaky one: a valid number, a useless seed. Fractional/garbage too.
  for (const amount of ['0', '1.5', '-1', 'abc', '']) {
    const bad: ChainManifestEntry = { ...solanaSeedBase, gasSeedAmountRaw: amount }
    assert.throws(() => assertManifestValid([bad]), /gasSeedAmountRaw must be a positive integer string/)
  }
})

// ---------- status: is Tenda's escrow actually deployed here? ---------------

/**
 * `status` exists because the landing inferred deployment from `kind` and
 * advertised four mainnet chains as live while none of them had a contract.
 * The field carries that claim explicitly; these tests hold it to being a
 * DECLARATION rather than a second derivation of `kind`.
 */

test('every manifest entry declares a status', () => {
  for (const entry of CHAIN_MANIFEST) {
    assert.ok(
      entry.status === 'live' || entry.status === 'launching' || entry.status === 'planned',
      `${entry.id} must declare a known status, saw ${String(entry.status)}`,
    )
  }
})

test('at most one chain is LAUNCHING — a launch claim names one chain, not a set', () => {
  // The distinction the third status exists for. Two chains "launching" at
  // once is how the copy went back to announcing a batch of launches: the
  // landing renders every launching chain under one verb.
  const launching = CHAIN_MANIFEST.filter((entry) => entry.status === 'launching')
  assert.ok(launching.length <= 1, `expected at most one launching chain, saw ${launching.length}`)
})

test('assertManifestValid rejects an entry whose status is missing', () => {
  // The shape a hand-edited entry has when someone adds a chain and forgets
  // the field. TS would catch it in this repo; the landing reads this module
  // through a Vite source alias and the apps through the CJS dist, and neither
  // boundary re-checks the type — so the guard is what actually holds.
  const { status: _dropped, ...withoutStatus } = solanaSeedBase
  const bad = withoutStatus as ChainManifestEntry
  assert.throws(
    () => assertManifestValid([bad]),
    /must declare status 'live', 'launching' or 'planned'/,
  )
})

test('assertManifestValid rejects a status outside the vocabulary', () => {
  // 'deployed', 'coming-soon', 'true' — the plausible near-misses. Each must
  // be refused rather than silently treated as not-live, which is how a
  // deployed chain would vanish from every surface that filters on status.
  for (const status of ['deployed', 'coming-soon', 'LIVE', 'Launching', '']) {
    // A single narrowing cast (string -> the union), not `unknown`: the point
    // is to hand the guard a value the type system would have refused, which
    // is exactly what an untyped boundary hands it in production.
    const bad: ChainManifestEntry = { ...solanaSeedBase, status } as ChainManifestEntry
    assert.throws(
      () => assertManifestValid([bad]),
      /must declare status 'live', 'launching' or 'planned'/,
      `status '${status}' must be refused`,
    )
  }
})

test('every status in the vocabulary is accepted — the guard refuses nothing valid', () => {
  for (const status of ['live', 'launching', 'planned'] as const) {
    assert.doesNotThrow(() => assertManifestValid([{ ...solanaSeedBase, status }]))
  }
})

// ---------- AppKit-network derivation primitives (Stage 1) -------------------
// These let the mobile network list derive from the manifest with no per-chain
// literals, so adding an EVM chain is a manifest entry + secrets, no app edit.

test('evmChainNumericId parses the CAIP-2 reference; rejects non-EVM / malformed', () => {
  assert.equal(evmChainNumericId('eip155:8453'), 8453)
  assert.equal(evmChainNumericId('eip155:84532'), 84532)
  assert.throws(() => evmChainNumericId('solana:devnet'), /not a numeric eip155/)
  assert.throws(() => evmChainNumericId('eip155:'), /not a numeric eip155/)
  assert.throws(() => evmChainNumericId('eip155:0x1'), /not a numeric eip155/)
})

test('nativeAssetOf returns the sole native asset for every chain', () => {
  for (const entry of CHAIN_MANIFEST) {
    const native = nativeAssetOf(entry)
    assert.equal(native.token, null, `${entry.id} native must have no token`)
    assert.equal(native.fromSecret, undefined, `${entry.id} native must have no secret`)
    assert.ok(native.roles.includes('exchange'), `${entry.id} native should be exchange-tradable`)
  }
})

test('nativeCurrencyOf assembles name/symbol/decimals from the native asset', () => {
  const base = nativeCurrencyOf(chainById('eip155:8453'))
  assert.deepEqual(base, { name: 'Ether', symbol: 'ETH', decimals: 18 })
  const celo = nativeCurrencyOf(chainById('eip155:42220'))
  assert.deepEqual(celo, { name: 'Celo', symbol: 'CELO', decimals: 18 })
})

test('nativeCurrencyOf falls back to symbol when the asset omits a name', () => {
  // USDC_SOL has no `name`; a hypothetical native USDC chain would surface the
  // symbol. Proven directly on the fallback branch via a synthetic entry.
  const synthetic: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'none',
    assets: [{ id: 'USDC_SOL', roles: ['exchange'], token: null }],
  }
  assert.deepEqual(nativeCurrencyOf(synthetic), { name: 'USDC', symbol: 'USDC', decimals: 6 })
})

test('nativeCurrencyOf refuses a native asset ASSET_META does not know', () => {
  // The manifest's own load-time check makes this unreachable through
  // CHAIN_MANIFEST, but `nativeCurrencyOf` takes an ENTRY, so a caller can
  // reach it — and it must fail loudly rather than build a currency out of
  // undefined. The bare `ASSET_META[id]` this replaced could not: an id that is
  // an Object.prototype key ('toString') answered a truthy FUNCTION, and the
  // result was { name: undefined, symbol: undefined, decimals: undefined }.
  const unknown: ChainManifestEntry = {
    id: 'eip155:1', namespace: 'eip155', family: 'eth', kind: 'mainnet', status: 'planned',
    displayName: 'X', minConfirmations: 1, publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://explorer.example', gasPolicy: 'none',
    assets: [{ id: 'NOT_IN_ASSET_META', roles: ['exchange'], token: null }],
  }
  assert.throws(() => nativeCurrencyOf(unknown), /missing from ASSET_META/)

  // And the prototype-key form specifically — the one that used to slip past.
  const inherited: ChainManifestEntry = {
    ...unknown,
    assets: [{ id: 'toString', roles: ['exchange'], token: null }],
  }
  assert.throws(() => nativeCurrencyOf(inherited), /missing from ASSET_META/)
})

test('evmManifestEntries returns only EVM chains, in manifest order', () => {
  const evm = evmManifestEntries()
  assert.ok(evm.length > 0)
  assert.ok(evm.every((e) => e.namespace === 'eip155'), 'only eip155 entries')
  assert.deepEqual(
    evm.map((e) => e.id),
    CHAIN_MANIFEST.filter((c) => c.namespace === 'eip155').map((c) => c.id),
  )
})

test('firstEvmChainIdByKind picks Base per env kind; undefined when none', () => {
  // Namespace-only for auth, but the value must stay stable: dev→Base Sepolia,
  // prod→Base (manifest order defines the canonical pick).
  assert.equal(firstEvmChainIdByKind('testnet'), 'eip155:84532')
  assert.equal(firstEvmChainIdByKind('mainnet'), 'eip155:8453')
})

// --- public RPC URL (client-side balance reads) ----------------------------

/**
 * The single source for client-side RPC endpoints — the comment on
 * `evmPublicRpcUrl` says callers must not hardcode them. The pair exists
 * because the two call sites want opposite failure modes: a screen that renders
 * with no balances, or a caller that cannot proceed without the URL.
 */
test('evmPublicRpcUrl returns the manifest URL for every EVM chain', () => {
  const evm = CHAIN_MANIFEST.filter((c) => c.id.startsWith('eip155:'))
  assert.ok(evm.length > 0, 'expected EVM chains in the manifest')
  for (const chain of evm) {
    assert.equal(evmPublicRpcUrl(chain.id), chain.publicRpcUrl ?? null, chain.id)
    // Not a hardcoded literal: it must track the manifest entry itself.
    assert.match(String(evmPublicRpcUrl(chain.id)), /^https:\/\//, chain.id)
  }
})

test('evmPublicRpcUrl is non-throwing for unknown and non-EVM chains', () => {
  // A registry chain with no manifest match yields no reads rather than
  // crashing the screen.
  assert.equal(evmPublicRpcUrl('eip155:999999'), null)
  assert.equal(evmPublicRpcUrl('not-a-chain'), null)
  const solana = CHAIN_MANIFEST.find((c) => c.id.startsWith('solana:'))
  assert.ok(solana)
  assert.equal(evmPublicRpcUrl(solana.id), null, 'non-EVM chains have no public RPC URL')
})

test('requireEvmPublicRpcUrl returns the same URL for a known chain', () => {
  const evm = CHAIN_MANIFEST.find((c) => c.id.startsWith('eip155:'))
  assert.ok(evm)
  assert.equal(requireEvmPublicRpcUrl(evm.id), evmPublicRpcUrl(evm.id))
})

test('requireEvmPublicRpcUrl throws — it is the variant for callers that cannot proceed', () => {
  assert.throws(() => requireEvmPublicRpcUrl('eip155:999999'), /no publicRpcUrl for EVM chain/)
  assert.throws(() => requireEvmPublicRpcUrl('not-a-chain'), /not in CHAIN_MANIFEST/)
})

// --- nativeAssetOf: the manifest invariant it enforces ---------------------

test('nativeAssetOf returns the native asset of every manifest chain', () => {
  for (const chain of CHAIN_MANIFEST) {
    assert.equal(isNativeAsset(nativeAssetOf(chain)), true, chain.id)
  }
})

test('nativeAssetOf throws rather than returning undefined — an absent native asset is a manifest bug', () => {
  const broken: ChainManifestEntry = {
    ...CHAIN_MANIFEST[0],
    assets: CHAIN_MANIFEST[0].assets.filter((a) => !isNativeAsset(a)),
  }
  assert.throws(() => nativeAssetOf(broken), /violates the manifest invariant/)
})

test('eip3009 (#18): every declaration rides a permit domain, and a declaration without one is refused', () => {
  const declared = CHAIN_MANIFEST.flatMap((c) => c.assets.filter((a) => a.eip3009 !== undefined).map((a) => `${c.id}/${a.id}`))
  assert.ok(declared.length > 0, 'expected at least one eip3009-capable asset')
  for (const entry of CHAIN_MANIFEST) {
    for (const asset of entry.assets) {
      if (asset.eip3009 !== undefined) assert.ok(asset.permit !== undefined, `${entry.id}/${asset.id}`)
    }
  }
  const [base] = CHAIN_MANIFEST.filter((c) => c.id === 'eip155:8453')
  assert.ok(base)
  const broken: ChainManifestEntry = {
    ...base,
    assets: base.assets.map((a) => (a.id === 'USDC_BASE' ? { id: a.id, roles: a.roles, token: a.token, eip3009: true } : a)),
  }
  assert.throws(() => assertManifestValid([broken]), /declares eip3009 but no permit domain/)
})
